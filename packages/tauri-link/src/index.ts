// Export TauriLink (Effect-based implementation with Promise facade)

import type { ProgressInfo } from "./streaming/progress-types";

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
	TimeoutError,
	ValidationError,
} from "./errors";
// Export metadata utilities
export { extractTauriMeta, tauri } from "./metadata";
export { TauriLink } from "./public-api";
export type { RustResourceHandle } from "./resource-handle";
/**
 * Rust resource handles (Tauri Resource protocol). See `RustResourceHandle`
 * and the `tauri.resource()` metadata helper for lifecycle details.
 */
export { asResourceHandle } from "./resource-handle";
export type { SimpleLogger } from "./services/logger";
// Export simple logger classes and type
export { ConsoleLogger, NoopLogger } from "./services/logger";
export { closeResource, RESOURCE_CLOSE_COMMAND } from "./services/resource";
export type {
	EventNameStrategy,
	StreamEventNames,
} from "./streaming/event-name-strategy";
// Export event name strategy
export { DefaultEventNameStrategy } from "./streaming/event-name-strategy";
export { HANDLE_PREFIX, parseHandleEnvelope } from "./streaming/handle";
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

// ============================================================================
// Ambient augmentation (shipped so consumers get typed `onProgress` with zero
// boilerplate). Source of truth: src/client-augmentation.ts — keep identical.
// ============================================================================

declare module "@orpc/client" {
	interface ClientOptions<T> {
		/**
		 * Transfer progress callback — fires for channel-mode streams
		 * (data-less `progress:` control envelopes; see ProgressInfo).
		 */
		onProgress?: (info: ProgressInfo) => void;
	}
}
