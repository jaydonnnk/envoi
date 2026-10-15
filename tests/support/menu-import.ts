import { drizzle } from "drizzle-orm/postgres-js";
import sharp from "sharp";
import { MENU_CONSENT_VERSION } from "@/domain/imports/consent";
import type { MenuModelBounds, MenuSpendPolicy } from "@/domain/imports/types";
import { createMerchantOutlet } from "@/domain/outlets/merchant";
import * as schema from "@/lib/db/schema";
import { isAppError } from "@/lib/errors";
import type { TestDatabase } from "./db";
import { newMerchant, type TestMerchant } from "./merchant";
import { TEST_BASE_URL } from "./session";

// FIXTURE support for the S11 menu photo import tests. Photos are generated here; no real menu
// photo is used. OpenAI is faked at the provider's fetch boundary and every response is labeled.

export const FIXTURE_VISION_MODEL = "FIXTURE-vision-model";

export const FIXTURE_VISION_ENV = {
  OPENAI_API_KEY: "fixture-openai-key",
  AI_MODEL: "FIXTURE-text-model",
  AI_MENU_MODEL: FIXTURE_VISION_MODEL,
  MENU_IMPORTS_ENABLED: "true",
};

// FIXTURE bounds: US$1 per million tokens each way, so one call reserves (3,000 + 2,000) micros.
export const FIXTURE_BOUNDS: MenuModelBounds = {
  model: FIXTURE_VISION_MODEL,
  inputUsdMicrosPerMillionTokens: 1_000_000,
  outputUsdMicrosPerMillionTokens: 1_000_000,
  maxInputTokens: 3_000,
  maxOutputTokens: 2_000,
};
export const FIXTURE_RESERVATION = 5_000;

export const fixturePolicy = (ceiling: number | null = 1_000_000, bounds: MenuModelBounds[] = [FIXTURE_BOUNDS]): MenuSpendPolicy => ({
  dailyCeilingUsdMicros: ceiling,
  modelBounds: bounds,
});

// ---- Photos -----------------------------------------------------------------------------------

export async function solidJpeg(width = 64, height = 48): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: "#cc3300" } }).jpeg().toBuffer());
}

export const EXIF_MARKER = "FIXTURE-EXIF-DESC";
export const XMP_MARKER = "FIXTURE-XMP-TITLE";
export const COMMENT_MARKER = "FIXTURE-JPEG-COMMENT";

// A 40 x 20 JPEG stored with orientation 6 (displayed rotated to 20 x 40), EXIF with GPS, XMP and a
// JPEG comment segment.
export async function jpegWithMetadata(): Promise<Uint8Array> {
  const tagged = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#cc3300" } })
    .withExif({ IFD0: { ImageDescription: EXIF_MARKER }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "1/1 17/1 0/1" } })
    .withXmp(
      `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${XMP_MARKER}</dc:title></rdf:Description></rdf:RDF></x:xmpmeta>`,
    )
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  return insertSegment(new Uint8Array(tagged), 0xfe, new TextEncoder().encode(COMMENT_MARKER));
}

// Inserts one marker segment right after the JPEG start-of-image marker.
function insertSegment(jpeg: Uint8Array, marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.byteLength + 2;
  const segment = new Uint8Array(4 + payload.byteLength);
  segment.set([0xff, marker, length >> 8, length & 0xff]);
  segment.set(payload, 4);
  const out = new Uint8Array(jpeg.byteLength + segment.byteLength);
  out.set(jpeg.subarray(0, 2));
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.byteLength);
  return out;
}

// A small valid JPEG padded with APP15 segments to the given size: within 2,048 pixels per side,
// but over the 2 MiB part limit.
export async function paddedJpeg(totalBytes: number): Promise<Uint8Array> {
  let jpeg = await solidJpeg();
  const chunk = new Uint8Array(65_000).fill(0x41);
  while (jpeg.byteLength + chunk.byteLength + 4 <= totalBytes) jpeg = insertSegment(jpeg, 0xef, chunk);
  const rest = totalBytes - jpeg.byteLength - 4;
  if (rest > 0) jpeg = insertSegment(jpeg, 0xef, new Uint8Array(rest).fill(0x42));
  return jpeg;
}

export async function pngBytes(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width: 20, height: 20, channels: 3, background: "#003366" } }).png().toBuffer());
}

// ---- Multipart bodies and counted streams ------------------------------------------------------

export const BOUNDARY = "FIXTUREboundary7MA4YWxkTrZu0gW";

export type Part = { name: string; filename?: string; type?: string; bytes: Uint8Array };

export function multipart(parts: Part[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    const disposition = `form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ""}`;
    chunks.push(encoder.encode(`--${BOUNDARY}\r\nContent-Disposition: ${disposition}\r\nContent-Type: ${part.type ?? "image/jpeg"}\r\n\r\n`));
    chunks.push(part.bytes);
    chunks.push(encoder.encode("\r\n"));
  }
  chunks.push(encoder.encode(`--${BOUNDARY}--\r\n`));
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export const photoBody = (jpeg: Uint8Array) => multipart([{ name: "photo", filename: "menu.jpg", bytes: jpeg }]);

export const MULTIPART_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;

export type CountedStream = { stream: ReadableStream<Uint8Array>; pulls: () => number; pulledBytes: () => number };

// A body that counts how often and how much the route pulls. With `stallAfter`, it stops sending
// after that many chunks and never ends, like a slow upload.
export function countedStream(bytes: Uint8Array, options: { chunkBytes?: number; stallAfter?: number } = {}): CountedStream {
  const chunkBytes = options.chunkBytes ?? 64 * 1024;
  let offset = 0;
  let pulls = 0;
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1;
        if (options.stallAfter !== undefined && pulls > options.stallAfter) return new Promise<void>(() => {});
        if (offset >= bytes.byteLength) {
          controller.close();
          return;
        }
        const chunk = bytes.slice(offset, offset + chunkBytes);
        offset += chunk.byteLength;
        pulled += chunk.byteLength;
        controller.enqueue(chunk);
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulls: () => pulls, pulledBytes: () => pulled };
}

export function importRequest(
  outletId: string,
  cookie: string,
  body: ReadableStream<Uint8Array> | Uint8Array,
  options: { headers?: Record<string, string>; baseRevisionId: string; signal?: AbortSignal; contentType?: string },
): Request {
  return new Request(`${TEST_BASE_URL}/api/v1/merchant/outlets/${outletId}/menu-imports`, {
    method: "POST",
    headers: {
      cookie,
      origin: TEST_BASE_URL,
      "content-type": options.contentType ?? MULTIPART_TYPE,
      "envoi-consent-version": MENU_CONSENT_VERSION,
      "envoi-base-revision": options.baseRevisionId,
      ...options.headers,
    },
    body: body as BodyInit,
    signal: options.signal,
    duplex: "half",
  } as RequestInit);
}

// ---- The FIXTURE vision fake --------------------------------------------------------------------

export type VisionTurn =
  | { kind: "answer"; output: unknown; usage?: { input_tokens: number; output_tokens: number } }
  | { kind: "hang" }
  | { kind: "status"; status: number; body?: unknown };

export type VisionCall = { url: string; body: Record<string, unknown> & { input: unknown[] }; signal: AbortSignal | null };

export type FakeVision = { fetch: typeof globalThis.fetch; calls: VisionCall[] };

const RESPONSES_URL = "https://api.openai.com/v1/responses";

export function createFakeVision(script: (index: number, call: VisionCall) => VisionTurn | Promise<VisionTurn>): FakeVision {
  const calls: VisionCall[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== RESPONSES_URL) throw new Error(`FIXTURE fake OpenAI refuses an unexpected URL: ${url}`);
    const call: VisionCall = { url, body: JSON.parse(String(init?.body)), signal: init?.signal ?? null };
    const index = calls.length;
    calls.push(call);
    const turn = await script(index, call);
    if (turn.kind === "hang") {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        const abort = () => reject(signal?.reason ?? new DOMException("aborted", "AbortError"));
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    }
    if (turn.kind === "status") return Response.json(turn.body ?? { error: { message: "FIXTURE failure", type: "server_error" } }, { status: turn.status });
    return Response.json({
      id: `FIXTURE-resp-${index}`,
      object: "response",
      created_at: 1_790_000_000,
      model: FIXTURE_VISION_MODEL,
      status: "completed",
      output: [{ type: "message", id: `FIXTURE-msg-${index}`, role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(turn.output), annotations: [] }] }],
      usage: turn.usage ?? { input_tokens: 1_200, output_tokens: 300 },
      incomplete_details: null,
    });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export const visionItem = (name: string | null, priceText: string | null, fields: { portion?: string | null; currency?: "sgd_or_unmarked" | "other" | null } = {}) => ({
  name,
  portion: fields.portion ?? null,
  priceText,
  currency: fields.currency === undefined ? (priceText === null ? null : "sgd_or_unmarked") : fields.currency,
});

// The base64 image the fake received in the one captured request.
export function sentImageBase64(call: VisionCall): string {
  const text = JSON.stringify(call.body);
  const match = /data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/.exec(text);
  if (!match) throw new Error("FIXTURE fake OpenAI received no JPEG data URL");
  return match[1]!;
}

// ---- Shops --------------------------------------------------------------------------------------

export type ImportShop = { merchant: TestMerchant; outletId: string; revisionId: string };

// A FIXTURE merchant with one approved membership and a new, unpublished shop with an empty draft.
export async function newImportShop(database: TestDatabase, label: string): Promise<ImportShop> {
  const merchant = await newMerchant(database, label, { membership: true });
  const created = await createMerchantOutlet(drizzle(database.admin, { schema }), { name: `FIXTURE ${label} kopi`, area: "Tanjong Pagar", userId: merchant.userId, now: new Date() });
  if (isAppError(created)) throw new Error(`FIXTURE shop was not created: ${created.code}`);
  return { merchant, outletId: created.outlet.id, revisionId: created.draft.revisionId };
}
