import type { AuthSchemes } from "../auth-schemes.js";
import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import { uuid } from "../core/uuid.js";
import * as s from "../core/validation/index.js";
import { notFoundResponseSchema, type NotFoundResponse } from "../models/not-found-response.js";
import { purchaseRequestBodySchema, type PurchaseRequestBody } from "../models/purchase-request-body.js";
import {
  purchaseRequestCreatedResponseSchema,
  type PurchaseRequestCreatedResponse,
} from "../models/purchase-request-created-response.js";
import { unauthorizedResponseSchema, type UnauthorizedResponse } from "../models/unauthorized-response.js";
import {
  validationFailedResponseSchema,
  type ValidationFailedResponse,
} from "../models/validation-failed-response.js";
import type { Servers } from "../servers.js";

export class PurchaseRequests {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;

  constructor(rawClient: RawClient, servers: Servers, auth: AuthSchemes) {
    this.#rawClient = rawClient;
    this.#servers = servers;
    this.#auth = auth;
  }

  /**
   * Propose a basket and get a link for a buyer
   *
   * @remarks
   * An agent holding an Envoi agent token proposes one shop's items and quantities. Envoi checks
   * the basket against the shop's published menu and answers a link that works once and expires 10
   * minutes after it is created. The buyer opens the link, reviews the price Envoi calculates and
   * approves payment themselves. The answer carries no price, purchase id or payment authority.
   * Fields other than outletId and lines, such as a price, total or payee, are dropped and never
   * priced or stored.
   *
   * @returns The link for the buyer.
   *
   * @throws {@link PurchaseRequests.CreatePurchaseRequestError} when the API answers with an error
   * status — narrow on `err.payload.kind`
   *
   * @throws {@link EnvoiPublicApiError} when no usable response was produced: a connection failure,
   * a timeout, a body that would not decode, a value that would not encode, or a credential that
   * could not be obtained
   */
  createPurchaseRequest(
    request: PurchaseRequests.CreatePurchaseRequestRequest,
    options?: RequestOptions,
  ): ApiPromise<PurchaseRequestCreatedResponse, PurchaseRequests.CreatePurchaseRequestError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/v1/purchase-requests"),
        auth: this.#auth.agentBearer,
        pathParams: [],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "json", value: request.body, schema: purchaseRequestBodySchema },
      },
      {
        success: { kind: "json", schema: purchaseRequestCreatedResponseSchema },
        errorFactory: PurchaseRequests.CreatePurchaseRequestError,
      },
      options,
    );
  }
}

export namespace PurchaseRequests {
  export type CreatePurchaseRequestRequest = {
    body: PurchaseRequestBody;
  };

  export class CreatePurchaseRequestError extends ApiError {
    declare readonly payload:
      | Declared<"validationFailedResponse", ValidationFailedResponse>
      | Declared<"unauthorizedResponse", UnauthorizedResponse>
      | Declared<"notFoundResponse", NotFoundResponse>
      | Undeclared;

    static readonly errors: ErrorDecoders<CreatePurchaseRequestError> = [
      {
        on: 400,
        kind: "validationFailedResponse",
        decode: { kind: "json", schema: validationFailedResponseSchema },
      },
      { on: 401, kind: "unauthorizedResponse", decode: { kind: "json", schema: unauthorizedResponseSchema } },
      { on: 404, kind: "notFoundResponse", decode: { kind: "json", schema: notFoundResponseSchema } },
    ];
  }
}
