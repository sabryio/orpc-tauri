import type { TauriMeta, MetaPlugin } from "./types";

// ============================================================================
// Merge Logic
// ============================================================================

function mergeTauriMeta(
  incoming: Partial<TauriMeta>,
  current?: TauriMeta,
): TauriMeta {
  if (!incoming.command && !current?.command) {
    throw new Error(
      "[TauriLink] command is required. Use tauri.command('command_name') or tauri({ command: 'command_name' })",
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
    command: (incoming.command ?? current?.command)!,
    transport:
      incoming.transport !== undefined ? incoming.transport : current?.transport,
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
  command(command: TauriMeta["command"]): MetaPlugin;
  transport(transport: TauriMeta["transport"]): MetaPlugin;
  timeout(timeout: TauriMeta["timeout"]): MetaPlugin;
  debug(debug: TauriMeta["debug"]): MetaPlugin;
};

// ============================================================================
// Scoped Helpers
// ============================================================================

tauri.command = (command): MetaPlugin =>
  tauri({ command });

tauri.transport = (transport): MetaPlugin => ({
  name: "~tauri/transport" as const,
  init(meta: Record<string, unknown>) {
    const existing = meta["~tauri"] as TauriMeta | undefined;
    if (!existing?.command) {
      throw new Error(
        "[TauriLink] tauri.transport() requires tauri.command() to be called first",
      );
    }
    const merged = mergeTauriMeta({ transport }, existing);
    return { ...meta, "~tauri": merged };
  },
});

tauri.timeout = (timeout): MetaPlugin => ({
  name: "~tauri/timeout" as const,
  init(meta: Record<string, unknown>) {
    const existing = meta["~tauri"] as TauriMeta | undefined;
    if (!existing?.command) {
      throw new Error(
        "[TauriLink] tauri.timeout() requires tauri.command() to be called first",
      );
    }
    const merged = mergeTauriMeta({ timeout }, existing);
    return { ...meta, "~tauri": merged };
  },
});

tauri.debug = (debug): MetaPlugin => ({
  name: "~tauri/debug" as const,
  init(meta: Record<string, unknown>) {
    const existing = meta["~tauri"] as TauriMeta | undefined;
    if (!existing?.command) {
      throw new Error(
        "[TauriLink] tauri.debug() requires tauri.command() to be called first",
      );
    }
    const merged = mergeTauriMeta({ debug }, existing);
    return { ...meta, "~tauri": merged };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract Tauri metadata from a procedure
 */
export function extractTauriMeta(
  procedure: Record<string, unknown>,
): TauriMeta | undefined {
  const orpcMeta = procedure["~orpc"] as { meta?: { "~tauri"?: TauriMeta } } | undefined;
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
