import { Effect } from "effect";
import {
	ProcedureNotFoundError,
	MissingCommandMetadataError,
} from "../errors";
import { extractTauriMeta } from "../metadata";
import { METADATA_KEYS, ORPC_SYMBOLS } from "../constants";
import type { Contract, ORPCMeta, TauriTransportConfig } from "../types";

/**
 * Resolves procedure metadata from contract paths.
 *
 * Provides Effect-based methods for extracting Tauri metadata with typed errors.
 */
export class ProcedureResolver {
	constructor(private readonly contract: Contract) {}

	private resolve(path: readonly string[]): Record<string, unknown> | null {
		let target: unknown = this.contract;

		for (const segment of path) {
			if (!target || typeof target !== "object") return null;
			target = (target as Record<string, unknown>)[segment];
			if (!target) return null;
		}

		return target as Record<string, unknown>;
	}

	/**
	 * Extract Tauri command name from procedure path.
	 */
	extractCommandName(
		path: readonly string[],
	): Effect.Effect<
		string,
		ProcedureNotFoundError | MissingCommandMetadataError,
		never
	> {
		const self = this;
		return Effect.gen(function* () {
			const procedure = self.resolve(path);
			if (!procedure) {
				return yield* new ProcedureNotFoundError({ path });
			}

			const tauriMeta = extractTauriMeta(procedure!);

			if (!tauriMeta?.command) {
				return yield* new MissingCommandMetadataError({ path });
			}

			return tauriMeta!.command;
		});
	}

	/**
	 * Check if procedure is streaming (returns AsyncIterator).
	 */
	isStreaming(path: readonly string[]): boolean {
		const procedure = this.resolve(path);
		if (!procedure) return false;

		const orpcMeta = procedure[METADATA_KEYS.ORPC] as ORPCMeta | undefined;
		if (!orpcMeta) return false;

		const outputSchemas = orpcMeta.outputSchemas;
		if (!outputSchemas || outputSchemas.length === 0) return false;

		const outputSchema = outputSchemas[0];
		if (!outputSchema || typeof outputSchema !== "object") return false;

		const standard = (outputSchema as Record<string, unknown>)["~standard"];
		if (!standard || typeof standard !== "object") return false;

		const symbols = Object.getOwnPropertySymbols(standard);
		return symbols.some((sym) =>
			sym.toString().includes(ORPC_SYMBOLS.ASYNC_ITERATOR),
		);
	}

	/**
	 * Get transport mode (listen or channel).
	 */
	getTransport(path: readonly string[]): "listen" | "channel" {
		const procedure = this.resolve(path);
		if (!procedure) return "channel";

		const tauriMeta = extractTauriMeta(procedure);

		if (tauriMeta?.transport) {
			return tauriMeta.transport.kind === "channel" ? "channel" : "listen";
		}

		return "channel";
	}

	/**
	 * Check if debug mode enabled for procedure.
	 */
	getDebug(path: readonly string[]): boolean {
		const procedure = this.resolve(path);
		if (!procedure) return false;

		const tauriMeta = extractTauriMeta(procedure);
		return tauriMeta?.debug ?? false;
	}

	/**
	 * Get transport configuration.
	 */
	getTransportConfig(path: readonly string[]): TauriTransportConfig | undefined {
		const procedure = this.resolve(path);
		if (!procedure) return undefined;

		const tauriMeta = extractTauriMeta(procedure);
		return tauriMeta?.transport;
	}
}
