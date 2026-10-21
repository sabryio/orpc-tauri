import { Effect, type Stream } from "effect";
import type { StreamError } from "../errors";
import type { TauriInvoker } from "../services/invoker";
import { TauriListener } from "../services/listener";
import { parseProgress } from "./progress";
import type { ProgressInfo } from "./progress-types";
import { attachEventMeta, type SseEvent } from "./sse-types";
import {
	captureHandleAnnouncement,
	createQueueStream,
	forkInvoke,
	type ResourceRidSlot,
	resourceTeardown,
} from "./stream-utils";

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
 *
 * Progress parity with the channel transport: data-less `progress:` comment
 * envelopes fire `onProgress` and are never yielded as payload. Only parsed
 * when the consumer passed `onProgress` (zero work otherwise), mirroring
 * `channel-stream.ts`.
 */
export const createEventStream = <T>(
	command: string,
	input: unknown,
	config: EventStreamConfig,
	onProgress?: (info: ProgressInfo) => void,
	progressParser?: (comment: string) => ProgressInfo | undefined,
	resource?: { readonly autoClose?: boolean },
): Stream.Stream<T, StreamError, TauriInvoker | TauriListener> =>
	createQueueStream<T, TauriInvoker | TauriListener>((emit) =>
		Effect.gen(function* () {
			const listener = yield* TauriListener;

			const streamId = config.streamId();
			const events = config.getEventNames(streamId);

			// Rust-resource lifecycle: `handle:<rid>` announcements ride the
			// comment of parity events; the slot feeds the teardown finalizer.
			const ridSlot: ResourceRidSlot = {};

			// Set up listeners that will push to the queue
			yield* listener.listen<SseEvent<T>>(events.data, (sseEvent) => {
				// Control envelope: first `handle:<rid>` announcement wins; a
				// comment-only envelope (no payload) is swallowed here.
				if (captureHandleAnnouncement(sseEvent.comment ?? "", ridSlot)) {
					if (sseEvent.data === undefined) return;
				}

				// Progress: data-less envelopes fire the callback, never
				// yielded. Payload-riding comments don't fire progress —
				// same precedence as the channel transport.
				if (sseEvent.data === undefined && onProgress !== undefined) {
					const info = progressParser
						? progressParser(sseEvent.comment ?? "")
						: parseProgress(sseEvent.comment ?? "");
					if (info) {
						onProgress(info);
						return;
					}
				}

				if (sseEvent.data !== undefined) {
					const value = sseEvent.data;
					attachEventMeta(value, sseEvent);
					emit.value(value);
				}
			});
			yield* listener.listen<unknown>(events.error, (errorPayload) =>
				emit.error({ streamId, cause: errorPayload }),
			);
			yield* listener.listen(events.done, () => emit.done());

			// Resource-backed streams: on abnormal exit (abort, failure, early
			// `.return()`), close the announced rid — cancels the Rust task.
			// Normal completion: Rust owns its lifecycle.
			yield* Effect.addFinalizer((exit) =>
				resourceTeardown(ridSlot, resource, exit),
			);

			// Start the stream by invoking the command (fork it so we don't
			// block); the request context rides inside the args under the
			// reserved `context` key — injected by the public API.
			yield* forkInvoke(
				command,
				{
					...(input as Record<string, unknown>),
					streamId,
					eventNames: events,
				},
				(error) => emit.error({ streamId, cause: error }),
			);
		}),
	);
