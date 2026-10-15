import { MENU_IMPORT_LIMITS } from "./types";

// In-memory parsing of the counted upload body (Gate 3 "Menu and imports"). Exactly one part,
// named "photo", of at most 2 MiB. The part's declared type and file name are ignored: only the
// decoded content decides, in normalizeMenuJpeg. Nothing is written to a file.

export type PhotoPart =
  | { ok: true; jpeg: Uint8Array }
  | { ok: false; reason: "not_multipart" | "part_count" | "missing_photo" | "part_too_large" };

export async function parseSinglePhotoPart(bytes: Uint8Array, contentType: string | null): Promise<PhotoPart> {
  if (contentType === null || !/^multipart\/form-data\s*;/i.test(contentType)) return { ok: false, reason: "not_multipart" };
  let form: FormData;
  try {
    form = await new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { "content-type": contentType } }).formData();
  } catch {
    return { ok: false, reason: "not_multipart" };
  }
  const parts = [...form.entries()];
  if (parts.length > 1) return { ok: false, reason: "part_count" };
  const [part] = parts;
  if (!part || part[0] !== "photo" || typeof part[1] === "string") return { ok: false, reason: "missing_photo" };
  if (part[1].size > MENU_IMPORT_LIMITS.maxPhotoBytes) return { ok: false, reason: "part_too_large" };
  return { ok: true, jpeg: new Uint8Array(await part[1].arrayBuffer()) };
}
