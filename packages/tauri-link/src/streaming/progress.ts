/**
 * Transfer progress reporting for channel transports.
 *
 * Progress is a control signal: it travels in data-less SSE envelopes
 * (the `comment` field) and never reaches the consumer's payload schema.
 * Format: `progress:<bytesTransferred>/<totalBytes>` — the total part is
 * optional; malformed envelopes are ignored silently, never thrown.
 */
import type { ProgressInfo } from "./progress-types";

export const PROGRESS_PREFIX = "progress:";

const PROGRESS_PREFIX_LENGTH = PROGRESS_PREFIX.length;

export function parseProgress(comment: string): ProgressInfo | undefined {
	if (!comment.startsWith(PROGRESS_PREFIX)) return undefined;

	const body = comment.slice(PROGRESS_PREFIX_LENGTH);
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
