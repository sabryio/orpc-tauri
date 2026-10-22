import {
	type AnyORPCError,
	COMMON_ERROR_STATUS_MAP,
	ORPCError,
} from "@orpc/client";

/**
 * Normalizes a runtime error code so it resolves to a real HTTP status in
 * `COMMON_ERROR_STATUS_MAP`: known standard codes pass through, legacy
 * aliases are mapped, and unknown codes fall back to INTERNAL_SERVER_ERROR
 * (the original value stays in `data.originalCode` so nothing is lost).
 */
function toErrorCode(code: string): string {
	if (code === "INTERNAL" || code === "INTERNAL_ERROR") {
		return "INTERNAL_SERVER_ERROR";
	}
	if (code in COMMON_ERROR_STATUS_MAP) return code;
	return "INTERNAL_SERVER_ERROR";
}

/**
 * Converts Effect errors and Tauri error payloads to ORPCError.
 *
 * Handles unwrapping of Effect errors (TauriInvokeError.cause),
 * preserving Tauri error structure (code/message/data/defined).
 */
export function toORPCError(error: unknown): AnyORPCError {
	// Timeout budget exceeded (tauri.timeout meta)
	if (
		error &&
		typeof error === "object" &&
		"_tag" in error &&
		error._tag === "TimeoutError"
	) {
		const timeoutError = error as unknown as {
			operation: string;
			timeout: number;
			message: string;
		};

		return new ORPCError("TIMEOUT", {
			message: timeoutError.message,
			data: {
				operation: timeoutError.operation,
				timeout: timeoutError.timeout,
			},
		});
	}

	// Consumer cancellation (pre-invoke or mid-stream abort)
	if (
		error &&
		typeof error === "object" &&
		"_tag" in error &&
		error._tag === "AbortError"
	) {
		const abortError = error as unknown as { reason?: string };

		return new ORPCError("CLIENT_CLOSED_REQUEST", {
			message: abortError.reason ?? "Request aborted",
		});
	}

	// Unwrap Effect errors to get the original Tauri error
	const unwrapped =
		error &&
		typeof error === "object" &&
		"cause" in error &&
		error.cause !== undefined
			? error.cause
			: error;

	// Tauri error payload: {code, message, data?, defined?}
	if (
		typeof unwrapped === "object" &&
		unwrapped !== null &&
		"code" in unwrapped &&
		typeof unwrapped.code === "string" &&
		"message" in unwrapped &&
		typeof (unwrapped as Record<string, unknown>).message === "string"
	) {
		const tauriError = unwrapped as {
			code: string;
			message: string;
			data?: unknown;
			defined?: boolean;
		};

		const normalizedCode = toErrorCode(tauriError.code);
		const orpcError = new ORPCError(normalizedCode, {
			message: tauriError.message,
			data:
				normalizedCode === tauriError.code
					? tauriError.data
					: { originalCode: tauriError.code, data: tauriError.data },
		});

		// Preserve 'defined' flag for contract-defined errors
		if (tauriError.defined === true) {
			Object.defineProperty(orpcError, "defined", {
				value: true,
				writable: false,
				enumerable: true,
				configurable: false,
			});
		}

		return orpcError;
	}

	// Already an ORPCError
	if (unwrapped instanceof ORPCError) {
		return unwrapped;
	}

	// Tauri rejects commands with the raw serialized payload — often a JSON
	// string of the Rust error. Parse it so the tauriError branch above could
	// have handled it (recursive call), else surface the text verbatim.
	if (typeof unwrapped === "string") {
		const trimmed = unwrapped.trim();
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			try {
				return toORPCError(JSON.parse(trimmed));
			} catch {
				// Not JSON — the plain text is the message.
			}
		}
		return new ORPCError("INTERNAL_SERVER_ERROR", {
			message: unwrapped,
			cause: unwrapped,
		});
	}

	// Generic error fallback
	if (unwrapped instanceof Error) {
		return new ORPCError("INTERNAL_SERVER_ERROR", {
			message: describeError(unwrapped),
			cause: unwrapped,
		});
	}

	return new ORPCError("INTERNAL_SERVER_ERROR", {
		message: "Unknown error",
		cause: unwrapped,
	});
}

/**
 * Effect's `Data.TaggedError` classes carry context in structured fields
 * (`path`, `command`, `streamId`, `cause`), not in `.message` — an
 * empty-message `Error` instance used to surface through the IPC boundary
 * as a blank ORPCError. Render whatever diagnostic material exists.
 */
function describeError(error: Error): string {
	if (error.message) return error.message;

	const fields = error as unknown as Record<string, unknown>;
	const tag =
		typeof fields._tag === "string" ? fields._tag : error.name || "Error";

	const cause = fields.cause;
	if (cause !== undefined && cause !== null) {
		const rendered = typeof cause === "string" ? cause : JSON.stringify(cause);
		if (rendered) return `${tag}: ${rendered}`;
	}

	const extras: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (key === "_tag" || key === "cause" || key.startsWith("_")) continue;
		if (value !== undefined) extras[key] = value;
	}
	const extrasJson = Object.keys(extras).length ? JSON.stringify(extras) : "";

	return extrasJson ? `${tag} ${extrasJson}` : tag;
}
