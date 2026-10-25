import { buildAuthSchemes, type AuthSchemes } from "./auth-schemes.js";
import type { ClientOptions } from "./client-options.js";
import { buildCoreClientOptions } from "./core/client-options.js";
import { RawClient } from "./core/raw-client.js";
import * as host from "./core/runtime-environment.js";
import * as s from "./core/validation/index.js";
import { Outlets } from "./resources/outlets.js";
import { PurchaseRequests } from "./resources/purchase-requests.js";
import { buildServers, type Servers } from "./servers.js";

/**
 * Hand-written description of Envoi's public API: two read routes, the list of published shops and
 * one shop's published menu, and the agent's purchase request route. Envoi is a test environment:
 * shops marked isDemoFixture are seeded demo fixtures, and payments use PayPal sandbox test money
 * only. The purchase request route needs an agent token and answers a one-time link that a human
 * buyer opens to review Envoi's price and approve payment themselves. Nothing in this API pays,
 * approves or prices a purchase or reads a receipt; a buyer's price is always recalculated by Envoi
 * at review. Prices are whole Singapore cents, and an unknown price or availability is null, never
 * zero or false. This file is written in JSON syntax, which is valid YAML 1.2, so it can be read
 * without a YAML library. The envelope flag ok and the error flag retryable are typed boolean
 * without a literal value because the APIMatic TypeScript generator (CLI 2.0.0-beta.6, codegen v4)
 * turns a boolean enum or const into the string "True" or "False".
 */
export class EnvoiPublicApiClient {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;
  #outlets?: Outlets;
  #purchaseRequests?: PurchaseRequests;

  constructor(options: ClientOptions = {}) {
    this.#rawClient = new RawClient({
      ...buildCoreClientOptions(options, "ENVOI_PUBLIC_API_CLIENT_LOG"),
      defaultHeaders: [
        { name: "User-Agent", value: "EnvoiPublicApiClient/1.1.0 TypeScript", schema: s.string() },
        { name: "X-APIMatic-Lang", value: "TypeScript", schema: s.string() },
        { name: "X-APIMatic-Package-Version", value: "1.1.0", schema: s.string() },
        { name: "X-APIMatic-Gen-Version", value: "4.0.0", schema: s.string() },
        { name: "X-APIMatic-OS", value: host.operatingSystem(), schema: s.optional(s.string()) },
        { name: "X-APIMatic-Runtime", value: host.runtimeDescription(), schema: s.optional(s.string()) },
      ],
      defaultQuery: [],
      defaultPathParams: [],
    });

    this.#servers = buildServers(options);

    this.#auth = buildAuthSchemes(options);
  }

  get outlets(): Outlets {
    return (this.#outlets ??= new Outlets(this.#rawClient, this.#servers));
  }

  get purchaseRequests(): PurchaseRequests {
    return (this.#purchaseRequests ??= new PurchaseRequests(this.#rawClient, this.#servers, this.#auth));
  }
}
