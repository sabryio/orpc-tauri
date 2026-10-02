import {
  createORPCClient,
  createSafeClient,
  isDefinedError,
  ORPCError,
  safe,
  getEventMeta,
  consumeAsyncIterator,
} from "@orpc/client";
import { type RouterContractClient } from "@orpc/contract";
import {
  createTanstackQueryUtils,
  type RouterUtilsPlugin,
} from "@orpc/tanstack-query";
import { TauriLink } from "@tauri-orpc-contract/tauri-link";
import { contract } from "./contract";
export { consumeAsyncIterator, getEventMeta } from "@orpc/client";

// Create link with optional custom logger
// const link = new TauriLink(contract, { logger: customLogger });
const link = new TauriLink(contract);

export const client: RouterContractClient<typeof contract> =
  createORPCClient(link);

// Plugin to preserve Symbol-based metadata by converting to regular properties
// Only needed for liveOptions where events replace each other
const metadataPreservationPlugin: RouterUtilsPlugin<typeof client> = {
  name: "metadata-preservation",
  initProcedureOptions(_path, options) {
    return {
      ...options,
      liveOptions: {
        ...options.liveOptions,
        select: (data: any) => {
          const meta = getEventMeta(data);

          // If metadata exists, attach it as regular properties
          if (meta) {
            return { ...data, _meta: meta };
          }

          return data;
        },
      },
    };
  },
};

export const orpc = createTanstackQueryUtils(client, {
  plugins: [metadataPreservationPlugin],
});

export { isDefinedError, ORPCError };
