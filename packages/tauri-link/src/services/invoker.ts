import { invoke } from "@tauri-apps/api/core";
import { Context, Effect, Layer } from "effect";
import { TauriInvokeError } from "../errors";

/**
 * Service for invoking Tauri commands with typed error handling.
 *
 * DIP: Domain code depends on this service interface, not concrete Tauri API.
 * SRP: Single responsibility - wrapping Tauri invoke with Effect error channels.
 */
export class TauriInvoker extends Context.Service<
	TauriInvoker,
	{
		readonly invoke: <T>(
			command: string,
			args?: Record<string, unknown>,
		) => Effect.Effect<T, TauriInvokeError>;
	}
>()("@tauri-link/TauriInvoker") {}

/**
 * Live implementation of TauriInvoker using @tauri-apps/api.
 */
export const TauriInvokerLive = Layer.succeed(
	TauriInvoker,
	TauriInvoker.of({
		invoke: <T>(command: string, args?: Record<string, unknown>) =>
			Effect.tryPromise({
				try: () => invoke<T>(command, args),
				catch: (cause) =>
					new TauriInvokeError({
						command,
						input: args,
						cause,
					}),
			}),
	}),
);
