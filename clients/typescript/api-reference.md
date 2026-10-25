# Reference

> Source: [EnvoiPublicApiClient](src/client.ts)

## Outlets

> Source: [Outlets](src/resources/outlets.ts)

<details>
<summary><code>getOutletMenu(request: Outlets.GetOutletMenuRequest, options?: RequestOptions): ApiPromise&lt;MenuResponse, Outlets.GetOutletMenuError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Returns the shop and the items of its published, confirmed menu revision in menu order. An unknown shop and a shop without a published menu both answer 404 not_found, so they cannot be told apart.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.outlets.getOutletMenu({ id: "some example string" });
  // TODO: Handle 'response' of type MenuResponse
} catch (err) {
  // TODO: Handle 'err' of type Outlets.GetOutletMenuError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.outlets.getOutletMenu({ id: "some example string" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type MenuResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>id</code> | <code>string</code> | The shop id, as listed by listOutlets. Any other value answers 404 not_found, like an unknown shop. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.outlets.getOutletMenu(request)`

- **OnSuccess**: <code>[MenuResponse](src/models/menu-response.ts)</code>
- **OnError**: throws <code>[Outlets.GetOutletMenuError](src/resources/outlets.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.outlets.getOutletMenu(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;MenuResponse, Outlets.GetOutletMenuError&gt;</code>, with `result.value` of type <code>[MenuResponse](src/models/menu-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[EnvoiPublicApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>listOutlets(options?: RequestOptions): ApiPromise&lt;OutletListResponse, ApiError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Returns up to 50 shops that have a published, confirmed menu, ordered by name and then id. A shop without a published menu is not listed.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.outlets.listOutlets();
  // TODO: Handle 'response' of type OutletListResponse
} catch (err) {
  // TODO: Handle 'err' of type ApiError, where 'err.payload' is always the Undeclared arm
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.outlets.listOutlets().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type OutletListResponse
} else {
  // TODO: Handle 'result', where 'result.payload' is always the Undeclared arm
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.outlets.listOutlets()`

- **OnSuccess**: <code>[OutletListResponse](src/models/outlet-list-response.ts)</code>
- **OnError**: throws <code>[ApiError](src/core/api-error.ts)</code>, with `err.payload` always the <code>[Undeclared](src/core/api-error.ts)</code> arm

**As ApiResult**: `await client.outlets.listOutlets().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;OutletListResponse, ApiError&gt;</code>, with `result.value` of type <code>[OutletListResponse](src/models/outlet-list-response.ts)</code>
- **OnError**: `result.payload` always the <code>[Undeclared](src/core/api-error.ts)</code> arm, with `result.message`

**Thrown**: <code>[EnvoiPublicApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## PurchaseRequests

> Source: [PurchaseRequests](src/resources/purchase-requests.ts)

<details>
<summary><code>createPurchaseRequest(request: PurchaseRequests.CreatePurchaseRequestRequest, options?: RequestOptions): ApiPromise&lt;PurchaseRequestCreatedResponse, PurchaseRequests.CreatePurchaseRequestError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

An agent holding an Envoi agent token proposes one shop's items and quantities. Envoi checks the basket against the shop's published menu and answers a link that works once and expires 10 minutes after it is created. The buyer opens the link, reviews the price Envoi calculates and approves payment themselves. The answer carries no price, purchase id or payment authority. Fields other than outletId and lines, such as a price, total or payee, are dropped and never priced or stored.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.purchaseRequests.createPurchaseRequest({
    body: { outletId: "some example string", lines: [{ menuItemId: "some example string", quantity: 1 }] },
  });
  // TODO: Handle 'response' of type PurchaseRequestCreatedResponse
} catch (err) {
  // TODO: Handle 'err' of type PurchaseRequests.CreatePurchaseRequestError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.purchaseRequests.createPurchaseRequest({
  body: { outletId: "some example string", lines: [{ menuItemId: "some example string", quantity: 1 }] },
}).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type PurchaseRequestCreatedResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>body</code> | <code>[PurchaseRequestBody](src/models/purchase-request-body.ts)</code> | - |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.purchaseRequests.createPurchaseRequest(request)`

- **OnSuccess**: <code>[PurchaseRequestCreatedResponse](src/models/purchase-request-created-response.ts)</code>
- **OnError**: throws <code>[PurchaseRequests.CreatePurchaseRequestError](src/resources/purchase-requests.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.purchaseRequests.createPurchaseRequest(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;PurchaseRequestCreatedResponse, PurchaseRequests.CreatePurchaseRequestError&gt;</code>, with `result.value` of type <code>[PurchaseRequestCreatedResponse](src/models/purchase-request-created-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[EnvoiPublicApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

