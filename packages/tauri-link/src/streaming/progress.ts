/**
 * Transfer progress reporting for streaming transports.
 *
 * Progress is a control signal: it travels in data-less SSE envelopes
 * (the `comment` field) and never reaches the consumer's payload schema.
 * Format: `progress:<bytesTransferred>/<totalBytes>` — the total part is
 * optional; malformed envelopes are ignored silently, never thrown.
 * Consumed by both `channel-stream.ts` and `event-stream.ts`.
 */
import type { ChannelProgressConfig, ProgressInfo } from "./progress-types";

export const PROGRESS_PREFIX = "progress:";

export function parseProgress(
	comment: string,
	prefix: string = PROGRESS_PREFIX,
): ProgressInfo | undefined {
	if (!comment.startsWith(prefix)) return undefined;

	const body = comment.slice(prefix.length);
	const [read, total] = body.split("/");

	const bytesTransferred = Number(read);
	if (
		read.trim() === "" ||
		!Number.isInteger(bytesTransferred) ||
		bytesTransferred < 0
	) {
		return undefined;
	}

	if (total === undefined || total.trim() === "") {
		return { bytesTransferred };
	}

	const totalBytes = Number(total);
	if (!Number.isInteger(totalBytes) || totalBytes <= 0) {
		return undefined;
	}

	return {
		bytesTransferred,
		totalBytes,
		percentage: Math.min(
			100,
			Math.round((bytesTransferred / totalBytes) * 100),
		),
	};
}

/**
 * Builds the comment parser a stream uses to recognize progress
 * envelopes, honoring the transport's per-procedure convention
 * (ChannelProgressConfig): a custom `parser` wins; otherwise a `prefix`
 * override renames the built-in "progress:" prefix; otherwise default.
 */
export function makeProgressParser(
	config?: ChannelProgressConfig,
): (comment: string) => ProgressInfo | undefined {
	if (config?.parser) return config.parser;
	return (comment) => parseProgress(comment, config?.prefix ?? PROGRESS_PREFIX);
}
