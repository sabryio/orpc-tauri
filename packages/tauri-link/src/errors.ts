import { Data } from "effect";

/**
 * Error thrown when a Tauri command invocation fails.
 */
export class TauriInvokeError extends Data.TaggedError("TauriInvokeError")<{
	readonly command: string;
	readonly input: unknown;
	readonly cause: unknown;
}> {}

/**
 * Error thrown when setting up a Tauri event listener fails.
 */
export class TauriListenError extends Data.TaggedError("TauriListenError")<{
	readonly event: string;
	readonly cause: unknown;
}> {}

/**
 * Error thrown during stream processing (SSE events or channel messages).
 */
export class StreamError extends Data.TaggedError("StreamError")<{
	readonly streamId?: string;
	readonly cause: unknown;
}> {}

/**
 * Error thrown when contract validation fails.
 */
export class ContractValidationError extends Data.TaggedError(
	"ContractValidationError",
)<{
	readonly message: string;
	readonly duplicateCommand?: string;
	readonly paths?: readonly string[];
}> {}

/**
 * Error thrown when procedure not found in contract.
 */
export class ProcedureNotFoundError extends Data.TaggedError(
	"ProcedureNotFoundError",
)<{
	readonly path: readonly string[];
}> {}

/**
 * Error thrown when procedure missing required Tauri command metadata.
 */
export class MissingCommandMetadataError extends Data.TaggedError(
	"MissingCommandMetadataError",
)<{
	readonly path: readonly string[];
}> {}

/**
 * Error thrown when contract validation fails.
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
	readonly path: readonly string[];
	readonly message: string;
}> {}

/**
 * Error thrown when an operation is aborted via AbortSignal.
 */
export class AbortError extends Data.TaggedError("AbortError")<{
	readonly reason?: string;
}> {}

/**
 * Union of all possible errors that can occur in tauri-link operations.
 */
export type CallError =
	| TauriInvokeError
	| TauriListenError
	| StreamError
	| ValidationError
	| AbortError
	| ContractValidationError
	| ProcedureNotFoundError
	| MissingCommandMetadataError;
