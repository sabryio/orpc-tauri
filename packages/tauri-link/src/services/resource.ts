import { Effect } from "effect";
import type { RustResourceHandle } from "../resource-handle";
import { TauriInvoker } from "./invoker";

/**
 * Built-in Tauri command that drops an entry from the Rust resource table.
 * This is exactly what `new Resource(rid).close()` from `@tauri-apps/api/core`
 * invokes (permission: `core:resources:allow-close`, in the default set) —
 * the link mirrors it so closing stays inside the same Effect pipeline.
 */
export const RESOURCE_CLOSE_COMMAND = "plugin:resources|close" as const;

/**
 * Effect-level close for a Rust resource handle.
 *
 * Best-effort per the link's resource semantics: the underlying invoke is
 * still typed, but callers (stream teardown finalizers, the public facade)
 * swallow failures and log at the boundary instead of masking the exit cause.
 */
export const closeResource = (
	handle: RustResourceHandle | { rid: number } | number,
): Effect.Effect<void, never, TauriInvoker> =>
	Effect.gen(function* () {
		const invoker = yield* TauriInvoker;
		const rid = typeof handle === "number" ? handle : handle.rid;

		yield* invoker
			.invoke<unknown>(RESOURCE_CLOSE_COMMAND, { rid })
			.pipe(Effect.catch(() => Effect.void));
	});
