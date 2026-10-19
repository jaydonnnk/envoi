import type { CoreClientOptions } from "./core/client-options.js";
import { ServerEnvironment } from "./servers.js";

export type ClientOptions = SdkClientOptions & CoreClientOptions;

type SdkClientOptions = ServerOptions;

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
