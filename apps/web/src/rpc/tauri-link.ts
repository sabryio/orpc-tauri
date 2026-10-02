import { ORPCError } from "@orpc/client";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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

    // Check if this procedure returns an async iterator (streaming)
    const procedure = this.resolveProcedure(path);
    const isStreaming = this.isStreamingProcedure(procedure, path);

    try {
      if (isStreaming) {
        // Return an async iterator for streaming procedures
        return this.createStreamIterator<TOutput>(
          commandName,
          input,
        ) as TOutput;
      }

      // Regular request-response
      const args =
        input === undefined ? {} : { input: input === null ? null : input };

      const response = await invoke<TOutput>(commandName, args);

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

        console.log("[TauriLink] Created ORPCError:", {
          code: orpcError.code,
          defined: error.defined,
        });
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
   * Resolve a procedure from the contract by path
   */
  private resolveProcedure(path: string[]): any {
    let target = this.contract;

    for (const segment of path) {
      target = target[segment];
      if (!target) {
        return null;
      }
    }

    return target;
  }

  /**
   * Check if a procedure returns an AsyncIteratorObject (streaming)
   * Checks the schema's ~standard metadata for the ORPC async iterator symbol
   */
  private isStreamingProcedure(procedure: any, path: string[]): boolean {
    if (!procedure || !procedure["~orpc"]) {
      return false;
    }

    const orpcMeta = procedure["~orpc"];
    const outputSchemas = orpcMeta?.outputSchemas;

    if (!outputSchemas || outputSchemas.length === 0) {
      return false;
    }

    const outputSchema = outputSchemas[0];
    const standard = outputSchema?.["~standard"];

    if (!standard) {
      return false;
    }

    // Check for the ORPC_ASYNC_ITERATOR_OBJECT_SCHEMA_DETAILS symbol on ~standard
    // This symbol is added by asyncIteratorObject() in the contract
    const symbols = Object.getOwnPropertySymbols(standard);
    const hasAsyncIteratorSymbol = symbols.some((sym) =>
      sym.toString().includes("ORPC_ASYNC_ITERATOR_OBJECT_SCHEMA_DETAILS"),
    );

    return hasAsyncIteratorSymbol;
  }

  /**
   * Create an async iterator for streaming Tauri commands
   * Generates a unique stream ID, invokes the command, and listens for events
   */
  private async *createStreamIterator<T>(
    commandName: string,
    input?: unknown,
  ): AsyncIterableIterator<T> {
    type QueueItem =
      | { type: "value"; value: T }
      | { type: "done" }
      | { type: "error"; error: Error };

    const queue: QueueItem[] = [];
    let waiting: ((item: QueueItem) => void) | null = null;
    let finished = false;
    const unlisten: UnlistenFn[] = [];

    function push(item: QueueItem) {
      if (waiting) {
        const resolve = waiting;
        waiting = null;
        resolve(item);
      } else {
        queue.push(item);
      }
    }

    function dequeue(): Promise<QueueItem> {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
      if (finished) {
        return Promise.resolve({ type: "done" });
      }
      return new Promise<QueueItem>((resolve) => {
        waiting = resolve;
      });
    }

    try {
      // First, invoke the command to get the stream ID from Rust
      const args = input === undefined ? {} : { input };

      const response = await invoke<{ stream_id: string }>(commandName, args);
      const streamId = response.stream_id;

      // Setup event listeners with stream-specific event names
      const dataEventName = `stream:${streamId}:data`;
      const doneEventName = `stream:${streamId}:done`;
      const errorEventName = `stream:${streamId}:error`;

      const unlistenData = await listen<T>(dataEventName, (event) => {
        push({ type: "value", value: event.payload });
      });
      unlisten.push(unlistenData);

      const unlistenDone = await listen(doneEventName, () => {
        finished = true;
        push({ type: "done" });
      });
      unlisten.push(unlistenDone);

      const unlistenError = await listen<TauriErrorPayload>(
        errorEventName,
        (event) => {
          finished = true;
          const error = this.isTauriORPCError(event.payload)
            ? new ORPCError(event.payload.code as any, {
                message: event.payload.message || "Stream error",
                data: event.payload.data,
              })
            : new ORPCError("INTERNAL_ERROR", {
                message: "Stream error occurred",
              });
          push({ type: "error", error });
        },
      );
      unlisten.push(unlistenError);

      // Yield values as they arrive
      while (true) {
        const item = await dequeue();
        if (item.type === "value") {
          yield item.value;
        } else if (item.type === "error") {
          throw item.error;
        } else {
          // done
          break;
        }
      }
    } finally {
      // Cleanup listeners
      unlisten.forEach((fn) => fn());
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
