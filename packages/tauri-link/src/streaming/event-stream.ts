import { Effect, Stream } from "effect";
import { StreamError } from "../errors";
import { TauriInvoker } from "../services/invoker";
import { TauriListener } from "../services/listener";
import { attachEventMeta, type SseEvent } from "./sse-types";
import { createQueueStream, forkInvoke } from "./stream-utils";

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
  createQueueStream<T, TauriInvoker | TauriListener>((emit) =>
    Effect.gen(function* () {
      const listener = yield* TauriListener;

      const streamId = config.streamId();
      const events = config.getEventNames(streamId);

      // Set up listeners that will push to the queue
      yield* listener.listen<SseEvent<T>>(events.data, (sseEvent) => {
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

      // Start the stream by invoking the command (fork it so we don't block)
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
