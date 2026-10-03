import { Effect, Layer, Stream } from "effect";
import { streamToAsyncIterator } from "./streaming/stream-adapter";
import {
	TauriChannelFactory,
	TauriChannelFactoryLive,
} from "./services/channel-factory";
import { TauriInvoker, TauriInvokerLive } from "./services/invoker";
import { TauriListener, TauriListenerLive } from "./services/listener";
import { createChannelStream } from "./streaming/channel-stream";
import { createEventStream } from "./streaming/event-stream";
import type { EventStreamConfig } from "./streaming/event-stream";

/**
 * Transport mode for streaming operations.
 */
export type TransportMode = "event" | "channel";

/**
 * Configuration for a streaming call.
 */
export interface StreamConfig {
	readonly mode: TransportMode;
	readonly eventConfig?: EventStreamConfig;
	readonly channelParam?: string;
}

/**
 * Effect-based TauriLink orchestrator.
 *
 * Coordinates services and streaming to provide typed, resource-safe Tauri IPC.
 * This is the internal Effect implementation - Phase 7 will wrap this with a
 * Promise-based facade for backward compatibility.
 */
export class EffectTauriLink {
	/**
	 * Combined layer providing all Tauri services.
	 * Public to allow external use and testing.
	 */
	static readonly AppLayer = Layer.mergeAll(
		TauriInvokerLive,
		TauriListenerLive,
		TauriChannelFactoryLive,
	);

	/**
	 * Execute a unary (non-streaming) Tauri command.
	 *
	 * @param command - Tauri command name (snake_case)
	 * @param input - Command input parameters
	 * @returns Effect that requires TauriInvoker service
	 */
	static call<TInput, TOutput>(
		command: string,
		input: TInput,
	): Effect.Effect<TOutput, unknown, TauriInvoker> {
		return Effect.gen(function* () {
			const invoker = yield* TauriInvoker;
			return yield* invoker.invoke<TOutput>(
				command,
				input as Record<string, unknown>,
			);
		});
	}

	/**
	 * Execute a streaming Tauri command.
	 *
	 * @param command - Tauri command name (snake_case)
	 * @param input - Command input parameters
	 * @param config - Stream configuration (event or channel mode)
	 * @param layer - Layer providing required services (defaults to AppLayer)
	 * @returns AsyncIterableIterator that yields stream values
	 */
	static async *stream<TInput, TOutput>(
		command: string,
		input: TInput,
		config: StreamConfig,
		layer: Layer.Layer<
			TauriInvoker | TauriListener | TauriChannelFactory
		> = EffectTauriLink.AppLayer,
	): AsyncIterableIterator<TOutput> {
		// Create stream based on transport mode and provide layer immediately
		const streamWithServices =
			config.mode === "event" && config.eventConfig
				? createEventStream<TOutput>(command, input, config.eventConfig).pipe(
						Stream.provide(layer),
						Stream.scoped,
					)
				: config.mode === "channel" && config.channelParam
					? createChannelStream<TOutput>(
							command,
							input,
							config.channelParam,
						).pipe(Stream.provide(layer), Stream.scoped)
					: Stream.fail(
							new Error(
								`Invalid stream config: mode=${config.mode}, eventConfig=${!!config.eventConfig}, channelParam=${config.channelParam}`,
							),
						).pipe(Stream.scoped);

		yield* streamToAsyncIterator(streamWithServices);
	}
}
