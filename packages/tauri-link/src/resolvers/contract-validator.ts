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
      const openApiPath = orpcMeta.meta?.["~openapi"]?.path;

      // Priority 1: Tauri command name
      // Priority 2: OpenAPI path
      const commandName = tauriMeta?.command || openApiPath;

      if (commandName) {
        const normalizedName = this.normalizeCommandName(commandName);
        const procedurePath = path.join(".");

        if (commandMap.has(normalizedName)) {
          const existingPath = commandMap.get(normalizedName)!.join(".");
          throw new Error(
            `[TauriLink] Duplicate command name detected: "${normalizedName}"\n` +
              `  - First defined at: ${existingPath}\n` +
              `  - Duplicate found at: ${procedurePath}\n` +
              `Each Tauri command must have a unique name.`,
          );
        }

        commandMap.set(normalizedName, path);
        this.commandNames.add(normalizedName);
      }
    }

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key !== "~orpc" && typeof value === "object" && value !== null) {
        this.extractCommands(value, [...path, key], commandMap);
      }
    }
  }

  private normalizeCommandName(path: string): string {
    return path.startsWith("/") ? path.substring(1) : path;
  }
}
