/**
 * Handle announcement convention for resource-backed streams
 * (`tauri.resource()` meta).
 *
 * A Rust command running a long-lived task (e.g. a cancellable download)
 * registers its task handle in the resource table and announces the `rid`
 * exactly once as a data-less control envelope, mirroring `progress:`:
 *
 *   comment: "handle:<rid>"
 *
 * The link swallows the envelope (never yields it) and keeps the rid for the
 * stream Scope teardown: unless `autoClose: false`, an abnormal exit — abort,
 * failure, or consumer early-exit — closes the resource, cancelling the Rust
 * task. Normal completion never auto-closes: the Rust side owns its lifecycle
 * (the worker removes its own resource when it finishes).
 */
export const HANDLE_PREFIX = "handle:" as const;

export interface HandleAnnouncement {
	/** Resource id the JS side can close to cancel the Rust task. */
	readonly rid: number;
}

/**
 * Parses a `handle:<rid>` control envelope comment. Returns `undefined` for
 * anything that does not match the convention exactly — malformed envelopes
 * are swallowed by the stream parser pipeline, same as progress comments.
 */
export const parseHandleEnvelope = (
	comment: string,
): HandleAnnouncement | undefined => {
	if (!comment.startsWith(HANDLE_PREFIX)) return undefined;

	const digits = comment.slice(HANDLE_PREFIX.length);
	if (!/^\d+$/.test(digits)) return undefined;

	return { rid: Number(digits) };
};
