import { Effect, Layer, Stream } from "effect";
import { StreamError, TimeoutError } from "./errors";
import {
	type TauriChannelFactory,
	TauriChannelFactoryLive,
} from "./services/channel-factory";
import { TauriInvoker, TauriInvokerLive } from "./services/invoker";
import { type TauriListener, TauriListenerLive } from "./services/listener";
import { ConsoleLoggerLive } from "./services/logger";
import { createChannelStream } from "./streaming/channel-stream";
import type { EventStreamConfig } from "./streaming/event-stream";
import { createEventStream } from "./streaming/event-stream";
import type { ProgressInfo } from "./streaming/progress-types";
import { streamToAsyncIterator } from "./streaming/stream-adapter";

/**
 * Transport mode for streaming operations.
 * - "listen": Uses tauri.listen() with custom event names (SSE-style)
 * - "channel": Uses Tauri Channel API
 */
export type TransportMode = "listen" | "channel";

/**
 * Configuration for a streaming call.
 */
export interface StreamConfig {
	readonly mode: TransportMode;
	readonly listenConfig?: EventStreamConfig;
	readonly channelParam?: string;
	/**
	 * Progress callback for channel-mode streams. Fires for data-less
	 * progress control envelopes; never called for yielded values.
	 */
	readonly onProgress?: (info: ProgressInfo) => void;
	/**
	 * Comment parser that recognizes progress envelopes in channel-mode
	 * streams (procedure-level convention from transport meta). Falls back
	 * to the built-in `progress:` parser when omitted.
	 */
	readonly progressParser?: (comment: string) => ProgressInfo | undefined;
	/**
	 * Client-side inactivity deadline in milliseconds (from `tauri.timeout`
	 * meta). Fires when no value arrives within the window; unary calls use
	 * it as a whole-call deadline instead.
	 */
	readonly timeoutMs?: number;
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
		ConsoleLoggerLive,
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
		let baseStream: Stream.Stream<
			TOutput,
			StreamError | TimeoutError | Error,
			TauriChannelFactory | TauriInvoker | TauriListener
		>;
		if (config.mode === "listen" && config.listenConfig) {
			baseStream = createEventStream<TOutput>(command, input, config.listenConfig);
		} else if (config.mode === "channel" && config.channelParam) {
			baseStream = createChannelStream<TOutput>(
				command,
				input,
				config.channelParam,
				config.onProgress,
				config.progressParser,
			);
		} else {
			baseStream = Stream.fail(
				new Error(
					`Invalid stream config: mode=${config.mode}, listenConfig=${!!config.listenConfig}, channelParam=${config.channelParam}`,
				),
			);
		}

		// Inactivity deadline from `tauri.timeout` meta: if no value arrives
		// within the window, fail with a typed TimeoutError.
		const timeoutMs = config.timeoutMs;
		const timedStream: Stream.Stream<
			TOutput,
			StreamError | TimeoutError | Error,
			TauriChannelFactory | TauriInvoker | TauriListener
		> =
			timeoutMs !== undefined
				? baseStream.pipe(
						Stream.timeoutOrElse({
							duration: timeoutMs,
							orElse: () =>
								Stream.fromEffect(
									Effect.fail(
										new TimeoutError({ operation: command, timeout: timeoutMs }),
									),
								),
						}),
					)
				: baseStream;

		const streamWithServices = timedStream.pipe(
			Stream.provide(layer),
			Stream.scoped,
		);

		yield* streamToAsyncIterator(streamWithServices);
	}
}
