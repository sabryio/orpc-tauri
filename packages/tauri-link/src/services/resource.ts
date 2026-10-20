import { Effect } from "effect";
import type { TauriInvokeError } from "../errors";
import type { RustResourceHandle } from "../resource-handle";
import { TauriInvoker } from "./invoker";

/**
 * Built-in Tauri command that drops an entry from the Rust resource table.
 * This is exactly what `new Resource(rid).close()` from `@tauri-apps/api/core`
 * invokes — the link mirrors it so closing stays inside the same Effect
 * pipeline. It needs the `core:resources:allow-close` capability; apps that
 * don't grant it get a typed failure here (loud at the boundaries, never
 * silently swallowed).
 */
export const RESOURCE_CLOSE_COMMAND = "plugin:resources|close" as const;

/**
 * Effect-level close for a Rust resource handle.
 *
 * Typed failure by design: callers decide how to surface it. The public
 * facade (`TauriLink.resource.close`) rejects; stream teardown finalizers
 * catch and log loudly instead of masking the stream's own exit cause.
 */
export const closeResource = (
	handle: RustResourceHandle | { rid: number } | number,
): Effect.Effect<void, TauriInvokeError, TauriInvoker> =>
	Effect.gen(function* () {
		const invoker = yield* TauriInvoker;
		const rid = typeof handle === "number" ? handle : handle.rid;

		yield* invoker.invoke<unknown>(RESOURCE_CLOSE_COMMAND, { rid });
	});
