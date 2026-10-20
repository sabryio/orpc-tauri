import { camelCase } from "./casing";
import { METADATA_KEYS } from "./constants";
import type { MetaPlugin, TauriMeta, TauriTransportConfig } from "./types";

// ============================================================================
// Merge Logic
// ============================================================================

function validateCommandChange(
	incoming: string | undefined,
	current: string | undefined,
): void {
	if (incoming && current && incoming !== current) {
		throw new Error(
			`[TauriLink] Cannot change command from "${current}" to "${incoming}". Command can only be set once.`,
		);
	}
}

function mergeArrayField<T>(
	incomingField: T[] | undefined,
	currentField: T[] | undefined,
): T[] | undefined {
	if (currentField && incomingField) return [...currentField, ...incomingField];
	return incomingField ?? currentField;
}

function mergeTauriMeta(incoming: TauriMeta, current?: TauriMeta): TauriMeta {
	validateCommandChange(incoming.command, current?.command);

	return {
		command: incoming.command ?? current?.command,
		transport: incoming.transport ?? current?.transport,
		timeout: incoming.timeout ?? current?.timeout,
		debug: incoming.debug ?? current?.debug,
		tags: mergeArrayField(incoming.tags, current?.tags),
		permissions: mergeArrayField(incoming.permissions, current?.permissions),
	};
}

// ============================================================================
// Main Plugin Function
// ============================================================================

export const tauri = ((incoming: Partial<TauriMeta>): MetaPlugin => ({
	name: METADATA_KEYS.TAURI,
	init(meta: Record<string, unknown>) {
		const existing = meta[METADATA_KEYS.TAURI] as TauriMeta | undefined;
		const merged = mergeTauriMeta(incoming, existing);
		return { ...meta, [METADATA_KEYS.TAURI]: merged };
	},
})) as {
	(meta: Partial<TauriMeta>): MetaPlugin;
	command(command: string): MetaPlugin;
	transport(config: TauriTransportConfig): MetaPlugin;
	listen(): MetaPlugin;
	channel(
		id?: Extract<TauriTransportConfig, { kind: "channel" }>["id"],
		progress?: Extract<TauriTransportConfig, { kind: "channel" }>["progress"],
	): MetaPlugin;
	timeout(timeout: TauriMeta["timeout"]): MetaPlugin;
	debug(debug: TauriMeta["debug"]): MetaPlugin;
};

// ============================================================================
// Scoped Helpers
// ============================================================================

tauri.command = (command): MetaPlugin => tauri({ command });

tauri.transport = (config): MetaPlugin => tauri({ transport: config });

tauri.listen = (): MetaPlugin => tauri({ transport: { kind: "listen" } });

/**
 * Channel streaming helper.
 *
 * `id` is the Rust parameter name, written exactly as it appears in the
 * Rust command signature (e.g. `on_event`). It is normalized to camelCase
 * internally, since Tauri IPC keys command arguments that way. camelCase
 * input is accepted and returned unchanged.
 */
/**
 * Channel streaming helper.
 *
 * `id` is the Rust parameter name, written exactly as it appears in the
 * Rust command signature (e.g. `on_event`). It is normalized to camelCase
 * internally, since Tauri IPC keys command arguments that way. camelCase
 * input is accepted and returned unchanged.
 *
 * `progress` customizes the transfer-progress convention for this procedure:
 * `prefix` renames the built-in `progress:` prefix; `parser` fully owns
 * recognition (wins over `prefix`). Omit for the standard convention.
 */
tauri.channel = (id?: { name: string } | string, progress?): MetaPlugin => {
	const transport: Extract<TauriTransportConfig, { kind: "channel" }> = id
		? {
				kind: "channel",
				id:
					typeof id === "string"
						? camelCase(id)
						: { ...id, name: camelCase(id.name) },
			}
		: ({ kind: "channel" } as Extract<
				TauriTransportConfig,
				{ kind: "channel" }
			>);

	return tauri({
		transport: progress
			? ({ ...transport, progress } as TauriTransportConfig)
			: transport,
	});
};

tauri.timeout = (timeout): MetaPlugin => tauri({ timeout });

tauri.debug = (debug): MetaPlugin => tauri({ debug });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract Tauri metadata from a procedure
 */
export function extractTauriMeta(
	procedure: Record<string, unknown>,
): TauriMeta | undefined {
	const orpcMeta = procedure[METADATA_KEYS.ORPC] as
		| { meta?: { [METADATA_KEYS.TAURI]?: TauriMeta } }
		| undefined;
	return orpcMeta?.meta?.[METADATA_KEYS.TAURI];
}
