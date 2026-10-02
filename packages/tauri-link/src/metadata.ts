import { defineMeta } from "@orpc/contract";
import type { TauriMeta, ORPCMeta } from "./types";

/**
 * Tauri metadata plugin for oRPC contracts
 *
 * Usage:
 * ```typescript
 * import { tauri } from '@tauri-orpc-contract/tauri-link'
 *
 * const contract = {
 *   stream: {
 *     events: oc
 *       .meta(openapi({ method: "GET", path: "/stream_events" }))
 *       .meta(tauri({ transport: "channel" }))
 *       .output(asyncIteratorObject(EventSchema))
 *   }
 * }
 * ```
 */
export const [tauri, getTauriMeta] = defineMeta<"~tauri", TauriMeta>(
  "~tauri",
  (incoming, current) => {
    const tags =
      current?.tags && incoming.tags
        ? [...current.tags, ...incoming.tags]
        : incoming.tags !== undefined
          ? incoming.tags
          : current?.tags;

    const permissions =
      current?.permissions && incoming.permissions
        ? [...current.permissions, ...incoming.permissions]
        : incoming.permissions !== undefined
          ? incoming.permissions
          : current?.permissions;

    return {
      transport:
        incoming.transport !== undefined
          ? incoming.transport
          : current?.transport,
      command:
        incoming.command !== undefined ? incoming.command : current?.command,
      timeout:
        incoming.timeout !== undefined ? incoming.timeout : current?.timeout,
      debug: incoming.debug !== undefined ? incoming.debug : current?.debug,
      tags,
      permissions,
    };
  },
);

/**
 * Extract Tauri metadata from a procedure
 */
export function extractTauriMeta(
  procedure: Record<string, unknown>,
): TauriMeta | undefined {
  const orpcMeta = procedure["~orpc"] as ORPCMeta | undefined;
  return orpcMeta?.meta?.["~tauri"];
}
