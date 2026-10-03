import { Effect } from "effect";
import { ContractValidationError } from "../errors";
import { extractTauriMeta } from "../metadata";
import { METADATA_KEYS } from "../constants";
import type { Contract, ORPCMeta } from "../types";

/**
 * Validates contract structure for duplicate command names.
 *
 * Returns Effect that fails with ContractValidationError if duplicates found.
 */
export const validateContract = (
	contract: Contract,
): Effect.Effect<void, ContractValidationError> =>
	Effect.try({
		try: () => {
			const commandMap = new Map<string, string[]>();
			extractCommands(contract, [], commandMap);
		},
		catch: (cause) => {
			if (cause instanceof ContractValidationError) {
				return cause;
			}
			return new ContractValidationError({
				message:
					cause instanceof Error ? cause.message : String(cause),
			});
		},
	});

function extractCommands(
	obj: unknown,
	path: string[],
	commandMap: Map<string, string[]>,
): void {
	if (!obj || typeof obj !== "object") return;

	const orpcMeta = (obj as Record<string, unknown>)[METADATA_KEYS.ORPC] as
		| ORPCMeta
		| undefined;

	if (orpcMeta) {
		const tauriMeta = extractTauriMeta(obj as Record<string, unknown>);
		const commandName = tauriMeta?.command;

		if (commandName) {
			const procedurePath = path.join(".");

			if (commandMap.has(commandName)) {
				const existingPath = commandMap.get(commandName)!.join(".");
				throw new ContractValidationError({
					message:
						`Duplicate command name detected: "${commandName}"\n` +
						`  - First defined at: ${existingPath}\n` +
						`  - Duplicate found at: ${procedurePath}\n` +
						`Each Tauri command must have a unique name.`,
					duplicateCommand: commandName,
					paths: [existingPath, procedurePath],
				});
			}

			commandMap.set(commandName, path);
		}
	}

	for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
		if (key !== METADATA_KEYS.ORPC && typeof value === "object" && value !== null) {
			extractCommands(value, [...path, key], commandMap);
		}
	}
}
