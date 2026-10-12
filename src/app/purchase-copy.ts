// Shared buyer copy for purchase states. Pending, canceled, failed and uncertain are never shown
// as paid (product rule).
export const SINGAPORE_TIME = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" });
export const SINGAPORE_CLOCK = new Intl.DateTimeFormat("en-SG", { timeStyle: "short", timeZone: "Asia/Singapore" });
