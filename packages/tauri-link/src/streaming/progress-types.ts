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
