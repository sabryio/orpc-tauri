import type { ORPCError } from "@orpc/client";
import type { Layer } from "effect";
import type { Logger } from "./services/logger";

export type { Logger };
export type Contract = Record<string, unknown>;

// ============================================================================
// Metadata Types
// ============================================================================

export type TauriTransportConfig =
  | {
      kind: "stream";
      id: { name: string; value: string | (() => string) };
      events: {
        name: string;
        generator: (streamId: string) => {
          data: string;
          done: string;
          error: string;
        };
      };
    }
  | { kind: "channel"; id: { name: string } | string };

export interface TauriMeta {
  command: string;
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
}

export interface TauriLinkOptions {
  logger?: import("./services/logger").SimpleLogger;
  eventNameStrategy?: import("./streaming/event-name-strategy").EventNameStrategy;
}
