import type { ClientOptions } from "./client-options.js";
import { ApiError, type Declared, type Undeclared } from "./core/api-error.js";
import type { ApiPromise } from "./core/api-promise.js";
import type { RequestOptions } from "./core/api-request.js";
import { noneAuth } from "./core/auth/schemes.js";
import { buildCoreClientOptions } from "./core/client-options.js";
import { RawClient } from "./core/raw-client.js";
import type { ErrorDecoders } from "./core/response-decoder.js";
import * as host from "./core/runtime-environment.js";
import * as s from "./core/validation/index.js";
import { menuResponseSchema, type MenuResponse } from "./models/menu-response.js";
import { notFoundResponseSchema, type NotFoundResponse } from "./models/not-found-response.js";
import { outletListResponseSchema, type OutletListResponse } from "./models/outlet-list-response.js";
import { buildServers, type Servers } from "./servers.js";

/**
 * Hand-written description of Envoi's two public read routes: the list of published shops and one
 * shop's published menu. Envoi is a test environment: shops marked isDemoFixture are seeded demo
 * fixtures, and payments use PayPal sandbox test money only. Nothing in this API pays, approves or
 * prices a purchase; a buyer's price is always recalculated by Envoi at review. Prices are whole
 * Singapore cents, and an unknown price or availability is null, never zero or false. This file is
 * written in JSON syntax, which is valid YAML 1.2, so it can be read without a YAML library. The
 * envelope flag ok is typed boolean without a literal value because the APIMatic TypeScript
 * generator (CLI 2.0.0-beta.6, codegen v4) turns a boolean enum or const into the string "True" or
 * "False".
 */
export class EnvoiPublicReadApiClient {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;

  constructor(options: ClientOptions = {}) {
    this.#rawClient = new RawClient({
      ...buildCoreClientOptions(options, "ENVOI_PUBLIC_READ_API_CLIENT_LOG"),
      defaultHeaders: [
        { name: "User-Agent", value: "EnvoiPublicReadApiClient/1.0.0 TypeScript", schema: s.string() },
        { name: "X-APIMatic-Lang", value: "TypeScript", schema: s.string() },
        { name: "X-APIMatic-Package-Version", value: "1.0.0", schema: s.string() },
        { name: "X-APIMatic-Gen-Version", value: "4.0.0", schema: s.string() },
        { name: "X-APIMatic-OS", value: host.operatingSystem(), schema: s.optional(s.string()) },
        { name: "X-APIMatic-Runtime", value: host.runtimeDescription(), schema: s.optional(s.string()) },
      ],
      defaultQuery: [],
      defaultPathParams: [],
    });

    this.#servers = buildServers(options);
  }

  /**
   * Read a shop's published menu
   *
   * @remarks
   * Returns the shop and the items of its published, confirmed menu revision in menu order. An
   * unknown shop and a shop without a published menu both answer 404 not_found, so they cannot be
   * told apart.
   *
   * @returns The shop's published menu.
   *
   * @throws {@link EnvoiPublicReadApiClient.GetOutletMenuError} when the API answers with an error
   * status — narrow on `err.payload.kind`
   *
   * @throws {@link EnvoiPublicReadApiError} when no usable response was produced: a connection
   * failure, a timeout, a body that would not decode, a value that would not encode, or a
   * credential that could not be obtained
   */
  getOutletMenu(
    request: EnvoiPublicReadApiClient.GetOutletMenuRequest,
    options?: RequestOptions,
  ): ApiPromise<MenuResponse, EnvoiPublicReadApiClient.GetOutletMenuError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/v1/outlets/{id}/menu"),
        auth: noneAuth,
        pathParams: [{ name: "id", value: request.id, schema: s.string() }],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: menuResponseSchema },
        errorFactory: EnvoiPublicReadApiClient.GetOutletMenuError,
      },
      options,
    );
  }

  /**
   * List published shops
   *
   * @remarks
   * Returns up to 50 shops that have a published, confirmed menu, ordered by name and then id. A
   * shop without a published menu is not listed.
   *
   * @returns The published shops.
   *
   * @throws {@link ApiError} when the API answers with an error status
   *
   * @throws {@link EnvoiPublicReadApiError} when no usable response was produced: a connection
   * failure, a timeout, a body that would not decode, a value that would not encode, or a
   * credential that could not be obtained
   */
  listOutlets(options?: RequestOptions): ApiPromise<OutletListResponse, ApiError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/v1/outlets"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: outletListResponseSchema },
        errorFactory: ApiError,
      },
      options,
    );
  }
}

export namespace EnvoiPublicReadApiClient {
  export type GetOutletMenuRequest = {
    /** The shop id, as listed by listOutlets. */
    id: string;
  };

  export class GetOutletMenuError extends ApiError {
    declare readonly payload: Declared<"notFoundResponse", NotFoundResponse> | Undeclared;

    static readonly errors: ErrorDecoders<GetOutletMenuError> = [
      { on: 404, kind: "notFoundResponse", decode: { kind: "json", schema: notFoundResponseSchema } },
    ];
  }
}
