import type { ORPCError } from "@orpc/client";
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
	timeout?: number;
	debug?: boolean;
	tags?: string[];
	permissions?: string[];
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
	| { type: "error"; error: ORPCError<string, unknown> };

// ============================================================================
// Options Types
// ============================================================================

export interface CallOptions<TContext> {
	context?: TContext;
	signal?: AbortSignal;
	/**
	 * Transfer progress callback — only meaningful for streaming calls.
	 * Fires for channel-mode `progress:` control envelopes.
	 */
	onProgress?: (
		info: import("./streaming/progress-types").ProgressInfo,
	) => void;
}

export interface TauriLinkOptions {
	logger?: import("./services/logger").SimpleLogger;
	eventNameStrategy?: import("./streaming/event-name-strategy").EventNameStrategy;
	invoke?: <T = unknown>(
		command: string,
		args?: Record<string, unknown>,
	) => Promise<T>;
}
