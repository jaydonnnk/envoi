// The Phantom landing (Gate 3 reopening 2026-10-18). The Phantom Browse link opens /buy in the wallet's
// browser with the basket and rail=pyusd, and that page asks for the PYUSD review itself through the
// ordinary POST /purchases, so the buyer's first page there is the review they confirm by paying. A
// refused review leaves the basket on /buy with the refusal's message. Shared by the server page and
// the client basket form, so it holds no React and no database.

export type ReviewLine = { menuItemId: string; quantity: number };
export type Rail = "paypal" | "pyusd";
export type ReviewPost = (body: { outletId: string; rail: Rail; lines: ReviewLine[] }) => Promise<{ ok: boolean; data?: { purchaseId: string }; error?: { message: string } }>;

// Whether /buy was opened from the Phantom Browse link: rail=pyusd and a pre-filled basket.
export function landsOnPyusd(railParam: unknown, preselectedCount: number): boolean {
  return railParam === "pyusd" && preselectedCount > 0;
}

// The review a landing asks for on its own, or null when the buyer reviews with the Review button,
// which keeps the shop's usual rail.
export function landingReview(autoReview: boolean, lines: readonly ReviewLine[]): { rail: Rail; lines: ReviewLine[] } | null {
  return autoReview && lines.length > 0 ? { rail: "pyusd", lines: [...lines] } : null;
}

// Asks the server for one review and opens it; a refusal comes back as the message to show, and
// nothing is opened.
export async function requestReview(post: ReviewPost, navigate: (href: string) => void, outletId: string, rail: Rail, lines: ReviewLine[]): Promise<string | null> {
  const result = await post({ outletId, rail, lines });
  if (!result.ok || !result.data) return result.error?.message ?? "The review could not be created. Try again.";
  navigate(`/review/${encodeURIComponent(result.data.purchaseId)}`);
  return null;
}
