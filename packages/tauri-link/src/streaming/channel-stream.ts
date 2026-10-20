import { Effect, type Stream } from "effect";
import type { StreamError } from "../errors";
import { TauriChannelFactory } from "../services/channel-factory";
import type { TauriInvoker } from "../services/invoker";
import { parseProgress } from "./progress";
import type { ProgressInfo } from "./progress-types";
import {
	captureHandleAnnouncement,
	createQueueStream,
	forkInvoke,
	type ResourceRidSlot,
	resourceTeardown,
} from "./stream-utils";

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
 * How long the scope teardown waits for Tauri's `{end}` envelope before it
 * unregisters the invoke callback itself. Successful and cancelled backends
 * drop their Channel clone within at most one send/poll interval — far below
 * this — so the grace only ever fires for a hung or leaking backend.
 */
const CHANNEL_TEARDOWN_GRACE_MS = 10_000;

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
	resource?: { readonly autoClose?: boolean },
): Stream.Stream<T, StreamError, TauriInvoker | TauriChannelFactory> =>
	createQueueStream<T, TauriInvoker | TauriChannelFactory>((emit) =>
		Effect.gen(function* () {
			const factory = yield* TauriChannelFactory;

			// Rust-resource lifecycle: capture the `handle:<rid>` announcement
			// (first envelope wins) for the Scope teardown finalizer below.
			const ridSlot: ResourceRidSlot = {};

			const channel = yield* factory.createChannel<SseEvent<T>>();

			// Scope teardown (completion, failure, or mid-stream cancellation):
			// stop the pipeline first so late envelopes can't reach the consumer
			// (onProgress or the queue), then hand the underlying Tauri invoke
			// callback back to Tauri's own end-of-channel cleanup.
			//
			// The callback is NEVER unregistered eagerly, in every exit case:
			// Tauri sends `{ end: true }` when the backend's last Channel clone
			// drops (natural completion, or a cancelled task stopping) and the
			// JS Channel then unregisters itself in order. Unregistering
			// ourselves first either steals that cleanup — Tauri warns
			// `Couldn't find callback id` after every normal completion — or
			// makes each trailing send of a cancelled stream warn the same way.
			// Trailing envelopes are swallowed by the no-op `onmessage` above.
			//
			// Safety net for backends that never send `{end}` (leaked channel
			// clone, hung task): unregister after a grace period. Idempotent —
			// if the `{end}` path already ran, this deletes a non-existent key.
			yield* Effect.addFinalizer((exit) =>
				Effect.gen(function* () {
					channel.onmessage = () => {};
					const channelLike = channel as unknown as {
						cleanupCallback?: () => void;
					};
					const tauriCleanup = channelLike.cleanupCallback;
					if (typeof tauriCleanup === "function") {
						let timer: ReturnType<typeof setTimeout> | undefined;
						let cleaned = false;
						const cleanupOnce = () => {
							if (cleaned) return;
							cleaned = true;
							if (timer !== undefined) clearTimeout(timer);
							try {
								tauriCleanup.call(channel);
							} catch {
								// Callback already gone — nothing to do.
							}
						};
						// Tauri's Channel calls this on its own `{end}` envelope —
						// route it through `cleanupOnce` to cancel the grace timer.
						channelLike.cleanupCallback = cleanupOnce;
						timer = setTimeout(cleanupOnce, CHANNEL_TEARDOWN_GRACE_MS);
						// Don't hold test/worker processes open for the grace period
						// when a stream outlives everything else.
						if (
							typeof timer === "object" &&
							timer !== null &&
							"unref" in timer &&
							typeof (timer as unknown as { unref?: () => void }).unref ===
								"function"
						) {
							(timer as unknown as { unref: () => void }).unref();
						}
					}

					// Resource-backed streams: on abnormal exit (abort, failure,
					// early `.return()`), close the announced rid — cancels the
					// Rust task. Normal completion: Rust owns its lifecycle.
					yield* resourceTeardown(ridSlot, resource, exit);
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
				} else if (msg.comment) {
					// Control envelopes: `handle:<rid>` first (never yielded),
					// then progress. Unknown comments stay swallowed.
					if (captureHandleAnnouncement(msg.comment, ridSlot)) return;
					if (onProgress !== undefined) {
						const info = progressParser
							? progressParser(msg.comment)
							: parseProgress(msg.comment);
						if (info) onProgress(info);
					}
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
