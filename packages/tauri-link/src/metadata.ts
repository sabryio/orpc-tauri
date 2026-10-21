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

function mergeTauriMeta(incoming: TauriMeta, current?: TauriMeta): TauriMeta {
	validateCommandChange(incoming.command, current?.command);

	return {
		command: incoming.command ?? current?.command,
		transport: incoming.transport ?? current?.transport,
		timeout: incoming.timeout ?? current?.timeout,
		resource: incoming.resource ?? current?.resource,
		debug: incoming.debug ?? current?.debug,
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
	listen(
		progress?: Extract<TauriTransportConfig, { kind: "listen" }>["progress"],
	): MetaPlugin;
	channel(
		id?: Extract<TauriTransportConfig, { kind: "channel" }>["id"],
		progress?: Extract<TauriTransportConfig, { kind: "channel" }>["progress"],
	): MetaPlugin;
	timeout(timeout: TauriMeta["timeout"]): MetaPlugin;
	resource(config?: NonNullable<TauriMeta["resource"]>): MetaPlugin;
	debug(debug: TauriMeta["debug"]): MetaPlugin;
};

// ============================================================================
// Scoped Helpers
// ============================================================================

tauri.command = (command): MetaPlugin => tauri({ command });

tauri.transport = (config): MetaPlugin => tauri({ transport: config });

/**
 * SSE/listen streaming helper.
 *
 * `progress` customizes the transfer-progress convention for this procedure
 * (parity with the channel transport): `prefix` renames the built-in
 * `progress:` prefix; `parser` fully owns recognition (wins over `prefix`).
 * Omit for the standard convention.
 */
tauri.listen = (
	progress?: Extract<TauriTransportConfig, { kind: "listen" }>["progress"],
): MetaPlugin =>
	tauri({
		transport: progress
			? ({ kind: "listen", progress } as TauriTransportConfig)
			: { kind: "listen" },
	});

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

/**
 * Documents a procedure as Rust-resource-backed (Tauri Resource protocol).
 *
 * For streaming procedures the Rust command announces its task handle with a
 * data-less `handle:<rid>` control envelope; with the default `autoClose`,
 * the link closes that resource when the stream exits abnormally (consumer
 * abort, failure, or early exit) — server-side cancellation in ~10 Rust lines.
 * See `parseHandleEnvelope` (`streaming/handle.ts`) for the wire convention.
 *
 * OPTIONAL: detection is envelope-driven — any command that emits
 * `handle:<rid>` is auto-closed even without this meta. The meta matters
 * only to opt OUT (`tauri.resource({ autoClose: false })`) and to document
 * intent in the contract.
 */
tauri.resource = (config): MetaPlugin => tauri({ resource: config ?? {} });

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
