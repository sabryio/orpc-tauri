import { Cause, Effect, Queue, Stream } from "effect";
import { StreamError } from "../errors";
import { TauriChannelFactory } from "../services/channel-factory";
import { TauriInvoker } from "../services/invoker";

/**
 * SSE event payload structure from Tauri channels.
 */
interface SseEvent<T> {
	readonly event: "message" | "error" | "complete";
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
	Stream.callback<T, StreamError, TauriInvoker | TauriChannelFactory>(
		(queue) =>
			Effect.gen(function* () {
				const invoker = yield* TauriInvoker;
				const factory = yield* TauriChannelFactory;

				const channel = yield* factory.createChannel<SseEvent<T>>();

				// Set up channel message handler
				channel.onmessage = (msg) => {
					if (msg.event === "message" && msg.data !== undefined) {
						Queue.offerUnsafe(queue, msg.data);
					} else if (msg.event === "error") {
						Queue.failCauseUnsafe(
							queue,
							Cause.fail(new StreamError({ cause: msg.error ?? msg })),
						);
					} else if (msg.event === "complete") {
						Queue.endUnsafe(queue);
					}
				};

				// Invoke command with channel as parameter (fork it so we don't block)
				yield* Effect.forkScoped(
					invoker.invoke(command, {
						...(input as Record<string, unknown>),
						[paramName]: channel,
					}).pipe(
						Effect.catch((error) =>
							Effect.sync(() =>
								Queue.failCauseUnsafe(
									queue,
									Cause.fail(new StreamError({ cause: error })),
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
							Cause.fail(new StreamError({ cause: error })),
						),
					),
				),
			),
	);
