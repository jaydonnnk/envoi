import sharp from "sharp";
import { MENU_IMPORT_LIMITS } from "@/domain/imports/types";

// The only module that imports sharp (Gate 3 Files). Everything happens in memory: the header is
// read first, so a photo over 2,048 pixels per side or not a JPEG is refused before any pixel is
// decoded; then one decode applies the orientation and re-encodes a JPEG with no metadata, without
// enlarging. One decode runs at a time in this process, and sharp keeps no cache.

sharp.cache(false);
sharp.concurrency(1);

export type NormalizedPhoto =
  | { ok: true; jpeg: Uint8Array; width: number; height: number }
  | { ok: false; reason: "not_jpeg" | "too_many_pixels" | "decode_failed" };

// The pixel decode, separate so a test can prove a refused header never reaches it.
export const pixelDecoder = {
  async decodeAndReencode(jpeg: Uint8Array): Promise<{ jpeg: Uint8Array; width: number; height: number }> {
    const { data, info } = await sharp(jpeg, { limitInputPixels: MENU_IMPORT_LIMITS.maxEdgePixels ** 2, failOn: "error" })
      .rotate()
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
  },
};

let queue: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

export async function normalizeMenuJpeg(jpeg: Uint8Array): Promise<NormalizedPhoto> {
  let header: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    header = await sharp(jpeg).metadata();
  } catch {
    // Not an image format sharp knows, so certainly not a JPEG.
    return { ok: false, reason: "not_jpeg" };
  }
  // The format comes from the content's own header, never from a declared type or file name.
  if (header.format !== "jpeg") return { ok: false, reason: "not_jpeg" };
  const limit = MENU_IMPORT_LIMITS.maxEdgePixels;
  if (!header.width || !header.height) return { ok: false, reason: "decode_failed" };
  if (header.width > limit || header.height > limit) return { ok: false, reason: "too_many_pixels" };
  try {
    return { ok: true, ...(await oneAtATime(() => pixelDecoder.decodeAndReencode(jpeg))) };
  } catch {
    return { ok: false, reason: "decode_failed" };
  }
}
