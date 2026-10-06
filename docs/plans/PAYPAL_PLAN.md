# ENVOI — PayPal AI Hackathon Plan

> **Envoi**: the messenger you send to pay. An AI agent finds the merchant, compares the rails, and pays on your behalf — with your one-tap approval.
>
> Tagline: *"Anyone can tender payment now. Even an AI."* (hold "Tender" as backup name if Envoi collision becomes an issue)

- Hackathon: Build What's Next with PayPal and AI — https://paypalaihackathon.devpost.com/
- Judged on: Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation
- Requirements: meaningful PayPal + AI use, <3-min video, public OSS repo + license file
- Submission window opened 2026-10-01; results late Dec 2026. **Exact deadline: confirm on Devpost.**

---

## 1. One-paragraph pitch

Physical shops in Singapore are invisible to AI agents: no product feed, no checkout URL, no way to be paid by anything but a bank app. Envoi fixes this with two pieces: (1) a **merchant registry** where shops onboard in ~60 seconds by photographing their existing SGQR sticker — AI extracts the UEN, the shop attaches its PayPal merchant ID and a PYUSD wallet address; (2) a **buyer agent** that resolves natural-language intent ("kaya toast from the nearest Ya Kun") against the registry, compares PayPal vs PYUSD cost for *this* payer, and executes payment **directly to the merchant's own destination** after a single human approval. Envoi never holds funds. It serves the people PayNow can't see — tourists, crypto holders — and makes every registered shop agent-payable.

## 2. Who it's for and why they'd use it (verified)

| Segment | Why Envoi's rails | Evidence |
|---|---|---|
| Tourists (US/EU/etc.) | PayNow/SGQR linkages only cover TH/MY/ID/IN; their PayPal works, PYUSD ≈ 0 FX vs ~3% card fees | MAS cross-border linkages page; PayPal PYUSD 70-market rollout (Mar 2026) |
| Crypto-holding locals | Pay from wallet, no bank in the loop, settles in seconds | OKX Pay/StraitsX proved SG demand (Sep 2025) |
| Any local | The agent is the draw (voice-order your usual); PayPal/PYUSD is the pipe the agent can drive | PayPal Agent Toolkit + Agentic Commerce strategy |
| Merchants | New customer channel: agent-discoverable tourists and AI buyers | Quay's own admission: "PayNow works for 99% of SG users" — we don't fight that 99% |

**Demo stars a tourist payer.** A local paying with PayPal instead of PayNow looks pointless on stage; a tourist paying looks like a solved problem.

## 3. Locked design rules (non-negotiable)

1. **No custody.** Money moves payer → merchant's own PayPal account or registered wallet. We are a directory + AI client, never a payment institution. This is the regulatory posture that keeps the project honest.
2. **No PayNow.** Requires MAS license/bank partnership. Out of scope, stated openly.
3. **No delivery.** No logistics leg. In-person pickup/dine-in only.
4. **No invented finance.** No escrow, no guaranteed refunds, no auto-SGD settlement claims, no merchant-side access we can't demonstrate. PYUSD lands in the merchant's wallet as PYUSD — labeled exactly that.
5. **Model judgment ≠ payment authority.** LLM proposes (merchant resolution, rail choice, discount negotiation); deterministic rules dispose (prices from registry, caps, allowlists, one-tap human approval before any transfer).
6. **No simulated success.** Every payment in the demo executes for real — PayPal sandbox capture IDs and Solana devnet tx hashes, both displayed.

## 4. Product flows

### Merchant onboarding (~60 seconds, also demo act 1)
1. Merchant photographs their existing SGQR sticker.
2. Vision model extracts the UEN from the EMVCo payload; registry cross-checks UEN format/uniqueness.
3. Merchant registers: display name, menu with fixed SGD prices, PayPal merchant ID (sandbox for demo), PYUSD wallet address.
4. Registry entry goes live → merchant is agent-payable and discoverable via the public API/MCP.

### Buyer agent journey
1. User: "Get me kaya toast and kopi from the nearest Ya Kun." (text or voice)
2. Agent searches registry (name/location/menu), resolves the merchant and items at **registered prices**.
3. Agent computes rail comparison for this payer (PayPal FX/fees vs PYUSD network fee + FX), shows both with honest math from published fee schedules.
4. (Differentiator, optional act) Buyer agent negotiates with the **merchant agent**: merchant-side deterministic discount rules (e.g., "10% off before 11am, max S$3") are exposed as data; LLMs haggle visibly, rules cap the outcome.
5. User taps **Approve** once.
6. Payment executes directly to merchant destination:
   - PayPal rail → Orders v2 create → pay → capture (sandbox), via PayPal Agent Toolkit / MCP.
   - PYUSD rail → SPL transfer of test PYUSD on Solana devnet to merchant's registered wallet.
7. Receipt screen: PayPal capture ID and/or devnet tx hash + explorer link. Merchant pane shows the order arriving live.

## 5. Architecture

```
┌─────────────┐   ┌──────────────────────┐   ┌─────────────────────┐
│ Buyer app   │──▶│ Envoi core           │──▶│ Rail adapters       │
│ (chat/voice)│   │ - intent resolver    │   │ - PayPal: Agent     │
│ + approval  │   │ - registry search    │   │   Toolkit/MCP,      │
│   UX        │   │ - rail comparator    │   │   Orders v2 sandbox │
└─────────────┘   │ - merchant agent     │   │ - PYUSD: Solana     │
                  │   (rules engine)     │   │   devnet SPL xfer   │
┌─────────────┐   │ - receipt service    │   └─────────────────────┘
│ Merchant    │──▶│                      │
│ onboarding  │   │ Registry DB + public │   ┌─────────────────────┐
│ (photo→UEN) │   │ API (OpenAPI spec)   │──▶│ MCP server          │
└─────────────┘   └──────────────────────┘   │ (any third-party    │
                                             │  agent can query)   │
                                             └─────────────────────┘
```

Components:
1. **Registry service** — merchants, menus (fixed prices), payment destinations. Postgres or similar. Public read API defined as OpenAPI.
2. **Onboarding agent** — photo → UEN extraction (vision model) → validation → registry write. Human confirms extracted data before going live.
3. **Buyer agent** — LLM with tools: `search_registry`, `get_menu`, `compare_rails`, `request_approval`, `execute_payment`. Framework: OpenAI Agents SDK or LangChain (both supported by PayPal Agent Toolkit).
4. **Merchant agent (rules engine)** — deterministic discount/policy rules stored as merchant-editable data; exposed to buyer agent for negotiation. LLM composes the dialogue; rules authorize the numbers.
5. **Rail adapters** — PayPal: `@paypal/mcp` / agent-toolkit sandbox (create_order, pay_order, capture). PYUSD: Solana devnet SPL token transfer of test PYUSD (devnet faucet/test token per PayPal PYUSD guide).
6. **Receipt service** — captures sandbox capture IDs + devnet tx hashes, renders verifiable receipts.
7. **Public MCP server** — registry exposed via MCP so any third-party agent can ask "is this merchant agent-payable, on which rails, to what destination?" (infrastructure claim, demoed live).

**Stack suggestion:** Next.js frontend (matches Quay's proven stack choice), Node/TS backend, Solana web3.js for devnet, PayPal agent-toolkit npm package. Host on Render (sponsor) if desired.

## 6. PayPal & AI integration map (what's verified)

| Capability | Status | Source |
|---|---|---|
| Agent Toolkit: MCP server (`npx @paypal/mcp`) + OpenAI Agents/LangChain/Vercel AI SDKs | Verified | github.com/paypal/agent-toolkit |
| Operations: create/pay/capture orders, invoices, subscriptions, disputes; sandbox mode via client ID/secret | Verified | toolkit docs + quickstart |
| PYUSD: Paxos-issued on Ethereum, Solana, Arbitrum, Polygon; test PYUSD on Solana devnet; PayPal users can transfer to/from external wallets | Verified | PayPal PYUSD help + quick-start guide |
| PayPal crypto Orders API (PYUSD at checkout) | **US merchants only — NOT used in our flow** | developer.paypal.com/crypto |
| PYUSD in PayPal wallet for Singapore consumers | **Not available (Mar 2026) — our PYUSD payers are tourists or on-chain wallets** | PayPal newsroom 70-markets release |
| Toolkit support for PYUSD operations | **None — PYUSD leg is direct on-chain (devnet), not via toolkit** | agent-toolkit README |
| PayPal guidance: human oversight for judgment, well-defined system prompts | Verified — mirrors our design rule 5 | toolkit quickstart |

## 7. Demo script (<3 minutes)

| Time | Beat | What judges see |
|---|---|---|
| 0:00–0:20 | Cold open: the problem | "10M visitors a year. PayNow covers locals. Tourists can't scan SGQR. And no AI agent on earth can pay a hawker stall." |
| 0:20–0:50 | Act 1 — onboard | Photo of SGQR sticker → UEN extracted → menu + PayPal ID + wallet attached → registry entry LIVE in ~60s |
| 0:50–1:40 | Act 2 — the envoi | Tourist persona: "kaya toast from nearest Ya Kun" → agent resolves merchant, shows menu price S$6, rail comparison (PayPal +US$0.13 FX vs PYUSD ~$0) |
| 1:40–2:10 | Act 3 — negotiate + approve | Merchant agent offers pre-11am 10% (capped at S$3 by rules, shown as merchant-editable data) → user taps Approve → both rails' receipts land (capture ID + devnet tx hash with explorer link) |
| 2:10–2:40 | Act 4 — it's infrastructure | Open a stock MCP client, query the registry, pay through *that* — proving any agent can use Envoi. APIMatic-generated SDK/portal flash |
| 2:40–3:00 | Close | "Envoi. The messenger you send to pay. Directory of information, never of funds." |

## 8. Build milestones

**Day-1 spike (kill gate — do before anything else):**
- [ ] `@paypal/mcp` headless create → pay → capture one sandbox order with client ID/secret. **If this fails, switch to Kaki Bill (fallback idea, plan archived in conversation).**
- [ ] Send test PYUSD on Solana devnet to a second wallet; read back the tx hash.
- [ ] Vision model extracts UEN from a real SGQR photo (10 samples).

**Week 1:** Registry service + OpenAPI spec; onboarding flow (photo → confirm → live); seed 10 merchants (honest: seeded, not real onboarded shops).
**Week 2:** Buyer agent with tools + approval UX; both rail adapters end-to-end; receipt service.
**Week 3:** Merchant rules engine + negotiation beat; public MCP server; APIMatic SDK generation + portal.
**Week 4:** Polish, AG Grid merchant back-office (optional), rehearsal, video shoot, repo + license + README.

**Buffer rule:** if behind at end of Week 3, cut the negotiation beat (Act 3 shrinks to approve-only). Everything else is core.

## 9. Compliance checklist

- [ ] Public repo with OSS license file (rules requirement)
- [ ] Video <3:00, English
- [ ] Meaningful PayPal use: Agent Toolkit/MCP + sandbox orders (primary); PYUSD leg = PayPal-issued asset on devnet
- [ ] No claims of: every-SGQR-merchant coverage, PayPal native SGQR support, PYUSD→SGD conversion, PayNow integration
- [ ] README states verified constraints (section 6) verbatim — honesty is a feature judges can check

## 10. Risks & kill conditions

| Risk | Trigger | Response |
|---|---|---|
| Agent Toolkit can't run unattended in sandbox | Day-1 spike fails | Switch to Kaki Bill (mixed-rail group split; fallback plan exists in conversation) |
| Devpost organizers say on-chain PYUSD (even devnet) doesn't count as PayPal use | Q&A response | Envoi survives on toolkit leg alone; PYUSD becomes "roadmap" — weaker but valid. Ask in Devpost Q&A early (Week 1) |
| "Agent pays" reads as cliché | Rehearsal feedback | Lead with Acts 1, 4 (onboarding + public MCP) — the infrastructure beats nobody else has; negotiation beat is the visible differentiator |
| Negotiation looks scripted | Merchant rules not shown as editable data | Show the rules JSON in-UI during the beat, or cut it |
| UEN extraction unreliable on real stickers | <8/10 clean on spike samples | Human-confirm step absorbs it (already designed); never auto-publish extracted data |

## 11. Sponsor tooling

- **Official pick: APIMatic** — registry API defined as OpenAPI → APIMatic generates TS/Python client SDKs + public developer portal. Directly amplifies the "infrastructure, not just an app" claim (Act 4). Strongest sponsor-fit of all combinations evaluated.
- **AG Grid** — optional, merchant back-office (orders by rail, receipts, registry management). Real utility, but an admin screen, not a demo beat. *Note the rules allow one additional sponsor tool per idea — declare APIMatic as the official entry; use AG Grid as a plain UI library if the slot is strictly policed.*
- Rejected for this idea: Channel3 (online product DB, no hawker relevance), Zapier (nothing to automate in the core loop).

## 12. Open questions (resolve Week 1)

1. Exact Devpost submission deadline (window opened 2026-10-01; results late Dec — pin the date).
2. Does devnet PYUSD count toward "meaningful PayPal use"? (Devpost Q&A)
3. Is there a formal sponsor-tool prize tier, or only visibility? (Check prizes page/updates)
4. PayPal sandbox: multiple buyer personas from one app — confirm sandbox account limits for the tourist-persona demo.
5. Envoi name: final trademark/GitHub-org sanity check before repo goes public (minor collision found: "Envoi Technologies", non-payments).

---

*Plan drafted 2026-10-06. All "verified" rows in section 6 were checked against primary sources on that date; re-verify before submission. Fallback idea (Kaki Bill) and rejected directions with evidence live in the source conversation.*
