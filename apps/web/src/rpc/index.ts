import {
  createORPCClient,
  createSafeClient,
  isDefinedError,
  ORPCError,
  safe,
} from "@orpc/client";
import { type RouterContractClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { TauriLink } from "@tauri-orpc-contract/tauri-link";
import { contract, type Contract } from "./contract";
export { consumeAsyncIterator, getEventMeta } from "@orpc/client";

// Create link with optional custom logger
// const link = new TauriLink(contract, { logger: customLogger });
const link = new TauriLink(contract);

export const client: RouterContractClient<Contract> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

export { isDefinedError, ORPCError };
