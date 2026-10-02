import {
  createORPCClient,
  createSafeClient,
  isDefinedError,
  ORPCError,
  safe,
} from "@orpc/client";
import { type RouterContractClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { contract } from "./contract";
import { TauriLink } from "./tauri-link";
export { consumeAsyncIterator, getEventMeta } from "@orpc/client";

const link = new TauriLink(contract);

export const client: RouterContractClient<typeof contract> =
  createORPCClient(link);

export const safeClient = createSafeClient(client);

export const orpc = createTanstackQueryUtils(client);

export { isDefinedError, ORPCError, safe };
