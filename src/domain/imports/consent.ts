// The versioned OpenAI disclosure for menu photo import (Gate 2 "Request-memory menu boundary",
// approved 2026-10-11). The short text is always shown; the details sit behind a "Details" control
// and belong to the same version. The version is derived from both, so any change to either text
// changes it, and an upload made under an older text is refused with consent_required.
export const MENU_CONSENT_TEXT = {
  short: [
    "Your menu photo is sent to OpenAI to draft item names and SGD prices while you wait.",
    "Envoi does not store it; only this browser tab keeps a copy, for side-by-side review.",
    "OpenAI may keep it for up to 30 days for abuse monitoring, or longer where the law or harm prevention requires, and does not train on it unless the account owner opts in.",
    "Upload only a menu, with no people or personal information.",
  ],
  details: [
    "Envoi sends the photo with OpenAI's store: false setting, which asks OpenAI not to keep the request for later use; OpenAI does not publish exactly what it changes for this kind of request.",
    "That setting is separate from the abuse-monitoring copy, which OpenAI removes only for approved Zero Data Retention accounts.",
    "OpenAI keeps an image its systems flag as possible child sexual abuse material for manual review, even when other retention is off.",
    "These are OpenAI's published terms; Envoi has not verified OpenAI's actual deletion.",
  ],
} as const;

// FNV-1a over the serialized text: no Node module, so the consent screen in the browser and the
// route on the server derive the same version from the same text.
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const MENU_CONSENT_VERSION = `menu-consent-${fnv1a(JSON.stringify(MENU_CONSENT_TEXT))}`;
