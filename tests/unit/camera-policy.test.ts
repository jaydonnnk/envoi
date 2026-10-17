import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

// S10: the buyer scan page is the only page that may ask for the camera, and only for this site's
// own document. Next applies every matching headers() entry in order, and for the same header the
// later entry wins, so the scan page's entry must come after the site-wide one. The rendered
// headers of a production build are checked separately in the S10 browser evidence.
describe("camera permission policy", () => {
  it("only the scan page may use the camera", async () => {
    const entries = (await nextConfig.headers!()).map(({ source, headers }) => ({
      source,
      policy: headers.find((header) => header.key === "Permissions-Policy")?.value ?? null,
    }));

    const siteWide = entries.findIndex((entry) => entry.source === "/:path*");
    expect(entries[siteWide]?.policy).toBe("camera=(), microphone=(), geolocation=()");

    const cameraAllowed = entries.filter((entry) => entry.policy !== null && !entry.policy.includes("camera=()"));
    expect(cameraAllowed).toEqual([{ source: "/buy/scan", policy: "camera=(self), microphone=(), geolocation=()" }]);
    expect(entries.findIndex((entry) => entry.source === "/buy/scan")).toBeGreaterThan(siteWide);
  });
});
