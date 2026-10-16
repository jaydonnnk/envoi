import { randomBytes } from "node:crypto";
import fs, { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APICallError } from "@ai-sdk/provider";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { importRuntime } from "@/domain/imports/request";
import { draftMenuFromPhoto } from "@/integrations/ai/menu-vision";
import { pixelDecoder } from "@/integrations/image/normalize";
import { routeParams, createPaymentsFixture, type PaymentsFixture } from "../support/payments";
import { jsonRequest, signInCookie } from "../support/merchant";
import {
  COMMENT_MARKER,
  EXIF_MARKER,
  FIXTURE_BOUNDS,
  FIXTURE_VISION_ENV,
  FIXTURE_VISION_MODEL,
  XMP_MARKER,
  countedStream,
  createFakeVision,
  fixturePolicy,
  importRequest,
  jpegWithMetadata,
  multipart,
  newImportShop,
  paddedJpeg,
  photoBody,
  pngBytes,
  sentImageBase64,
  solidJpeg,
  visionItem,
  type VisionCall,
  type VisionTurn,
} from "../support/menu-import";

// S11: the menu-import route handler and the draft reload, run as envoi_web against a migrated
// disposable database with the real Better Auth handler. OpenAI is faked at the provider's fetch
// boundary (FIXTURE); photos are generated. Every case uses its own FIXTURE shop, and the global
// in-flight and daily limits are raised so cases never block each other; the admission tests prove
// those limits.

type Envelope = { ok: boolean; data?: Record<string, unknown> & { draft?: { items: { name: string; priceSgdCents: number | null; source: string }[] }; latestImport?: { outcome: string } | null }; error?: { code: string; message: string; details: Record<string, string | number | boolean> } };

const ISOLATED = { outletInFlight: 1, globalInFlight: 100, outletDaily: 10, globalDaily: 1_000 };
const DRAFT_OUTPUT = { items: [visionItem("FIXTURE Kopi O", "1.80"), visionItem("FIXTURE Teh", "1.60"), visionItem("FIXTURE Kaya toast", null)] };
const MIB = 1_048_576;

let fixture: PaymentsFixture;
let routes: {
  auth: typeof import("@/app/api/auth/[...all]/route");
  imports: typeof import("@/app/api/v1/merchant/outlets/[id]/menu-imports/route");
  draft: typeof import("@/app/api/v1/merchant/outlets/[id]/menu-draft/route");
};
let script: (index: number, call: VisionCall) => VisionTurn | Promise<VisionTurn>;
let fake: ReturnType<typeof createFakeVision>;

beforeAll(async () => {
  fixture = await createPaymentsFixture("import-route", FIXTURE_VISION_ENV);
  routes = {
    auth: await import("@/app/api/auth/[...all]/route"),
    imports: await import("@/app/api/v1/merchant/outlets/[id]/menu-imports/route"),
    draft: await import("@/app/api/v1/merchant/outlets/[id]/menu-draft/route"),
  };
});

beforeEach(() => {
  script = () => ({ kind: "answer", output: DRAFT_OUTPUT });
  fake = createFakeVision((index, call) => script(index, call));
  vi.stubGlobal("fetch", fake.fetch);
  importRuntime.policy = fixturePolicy();
  importRuntime.limits = ISOLATED;
  importRuntime.now = () => new Date();
  importRuntime.draft = draftMenuFromPhoto;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await fixture?.database.drop();
});

async function shop(label: string) {
  const created = await newImportShop(fixture.database, label);
  const cookie = await signInCookie(routes.auth.POST, created.merchant);
  return { ...created, cookie };
}
type Shop = Awaited<ReturnType<typeof shop>>;

async function send(target: Shop, body: ReadableStream<Uint8Array> | Uint8Array, options: { headers?: Record<string, string>; signal?: AbortSignal; contentType?: string } = {}) {
  const response = await routes.imports.POST(importRequest(target.outletId, target.cookie, body, { baseRevisionId: target.revisionId, ...options }), routeParams(target.outletId));
  return { status: response.status, body: (await response.json()) as Envelope };
}

const attempts = (outletId: string) =>
  fixture.database.admin<{ id: string; closed_outcome: string | null; model_dispatched_at: Date | null; actual_usd_micros: string | null }[]>`
    select id, closed_outcome, model_dispatched_at, actual_usd_micros from menu_imports where outlet_id = ${outletId} order by admitted_at`;

const getDraft = async (target: Shop) =>
  (await (await routes.draft.GET(jsonRequest("GET", `/api/v1/merchant/outlets/${target.outletId}/menu-draft`, target.cookie), routeParams(target.outletId))).json()) as Envelope;

// Gives up waiting after `ms`, so a call that never ends fails an assertion instead of the test timeout.
const within = <T,>(promise: Promise<T>, ms: number) => Promise.race([promise, new Promise<"still waiting">((resolve) => setTimeout(() => resolve("still waiting"), ms))]);

// From the second reading on, the injected clock reads `elapsedMs` after the first.
function elapsedClock(elapsedMs: number) {
  let first: Date | null = null;
  importRuntime.now = () => {
    if (first === null) {
      first = new Date();
      return first;
    }
    return new Date(first.getTime() + elapsedMs);
  };
}

describe("import route refusals read no body", () => {
  it("import route rejects a foreign Origin", async () => {
    const target = await shop("foreign-origin");
    const body = countedStream(photoBody(await solidJpeg()));
    const result = await send(target, body.stream, { headers: { origin: "https://shop.example.test" } });
    expect(result.status).toBe(403);
    expect(result.body.error).toMatchObject({ code: "forbidden_origin", details: { reason: "foreign" } });
    expect(await attempts(target.outletId)).toEqual([]);
    expect(body.pulls()).toBe(0);
  });

  it("stale consent version is refused before admission", async () => {
    const target = await shop("stale-consent");
    const body = countedStream(photoBody(await solidJpeg()));
    const result = await send(target, body.stream, { headers: { "envoi-consent-version": "menu-consent-00000000" } });
    expect(result.status).toBe(409);
    expect(result.body.error?.code).toBe("consent_required");
    expect(await attempts(target.outletId)).toEqual([]);
    expect(body.pulls()).toBe(0);
  });

  it("refused admission reads no image bytes", async () => {
    const target = await shop("refused-admission");
    // FIXTURE: a live import already open for this outlet.
    await fixture.database.admin`insert into menu_imports (id, outlet_id, actor_user_id, base_revision_id, consent_version, model_config_version, admitted_at, deadline_at, reserved_usd_micros)
      values ('imp_fixturelive', ${target.outletId}, ${target.merchant.userId}, ${target.revisionId}, 'FIXTURE', 'FIXTURE', now(), now() + interval '90 seconds', 5000)`;
    const body = countedStream(photoBody(await solidJpeg()));
    const result = await send(target, body.stream);
    expect(result.status).toBe(429);
    expect(result.body.error).toMatchObject({ code: "admission_rejected", details: { reason: "in_flight_outlet" } });
    expect(body.pulls()).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("import upload and photo rejects", () => {
  beforeEach(() => {
    script = () => {
      throw new Error("FIXTURE fake OpenAI must not be called for a rejected upload");
    };
  });

  async function rejected(target: Shop, result: { status: number; body: Envelope }, reason: string, outcome: string) {
    expect(result.status).toBe(422);
    expect(result.body.error).toMatchObject({ code: "import_rejected", details: { reason, outcome } });
    expect((await attempts(target.outletId)).map((row) => [row.closed_outcome, row.model_dispatched_at, row.actual_usd_micros])).toEqual([[outcome, null, "0"]]);
    expect(fake.calls).toHaveLength(0);
  }

  it("import body is counted, not trusted from Content-Length", async () => {
    const target = await shop("counted");
    // 3 MiB with no Content-Length at all: only counting can stop it.
    const body = countedStream(new Uint8Array(3 * MIB).fill(0x41));
    const result = await send(target, body.stream);
    await rejected(target, result, "too_large", "rejected_upload");
    expect(body.pulledBytes()).toBeLessThanOrEqual(2_621_440 + 64 * 1024);
  });

  it("slow upload stops at its read bound", async () => {
    const target = await shop("slow");
    elapsedClock(29_900);
    const controller = new AbortController();
    const body = countedStream(photoBody(await solidJpeg()), { chunkBytes: 100, stallAfter: 1 });
    const result = await within(send(target, body.stream, { signal: controller.signal }), 5_000);
    controller.abort();
    expect(result).not.toBe("still waiting");
    if (result === "still waiting") return;
    await rejected(target, result, "timeout", "rejected_upload");
  });

  it("non-multipart body is refused", async () => {
    const target = await shop("raw-body");
    await rejected(target, await send(target, await solidJpeg(), { contentType: "image/jpeg" }), "not_multipart", "rejected_upload");
  });

  it("second photo part is refused", async () => {
    const target = await shop("two-parts");
    const jpeg = await solidJpeg();
    const body = multipart([
      { name: "photo", filename: "menu.jpg", bytes: jpeg },
      { name: "photo2", filename: "back.jpg", bytes: jpeg },
    ]);
    await rejected(target, await send(target, body), "part_count", "rejected_upload");
  });

  it("body without a photo part is refused", async () => {
    const target = await shop("no-photo");
    const body = multipart([{ name: "image", filename: "menu.jpg", bytes: await solidJpeg() }]);
    await rejected(target, await send(target, body), "missing_photo", "rejected_upload");
  });

  it("JPEG over 2 MiB is refused inside a legal body", async () => {
    const target = await shop("big-part");
    const body = photoBody(await paddedJpeg(Math.round(2.3 * MIB)));
    expect(body.byteLength).toBeLessThan(2_621_440);
    await rejected(target, await send(target, body), "part_too_large", "rejected_upload");
  });

  it("non-JPEG content is refused even when labeled JPEG", async () => {
    const target = await shop("png");
    const body = multipart([{ name: "photo", filename: "menu.jpg", type: "image/jpeg", bytes: await pngBytes() }]);
    await rejected(target, await send(target, body), "not_jpeg", "rejected_photo");
  });

  it("JPEG over 2,048 pixels per side is refused before decode", async () => {
    const target = await shop("wide");
    const decode = vi.spyOn(pixelDecoder, "decodeAndReencode");
    await rejected(target, await send(target, photoBody(await solidJpeg(2_049, 100))), "too_many_pixels", "rejected_photo");
    expect(decode).not.toHaveBeenCalled();
  });
});

describe("menu vision request", () => {
  async function imported(label: string) {
    const target = await shop(label);
    const result = await send(target, photoBody(await solidJpeg()));
    return { target, result };
  }

  it("menu vision request sets store false", async () => {
    const { result } = await imported("store-false");
    expect(result.status).toBe(200);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.body.store).toBe(false);
  });

  it("menu vision request carries no tools", async () => {
    const { result } = await imported("no-tools");
    expect(result.status).toBe(200);
    expect(fake.calls).toHaveLength(1);
    expect(Object.keys(fake.calls[0]!.body)).not.toContain("tools");
  });

  it("menu vision call is never retried", async () => {
    script = () => ({ kind: "status", status: 500 });
    const { target, result } = await imported("no-retry");
    expect(fake.calls).toHaveLength(1);
    expect(result.status).toBe(502);
    expect(result.body.error).toMatchObject({ code: "provider_unreachable", details: { outcome: "model_failed" } });
    expect((await attempts(target.outletId)).map((row) => row.closed_outcome)).toEqual(["model_failed"]);
  });

  it("menu vision schema is strict with required nullable fields", async () => {
    await imported("strict-schema");
    const format = (fake.calls[0]!.body.text as { format: { type: string; strict: boolean; schema: { properties: { items: { items: { properties: Record<string, { type: string | string[]; enum?: unknown[] }>; required: string[] } } } } } }).format;
    expect(format).toMatchObject({ type: "json_schema", strict: true });
    const item = format.schema.properties.items.items;
    expect(Object.keys(item.properties).sort()).toEqual(["currency", "name", "portion", "priceText"]);
    expect([...item.required].sort()).toEqual(["currency", "name", "portion", "priceText"]);
    for (const [name, property] of Object.entries(item.properties)) {
      const allowsNull = Array.isArray(property.type) ? property.type.includes("null") : property.enum?.includes(null) || JSON.stringify(property).includes('"null"');
      expect(allowsNull, `${name} allows null`).toBe(true);
    }
  });

  it("menu vision output is capped at the reviewed token bound", async () => {
    await imported("token-bound");
    expect(fake.calls[0]!.body.max_output_tokens).toBe(FIXTURE_BOUNDS.maxOutputTokens);
  });

  it("menu vision uses AI_MENU_MODEL, not AI_MODEL", async () => {
    expect(process.env.AI_MODEL).not.toBe(process.env.AI_MENU_MODEL);
    await imported("menu-model");
    expect(fake.calls[0]!.body.model).toBe(FIXTURE_VISION_MODEL);
  });

  it("model budget keeps the commit reserve", async () => {
    const budgets: number[] = [];
    importRuntime.draft = (input) => {
      budgets.push(input.budgetMs);
      return draftMenuFromPhoto(input);
    };
    // The upload took 40 seconds of the 90: the call may use 45, keeping 5 for the commit.
    elapsedClock(40_000);
    const { result } = await imported("budget");
    expect(result.status).toBe(200);
    expect(budgets).toEqual([45_000]);
    expect(budgets[0]).toBeLessThanOrEqual(60_000);
  });

  it("client disconnect aborts the model call", async () => {
    const target = await shop("disconnect");
    const controller = new AbortController();
    script = () => {
      setTimeout(() => controller.abort(), 20);
      return { kind: "hang" };
    };
    const result = await within(send(target, photoBody(await solidJpeg()), { signal: controller.signal }), 5_000);
    expect(result).not.toBe("still waiting");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.signal?.aborted).toBe(true);
    expect((await attempts(target.outletId)).map((row) => row.closed_outcome)).toEqual(["aborted"]);
  });
});

describe("re-encoded photo carries no metadata", () => {
  it("re-encoded photo carries no metadata", async () => {
    const target = await shop("metadata");
    const original = await jpegWithMetadata();
    const markers = [EXIF_MARKER, XMP_MARKER, COMMENT_MARKER];
    // The FIXTURE photo really carries what the import must strip.
    const before = await sharp(original).metadata();
    expect(before).toMatchObject({ width: 40, height: 20, orientation: 6 });
    expect(markers.every((marker) => Buffer.from(original).includes(marker))).toBe(true);

    const result = await send(target, photoBody(original));
    expect(result.status).toBe(200);
    const sent = Buffer.from(sentImageBase64(fake.calls[0]!), "base64");
    const after = await sharp(sent).metadata();
    expect(after.format).toBe("jpeg");
    expect([after.width, after.height]).toEqual([20, 40]);
    expect(after.orientation).toBeUndefined();
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.comments ?? []).toEqual([]);
    for (const marker of markers) expect(sent.includes(marker), marker).toBe(false);
  });
});

describe("import writes nothing to disk", () => {
  it("import writes nothing to disk", async () => {
    const target = await shop("no-disk");
    const failing = await shop("no-disk-failing");
    const dir = mkdtempSync(join(tmpdir(), "envoi-s11-fixture-"));
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = dir;
    const writers = [
      vi.spyOn(fs, "writeFile"),
      vi.spyOn(fs, "writeFileSync"),
      vi.spyOn(fs, "appendFile"),
      vi.spyOn(fs, "appendFileSync"),
      vi.spyOn(fs, "createWriteStream"),
      vi.spyOn(fs, "mkdtemp"),
      vi.spyOn(fs, "mkdtempSync"),
      vi.spyOn(fs.promises, "writeFile"),
      vi.spyOn(fs.promises, "appendFile"),
      vi.spyOn(fs.promises, "mkdtemp"),
    ];
    // Named ESM imports of node:fs see the spies only after this.
    syncBuiltinESMExports();
    try {
      expect(tmpdir()).toBe(dir);
      const ok = await send(target, photoBody(await solidJpeg()));
      const bad = await send(failing, multipart([{ name: "photo", filename: "menu.jpg", bytes: await pngBytes() }]));
      expect([ok.status, bad.status]).toEqual([200, 422]);
    } finally {
      process.env.TMPDIR = previous;
      vi.restoreAllMocks();
      syncBuiltinESMExports();
    }
    expect(readdirSync(dir)).toEqual([]);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
    rmSync(dir, { recursive: true });
  });
});

describe("model dispatch is recorded before the call", () => {
  it("model dispatch is recorded before the call", async () => {
    const target = await shop("dispatch");
    let seenBySecondConnection: string | null | undefined;
    script = async () => {
      // The superuser connection is a second connection: it sees only committed writes.
      const [row] = await fixture.database.admin<{ dispatched: string | null }[]>`select model_dispatched_at::text as dispatched from menu_imports where outlet_id = ${target.outletId}`;
      seenBySecondConnection = row?.dispatched ?? null;
      return { kind: "answer", output: DRAFT_OUTPUT };
    };
    const result = await send(target, photoBody(await solidJpeg()));
    expect(result.status).toBe(200);
    expect(seenBySecondConnection).not.toBeNull();
    expect(String(seenBySecondConnection)).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });
});

describe("image bytes never reach logs, responses or audit", () => {
  // The leak scanner: a needle counts as present raw, inside a data URL, JSON-escaped once or twice,
  // or with JSON-escaped slashes.
  function containsNeedle(text: string, needle: string): boolean {
    const unescaped = text.replace(/\\\\/g, "\\").replace(/\\\//g, "/");
    return [text, unescaped, unescaped.replace(/\\\//g, "/")].some((candidate) => candidate.includes(needle));
  }

  it("image bytes never reach logs, responses or audit", async () => {
    const needle = `FIXTURE/${randomBytes(30).toString("base64")}`;

    // Scanner self-test on the actual serialized log format (one JSON object per line), written
    // without the logger's redaction, which would otherwise hide what the scanner must find.
    const line = (value: string) => JSON.stringify({ at: new Date().toISOString(), level: "warn", event: "FIXTURE_scanner_self_test", value });
    const planted = [
      line(needle),
      line(`data:image/jpeg;base64,${needle}`),
      line(JSON.stringify({ requestBodyValues: { input: [{ image_url: `data:image/jpeg;base64,${needle}` }] } })),
      line(`data:image/jpeg;base64,${needle}`).replace(/\//g, "\\/"),
    ];
    for (const text of planted) expect(containsNeedle(text, needle), text).toBe(true);
    expect(containsNeedle(line("FIXTURE clean line"), needle)).toBe(false);

    const output: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        output.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
      });
    }
    let sentImage = "";
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body);
      sentImage = /data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/.exec(body)?.[1] ?? "";
      throw new APICallError({
        message: `FIXTURE provider rejected the image ${needle}`,
        url: "https://api.openai.com/v1/responses",
        requestBodyValues: { needle, input: JSON.parse(body).input },
        statusCode: 400,
        responseBody: JSON.stringify({ error: { message: needle } }),
        cause: new Error(`FIXTURE cause ${needle}`),
        isRetryable: false,
      });
    });

    const target = await shop("leak");
    const response = await routes.imports.POST(importRequest(target.outletId, target.cookie, photoBody(await solidJpeg(640, 480)), { baseRevisionId: target.revisionId }), routeParams(target.outletId));
    const responseText = await response.text();
    expect(response.status).toBe(502);
    expect(sentImage.length).toBeGreaterThan(200);
    const audit = JSON.stringify(await fixture.database.admin`select * from audit_events where outlet_id = ${target.outletId}`);
    const imports = JSON.stringify(await fixture.database.admin`select * from menu_imports where outlet_id = ${target.outletId}`);
    // The failure was logged, so the logs are a surface that was actually written.
    expect(output.some((text) => text.includes("menu_vision_failed"))).toBe(true);
    const imageSlice = sentImage.slice(100, 160);
    for (const [surface, text] of [
      ["logs", output.join("\n")],
      ["response", responseText],
      ["audit rows", audit],
      ["import rows", imports],
    ] as const) {
      expect(containsNeedle(text, needle), surface).toBe(false);
      expect(containsNeedle(text, imageSlice), `${surface} image bytes`).toBe(false);
    }
  });
});

describe("an abandoned import reads as expired with no write", () => {
  it("an abandoned import reads as expired with no write", async () => {
    const target = await shop("abandoned");
    // FIXTURE: an import admitted two minutes ago that never closed, as if its process died.
    await fixture.database.admin`insert into menu_imports (id, outlet_id, actor_user_id, base_revision_id, consent_version, model_config_version, admitted_at, deadline_at, model_dispatched_at, reserved_usd_micros)
      values ('imp_fixtureabandoned', ${target.outletId}, ${target.merchant.userId}, ${target.revisionId}, 'FIXTURE', 'FIXTURE', now() - interval '2 minutes', now() - interval '30 seconds', now() - interval '100 seconds', 5000)`;
    const snapshot = () => fixture.database.admin`
      select (select row_to_json(m) from menu_imports m where m.id = 'imp_fixtureabandoned') as attempt,
        (select count(*)::int from audit_events where outlet_id = ${target.outletId}) as audits,
        (select json_agg(r order by r.id) from menu_revisions r where r.outlet_id = ${target.outletId}) as revisions`;
    const before = await snapshot();
    const draft = await getDraft(target);
    expect(draft.data?.latestImport).toMatchObject({ id: "imp_fixtureabandoned", outcome: "expired" });
    expect(await snapshot()).toEqual(before);
  });
});

describe("draft reload reports the latest import outcome", () => {
  it("draft reload reports the latest import outcome", async () => {
    const target = await shop("reload");
    // The response is dropped unread, as if the connection was lost after the commit.
    await routes.imports.POST(importRequest(target.outletId, target.cookie, photoBody(await solidJpeg()), { baseRevisionId: target.revisionId }), routeParams(target.outletId));
    const draft = await getDraft(target);
    expect(draft.data?.latestImport).toMatchObject({ outcome: "completed", rowsDrafted: 3, rowsBlankPrice: 1 });
    expect(draft.data?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "FIXTURE Kopi O", priceSgdCents: 180, source: "import_suggestion" }),
        expect.objectContaining({ name: "FIXTURE Kaya toast", priceSgdCents: null, source: "import_suggestion" }),
      ]),
    );
  });
});

// S11 review fixes: every admission refusal said retryable, even one that holds until a reviewed
// code change, such as the empty bounds list that keeps imports closed in this release.
describe("admission refusals say whether a retry can pass", () => {
  it("only a refusal a later attempt can pass is retryable", async () => {
    importRuntime.policy = fixturePolicy(1_000_000, []);
    const closed = await shop("no-bounds");
    const refused = await send(closed, countedStream(photoBody(await solidJpeg())).stream);
    expect(refused.status).toBe(429);
    expect(refused.body.error).toMatchObject({ code: "admission_rejected", retryable: false, details: { reason: "model_bounds_missing" } });
    expect(refused.body.error?.message).toBe("Menu photo import is not available in this release. You can still enter your menu by hand.");

    importRuntime.policy = fixturePolicy();
    const busy = await shop("busy");
    // FIXTURE: a live import already open for this outlet.
    await fixture.database.admin`insert into menu_imports (id, outlet_id, actor_user_id, base_revision_id, consent_version, model_config_version, admitted_at, deadline_at, reserved_usd_micros)
      values ('imp_fixturebusy', ${busy.outletId}, ${busy.merchant.userId}, ${busy.revisionId}, 'FIXTURE', 'FIXTURE', now(), now() + interval '90 seconds', 5000)`;
    const later = await send(busy, countedStream(photoBody(await solidJpeg())).stream);
    expect(later.body.error).toMatchObject({ code: "admission_rejected", retryable: true, details: { reason: "in_flight_outlet" } });
    expect(fake.calls).toHaveLength(0);
  });
});

// S11 review fixes: a request with no Origin is refused like a foreign one, before admission and
// before any body byte; every browser sends Origin on a POST, so only a non-browser client omits it.
describe("a missing Origin is refused", () => {
  it("import route rejects a request with no Origin", async () => {
    const target = await shop("missing-origin");
    const body = countedStream(photoBody(await solidJpeg()));
    const request = importRequest(target.outletId, target.cookie, body.stream, { baseRevisionId: target.revisionId });
    request.headers.delete("origin");
    expect(request.headers.has("origin")).toBe(false);
    const response = await routes.imports.POST(request, routeParams(target.outletId));
    expect(response.status).toBe(403);
    expect(((await response.json()) as Envelope).error).toMatchObject({ code: "forbidden_origin", details: { reason: "missing" } });
    expect(await attempts(target.outletId)).toEqual([]);
    expect(body.pulls()).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });
});
