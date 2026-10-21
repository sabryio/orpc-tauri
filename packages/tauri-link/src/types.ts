import type { ORPCError, ORPCErrorCode } from "@orpc/client";
import type { ChannelProgressConfig } from "./streaming/progress-types";

export type Contract = Record<string, unknown>;

// ============================================================================
// Metadata Types
// ============================================================================

export type TauriTransportConfig =
	| {
			kind: "listen";
			id?: { name: string; value: string | (() => string) };
			events?: {
				name: string;
				generator: (streamId: string) => {
					data: string;
					done: string;
					error: string;
				};
			};
			progress?: ChannelProgressConfig;
	  }
	| {
			kind: "channel";
			id?: { name: string } | string;
			progress?: ChannelProgressConfig;
	  };

export interface TauriMeta {
	/**
	 * Tauri command name. When omitted, the link derives it from the last
	 * segment of the contract route path (verbatim, no case conversion).
	 */
	command?: string;
	transport?: TauriTransportConfig;
	/**
	 * Client-side deadline in milliseconds applied by the link.
	 *
	 * Unary calls: the whole call must complete within the window.
	 * Streams: inactivity deadline — fails when no value arrives within
	 * the window (a slow but steady stream is never cut).
	 */
	timeout?: number;
	/**
	 * Marks a procedure as Rust-resource-backed (`tauri.resource()` meta).
	 *
	 * For streaming procedures with the default `autoClose: true`, the link
	 * closes the announced `handle:<rid>` resource when the stream exits
	 * abnormally (consumer abort/failure/early exit) — server-side teardown.
	 * Normal completion never auto-closes: the Rust side owns its lifecycle.
	 */
	resource?: TauriResourceConfig;
	debug?: boolean;
}

export interface TauriResourceConfig {
	/**
	 * Close the announced `handle:<rid>` resource on abnormal stream exits.
	 * Default `true`. `false` keeps the Rust resource fully manual.
	 */
	autoClose?: boolean;
}

export interface MetaPlugin {
	name: string;
	init(meta: Record<string, unknown>): Record<string, unknown>;
}

export interface ORPCMeta {
	meta?: {
		"~tauri"?: TauriMeta;
	};
	outputSchemas?: unknown[];
}

// ============================================================================
// Error Types
// ============================================================================

export interface TauriErrorPayload {
	defined?: boolean;
	code?: string;
	message?: string;
	data?: unknown;
}

// ============================================================================
// Stream Types
// ============================================================================

export type StreamEvent<T> =
	| { type: "value"; value: T }
	| { type: "done" }
	| { type: "error"; error: ORPCError<ORPCErrorCode, unknown> };

// ============================================================================
// Options Types
// ============================================================================

/**
 * Call options accepted by `TauriLink.call`.
 */
export interface CallOptions<TContext = unknown> {
	/**
	 * Request-scoped client context. Merged (shallow, per-call wins) over the
	 * link-level `context` defaults and injected into the invoke args under
	 * the reserved `context` key — the IPC analog of HTTP headers. Rust
	 * commands opt in by declaring `context: Option<CallCtx>`.
	 */
	context?: TContext;
	signal?: AbortSignal;
	/**
	 * Transfer progress callback — only meaningful for streaming calls.
	 * Fires for `progress:` control envelopes on both transports
	 * (channel-mode and listen-mode).
	 */
	onProgress?: (
		info: import("./streaming/progress-types").ProgressInfo,
	) => void;
}

export interface TauriLinkOptions<TContext = unknown> {
	logger?: import("./services/logger").SimpleLogger;
	eventNameStrategy?: import("./streaming/event-name-strategy").EventNameStrategy;
	invoke?: <T = unknown>(
		command: string,
		args?: Record<string, unknown>,
	) => Promise<T>;
	/**
	 * Link-level request context defaults — the IPC analog of static headers.
	 * A static object, or a function re-evaluated per call (for dynamic
	 * values like a fresh request id). Merged shallowly with per-call
	 * `context` (per-call wins) and injected into invoke args under the
	 * reserved `context` key; see `CallOptions.context`.
	 */
	context?: TContext | (() => TContext);
}
