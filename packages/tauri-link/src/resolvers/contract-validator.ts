import { extractTauriMeta } from "../metadata";
import type { Contract, ORPCMeta } from "../types";

export class ContractValidator {
  private readonly commandNames = new Set<string>();

  validate(contract: Contract): void {
    const commandMap = new Map<string, string[]>();
    this.extractCommands(contract, [], commandMap);
  }

  private extractCommands(
    obj: unknown,
    path: string[],
    commandMap: Map<string, string[]>,
  ): void {
    if (!obj || typeof obj !== "object") return;

    const orpcMeta = (obj as Record<string, unknown>)["~orpc"] as
      | ORPCMeta
      | undefined;

    if (orpcMeta) {
      const tauriMeta = extractTauriMeta(obj as Record<string, unknown>);
      const commandName = tauriMeta?.command;

      if (commandName) {
        const procedurePath = path.join(".");

        if (commandMap.has(commandName)) {
          const existingPath = commandMap.get(commandName)!.join(".");
          throw new Error(
            `[TauriLink] Duplicate command name detected: "${commandName}"\n` +
              `  - First defined at: ${existingPath}\n` +
              `  - Duplicate found at: ${procedurePath}\n` +
              `Each Tauri command must have a unique name.`,
          );
        }

        commandMap.set(commandName, path);
        this.commandNames.add(commandName);
      }
    }

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key !== "~orpc" && typeof value === "object" && value !== null) {
        this.extractCommands(value, [...path, key], commandMap);
      }
    }
  }
}
