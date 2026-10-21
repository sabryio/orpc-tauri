import { createORPCClient } from "@orpc/client";
import type { RouterContractClient } from "@orpc/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { invoke } from "@tauri-apps/api/core";
import { TauriLink } from "orpc-tauri/link";
import { type Contract, contract } from "./contract";

// `onProgress` call-option typing ships with the orpc-tauri package via its
// ambient `@orpc/client` augmentation — no local `declare module` needed.

// Request-scoped client context — the IPC analog of HTTP headers. The link
// merges this per call (dynamic factory here: a fresh request id) with any
// per-call override, injects it into invoke args under the reserved
// `context` key, and passes it to `invoke` as a third argument. Rust
// commands opt in by declaring `context: Option<CallCtx>` (see ping.rs).
interface ClientContext {
	token?: string;
	xRequestId?: string;
}

const link = new TauriLink<ClientContext>(contract, {
	// Link-level defaults — a function is re-evaluated on every call.
	context: () => ({
		xRequestId: crypto.randomUUID(),
	}),
	// The merged request context rides `args` under the reserved `context`
	// key — a Rust command that declares `context: Option<CallCtx>` receives
	// it as a named parameter (see ping.rs).
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

export const client: RouterContractClient<Contract, ClientContext> =
	createORPCClient(link);

// Exposed for resource lifecycle demos (`link.resource.close(handle)`).
export { link };

export const orpc = createTanstackQueryUtils(client);
