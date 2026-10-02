import type { ORPCError } from "@orpc/client";

export type { Logger } from "./logger";
export type Contract = Record<string, unknown>;

// ============================================================================
// Metadata Types
// ============================================================================

export type TauriParamConfig =
  | { kind: "stream"; name: string; value?: string }
  | { kind: "channel"; name: string };

export type EventNamesConfig = {
  paramName: string; // Parameter name in Rust (e.g., "eventNames", "event_names")
  generator: (streamId: string) => {
    data: string;
    done: string;
    error: string;
  };
};

export interface TauriMeta {
  command: string;
  transport?: "emit-listen" | "channel";
  param?: TauriParamConfig;
  events?: EventNamesConfig;
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

export interface StreamResponse {
  stream_id: string;
}

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
}

export interface TauriLinkOptions {
  logger?: import("./logger").Logger;
  eventNameStrategy?: import("./streaming/event-name-strategy").EventNameStrategy;
}
