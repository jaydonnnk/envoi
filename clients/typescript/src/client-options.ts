import type { TokenProvider } from "./core/auth/credentials.js";
import type { CoreClientOptions } from "./core/client-options.js";
import { ServerEnvironment } from "./servers.js";

export type ClientOptions = SdkClientOptions & CoreClientOptions;

type SdkClientOptions = ServerOptions & {
  /**
   * An Envoi agent token, issued by the Envoi operator and shown once. It can propose a basket
   * only: it cannot pay, approve a payment or read a receipt.
   */
  readonly agentBearer?: TokenProvider | undefined;
};

type ServerOptions =
  | {
      readonly serverEnvironment?: typeof ServerEnvironment.Production;
      /** Render test deployment */
      readonly serverOptions?: {
        baseUrl?: string;
      };
    }
  | {
      readonly serverEnvironment: typeof ServerEnvironment.Environment2;
      /** Render test deployment */
      readonly serverOptions?: {
        baseUrl?: string;
      };
    };
