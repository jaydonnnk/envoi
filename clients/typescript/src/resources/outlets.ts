import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import { noneAuth } from "../core/auth/schemes.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import * as s from "../core/validation/index.js";
import { menuResponseSchema, type MenuResponse } from "../models/menu-response.js";
import { notFoundResponseSchema, type NotFoundResponse } from "../models/not-found-response.js";
import { outletListResponseSchema, type OutletListResponse } from "../models/outlet-list-response.js";
import type { Servers } from "../servers.js";

export class Outlets {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;

  constructor(rawClient: RawClient, servers: Servers) {
    this.#rawClient = rawClient;
    this.#servers = servers;
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
   * @throws {@link Outlets.GetOutletMenuError} when the API answers with an error status — narrow
   * on `err.payload.kind`
   *
   * @throws {@link EnvoiPublicApiError} when no usable response was produced: a connection failure,
   * a timeout, a body that would not decode, a value that would not encode, or a credential that
   * could not be obtained
   */
  getOutletMenu(
    request: Outlets.GetOutletMenuRequest,
    options?: RequestOptions,
  ): ApiPromise<MenuResponse, Outlets.GetOutletMenuError> {
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
        errorFactory: Outlets.GetOutletMenuError,
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
   * @throws {@link EnvoiPublicApiError} when no usable response was produced: a connection failure,
   * a timeout, a body that would not decode, a value that would not encode, or a credential that
   * could not be obtained
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

export namespace Outlets {
  export type GetOutletMenuRequest = {
    /**
     * The shop id, as listed by listOutlets. Any other value answers 404 not_found, like an unknown
     * shop.
     */
    id: string;
  };

  export class GetOutletMenuError extends ApiError {
    declare readonly payload: Declared<"notFoundResponse", NotFoundResponse> | Undeclared;

    static readonly errors: ErrorDecoders<GetOutletMenuError> = [
      { on: 404, kind: "notFoundResponse", decode: { kind: "json", schema: notFoundResponseSchema } },
    ];
  }
}
