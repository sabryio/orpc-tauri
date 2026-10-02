import type { TauriMeta, MetaPlugin } from "./types";

// ============================================================================
// Merge Logic
// ============================================================================

function mergeTauriMeta(
  incoming: TauriMeta,
  current?: TauriMeta,
): TauriMeta {
  // Prevent overwriting existing command
  if (
    incoming.command &&
    current?.command &&
    incoming.command !== current.command
  ) {
    throw new Error(
      `[TauriLink] Cannot change command from "${current.command}" to "${incoming.command}". Command can only be set once.`,
    );
  }

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
    command: incoming.command ?? current?.command,
    transport:
      incoming.transport !== undefined
        ? incoming.transport
        : current?.transport,
    timeout:
      incoming.timeout !== undefined ? incoming.timeout : current?.timeout,
    debug: incoming.debug !== undefined ? incoming.debug : current?.debug,
    tags,
    permissions,
  };
}

// ============================================================================
// Main Plugin Function
// ============================================================================

export const tauri = ((incoming: TauriMeta): MetaPlugin => ({
  name: "~tauri" as const,
  init(meta: Record<string, unknown>) {
    const existing = meta["~tauri"] as TauriMeta | undefined;
    const merged = mergeTauriMeta(incoming, existing);
    return { ...meta, "~tauri": merged };
  },
})) as {
  (meta: TauriMeta): MetaPlugin;
  command(command: string): MetaPlugin;
  transport(transport: TauriMeta["transport"]): MetaPlugin;
  timeout(timeout: TauriMeta["timeout"]): MetaPlugin;
  debug(debug: TauriMeta["debug"]): MetaPlugin;
};

// ============================================================================
// Scoped Helpers
// ============================================================================

tauri.command = (command): MetaPlugin => tauri({ command } as TauriMeta);

tauri.transport = (transport): MetaPlugin =>
  tauri({ transport } as TauriMeta);

tauri.timeout = (timeout): MetaPlugin => tauri({ timeout } as TauriMeta);

tauri.debug = (debug): MetaPlugin => tauri({ debug } as TauriMeta);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract Tauri metadata from a procedure
 */
export function extractTauriMeta(
  procedure: Record<string, unknown>,
): TauriMeta | undefined {
  const orpcMeta = procedure["~orpc"] as
    | { meta?: { "~tauri"?: TauriMeta } }
    | undefined;
  return orpcMeta?.meta?.["~tauri"];
}

/**
 * Get Tauri metadata from a procedure (alias for extractTauriMeta)
 */
export function getTauriMeta(
  procedure: Record<string, unknown>,
): TauriMeta | undefined {
  return extractTauriMeta(procedure);
}
