/**
 * @module
 *
 * TauriLink - Type-safe oRPC link for Tauri applications.
 *
 * This module provides the main TauriLink class for bridging TypeScript and Rust
 * via Tauri IPC, with support for both unary calls and dual streaming modes
 * (event-based SSE and native Tauri channels).
 *
 * @example
 * ```typescript
 * import { TauriLink } from "@sabryio/orpc-tauri/link";
 * import { contract } from "./contract";
 *
 * const link = new TauriLink(contract);
 * const client = createORPCClient(link);
 * ```
 */

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
