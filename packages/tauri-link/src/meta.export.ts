/**
 * @module
 *
 * Metadata utilities for configuring Tauri command behavior in oRPC contracts.
 *
 * This module exports the `tauri()` metadata plugin and helper functions for
 * configuring command names, streaming transports, timeouts, and other
 * Tauri-specific options via oRPC contract metadata.
 *
 * @example
 * ```typescript
 * import { tauri } from "@sabryio/orpc-tauri/meta";
 * import { oc } from "@orpc/contract";
 *
 * // The route key IS the Rust command name — no meta needed.
 * const unaryProcedure = oc.input(z.void()).output(PingSchema);
 *
 * // Explicit overrides and streaming transports use metadata helpers.
 * const streamProcedure = oc
 *   .meta(tauri.listen())
 *   .input(z.void())
 *   .output(EventSchema);
 * ```
 */

// Meta module - Contract metadata utilities
export { extractTauriMeta, tauri } from "./metadata";

export type {
	MetaPlugin,
	TauriMeta,
	TauriResourceConfig,
	TauriTransportConfig,
} from "./types";
