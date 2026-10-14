import type { MenuDraft } from "./types";

// The JSON shape of a menu draft, shared by the merchant routes, the setup page and its editor.
export type DraftJson = Omit<MenuDraft, "confirmedAt"> & { confirmedAt: string | null };

export function draftJson(draft: MenuDraft): DraftJson {
  return { ...draft, confirmedAt: draft.confirmedAt?.toISOString() ?? null };
}
