import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Context, Effect, Layer } from "effect";
import type { Scope } from "effect/Scope";
import { TauriListenError } from "../errors";

/**
 * Service for listening to Tauri events with automatic cleanup via Scope.
 *
 * DIP: Streaming code depends on this service interface, not concrete Tauri API.
 * SRP: Single responsibility - wrapping Tauri event listeners with Effect Scope.
 */
export class TauriListener extends Context.Service<
	TauriListener,
	{
		readonly listen: <T>(
			event: string,
			handler: (payload: T) => void,
		) => Effect.Effect<void, TauriListenError, Scope>;
	}
>()("@tauri-link/TauriListener") {}

/**
 * Live implementation of TauriListener using @tauri-apps/api.
 *
 * Listeners are automatically cleaned up when the Scope exits (normal, error, or interrupt).
 */
export const TauriListenerLive = Layer.succeed(
	TauriListener,
	TauriListener.of({
		listen: <T>(event: string, handler: (payload: T) => void) =>
			Effect.acquireRelease(
				Effect.tryPromise({
					try: () => listen<T>(event, (e) => handler(e.payload)),
					catch: (cause) => new TauriListenError({ event, cause }),
				}),
				(unlisten: UnlistenFn) => Effect.sync(() => unlisten()),
			).pipe(Effect.asVoid),
	}),
);
