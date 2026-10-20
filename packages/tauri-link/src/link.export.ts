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

// Typed errors
import type { ProgressInfo } from "./streaming/progress-types";

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
// Link module - TauriLink class and related types
export { TauriLink } from "./public-api";
// Invoker utilities
export type { InvokeFn } from "./services/invoker";
export type { SimpleLogger } from "./services/logger";
// Logger utilities
export { ConsoleLogger, NoopLogger } from "./services/logger";
export type {
	EventNameStrategy,
	StreamEventNames,
} from "./streaming/event-name-strategy";
// Event name strategy
export { DefaultEventNameStrategy } from "./streaming/event-name-strategy";
export { PROGRESS_PREFIX } from "./streaming/progress";
// Transfer progress (channel streams)
export type {
	ChannelProgressConfig,
	ProgressInfo,
} from "./streaming/progress-types";
// SSE types
export type { EventMeta, SseEvent } from "./streaming/sse-types";
export { EVENT_META_SYMBOL } from "./streaming/sse-types";
// Core types
export type {
	CallOptions,
	Contract,
	StreamEvent,
	TauriErrorPayload,
	TauriLinkOptions,
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
