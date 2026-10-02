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
    const openApiPath = orpcMeta?.meta?.["~openapi"]?.path;

    if (openApiPath) {
      const commandName = this.normalizeCommandName(openApiPath);
      const procedurePath = path.join(".");

      if (commandMap.has(commandName)) {
        const existingPath = commandMap.get(commandName)!.join(".");
        throw new Error(
          `[TauriLink] Duplicate command name detected: "${commandName}"\n` +
            `  - First defined at: ${existingPath}\n` +
            `  - Duplicate found at: ${procedurePath}\n` +
            `Each Tauri command must have a unique OpenAPI path.`,
        );
      }

      commandMap.set(commandName, path);
      this.commandNames.add(commandName);
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
