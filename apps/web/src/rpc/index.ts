import { createORPCClient } from "@orpc/client";
import type { RouterContractClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { ProgressInfo } from "orpc-tauri/link";
import { invoke } from "@tauri-apps/api/core";
import { TauriLink } from "orpc-tauri/link";
import { type Contract, contract } from "./contract";

// Augment the oRPC client options with the transfer progress callback
// consumed by TauriLink for channel-mode streams (`progress:` control
// envelopes). Type-safe for all `client.*` and `orpc.*` callsites.
declare module "@orpc/client" {
	// biome-ignore lint/correctness/noUnusedVariables: augmentation must mirror the generic signature
	interface ClientOptions<T> {
		/** Transfer progress callback — fires for channel streams (Rust `.progress()`). */
		onProgress?: (info: ProgressInfo) => void;
	}
}

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

export const orpc = createTanstackQueryUtils(client);
