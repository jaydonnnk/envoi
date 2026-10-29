import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { validateVisionDraft } from "@/domain/imports/validate-result";
import { hasPrintedPrice, keepPrintedOnly, pagePriceTokens } from "@/domain/imports/verbatim";
import { checkMenuPageUrl } from "@/domain/imports/web-url";
import { KERNEL_SESSION_REQUEST, PAGE_READ_BOUNDS, cutToBytes, readPageText } from "@/integrations/browser/kernel";
import { createFakeKernel, FIXTURE_PAGE_TEXT, type PageTurn } from "../support/fake-kernel";

// S24 named tests that need no database: the link check's reasons (half of test 1; the route half is
// in tests/integration/menu-web-import.test.ts), the Kernel session's deletion and request (tests 5
// and 6), the verbatim rule (tests 8 and 9) and the SDK boundary (test 12). Kernel is faked at the
// SDK's fetch boundary (FIXTURE); no session is started.

const URL_OK = new URL("https://fixture-shop.example/menu");
const read = (turn: PageTurn, signal = new AbortController().signal, options: { deleteStatus?: number } = {}) => {
  const fake = createFakeKernel(() => turn, options);
  return { fake, result: readPageText(URL_OK, signal, { apiKey: "FIXTURE-kernel-key", fetch: fake.fetch }) };
};

const draftOf = (items: { name: string | null; priceText: string | null; portion?: string | null }[]) => {
  const validated = validateVisionDraft({ items: items.map((item) => ({ name: item.name, portion: item.portion ?? null, priceText: item.priceText, currency: item.priceText === null ? null : "sgd_or_unmarked" })) });
  if (!validated.ok) throw new Error(`FIXTURE draft was refused: ${validated.reason}`);
  return validated;
};

describe("a menu page link must be public https", () => {
  it.each([
    ["http://fixture-shop.example/menu", "not_https"],
    ["ftp://fixture-shop.example/menu", "not_https"],
    ["https://merchant:pw@fixture-shop.example/menu", "has_credentials"],
    ["https://192.168.1.10/menu", "ip_or_local_host"],
    ["https://[::1]/menu", "ip_or_local_host"],
    ["https://localhost/menu", "ip_or_local_host"],
    ["https://intranet/menu", "ip_or_local_host"],
    ["https://fixture-shop.example:8443/menu", "bad_port"],
    [`https://fixture-shop.example/${"a".repeat(2_048)}`, "too_long"],
    ["not a link", "malformed"],
  ])("%s is refused as %s", (input, reason) => {
    expect(checkMenuPageUrl(input)).toEqual({ ok: false, reason });
  });

  it("a public https link passes with its host", () => {
    const check = checkMenuPageUrl("https://Fixture-Shop.example:443/menu?x=1");
    expect(check.ok && check.host).toBe("fixture-shop.example");
  });
});

describe("the Kernel session is deleted on every path", () => {
  it.each<[string, PageTurn, string]>([
    ["ok", { kind: "page", text: FIXTURE_PAGE_TEXT }, "ok"],
    ["refused by status", { kind: "page", text: "Forbidden", status: 403 }, "refused"],
    ["refused by a sign-in", { kind: "page", text: "Sign in", signIn: true }, "refused"],
    ["timeout", { kind: "vm_error", error: "page.goto: Timeout 18000ms exceeded." }, "timeout"],
    ["unreachable", { kind: "vm_error", error: "page.goto: net::ERR_NAME_NOT_RESOLVED" }, "unreachable"],
  ])("%s ends with one delete call", async (_label, turn, kind) => {
    const { fake, result } = read(turn);
    expect((await result).kind).toBe(kind);
    expect(fake.creates()).toHaveLength(1);
    expect(fake.deletes()).toBe(1);
  });

  it("abort ends with one delete call", async () => {
    const controller = new AbortController();
    const { fake, result } = read({ kind: "hang" }, controller.signal);
    setTimeout(() => controller.abort(), 50);
    expect((await result).kind).toBe("unreachable");
    expect(fake.deletes()).toBe(1);
  });

  it("a session that never started has nothing to delete", async () => {
    const { fake, result } = read({ kind: "create_fails", status: 503 });
    expect((await result).kind).toBe("unreachable");
    expect(fake.deletes()).toBe(0);
  });
});

describe("the Kernel session asks for no stealth, proxy, profile or CAPTCHA solving", () => {
  it("the create request is asserted field by field", async () => {
    const { fake, result } = read({ kind: "page", text: FIXTURE_PAGE_TEXT });
    await result;
    const [create] = fake.creates();
    expect(create?.body).toEqual({ headless: true, stealth: false, proxy: { mode: "direct" }, kiosk_mode: false, timeout_seconds: 30 });
    expect(create?.body).toEqual(KERNEL_SESSION_REQUEST);
    for (const field of ["profile", "proxy_id", "extensions", "vaults", "start_url", "network", "invocation_id"]) expect(create?.body).not.toHaveProperty(field);
    // One navigation: the only executed code makes one goto and no click.
    const executes = fake.calls.filter((call) => call.path.endsWith("/playwright/execute"));
    expect(executes).toHaveLength(1);
    const code = String(executes[0]?.body?.code);
    expect(code.match(/page\.goto\(/g)).toHaveLength(1);
    expect(code).not.toMatch(/\.click\(|\.fill\(|\.goBack\(|newPage\(/);
  });

  it("text beyond the cap is cut, never sent whole", async () => {
    const long = `Kopi $1.80 ${"é".repeat(PAGE_READ_BOUNDS.maxTextBytes)}`;
    const { result } = read({ kind: "page", text: long });
    const page = await result;
    expect(page.kind === "ok" && new TextEncoder().encode(page.text).byteLength).toBeLessThanOrEqual(PAGE_READ_BOUNDS.maxTextBytes);
    expect(cutToBytes("ab€", 3)).toBe("ab");
  });
});

// Review additions, 2026-10-29: guards of readPageText that no named test covered.
describe("readPageText reads only the merchant's own host, once, and keeps the URL out of logs", () => {
  it.each([
    ["fixture-shop.example", "ok"],
    ["www.fixture-shop.example", "ok"],
    ["other-shop.example", "refused"],
    ["fixture-shop.example.other.example", "refused"],
  ])("a page that lands on %s reads as %s", async (host, kind) => {
    const { fake, result } = read({ kind: "page", text: FIXTURE_PAGE_TEXT, host });
    expect((await result).kind).toBe(kind);
    expect(fake.deletes()).toBe(1);
  });

  it("a PDF document reads as a PDF with no text, and its session is deleted", async () => {
    const { fake, result } = read({ kind: "page", text: FIXTURE_PAGE_TEXT, pdf: true });
    expect(await result).toEqual({ kind: "ok", text: "", finalHost: "fixture-shop.example", pdf: true });
    expect(fake.deletes()).toBe(1);
  });

  it("a failed create is not retried, so one import makes at most one session", async () => {
    const { fake, result } = read({ kind: "create_fails", status: 503 });
    expect((await result).kind).toBe("unreachable");
    expect(fake.creates()).toHaveLength(1);
  });

  it("a failed delete still answers the read and logs the session id", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: unknown) => void lines.push(String(line)));
    vi.stubEnv("LOG_LEVEL", "debug");
    try {
      const { fake, result } = read({ kind: "page", text: FIXTURE_PAGE_TEXT }, undefined, { deleteStatus: 500 });
      expect((await result).kind).toBe("ok");
      expect(fake.deletes()).toBe(1);
      expect(lines.some((line) => line.includes("kernel_session_delete_failed") && line.includes("FIXTURE-kernel-session"))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    }
  });

  it("the link reaches the browser as one string literal, whatever it holds", async () => {
    const tricky = new URL("https://fixture-shop.example/it's'+globalThis.x+'/menu?q=${globalThis.y}`);//");
    const fake = createFakeKernel(() => ({ kind: "page", text: FIXTURE_PAGE_TEXT }));
    await readPageText(tricky, new AbortController().signal, { apiKey: "FIXTURE-kernel-key", fetch: fake.fetch });
    const code = String(fake.calls.find((call) => call.path.endsWith("/playwright/execute"))?.body?.code);
    const source = ts.createSourceFile("vm.ts", `async function vm(page) {${code}}`, ts.ScriptTarget.Latest, true);
    const gotos: ts.CallExpression[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "page.goto") gotos.push(node);
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(gotos).toHaveLength(1);
    const [first] = gotos[0]!.arguments;
    expect(first && ts.isStringLiteral(first) && first.text).toBe(tricky.href);
  });

  it("the Kernel SDK writes no request body to the console, even with KERNEL_LOG=debug", async () => {
    const NEEDLE = "FIXTURENEEDLEKERNELLOG5K";
    const lines: string[] = [];
    for (const method of ["log", "info", "debug", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ")));
    }
    vi.stubEnv("KERNEL_LOG", "debug");
    try {
      const fake = createFakeKernel(() => ({ kind: "page", text: FIXTURE_PAGE_TEXT }));
      await readPageText(new URL(`https://fixture-shop.example/${NEEDLE}/menu`), new AbortController().signal, { apiKey: "FIXTURE-kernel-key", fetch: fake.fetch });
      const surface = lines.join("\n");
      // Self-test first: the scanner finds the needle once it is planted on this surface.
      expect(`${surface}\n${JSON.stringify({ url: `https://fixture-shop.example/${NEEDLE}/menu` })}`.includes(NEEDLE)).toBe(true);
      expect(JSON.stringify(fake.calls).includes(NEEDLE)).toBe(true);
      expect(surface.includes(NEEDLE)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    }
  });
});

describe("a page with no printed price makes no model call (the price check)", () => {
  it("opening hours and a phone number are not prices; a marked or two-decimal price is", () => {
    expect(hasPrintedPrice("Open 8am to 10pm. Call 6123 4567.")).toBe(false);
    expect(hasPrintedPrice("Otah: $2")).toBe(true);
    expect(hasPrintedPrice("Otah S$2")).toBe(true);
    expect(hasPrintedPrice("Otah SGD 2")).toBe(true);
    expect(hasPrintedPrice("Otah 2.00")).toBe(true);
  });
});

describe("a drafted price not printed on the page stays blank", () => {
  it('"4.9" on the page keeps 4.90; "49" on the page blanks 4.90', () => {
    const draft = draftOf([{ name: "Ebi fry", priceText: "4.90" }]);
    expect(keepPrintedOnly(draft, "Ebi fry 4.9").draft.items[0]).toMatchObject({ priceSgdCents: 490, priceBasis: "explicit" });
    expect(keepPrintedOnly(draft, "Ebi fry 49").draft.items[0]).toMatchObject({ priceSgdCents: null, priceBasis: "not_on_page" });
  });

  it("an invented price is blanked with basis not_on_page and counted blank", () => {
    const draft = draftOf([{ name: "Kopi C", priceText: "1.80" }, { name: "Ebi fry", priceText: "6.40" }]);
    const kept = keepPrintedOnly(draft, FIXTURE_PAGE_TEXT);
    expect(kept.draft.items.map((item) => [item.priceSgdCents, item.priceBasis])).toEqual([[180, "explicit"], [null, "not_on_page"]]);
    expect(kept.draft.blankPriceCount).toBe(1);
    expect(kept.draft.fingerprint).not.toBe(draft.fingerprint);
  });

  it("price tokens read digits as printed, not inside longer numbers", () => {
    expect([...pagePriceTokens("$4.90, S$12 and 4.905 and 1.2.3")].sort((a, b) => a - b)).toEqual([490, 1200]);
  });
});

describe("a drafted name not on the page is left out", () => {
  it("an item whose folded name is not in the folded page text is dropped and counted", () => {
    const draft = draftOf([
      { name: "KAYA  toast set", priceText: "3.50" },
      { name: "Golden Lobster", priceText: "3.50" },
      { name: null, priceText: "1.80" },
    ]);
    const kept = keepPrintedOnly(draft, FIXTURE_PAGE_TEXT);
    expect(kept.draft.items.map((item) => item.name)).toEqual(["KAYA  toast set"]);
    expect(kept.droppedNames).toBe(2);
  });
});

// ---- Test 12: only the browser integration imports the Kernel SDK ------------------------------

const ROOT = join(import.meta.dirname, "..", "..");
const KERNEL_MODULE = "src/integrations/browser/kernel.ts";

function kernelImporters(files: { path: string; text: string }[]): string[] {
  const out: string[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true);
    let found = false;
    const visit = (node: ts.Node) => {
      const specifier =
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
            ? node.arguments[0].text
            : null;
      if (specifier !== null && /^@onkernel\/sdk(\/|$)/.test(specifier)) found = true;
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (found) out.push(file.path);
  }
  return out;
}

function sourceFiles(dir: string): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name))
    .map((entry) => {
      const full = join(entry.parentPath, entry.name);
      return { path: relative(ROOT, full), text: readFileSync(full, "utf8") };
    });
}

describe("only the browser integration imports the Kernel SDK", () => {
  it("the scanner finds a planted import elsewhere, in each import form", () => {
    for (const text of ['import Kernel from "@onkernel/sdk";', 'export { Kernel } from "@onkernel/sdk";', 'const k = await import("@onkernel/sdk/resources");', 'const k = require("@onkernel/sdk");']) {
      expect(kernelImporters([{ path: "src/domain/planted.ts", text }])).toEqual(["src/domain/planted.ts"]);
    }
  });

  it("src/integrations/browser/kernel.ts is the only importer under src and the app", () => {
    expect(kernelImporters(sourceFiles(join(ROOT, "src")))).toEqual([KERNEL_MODULE]);
  });
});
