#!/usr/bin/env python3
"""Build design/showcase/envoi-showcase.html: one self-contained 16:9 slideshow with embedded screenshots.

Run from the repo root: python3 -I design/showcase/build.py
Screenshots live in design/showcase/raw/. A slide whose image is missing shows a labeled placeholder.
"""
import base64
import html
import json
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "envoi-showcase.html")


def img(name, width=1800):
    path = os.path.join(RAW, name)
    if not os.path.exists(path):
        return None
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "x.jpg")
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", "--resampleWidth", str(width), path, "--out", out],
                       check=True, capture_output=True)
        with open(out, "rb") as f:
            return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()


def shot(name, alt, width=1800, cls=""):
    src = img(name, width)
    if src is None:
        return f'<div class="shot pending {cls}"><span>Screenshot to add</span><code>raw/{html.escape(name)}</code></div>'
    return f'<figure class="shot {cls}"><img src="{src}" alt="{html.escape(alt)}"></figure>'


def claude_code():
    path = os.path.join(RAW, "13-claude-code.json")
    data = json.load(open(path))
    rows = []
    for call in data["calls"]:
        rows.append(
            f'<div class="call"><div class="tool">{html.escape(call["tool"])}</div>'
            f'<pre class="in">{html.escape(json.dumps(call["input"]))}</pre>'
            f'<div class="out">{html.escape(call["output"])}</div></div>'
        )
    return f'<div class="terminal"><div class="bar"><i></i><i></i><i></i><span>{html.escape(data["client"])}</span></div>{"".join(rows)}</div>'


# Each slide: (part, title, body html, visual html). Copy only uses claims recorded in README.md.
S = []


def slide(part, title, body, visual="", layout="split"):
    S.append((part, title, body, visual, layout))


slide("Envoi", "Scan the stall's SGQR. Pay with the PayPal you already have.",
      "<p class='lead'>AI explains the menu and helps you order. Envoi prices the order from the shop's own menu. You approve the exact amount in PayPal, and the money goes straight to the shop's own PayPal.</p>"
      "<p class='meta'>envoi-helx.onrender.com · PayPal sandbox test money only</p>",
      shot("01-landing-0.35.png", "Envoi landing page with the scroll stage"), "hero")

slide("The problem", "A hawker stall, a menu you cannot read, a card that does not work",
      "<ul class='big'><li><b>The visitor</b> has PayPal, but the stall takes cash or SGQR, and PayPal is not on SGQR.</li>"
      "<li><b>The menu</b> is often only in Chinese or Singlish.</li>"
      "<li><b>The stall</b> confirms payments by ear and has no simple view of the week.</li>"
      "<li><b>The visitor's AI assistant</b> cannot order from a hawker stall at all.</li></ul>",
      shot("01-landing-0.6.png", "Landing scroll stage at the Approve step"))

slide("Visitor · 1 Scan", "Scan the stall's existing SGQR",
      "<p>Open Envoi in the browser, no app to install, and scan the sticker. Envoi uses it only to identify an enrolled shop. It is never treated as a payment code.</p>",
      shot("03-scan-phone.png", "Scanning an SGQR sticker on a phone", 1000, "phone") if os.path.exists(os.path.join(RAW, "03-scan-phone.png")) else shot("03-scan-page.png", "Envoi scan page"))

slide("Visitor · not on Envoi yet", "A stall that is not on Envoi stays unpayable",
      "<p>The visitor gets a card in the stall's languages explaining Envoi. Nothing is paid and no shop is added.</p><p>Envoi keeps only an anonymous weekly count of scans, so a stall that joins later can see how many visitors tried to pay it.</p>",
      shot("04-not-on-envoi.png", "This stall isn't on Envoi yet card"))

slide("Visitor · 2 Ask", "The menu, explained in your language",
      "<p>AI translates each dish beside its original name and says what to expect. Here the browser is set to Japanese.</p><p>A translation never changes a price or adds an item.</p>",
      shot("05-menu-ja.png", "Ah Seng Chicken Rice menu with Japanese translations"))

slide("Visitor · 2 Ask", "One sentence to a basket",
      "<p><q>two kopi o and one kaya toast near Tanjong Pagar</q></p><p>The model names registered shops and items only. Prices come from the shop's menu, and nothing is reviewed or paid until the visitor taps Review.</p>",
      shot("06-one-sentence.png", "Basket filled from one sentence"))

slide("Visitor · 2 Ask", "Ask Envoi: what should I try for S$10?",
      "<p>Ask Envoi reads the shop through Envoi's own MCP server, suggests only menu items within the budget, and shows every call it made under <b>How this was checked</b>.</p><p>No basket exists until the visitor accepts.</p>",
      shot("07-ask-envoi.png", "Ask Envoi suggests a basket within S$10"))

slide("Visitor · 2 Ask", "A one-time link, never a payment",
      "<p>When the visitor accepts, Envoi hands over a one-time link. The assistant set no price and cannot pay. The link works once and expires after 10 minutes.</p>",
      shot("08a-handoff.png", "Check the basket your assistant suggested"))

slide("Visitor · 3 Approve", "The exact total, and who gets paid",
      "<p>The server prices the basket from the shop's published menu: S$8.70. The payee is the shop's own PayPal sandbox seller account. Envoi's own account never receives the money.</p><p>Unknown costs read Unknown, never zero.</p>",
      shot("08-review.png", "Review showing S$8.70 and the payee"))

slide("Visitor · 3 Approve", "Paid only after PayPal confirms the capture",
      "<p>The visitor approved in PayPal sandbox. The receipt shows the PayPal order and capture ids, the payee and the paid total.</p><p class='meta'>Recorded 11 Nov 2026 · capture 3JA25814WL2236546 · S$8.70 test money</p>",
      shot("10-receipt.png", "Paid receipt"))

slide("Visitor · 4 Show the stall", "Show the order in the stall's language",
      "<p>After Paid, the order appears in large text in English, 中文, Melayu or தமிழ், and can be read aloud. The original names and the paid amount stay on screen.</p>",
      "<div class='pair'>" + shot("11-stall-2.png", "Show the stall in Chinese", 1200) + shot("11-stall-4.png", "Show the stall in Tamil", 1200) + "</div>")

slide("Bring your own AI", "Any MCP assistant can order",
      "<p>Envoi serves its own MCP endpoint at <code>/mcp</code>. An assistant connects with a revocable token, finds a shop, reads its menu and creates a one-time link. The person still approves the payment.</p><p>60 requests per 10 minutes per token.</p>",
      shot("12-agents.png", "Envoi agents page"))

slide("Bring your own AI", "Claude Code ordering through Envoi",
      "<p>Three real calls over <code>/mcp</code>: find the shop, read the menu, make the link. Prices in the reply match Envoi's menu exactly.</p><p>Claude Code links have also been paid in sandbox.</p>",
      claude_code())

slide("Bring your own AI", "Meta Muse ordering through Envoi",
      "<p>Connected as a custom connector, Muse found Ah Seng Chicken Rice, read its menu with prices matching Envoi's own, asked which chicken rice the user meant, and created a one-time link.</p>",
      shot("14-muse.png", "Meta Muse chat using Envoi"))

slide("Optional rail", "PYUSD on Solana devnet",
      "<p>A Singapore shop can also accept PYUSD test tokens on devnet. The shop sets its own rate, Envoi prepares the transfer, and the visitor's own wallet signs it. Envoi never holds keys.</p>",
      "<div class='pair'>" + shot("pyusd-1.png", "PYUSD review", 1200) + shot("pyusd-2.png", "Paid, finalized on devnet", 1200) + "</div>")

slide("For shops", "Keep your SGQR, add no hardware, see the real fee",
      "<p>The calculator shows what the shop keeps at PayPal's published Singapore rates. On a S$4.50 order: S$0.70 standard fee, S$0.35 on the micropayment rate.</p><p>The micropayment rate needs PayPal's approval, then applies to every sale. Envoi adds no fee of its own.</p>",
      shot("16-for-shops.png", "For shops fee calculator at S$4.50"))

slide("For shops · setup", "Enroll, connect PayPal, publish",
      "<p>The merchant confirms shop details, uploads the SGQR sticker (decoded in the browser, never uploaded), enters the menu and connects their own PayPal. An operator approves before anything is public.</p>",
      shot("17-setup.png", "Merchant setup"))

slide("For shops · setup", "AI drafts the menu from the shop's own page",
      "<p>One hosted Kernel browser reads the shop's public menu page and AI drafts an editable table. A price is filled only where the page prints the same digits. Nothing publishes until the merchant confirms every row.</p>",
      shot("18-import.png", "Web menu import"))

slide("For shops · setup", "A counter poster beside the existing SGQR",
      "<p>An optional printable sheet tells visitors to scan the stall's existing SGQR with Envoi. No second QR code.</p>",
      shot("19-poster.png", "Printable counter poster"))

slide("For shops · US", "US shops, and PayPal's PYUSD rewards",
      "<p>A US shop takes PayPal in USD. Setup shows what the shop was paid through Envoi this month beside PayPal's advertised PYUSD rewards, which PayPal offers to US businesses.</p><p class='meta'>PayPal's offer, shown with the date it was read, not a return Envoi promises.</p>",
      shot("20-us-rewards.png", "US shop rewards card"))

slide("For shops · operations", "The sales desk",
      "<p>Every paid order with PayPal's actual fee, the net and the payer's PayPal country. A fee PayPal did not report reads Unknown, never zero. Totals count paid orders only.</p>",
      shot("21-desk.png", "Merchant sales desk"))

slide("For shops · operations", "Ask your orders in one sentence",
      "<p><q>paid orders from overseas, biggest first</q> becomes filters and a sort on the table. The model sees the sentence and the date, never an order.</p>",
      shot("22-ask-orders.png", "Ask your orders filtering the table"))

slide("For shops · operations", "This week, written by AI",
      "<p>The model writes only a template with placeholders. Envoi fills in every figure from its own records, in English, 中文, Melayu or தமிழ்.</p>",
      "<div class='pair'>" + shot("23-summary-zh.png", "Weekly summary in Chinese", 1200) + shot("23-summary-en.png", "Weekly summary in English", 1200) + "</div>")

slide("For shops · operations", "A copilot on PayPal's own MCP server",
      "<p>It reads the shop's sandbox PayPal records through PayPal's hosted MCP server, filtered to that shop and stripped of payer details. It can propose a refund; only the merchant's tap on Confirm sends it.</p><p>It refused to guess payer countries it cannot see.</p>",
      shot("24b-refund-card.png", "Copilot refund confirmation card"))

slide("Trust", "AI reads and drafts. People approve.",
      "<ul class='big'><li>Every price comes from the shop's published menu.</li><li>Items not on the menu are dropped; quantities outside 1 to 20 are refused.</li>"
      "<li>Translations never change a price.</li><li>The copilot refuses any amount Envoi has not checked.</li><li>A person approves every payment and every refund.</li></ul>",
      "", "text")

slide("Evidence", "What was measured, and what was not",
      "<ul class='big'><li>Ask Envoi: 24 of 25 across languages, zero wrong basket links.</li><li>Budget advice: 10 of 10, nothing off the menu or over budget.</li>"
      "<li>Copilot: 7 of 7 sandbox questions, no invented amount.</li><li>Scan to Paid on the deployed site, with Envoi and PayPal records matching.</li></ul>",
      "", "text")

slide("Why Envoi", "Wise can pay a QR code. Envoi gets you from menu to order.",
      "<p class='lead'>Read the menu, choose, pay with the PayPal you already have, and tell the stall what to make, in one flow in the browser. The trade-off is real: the shop pays PayPal's fee, and Envoi only works at enrolled shops.</p>"
      "<p class='meta'>envoi-helx.onrender.com · github.com/jaydonnnk/envoi · PayPal sandbox test money only</p>",
      shot("01-landing-0.9.png", "Landing scroll stage at Show the stall"), "hero")

CSS = """
:root{--ink:#14293d;--muted:#52657a;--blue:#145deb;--pale:#f1f6fc;--line:#c9d7e6;--paper:#fff;--warn:#fff4da;--amber:#704009}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#0d1b28}
body{font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);overflow:hidden}
.viewport{position:fixed;inset:0 0 30px 0;display:grid;place-items:center}
.deck{width:1600px;height:900px;position:absolute;left:50%;top:50%;transform-origin:center center}
.slide{position:absolute;inset:0;background:var(--pale);display:none;padding:64px 72px 72px;overflow:hidden}
.slide.on{display:grid}
.slide.split{grid-template-columns:520px 1fr;gap:56px;align-items:center}
.slide.hero{grid-template-columns:600px 1fr;gap:56px;align-items:center;background:var(--paper)}
.slide.text{grid-template-columns:1fr;align-content:center;padding:80px 160px}
.part{font:600 14px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--blue);margin:0 0 18px}
h1{font-family:Georgia,"Times New Roman",serif;font-weight:600;letter-spacing:-.02em;line-height:1.08;font-size:46px;margin:0 0 24px;text-wrap:balance}
.hero h1{font-size:58px}.text h1{font-size:54px}
p{font-size:21px;line-height:1.5;color:var(--muted);margin:0 0 16px}
p b,li b{color:var(--ink)}
.lead{font-size:24px;color:var(--ink)}
.meta{font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;color:var(--muted);margin-top:24px}
q{font-style:italic;color:var(--ink)}
code{font:0.85em ui-monospace,Menlo,Consolas,monospace;background:#e3ecf7;padding:2px 6px;border-radius:4px;color:var(--ink)}
ul.big{list-style:none;padding:0;margin:0}
ul.big li{font-size:23px;line-height:1.45;padding:14px 0 14px 34px;border-bottom:1px solid var(--line);position:relative;color:var(--ink)}
ul.big li:last-child{border:0}
ul.big li:before{content:"";position:absolute;left:4px;top:26px;width:12px;height:12px;border-radius:3px;background:var(--blue)}
.visual{min-width:0;height:100%;display:flex;align-items:center;justify-content:center}
.shot{margin:0;border-radius:14px;overflow:hidden;background:var(--paper);box-shadow:0 30px 60px rgba(20,41,61,.18),0 0 0 1px var(--line);max-height:760px;display:flex}
.shot img{display:block;width:100%;height:auto;max-height:760px;object-fit:cover;object-position:top}
.shot.phone{max-width:380px;border-radius:28px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px;width:100%;align-items:start}
.pair .shot img{max-height:620px}
.shot.pending{width:100%;height:520px;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:repeating-linear-gradient(135deg,#fff 0 14px,#f4f8fc 14px 28px);color:var(--muted);font-size:20px;box-shadow:0 0 0 2px dashed var(--line)}
.pair .shot.pending{height:420px}
.terminal{width:100%;background:#0f1d2a;border-radius:14px;box-shadow:0 30px 60px rgba(20,41,61,.25);overflow:hidden;color:#d8e4f0}
.terminal .bar{display:flex;align-items:center;gap:8px;padding:14px 18px;background:#182a3a;font:13px ui-monospace,Menlo,monospace;color:#9fb2c6}
.terminal .bar i{width:12px;height:12px;border-radius:50%;background:#33495e}
.terminal .bar span{margin-left:10px}
.call{padding:20px 24px;border-top:1px solid #213547}
.tool{font:600 18px ui-monospace,Menlo,monospace;color:#7fb0ff}
.call pre{margin:8px 0;font:14px/1.5 ui-monospace,Menlo,monospace;color:#9fb2c6;white-space:pre-wrap}
.out{font-size:17px;line-height:1.5;color:#eaf2fa;border-left:3px solid #2f6fe0;padding-left:12px}
.chrome{position:fixed;left:0;right:0;bottom:0;height:30px;display:flex;align-items:center;justify-content:space-between;padding:10px 20px;font:12px ui-monospace,Menlo,monospace;color:#9fb2c6;pointer-events:none}
.chrome .bar{flex:1;height:3px;background:#22384c;margin:0 16px;border-radius:2px;overflow:hidden}
.chrome .bar i{display:block;height:100%;background:#4c8dff;width:0}
.badge{position:absolute;right:72px;top:56px;font:600 11px ui-monospace,Menlo,monospace;letter-spacing:.07em;text-transform:uppercase;background:#ceedf3;color:var(--ink);padding:6px 9px;border-radius:4px}
.nav{position:fixed;top:0;bottom:0;width:15%;cursor:pointer}.nav.prev{left:0}.nav.next{right:0}
@media print{html,body{overflow:visible;background:#fff}.viewport{position:static;display:block}.deck{transform:none!important}.slide{display:grid!important;position:relative;page-break-after:always}.chrome,.nav{display:none}}
"""

JS = """
(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide')),i=0,deck=document.querySelector('.deck'),
      count=document.getElementById('count'),bar=document.getElementById('bar');
  function fit(){var s=Math.min((innerWidth-24)/1600,(innerHeight-54)/900);deck.style.transform='translate(-50%,-50%) scale('+s+')'}
  function show(n){i=Math.max(0,Math.min(slides.length-1,n));slides.forEach(function(s,k){s.classList.toggle('on',k===i)});
    count.textContent=(i+1)+' / '+slides.length;bar.style.width=((i+1)/slides.length*100)+'%';
    try{history.replaceState(null,'','#'+(i+1))}catch(e){}}
  addEventListener('keydown',function(e){
    if(['ArrowRight','PageDown',' ','Enter'].indexOf(e.key)>=0){e.preventDefault();show(i+1)}
    if(['ArrowLeft','PageUp','Backspace'].indexOf(e.key)>=0){e.preventDefault();show(i-1)}
    if(e.key==='Home')show(0);if(e.key==='End')show(slides.length-1)});
  document.querySelector('.nav.prev').onclick=function(){show(i-1)};
  document.querySelector('.nav.next').onclick=function(){show(i+1)};
  addEventListener('hashchange',function(){show((parseInt(location.hash.slice(1),10)||1)-1)});
  addEventListener('resize',fit);fit();show((parseInt(location.hash.slice(1),10)||1)-1);
})();
"""


def render():
    parts = []
    for n, (part, title, body, visual, layout) in enumerate(S, 1):
        vis = f'<div class="visual">{visual}</div>' if layout != "text" else ""
        parts.append(
            f'<section class="slide {layout}" aria-label="Slide {n}: {html.escape(title)}">'
            f'<span class="badge">Test environment</span>'
            f'<div class="copy"><p class="part">{html.escape(part)}</p><h1>{html.escape(title)}</h1>{body}</div>{vis}</section>'
        )
    doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Envoi showcase</title><style>{CSS}</style></head>
<body><div class="viewport"><div class="deck">{''.join(parts)}</div></div>
<div class="nav prev" aria-label="Previous slide"></div><div class="nav next" aria-label="Next slide"></div>
<div class="chrome"><span>Envoi · PayPal sandbox test money only</span><span class="bar"><i id="bar"></i></span><span id="count"></span></div>
<script>{JS}</script></body></html>"""
    with open(OUT, "w") as f:
        f.write(doc)
    missing = [p for p in ["03-scan-phone.png", "14-muse.png", "pyusd-1.png", "pyusd-2.png", "20-us-rewards.png"] if not os.path.exists(os.path.join(RAW, p))]
    print(f"{len(S)} slides, {os.path.getsize(OUT) / 1e6:.1f} MB -> {OUT}")
    print("missing:", ", ".join(missing) or "none")


render()
