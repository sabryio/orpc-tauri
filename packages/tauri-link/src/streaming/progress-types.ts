/**
 * Typed shape of a transfer progress tick.
 *
 * Fired via the `onProgress` call option for channel-mode streams.
 * Never part of the consumer's Zod payload schema — see streaming/progress.ts.
 */
export interface ProgressInfo {
	/** Bytes transferred so far. */
	bytesTransferred: number;
	/** Total bytes expected — present when the sender knows the size. */
	totalBytes?: number;
	/** 0–100, only present when totalBytes is known. */
	percentage?: number;
}

/**
 * Per-procedure progress convention for channel transports.
 *
 * `prefix` renames the built-in `progress:` prefix.
 * `parser` fully owns recognition — it wins over `prefix` and receives every
 * comment-bearing envelope; returning undefined swallows the envelope
 * (control signals can never break a data stream).
 */
export interface ChannelProgressConfig {
	prefix?: string;
	parser?: (comment: string) => ProgressInfo | undefined;
}
