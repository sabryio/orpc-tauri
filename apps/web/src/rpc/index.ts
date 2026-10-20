import { createORPCClient } from "@orpc/client";
import type { RouterContractClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { invoke } from "@tauri-apps/api/core";
import { TauriLink } from "orpc-tauri/link";
import { type Contract, contract } from "./contract";

// `onProgress` call-option typing ships with the orpc-tauri package via its
// ambient `@orpc/client` augmentation — no local `declare module` needed.

const link = new TauriLink(contract, {
	invoke: async <T = unknown>(
		command: string,
		args?: Record<string, unknown>,
	): Promise<T> => {
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

// Exposed for resource lifecycle demos (`link.resource.close(handle)`).
export { link };

export const orpc = createTanstackQueryUtils(client);
