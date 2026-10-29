// The menu page link a merchant pastes (S24; Gate 2 web menu import, rule 2). Checked before
// anything is admitted: https on port 443 only, no user or password part, a host name rather than an
// IP literal, no localhost or single-label host, at most 2,048 characters. Nothing here resolves DNS;
// Kernel's browser runs in Kernel's cloud, not inside Render.

export const MENU_PAGE_URL_MAX_CHARS = 2_048;

export type MenuPageUrlCheck =
  | { ok: true; url: URL; host: string }
  | { ok: false; reason: "not_https" | "has_credentials" | "ip_or_local_host" | "bad_port" | "too_long" | "malformed" };

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
// A label of letters, digits and hyphens, not starting or ending with a hyphen.
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function checkMenuPageUrl(input: string): MenuPageUrlCheck {
  const text = input.trim();
  if (text.length > MENU_PAGE_URL_MAX_CHARS) return { ok: false, reason: "too_long" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "has_credentials" };
  // URL drops the default port, so any port left here is not 443.
  if (url.port !== "") return { ok: false, reason: "bad_port" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || IPV4.test(host)) return { ok: false, reason: "ip_or_local_host" };
  const labels = host.split(".");
  if (labels.length < 2 || host === "localhost" || host.endsWith(".localhost") || labels.at(-1) === "local") return { ok: false, reason: "ip_or_local_host" };
  if (!labels.every((label) => LABEL.test(label)) || /^\d+$/.test(labels.at(-1)!)) return { ok: false, reason: "malformed" };
  return { ok: true, url, host };
}
