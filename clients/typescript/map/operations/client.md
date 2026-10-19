<!-- Generated file — do not edit; regenerated with the SDK. -->

# EnvoiPublicReadApiClient — ungrouped operations

Accessor: `client` (the client itself) · Source: `src/client.ts` · 2 operations · Request and error types: namespace `EnvoiPublicReadApiClient`

Operations the spec leaves untagged are methods on the client rather than on a resource, so there is no accessor property to go through. The request type still lives in a namespace merged onto the exported class, so you write `EnvoiPublicReadApiClient.GetOutletMenuRequest`.

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `envoi-public-read-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### getOutletMenu

- **Signature**: `getOutletMenu(request: EnvoiPublicReadApiClient.GetOutletMenuRequest, options?: RequestOptions): ApiPromise<MenuResponse, EnvoiPublicReadApiClient.GetOutletMenuError>`
- **Wire**: `GET /api/v1/outlets/{id}/menu`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `MenuResponse`
- **Error**: `EnvoiPublicReadApiError` with `kind: "api"`, an instance of `EnvoiPublicReadApiClient.GetOutletMenuError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"notFoundResponse"` [404] `NotFoundResponse` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `EnvoiPublicReadApiClient.GetOutletMenuRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `id` | `path` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `MenuResponse` | `menuResponseSchema` | `src/models/menu-response.ts` |
| `NotFoundResponse` | `notFoundResponseSchema` | `src/models/not-found-response.ts` |

### listOutlets

- **Signature**: `listOutlets(options?: RequestOptions): ApiPromise<OutletListResponse, ApiError>`
- **Wire**: `GET /api/v1/outlets`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `OutletListResponse`
- **Error**: `EnvoiPublicReadApiError` with `kind: "api"` — untyped, `payload.kind` always `"undeclared"`

| Type | Schema value | Source |
| --- | --- | --- |
| `OutletListResponse` | `outletListResponseSchema` | `src/models/outlet-list-response.ts` |

