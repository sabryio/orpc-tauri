import { Effect, Stream } from "effect";
import { TauriChannelFactory } from "../services/channel-factory";
import { TauriInvoker } from "../services/invoker";
import { type StreamError } from "../errors";
import { createQueueStream, forkInvoke } from "./stream-utils";

/**
 * SSE event payload structure from Tauri channels.
 */
interface SseEvent<T> {
  readonly event: "message" | "error" | "done";
  readonly data?: T;
  readonly error?: unknown;
}

/**
 * Creates an Effect.Stream that consumes data from a Tauri Channel.
 *
 * DIP: Depends on TauriInvoker and TauriChannelFactory abstractions.
 * SRP: Single responsibility - converting Tauri Channel callbacks into Effect.Stream.
 *
 * The channel is created within a Scope for automatic cleanup.
 */
export const createChannelStream = <T>(
  command: string,
  input: unknown,
  paramName: string,
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
