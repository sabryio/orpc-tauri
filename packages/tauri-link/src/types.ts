import type { ORPCError } from "@orpc/client";

// ============================================================================
// Metadata Types
// ============================================================================

export interface TauriMeta {
  /**
   * Transport mechanism for streaming procedures
   * - "emit-listen": Event-based streaming with stream IDs (default)
   * - "channel": Bidirectional Channel API streaming
   */
  transport?: "emit-listen" | "channel";

  /**
   * Custom Tauri command name override
   */
  command?: string;

  /**
   * Command timeout in milliseconds
   */
  timeout?: number;

  /**
   * Enable debug logging for this command
   */
  debug?: boolean;

  /**
   * Tags for categorizing Tauri commands
   */
  tags?: string[];

  /**
   * Permissions required for this command
   */
  permissions?: string[];
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

export interface CallOptions<TContext> {
  context?: TContext;
  signal?: AbortSignal;
}

export type StreamEvent<T> =
  | { type: "value"; value: T }
  | { type: "done" }
  | { type: "error"; error: ORPCError<string, unknown> };

export type ChannelEvent<T> =
  | { event: "data"; data: T }
  | { event: "done" }
  | { event: "error"; data: { message: string } };

// ============================================================================
// Contract Types
// ============================================================================

export type Contract = Record<string, unknown>;
