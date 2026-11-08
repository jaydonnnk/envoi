import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CounterPoster } from "@/app/merchant/setup/poster/poster";

// S49 test 85. FIXTURE content, static instructions with no QR writer or provider call.
const poster = (isDemoFixture: boolean) => renderToStaticMarkup(createElement(CounterPoster, { outlet: { name: "FIXTURE Kopi", isDemoFixture } }));
describe("counter poster (FIXTURE)", () => {
  it("the poster labels the shop as a test shop while it is one", () => {
    expect(poster(true)).toContain("Test shop · test money only");
  });
  it("a non-fixture poster keeps the test-money label without calling it a test shop", () => {
    const html = poster(false);
    expect(html).not.toContain("Test shop");
    expect(html).toContain("Test money only");
  });
  it("the poster names the shop and tells visitors to use the existing SGQR", () => {
    const html = poster(true);
    expect(html).toContain("FIXTURE Kopi");
    expect(html).toContain("envoi-helx.onrender.com/buy/scan");
    expect(html).toContain("SGQR beside this poster");
    expect(html).toContain("Approve the payment in PayPal");
  });
  it("the poster contains no new QR or code image", () => {
    const html = poster(true);
    const codeSurface = /<(?:img|svg|canvas)\b|Envoi shop QR|Drawing the QR code/i;
    for (const needle of ['<img src="fixture-code.png" />', '<svg><path /></svg>', '<canvas></canvas>']) {
      expect(html + needle).toMatch(codeSurface);
    }
    expect(html).not.toMatch(codeSurface);
  });
  it("the poster can be printed without generating a QR", () => {
    const html = poster(true);
    expect(html).toMatch(/<button[^>]*>Print<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });
  it("renders the three reviewed poster lines", () => {
    const html = poster(true);
    expect(html).toContain("游客:扫码用 PayPal 付款");
    expect(html).toContain("Pelawat: imbas untuk bayar dengan PayPal");
    expect(html).toContain("பார்வையாளர்கள்: PayPal மூலம் பணம் செலுத்த ஸ்கேன் செய்யவும்");
  });
});
