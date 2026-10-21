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
// Link module - TauriLink class and related types
export { TauriLink } from "./public-api";
export type { RustResourceHandle } from "./resource-handle";
// Rust resource handles (Tauri Resource protocol)
export { asResourceHandle } from "./resource-handle";
// Invoker utilities
export type { InvokeFn } from "./services/invoker";
export type { SimpleLogger } from "./services/logger";
// Logger utilities
export { ConsoleLogger, NoopLogger } from "./services/logger";
export { closeResource, RESOURCE_CLOSE_COMMAND } from "./services/resource";
export type {
  EventNameStrategy,
  StreamEventNames,
} from "./streaming/event-name-strategy";
// Event name strategy
export { DefaultEventNameStrategy } from "./streaming/event-name-strategy";
export { HANDLE_PREFIX, parseHandleEnvelope } from "./streaming/handle";
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
