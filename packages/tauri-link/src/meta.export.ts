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
 * const procedure = oc
 *   .meta(tauri.command("my_command"))
 *   .meta(tauri.transport({ kind: "stream" }))
 *   .input(z.void())
 *   .output(EventSchema);
 * ```
 */

// Meta module - Contract metadata utilities
export { tauri, extractTauriMeta } from "./metadata";

export type {
	TauriMeta,
	TauriTransportConfig,
	MetaPlugin,
} from "./types";
