// Link module - TauriLink class and related types
export { TauriLink } from "./public-api";

// Logger utilities
export { ConsoleLogger, NoopLogger } from "./services/logger";
export type { SimpleLogger } from "./services/logger";

// Event name strategy
export { DefaultEventNameStrategy } from "./streaming/event-name-strategy";
export type {
	EventNameStrategy,
	StreamEventNames,
} from "./streaming/event-name-strategy";

// Typed errors
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

// Core types
export type {
	TauriLinkOptions,
	Contract,
	CallOptions,
	StreamEvent,
	TauriErrorPayload,
} from "./types";

// SSE types
export type { SseEvent, EventMeta } from "./streaming/sse-types";
export { EVENT_META_SYMBOL } from "./streaming/sse-types";
