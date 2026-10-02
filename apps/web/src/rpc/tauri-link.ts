import { ORPCError } from "@orpc/client";
import { invoke } from "@tauri-apps/api/core";

interface OpenAPIMeta {
  path?: string;
  method?: string;
}

interface TauriErrorPayload {
  defined?: boolean;
  code?: string;
  message?: string;
  data?: unknown;
}

export class TauriLink<TContext = unknown> {
  private contract: any;
  private commandNames: Set<string> = new Set();

  constructor(contract: any) {
    this.contract = contract;
    this.validateUniqueCommandNames();
  }

  /**
   * Validate that all command names in the contract are unique
   * Throws an error if duplicate command names are found
   */
  private validateUniqueCommandNames(): void {
    const commandNames = new Map<string, string[]>();

    const extractCommands = (obj: any, path: string[] = []): void => {
      if (!obj || typeof obj !== "object") return;

      // Check if this is a procedure (has ~orpc metadata)
      if (obj["~orpc"]?.meta?.["~openapi"]?.path) {
        const commandName = this.getCommandNameFromPath(
          obj["~orpc"].meta["~openapi"].path,
        );
        const procedurePath = path.join(".");

        if (commandNames.has(commandName)) {
          const existingPath = commandNames.get(commandName)!.join(".");
          throw new Error(
            `[TauriLink] Duplicate command name detected: "${commandName}"\n` +
              `  - First defined at: ${existingPath}\n` +
              `  - Duplicate found at: ${procedurePath}\n` +
              `Each Tauri command must have a unique OpenAPI path.`,
          );
        }

        commandNames.set(commandName, path);
        this.commandNames.add(commandName);
      }

      // Recursively check nested objects
      for (const [key, value] of Object.entries(obj)) {
        if (key !== "~orpc" && typeof value === "object" && value !== null) {
          extractCommands(value, [...path, key]);
        }
      }
    };

    extractCommands(this.contract);

    console.log(
      `[TauriLink] Validated ${this.commandNames.size} unique command(s):`,
      Array.from(this.commandNames).sort(),
    );
  }

  /**
   * Extract command name from OpenAPI path (removes leading slash)
   */
  private getCommandNameFromPath(path: string): string {
    return path.startsWith("/") ? path.substring(1) : path;
  }

  async call<TInput, TOutput>(
    path: string[],
    input: TInput,
    callOptions?: { context?: TContext; signal?: AbortSignal },
  ): Promise<TOutput> {
    const commandName = this.extractCommandName(path);

    if (callOptions?.signal?.aborted) {
      throw new ORPCError("INTERNAL_ERROR", {
        message: "Request aborted",
      });
    }

    try {
      console.log(`[TauriLink] ${commandName}`, input);

      // Only pass input if it's not undefined (for commands that don't need input)
      const args =
        input === undefined ? {} : { input: input === null ? null : input };

      const response = await invoke<TOutput>(commandName, args);

      console.log(`[TauriLink] ${commandName} →`, response);

      return response;
    } catch (error) {
      console.error(`[TauriLink] ${commandName} error:`, error);

      // If Tauri returned a structured oRPC error from Rust, convert to ORPCError
      if (this.isTauriORPCError(error)) {
        // Create ORPCError and mark it as defined if Rust indicated it was
        const orpcError = new ORPCError(error.code as any, {
          message: error.message || "Unknown error",
          data: error.data,
        });

        // Mark the error as defined if Rust sent defined: true
        // This is used by isDefinedError() to determine if the error matches the contract
        if (error.defined === true) {
          Object.defineProperty(orpcError, "defined", {
            value: true,
            writable: false,
            enumerable: true,
            configurable: false,
          });
        }

        console.log("[TauriLink] Created ORPCError:", orpcError);
        throw orpcError;
      }

      if (error instanceof ORPCError) {
        throw error;
      }

      throw new ORPCError("INTERNAL_ERROR", {
        message: error instanceof Error ? error.message : "Tauri invoke failed",
        cause: error,
      });
    }
  }

  /**
   * Type guard to check if an error from Tauri is a structured ORPC error
   * (as opposed to a generic Tauri error, network error, etc.)
   */
  private isTauriORPCError(error: unknown): error is TauriErrorPayload {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      "message" in error &&
      typeof (error as TauriErrorPayload).message === "string"
    );
  }

  private extractCommandName(path: string[]): string {
    let target = this.contract;

    for (const segment of path) {
      target = target[segment];
      if (!target) {
        throw new ORPCError("INTERNAL_ERROR", {
          message: `Invalid procedure path: ${path.join(".")}`,
        });
      }
    }

    const meta = target["~orpc"]?.meta?.["~openapi"] as OpenAPIMeta | undefined;
    let commandName = meta?.path;

    if (!commandName) {
      throw new ORPCError("INTERNAL_ERROR", {
        message: `No openapi path found for procedure: ${path.join(".")}`,
      });
    }

    if (commandName.startsWith("/")) {
      commandName = commandName.substring(1);
    }

    return commandName;
  }
}
