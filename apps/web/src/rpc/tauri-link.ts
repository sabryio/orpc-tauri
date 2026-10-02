import { ORPCError } from "@orpc/client";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// Type Definitions
// ============================================================================

interface ORPCMeta {
  meta?: {
    "~openapi"?: OpenAPIMeta;
  };
  outputSchemas?: unknown[];
}

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

interface StreamResponse {
  stream_id: string;
}

interface CallOptions<TContext> {
  context?: TContext;
  signal?: AbortSignal;
}

type StreamEvent<T> =
  | { type: "value"; value: T }
  | { type: "done" }
  | { type: "error"; error: Error };

// ============================================================================
// Stream Iterator
// ============================================================================

class StreamIterator<T> {
  private queue: StreamEvent<T>[] = [];
  private waiting: ((item: StreamEvent<T>) => void) | null = null;
  private finished = false;
  private readonly unlisten: UnlistenFn[] = [];

  push(item: StreamEvent<T>): void {
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve(item);
    } else {
      this.queue.push(item);
    }
  }

  async dequeue(): Promise<StreamEvent<T>> {
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }
    if (this.finished) {
      return { type: "done" };
    }
    return new Promise<StreamEvent<T>>((resolve) => {
      this.waiting = resolve;
    });
  }

  markFinished(): void {
    this.finished = true;
  }

  addUnlisten(fn: UnlistenFn): void {
    this.unlisten.push(fn);
  }

  cleanup(): void {
    this.unlisten.forEach((fn) => fn());
  }
}

// ============================================================================
// Error Handler
// ============================================================================

class ErrorHandler {
  static isTauriORPCError(error: unknown): error is TauriErrorPayload {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      "message" in error &&
      typeof (error as TauriErrorPayload).message === "string"
    );
  }

  static toORPCError(error: unknown, context: string): ORPCError<string, unknown> {
    if (this.isTauriORPCError(error)) {
      const orpcError = new ORPCError<string, unknown>(
        error.code || "INTERNAL_ERROR",
        {
          message: error.message || "Unknown error",
          data: error.data,
        },
      );

      if (error.defined === true) {
        Object.defineProperty(orpcError, "defined", {
          value: true,
          writable: false,
          enumerable: true,
          configurable: false,
        });
      }

      return orpcError;
    }

    if (error instanceof ORPCError) {
      return error as ORPCError<string, unknown>;
    }

    return new ORPCError<"INTERNAL_ERROR", unknown>("INTERNAL_ERROR", {
      message: error instanceof Error ? error.message : context,
      cause: error,
    });
  }
}

// ============================================================================
// Contract Validator
// ============================================================================

class ContractValidator {
  private readonly commandNames = new Set<string>();

  validate(contract: Record<string, unknown>): void {
    const commandMap = new Map<string, string[]>();
    this.extractCommands(contract, [], commandMap);

    console.log(
      `[TauriLink] Validated ${this.commandNames.size} unique command(s):`,
      Array.from(this.commandNames).sort(),
    );
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

// ============================================================================
// Procedure Resolver
// ============================================================================

class ProcedureResolver {
  constructor(private readonly contract: Record<string, unknown>) {}

  resolve(path: string[]): Record<string, unknown> | null {
    let target: unknown = this.contract;

    for (const segment of path) {
      if (!target || typeof target !== "object") return null;
      target = (target as Record<string, unknown>)[segment];
      if (!target) return null;
    }

    return target as Record<string, unknown>;
  }

  extractCommandName(path: string[]): string {
    const procedure = this.resolve(path);
    if (!procedure) {
      throw new ORPCError<"INTERNAL_ERROR", unknown>("INTERNAL_ERROR", {
        message: `Invalid procedure path: ${path.join(".")}`,
      });
    }

    const meta = (procedure["~orpc"] as ORPCMeta | undefined)?.meta?.[
      "~openapi"
    ];
    const commandPath = meta?.path;

    if (!commandPath) {
      throw new ORPCError<"INTERNAL_ERROR", unknown>("INTERNAL_ERROR", {
        message: `No openapi path found for procedure: ${path.join(".")}`,
      });
    }

    return commandPath.startsWith("/")
      ? commandPath.substring(1)
      : commandPath;
  }

  isStreaming(path: string[]): boolean {
    const procedure = this.resolve(path);
    if (!procedure) return false;

    const orpcMeta = procedure["~orpc"] as ORPCMeta | undefined;
    if (!orpcMeta) return false;

    const outputSchemas = orpcMeta.outputSchemas;
    if (!outputSchemas || outputSchemas.length === 0) return false;

    const outputSchema = outputSchemas[0];
    if (!outputSchema || typeof outputSchema !== "object") return false;

    const standard = (outputSchema as Record<string, unknown>)["~standard"];
    if (!standard || typeof standard !== "object") return false;

    const symbols = Object.getOwnPropertySymbols(standard);
    return symbols.some((sym) =>
      sym.toString().includes("ORPC_ASYNC_ITERATOR_OBJECT_SCHEMA_DETAILS"),
    );
  }
}

// ============================================================================
// TauriLink
// ============================================================================

export class TauriLink<TContext = unknown> {
  private readonly resolver: ProcedureResolver;

  constructor(contract: Record<string, unknown>) {
    this.resolver = new ProcedureResolver(contract);
    new ContractValidator().validate(contract);
  }

  async call<TInput, TOutput>(
    path: string[],
    input: TInput,
    callOptions?: CallOptions<TContext>,
  ): Promise<TOutput> {
    const commandName = this.resolver.extractCommandName(path);

    if (callOptions?.signal?.aborted) {
      throw new ORPCError<"INTERNAL_ERROR", unknown>("INTERNAL_ERROR", {
        message: "Request aborted",
      });
    }

    try {
      if (this.resolver.isStreaming(path)) {
        return this.createStreamIterator<TOutput>(commandName, input) as TOutput;
      }

      return await this.invokeCommand<TInput, TOutput>(commandName, input);
    } catch (error) {
      throw ErrorHandler.toORPCError(error, `${commandName} failed`);
    }
  }

  private async invokeCommand<TInput, TOutput>(
    commandName: string,
    input: TInput,
  ): Promise<TOutput> {
    const args =
      input === undefined ? {} : { input: input === null ? null : input };
    return await invoke<TOutput>(commandName, args);
  }

  private async *createStreamIterator<T>(
    commandName: string,
    input?: unknown,
  ): AsyncIterableIterator<T> {
    const iterator = new StreamIterator<T>();

    try {
      const streamId = await this.startStream(commandName, input);
      await this.setupStreamListeners(streamId, iterator);

      while (true) {
        const item = await iterator.dequeue();
        if (item.type === "value") {
          yield item.value;
        } else if (item.type === "error") {
          throw item.error;
        } else {
          break;
        }
      }
    } finally {
      iterator.cleanup();
    }
  }

  private async startStream(
    commandName: string,
    input?: unknown,
  ): Promise<string> {
    const args = input === undefined ? {} : { input };
    const response = await invoke<StreamResponse>(commandName, args);

    if (!response.stream_id) {
      throw new ORPCError<"INTERNAL_ERROR", unknown>("INTERNAL_ERROR", {
        message: `Stream command ${commandName} did not return stream_id`,
      });
    }

    return response.stream_id;
  }

  private async setupStreamListeners<T>(
    streamId: string,
    iterator: StreamIterator<T>,
  ): Promise<void> {
    const dataEvent = `stream:${streamId}:data`;
    const doneEvent = `stream:${streamId}:done`;
    const errorEvent = `stream:${streamId}:error`;

    const unlistenData = await listen<T>(dataEvent, (event) => {
      iterator.push({ type: "value", value: event.payload });
    });
    iterator.addUnlisten(unlistenData);

    const unlistenDone = await listen(doneEvent, () => {
      iterator.markFinished();
      iterator.push({ type: "done" });
    });
    iterator.addUnlisten(unlistenDone);

    const unlistenError = await listen<TauriErrorPayload>(errorEvent, (event) => {
      iterator.markFinished();
      const error = ErrorHandler.toORPCError(event.payload, "Stream error");
      iterator.push({ type: "error", error });
    });
    iterator.addUnlisten(unlistenError);
  }
}
