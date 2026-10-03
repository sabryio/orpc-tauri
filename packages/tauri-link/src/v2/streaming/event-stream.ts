import { Cause, Effect, Queue, Stream } from "effect";
import { StreamError } from "../errors";
import { TauriInvoker } from "../services/invoker";
import { TauriListener } from "../services/listener";
import { attachEventMeta, type SseEvent } from "../../streaming/sse-types";

/**
 * Configuration for SSE event streaming.
 */
export interface EventStreamConfig {
	readonly streamId: () => string;
	readonly getEventNames: (streamId: string) => {
		readonly data: string;
		readonly error: string;
		readonly done: string;
	};
}

/**
 * Creates an Effect.Stream that consumes SSE events from Tauri.
 *
 * DIP: Depends on TauriInvoker and TauriListener abstractions, not concrete Tauri API.
 * SRP: Single responsibility - orchestrating event listeners into a stream.
 *
 * Automatically cleans up all event listeners when the stream ends (via Scope).
 */
export const createEventStream = <T>(
	command: string,
	input: unknown,
	config: EventStreamConfig,
): Stream.Stream<T, StreamError, TauriInvoker | TauriListener> =>
	Stream.callback<T, StreamError, TauriInvoker | TauriListener>((queue) =>
		Effect.gen(function* () {
			const invoker = yield* TauriInvoker;
			const listener = yield* TauriListener;

			const streamId = config.streamId();
			const events = config.getEventNames(streamId);

			// Set up listeners that will push to the queue
			// Note: listener receives SseEvent<T> structure from backend
			yield* listener.listen<SseEvent<T>>(events.data, (sseEvent) => {
				// Extract data and attach metadata (preserve old implementation behavior)
				if (sseEvent.data !== undefined) {
					const value = sseEvent.data;
					attachEventMeta(value, sseEvent);
					Queue.offerUnsafe(queue, value);
				}
			});
			yield* listener.listen<unknown>(events.error, (errorPayload) =>
				Queue.failCauseUnsafe(
					queue,
					Cause.fail(new StreamError({ streamId, cause: errorPayload })),
				),
			);
			yield* listener.listen(events.done, () => Queue.endUnsafe(queue));

			// Start the stream by invoking the command (fork it so we don't block)
			yield* Effect.forkScoped(
				invoker.invoke(command, {
					...(input as Record<string, unknown>),
					streamId,
					eventNames: events,
				}).pipe(
					Effect.catch((error) =>
						Effect.sync(() =>
							Queue.failCauseUnsafe(
								queue,
								Cause.fail(new StreamError({ streamId, cause: error })),
							),
						),
					),
				),
			);
		}).pipe(
			Effect.catch((error) =>
				Effect.sync(() =>
					Queue.failCauseUnsafe(
						queue,
						Cause.fail(
							new StreamError({
								streamId: config.streamId(),
								cause: error,
							}),
						),
					),
				),
			),
		),
	);
