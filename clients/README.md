# Envoi API clients

This file is hand-written.
Everything under `clients/typescript/` is generated and committed unchanged; do not edit it by hand.

## TypeScript client

- **Generator:** APIMatic, through the APIMatic CLI `@apimatic/cli/2.0.0-beta.6` (codegen v4), with `apimatic sdk generate -l typescript`.
- **Source document:** `openapi/envoi-public.yaml`, git blob `da2a863f7363f78be8a4f4d6780359029bdae51e` (find its commit with `git log --find-object=da2a863f7363f78be8a4f4d6780359029bdae51e -- openapi/envoi-public.yaml`).
  It was uploaded to APIMatic once, on 2026-10-25, alone in an otherwise empty input folder; nothing else from the repository was sent.
- **Covers:** `GET /api/v1/outlets`, `GET /api/v1/outlets/{id}/menu` and the agent's `POST /api/v1/purchase-requests` with the `agentBearer` token.
  It has no operation on a receipt or payment route; `tests/unit/generated-client.test.ts` holds that.
- **Validation is structural only.**
  The generated client checks types, shape and required keys; value rules in the document, such as a price's `minimum` of 1 or an id's `pattern`, are left to Envoi, which enforces them.
- **Idempotency-Key:** the generated `createPurchaseRequest` sends a fresh `Idempotency-Key` header on every call.
  Envoi ignores it: two calls create two links.
  The client does not retry a POST by default.
- **Runtime:** nothing calls APIMatic at runtime; the client's only runtime dependency is `zod`.

## Hand-written files under `clients/`

- `clients/README.md` (this file).
- `clients/buyer-agent/`, the S20 reference buyer agent: `agent.ts`, `tools.ts` and `trace.ts`. It calls Envoi only through the generated client above and is run with `npm run agent -- "<sentence>"`; the hosted app never imports it.

No other file under `clients/` is hand-written.
