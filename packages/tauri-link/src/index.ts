// Export TauriLink (Effect-based implementation with Promise facade)
export { TauriLink } from "./public-api";

// Export typed error classes for power users (optional advanced usage)
export {
	TauriInvokeError,
	TauriListenError,
	StreamError,
	ValidationError,
	AbortError,
	ContractValidationError,
	ProcedureNotFoundError,
	MissingCommandMetadataError,
	type CallError,
} from "./errors";

// Export metadata utilities
export { tauri, extractTauriMeta } from "./metadata";

// Export logger implementations
export { ConsoleLoggerLive, NoopLoggerLive, Logger } from "./services/logger";

// Export event name strategy
export { DefaultEventNameStrategy } from "./streaming/event-name-strategy";
export type {
	TauriMeta,
	TauriTransportConfig,
	TauriLinkOptions,
	MetaPlugin,
	Contract,
	CallOptions,
	StreamEvent,
	TauriErrorPayload,
} from "./types";
export type { SseEvent, EventMeta } from "./streaming/sse-types";
export type {
	EventNameStrategy,
	StreamEventNames,
} from "./streaming/event-name-strategy";
export { EVENT_META_SYMBOL } from "./streaming/sse-types";
