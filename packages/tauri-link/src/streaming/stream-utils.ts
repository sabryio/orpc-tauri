import { Cause, Effect, Exit, Queue, Stream } from "effect";
import type { Scope } from "effect/Scope";
import { StreamError } from "../errors";
import { TauriInvoker } from "../services/invoker";
import { closeResource } from "../services/resource";
import { parseHandleEnvelope } from "./handle";

/**
 * Queue emitter interface for abstracting queue operations.
 * Provides a clean API for pushing values, errors, and completion signals.
 */
export interface QueueEmitter<T> {
	readonly value: (v: T) => void;
	readonly error: (e: unknown) => void;
	readonly done: () => void;
}

/**
 * Creates an Effect.Stream using queue-based callbacks with automatic error handling.
 *
 * This utility abstracts the common pattern of:
 * 1. Creating a Stream.callback with a queue
 * 2. Providing a QueueEmitter for setup logic
 * 3. Wrapping setup errors in StreamError
 * 4. Handling outer errors consistently
 *
 * DIP: Generic over requirements R, allowing any Effect services
 * SRP: Single responsibility - queue-based stream creation pattern
 *
 * Note: Stream.callback provides Scope automatically, so setup functions can use
 * scoped operations like Effect.forkScoped without exposing Scope in the final Stream type.
 *
 * @param setup - Effect that receives a QueueEmitter to register callbacks.
 *                Can require Scope since Stream.callback provides it.
 * @returns Stream that emits values via the queue
 */
export const createQueueStream = <T, R>(
	setup: (emit: QueueEmitter<T>) => Effect.Effect<void, unknown, R | Scope>,
): Stream.Stream<T, StreamError, R> =>
	Stream.callback<T, StreamError, R>((queue) =>
		Effect.gen(function* () {
			const emit: QueueEmitter<T> = {
				value: (v) => Queue.offerUnsafe(queue, v),
				error: (e) =>
					Queue.failCauseUnsafe(
						queue,
						Cause.fail(new StreamError({ cause: e })),
					),
				done: () => Queue.endUnsafe(queue),
			};

			yield* setup(emit);
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

/**
 * Forks a Tauri command invocation within a scoped context.
 *
 * This utility abstracts the common pattern of:
 * 1. Forking the invoke call to avoid blocking
 * 2. Catching errors and forwarding to error handler
 * 3. Running in scoped context for automatic cleanup
 *
 * DIP: Depends on TauriInvoker abstraction
 * SRP: Single responsibility - async command invocation with error handling
 *
 * @param command - Command name to invoke
 * @param input - Command input parameters
 * @param onError - Error handler to call on invocation failure
 * @returns Forked Effect that completes when command finishes
 */
export const forkInvoke = (
	command: string,
	input: Record<string, unknown>,
	onError: (error: unknown) => void,
): Effect.Effect<void, never, TauriInvoker | Scope> =>
	Effect.gen(function* () {
		const invoker = yield* TauriInvoker;
		yield* Effect.forkScoped(
			invoker
				.invoke(command, input)
				.pipe(Effect.catch((error) => Effect.sync(() => onError(error)))),
		);
	});

/**
 * Mutable slot for a stream's announced Rust resource id.
 *
 * Contracts: set at most once (first `handle:<rid>` envelope wins),
 * read from the Scope teardown finalizer.
 */
export interface ResourceRidSlot {
	rid?: number;
}

/**
 * Parses a stream comment for a `handle:<rid>` announcement, mutating the
 * slot (first envelope wins, duplicates ignored). Returns true when the
 * comment was a handle envelope — callers treat this as a control envelope
 * (swallowed, never emitted as payload).
 */
export const captureHandleAnnouncement = (
	comment: string,
	slot: ResourceRidSlot,
): boolean => {
	const announcement = parseHandleEnvelope(comment);
	if (!announcement) return false;

	if (slot.rid === undefined) slot.rid = announcement.rid;
	return true;
};

/**
 * Abnormal scope exit = stream exited without `done` — consumer abort,
 * failure, or early `.return()`. On such an exit (and otherwise never),
 * the announced Rust resource is closed server-side: `Resource.close`
 * cancels the Rust task via its owning token.
 *
 * Best-effort, but never silent: a failed close leaves the Rust task
 * running, so the failure is logged loudly with its cause and the most
 * common fix (capability grant). The stream's own exit cause is preserved —
 * this must not mask it, so the finalizer error channel stays `never`.
 */
export const resourceTeardown = (
	slot: ResourceRidSlot,
	resource: { readonly autoClose?: boolean } | undefined,
	exit: Exit.Exit<unknown, unknown>,
): Effect.Effect<void, never, TauriInvoker | Scope> => {
	const autoClose = resource?.autoClose ?? true;
	if (!autoClose) return Effect.void;
	// Normal completion: the Rust side owns its lifecycle (the worker removes
	// its own resource) — the link never closes on a successful exit.
	if (Exit.isSuccess(exit)) return Effect.void;
	if (slot.rid === undefined) return Effect.void;

	return closeResource(slot.rid).pipe(
		Effect.catch((error) =>
			Effect.sync(() => {
				const cause = describeCloseError(error);
				console.error(
					`[tauri-link] Failed to close Rust resource rid=${slot.rid} (Rust task was NOT cancelled — it keeps running). Cause: ${cause} Most common fix: add "core:resources:allow-close" to the app's src-tauri/capabilities/*.json.`,
				);
			}),
		),
	);
};

/**
 * One-line diagnostic text for a failed `plugin:resources|close` invoke
 * (the cause is what makes these failures diagnosable): `TauriInvokeError`
 * wraps Tauri's own message (e.g. `resources.close not allowed. …`).
 */
const describeCloseError = (error: unknown): string => {
	if (typeof error === "object" && error !== null && "cause" in error) {
		return `TauriInvokeError: ${String((error as { cause: unknown }).cause)}`;
	}
	if (error instanceof Error) return error.message;
	return String(error);
};
