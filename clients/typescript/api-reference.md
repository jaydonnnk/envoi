# Reference

> Source: [EnvoiPublicReadApiClient](src/client.ts)

<details>
<summary><code>getOutletMenu(request: EnvoiPublicReadApiClient.GetOutletMenuRequest, options?: RequestOptions): ApiPromise&lt;MenuResponse, EnvoiPublicReadApiClient.GetOutletMenuError&gt;</code></summary>

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
  const response = await client.getOutletMenu({ id: "some example string" });
  // TODO: Handle 'response' of type MenuResponse
} catch (err) {
  // TODO: Handle 'err' of type EnvoiPublicReadApiClient.GetOutletMenuError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.getOutletMenu({ id: "some example string" }).asApiResult();
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
| <code>id</code> | <code>string</code> | The shop id, as listed by listOutlets. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.getOutletMenu(request)`

- **OnSuccess**: <code>[MenuResponse](src/models/menu-response.ts)</code>
- **OnError**: throws <code>[EnvoiPublicReadApiClient.GetOutletMenuError](src/client.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.getOutletMenu(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;MenuResponse, EnvoiPublicReadApiClient.GetOutletMenuError&gt;</code>, with `result.value` of type <code>[MenuResponse](src/models/menu-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[EnvoiPublicReadApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

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
  const response = await client.listOutlets();
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
const result = await client.listOutlets().asApiResult();
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

**Direct**: `await client.listOutlets()`

- **OnSuccess**: <code>[OutletListResponse](src/models/outlet-list-response.ts)</code>
- **OnError**: throws <code>[ApiError](src/core/api-error.ts)</code>, with `err.payload` always the <code>[Undeclared](src/core/api-error.ts)</code> arm

**As ApiResult**: `await client.listOutlets().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;OutletListResponse, ApiError&gt;</code>, with `result.value` of type <code>[OutletListResponse](src/models/outlet-list-response.ts)</code>
- **OnError**: `result.payload` always the <code>[Undeclared](src/core/api-error.ts)</code> arm, with `result.message`

**Thrown**: <code>[EnvoiPublicReadApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

