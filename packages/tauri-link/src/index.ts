// Export TauriLink (Effect-based implementation with Promise facade)

// Export typed error classes for power users (optional advanced usage)
export {
	AbortError,
	type CallError,
	ContractValidationError,
	MissingCommandMetadataError,
	ProcedureNotFoundError,
	StreamError,
	TauriInvokeError,
	TauriListenError,
	ValidationError,
} from "./errors";
// Export metadata utilities
export { extractTauriMeta, tauri } from "./metadata";
export { TauriLink } from "./public-api";
export type { SimpleLogger } from "./services/logger";
// Export simple logger classes and type
export { ConsoleLogger, NoopLogger } from "./services/logger";
export type {
	EventNameStrategy,
	StreamEventNames,
} from "./streaming/event-name-strategy";
// Export event name strategy
export { DefaultEventNameStrategy } from "./streaming/event-name-strategy";
export { PROGRESS_PREFIX } from "./streaming/progress";
export type {
	ChannelProgressConfig,
	ProgressInfo,
} from "./streaming/progress-types";
export type { EventMeta, SseEvent } from "./streaming/sse-types";
export { EVENT_META_SYMBOL } from "./streaming/sse-types";
export type {
	CallOptions,
	Contract,
	MetaPlugin,
	StreamEvent,
	TauriErrorPayload,
	TauriLinkOptions,
	TauriMeta,
	TauriTransportConfig,
} from "./types";
