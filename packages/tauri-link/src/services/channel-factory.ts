import { Channel } from "@tauri-apps/api/core";
import { Context, Effect, Layer } from "effect";
import { TauriInvokeError } from "../errors";

/**
 * Service for creating Tauri channels with typed error handling.
 *
 * DIP: Channel streaming depends on this service interface, not concrete Channel API.
 * SRP: Single responsibility - wrapping Tauri Channel creation with Effect error channels.
 */
export class TauriChannelFactory extends Context.Service<
	TauriChannelFactory,
	{
		readonly createChannel: <T>() => Effect.Effect<Channel<T>, TauriInvokeError>;
	}
>()("@tauri-link/TauriChannelFactory") {}

/**
 * Live implementation of TauriChannelFactory using @tauri-apps/api.
 */
export const TauriChannelFactoryLive = Layer.succeed(
	TauriChannelFactory,
	TauriChannelFactory.of({
		createChannel: <T>() =>
			Effect.try({
				try: () => new Channel<T>(),
				catch: (cause) =>
					new TauriInvokeError({
						command: "Channel.new",
						input: undefined,
						cause,
					}),
			}),
	}),
);
