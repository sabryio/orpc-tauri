import { Effect, type Stream } from "effect";
import type { StreamError } from "../errors";
import { TauriChannelFactory } from "../services/channel-factory";
import type { TauriInvoker } from "../services/invoker";
import { parseProgress } from "./progress";
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
 * Data-less envelopes (`comment`-only) are control signals: comments matching
 * the procedure's progress convention fire the optional onProgress callback,
 * other envelopes (flush, unknown) are swallowed silently. Control envelopes
 * are never yielded.
 */
export const createChannelStream = <T>(
	command: string,
	input: unknown,
	paramName: string,
	onProgress?: (info: ProgressInfo) => void,
	progressParser?: (comment: string) => ProgressInfo | undefined,
): Stream.Stream<T, StreamError, TauriInvoker | TauriChannelFactory> =>
	createQueueStream<T, TauriInvoker | TauriChannelFactory>((emit) =>
		Effect.gen(function* () {
			const factory = yield* TauriChannelFactory;

			const channel = yield* factory.createChannel<SseEvent<T>>();

			// Scope teardown (completion, failure, or mid-stream cancellation):
			// stop the pipeline first so late envelopes can't reach the consumer
			// (onProgress or the queue), then unregister the underlying Tauri
			// invoke callback so Rust keeps sending into a dead channel.
			// Tauri only tears a channel down when the backend sends `end` — a
			// cancelled stream has no `end`, so the client must do it here.
			yield* Effect.addFinalizer(() =>
				Effect.sync(() => {
					channel.onmessage = () => {};
					const cleanup = (
						channel as unknown as { cleanupCallback?: () => void }
					).cleanupCallback;
					if (typeof cleanup === "function") {
						try {
							cleanup.call(channel);
						} catch {
							// Callback already gone (e.g. Rust sent `end`) — nothing to do.
						}
					}
				}),
			);

			// Set up channel message handler
			channel.onmessage = (msg) => {
				if (msg.event === "message" && msg.data !== undefined) {
					emit.value(msg.data);
				} else if (msg.event === "error") {
					emit.error(msg.error ?? msg);
				} else if (msg.event === "done") {
					emit.done();
				} else if (onProgress !== undefined && msg.comment) {
					const info = progressParser
						? progressParser(msg.comment)
						: parseProgress(msg.comment);
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
