<!-- Generated file — do not edit; regenerated with the SDK. -->

# PurchaseRequests — operations

Accessor: `client.purchaseRequests` · Source: `src/resources/purchase-requests.ts` · 1 operation · Request and error types: namespace `PurchaseRequests`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `envoi-public-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### createPurchaseRequest

- **Signature**: `createPurchaseRequest(request: PurchaseRequests.CreatePurchaseRequestRequest, options?: RequestOptions): ApiPromise<PurchaseRequestCreatedResponse, PurchaseRequests.CreatePurchaseRequestError>`
- **Wire**: `POST /api/v1/purchase-requests`
- **Auth**: `agentBearer`
- **Request body**: `application/json` — the `body` field
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `PurchaseRequestCreatedResponse`
- **Error**: `EnvoiPublicApiError` with `kind: "api"`, an instance of `PurchaseRequests.CreatePurchaseRequestError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"validationFailedResponse"` [400] `ValidationFailedResponse` · `"unauthorizedResponse"` [401] `UnauthorizedResponse` · `"notFoundResponse"` [404] `NotFoundResponse` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `PurchaseRequests.CreatePurchaseRequestRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `body` | `body` | `PurchaseRequestBody` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `PurchaseRequestBody` | `purchaseRequestBodySchema` | `src/models/purchase-request-body.ts` |
| `PurchaseRequestCreatedResponse` | `purchaseRequestCreatedResponseSchema` | `src/models/purchase-request-created-response.ts` |
| `ValidationFailedResponse` | `validationFailedResponseSchema` | `src/models/validation-failed-response.ts` |
| `UnauthorizedResponse` | `unauthorizedResponseSchema` | `src/models/unauthorized-response.ts` |
| `NotFoundResponse` | `notFoundResponseSchema` | `src/models/not-found-response.ts` |

