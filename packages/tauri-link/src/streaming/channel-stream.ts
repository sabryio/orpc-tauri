import { Effect, type Stream } from "effect";
import type { StreamError } from "../errors";
import { TauriChannelFactory } from "../services/channel-factory";
import type { TauriInvoker } from "../services/invoker";
import { PROGRESS_PREFIX, parseProgress } from "./progress";
import type { ProgressInfo } from "./progress-types";
import { createQueueStream, forkInvoke } from "./stream-utils";

/**
 * SSE event payload structure from Tauri channels.
 */
interface SseEvent<T> {
	readonly event: "message" | "error" | "done";
	readonly data?: T;
	readonly error?: unknown;
	/** Comment (SSE `:` field) — carries control signals such as progress. */
	readonly comment?: string;
}

/**
 * Creates an Effect.Stream that consumes data from a Tauri Channel.
 *
 * DIP: Depends on TauriInvoker and TauriChannelFactory abstractions.
 * SRP: Single responsibility - converting Tauri Channel callbacks into Effect.Stream.
 *
 * The channel is created within a Scope for automatic cleanup.
 *
 * Data-less envelopes (`comment`-only) are control signals: `progress:`
 * comments fire the optional onProgress callback, other envelopes (flush,
 * unknown) are swallowed silently. Control envelopes are never yielded.
 */
export const createChannelStream = <T>(
	command: string,
	input: unknown,
	paramName: string,
	onProgress?: (info: ProgressInfo) => void,
): Stream.Stream<T, StreamError, TauriInvoker | TauriChannelFactory> =>
	createQueueStream<T, TauriInvoker | TauriChannelFactory>((emit) =>
		Effect.gen(function* () {
			const factory = yield* TauriChannelFactory;

			const channel = yield* factory.createChannel<SseEvent<T>>();

			// Set up channel message handler
			channel.onmessage = (msg) => {
				if (msg.event === "message" && msg.data !== undefined) {
					emit.value(msg.data);
				} else if (msg.event === "error") {
					emit.error(msg.error ?? msg);
				} else if (msg.event === "done") {
					emit.done();
				} else if (
					onProgress !== undefined &&
					(msg.comment ?? "").startsWith(PROGRESS_PREFIX)
				) {
					const info = parseProgress(msg.comment as string);
					if (info) onProgress(info);
				}
			};

			// Invoke command with channel as parameter (fork it so we don't block)
			yield* forkInvoke(
				command,
				{
					...(input as Record<string, unknown>),
					[paramName]: channel,
				},
				emit.error,
			);
		}),
	);
