import {
  createORPCClient,
  createSafeClient,
  isDefinedError,
  ORPCError,
  safe,
} from "@orpc/client";
import { type RouterContractClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { TauriLink } from "@sabryio/orpc-tauri/link";
import { contract, type Contract } from "./contract";
import { invoke } from "@tauri-apps/api/core";
export { consumeAsyncIterator, getEventMeta } from "@orpc/client";

const link = new TauriLink(contract, {
  invoke: async <T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> => {
    console.log(`[Invoke] ${command}`, args);

    try {
      const result = await invoke<T>(command, args);
      console.log(`[Result] ${command}`, result);
      return result;
    } catch (error) {
      console.error(`[Error] ${command}`, error);
      throw error;
    }
  },
});

export const client: RouterContractClient<Contract> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

export { isDefinedError, ORPCError };
