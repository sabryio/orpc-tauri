import { ORPCError } from "@orpc/client";

/**
 * Converts Effect errors and Tauri error payloads to ORPCError.
 *
 * Handles unwrapping of Effect errors (TauriInvokeError.cause),
 * preserving Tauri error structure (code/message/data/defined).
 */
export function toORPCError(error: unknown): ORPCError<string, unknown> {
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
		typeof (unwrapped as any).message === "string"
	) {
		const tauriError = unwrapped as {
			code: string;
			message: string;
			data?: unknown;
			defined?: boolean;
		};

		const orpcError = new ORPCError(tauriError.code, {
			message: tauriError.message,
			data: tauriError.data,
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

	// Generic error fallback
	if (unwrapped instanceof Error) {
		return new ORPCError("INTERNAL_ERROR", {
			message: unwrapped.message,
			cause: unwrapped,
		});
	}

	return new ORPCError("INTERNAL_ERROR", {
		message: "Unknown error",
		cause: unwrapped,
	});
}
