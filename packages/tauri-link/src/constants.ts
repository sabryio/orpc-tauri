/**
 * Metadata keys used in oRPC contracts.
 */
export const METADATA_KEYS = {
	/** Tauri-specific metadata key */
	TAURI: "~tauri" as const,
	/** oRPC standard metadata key */
	ORPC: "~orpc" as const,
} as const;

/**
 * SSE event name suffixes for listen-based streaming.
 */
export const SSE_EVENT_SUFFIXES = {
	/** Data event suffix */
	DATA: ":data" as const,
	/** Error event suffix */
	ERROR: ":error" as const,
	/** Done/completion event suffix */
	DONE: ":done" as const,
} as const;

/**
 * oRPC internal symbol names.
 */
export const ORPC_SYMBOLS = {
	/** Symbol identifying AsyncIterator schema in oRPC */
	ASYNC_ITERATOR: "ORPC_ASYNC_ITERATOR_OBJECT_SCHEMA_DETAILS" as const,
} as const;

/**
 * Default parameter names for Tauri commands.
 */
export const DEFAULT_PARAMS = {
	/** Default channel parameter name */
	CHANNEL: "channel" as const,
} as const;
