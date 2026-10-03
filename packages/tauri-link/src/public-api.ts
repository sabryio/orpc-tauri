import { Effect, Layer } from "effect";
import { EffectTauriLink } from "./link";
import { Logger, ConsoleLoggerLive, fromSimpleLogger } from "./services/logger";
import { toORPCError } from "./error-converter";
import { validateContract } from "./resolvers/contract-validator";
import { ProcedureResolver } from "./resolvers/procedure-resolver";
import { DefaultEventNameStrategy } from "./streaming/event-name-strategy";
import { AbortError } from "./errors";
import { DEFAULT_PARAMS, GLOBAL_EVENT_NAMES } from "./constants";
import type { ContractValidationError } from "./errors";
import type {
  Contract,
  CallOptions,
  TauriLinkOptions,
  TauriTransportConfig,
} from "./types";
import type { StreamConfig } from "./link";
import type { EventNameStrategy } from "./streaming/event-name-strategy";

/**
 * Promise-based TauriLink facade over Effect implementation.
 *
 * Use `new TauriLink(contract, options)` for synchronous construction (throws on validation errors).
 * Or use `TauriLink.make()` factory for Effect-based construction with typed errors.
 */
export class TauriLink<TContext = unknown> {
  private readonly resolver: ProcedureResolver;
  private readonly appLayer;
  private readonly eventNameStrategy: EventNameStrategy;

  constructor(contract: Contract, options?: TauriLinkOptions) {
    const loggerLayer = options?.logger
      ? fromSimpleLogger(options.logger)
      : ConsoleLoggerLive;

    this.appLayer = Layer.merge(EffectTauriLink.AppLayer, loggerLayer);
    this.eventNameStrategy =
      options?.eventNameStrategy ?? new DefaultEventNameStrategy();
    this.resolver = new ProcedureResolver(contract);

    // Run validation synchronously
    Effect.runSync(validateContract(contract));
  }

  /**
   * Effect-based factory with typed errors.
   *
   * Recommended for applications using Effect throughout.
   */
  static make<TContext = unknown>(
    contract: Contract,
    options?: TauriLinkOptions,
  ): Effect.Effect<TauriLink<TContext>, ContractValidationError> {
    return Effect.gen(function* () {
      yield* validateContract(contract);
      // Create via constructor but catch validation error since already validated
      try {
        return new TauriLink<TContext>(contract, options);
      } catch {
        // Should never happen since we already validated
        return new TauriLink<TContext>(contract, options);
      }
    });
  }

  /**
   * Execute a call using Effect internally.
   *
   * This is the Effect-native implementation. The public `call()` method
   * wraps this with Promise conversion and error mapping.
   */
  private callEffect<TInput, TOutput>(
    path: string[],
    input: TInput,
    callOptions?: CallOptions<TContext>,
  ) {
    const self = this;
    return Effect.gen(function* () {
      // Extract command name
      const commandName = yield* self.resolver.extractCommandName(path);
      const debug = self.resolver.getDebug(path);

      if (debug) {
        const logger = yield* Logger;
        yield* logger.log(`[TauriLink] ${commandName}`, {
          input,
          path: path.join("."),
        });
      }

      // Check abort signal
      if (callOptions?.signal?.aborted) {
        yield* new AbortError({ reason: "Request aborted" });
      }

      // Handle streaming vs unary
      if (self.resolver.isStreaming(path)) {
        const transport = self.resolver.getTransport(path);
        const transportConfig = self.resolver.getTransportConfig(path);

        if (transport === "channel") {
          return self.createChannelStream<TOutput>(
            commandName,
            input,
            transportConfig,
          ) as TOutput;
        }

        return self.createEventStream<TOutput>(
          commandName,
          input,
          transportConfig,
        ) as TOutput;
      }

      // Unary call - pass input directly without wrapping
      const args = (input === undefined ? undefined : input) as Record<
        string,
        unknown
      >;
      const result = yield* EffectTauriLink.call<
        Record<string, unknown>,
        TOutput
      >(commandName, args);

      if (debug) {
        const logger = yield* Logger;
        yield* logger.log(`[TauriLink] ${commandName} →`, result);
      }

      return result;
    });
  }

  async call<TInput, TOutput>(
    path: string[],
    input: TInput,
    callOptions?: CallOptions<TContext>,
  ): Promise<TOutput> {
    return Effect.runPromise(
      this.callEffect<TInput, TOutput>(path, input, callOptions).pipe(
        Effect.provide(this.appLayer),
        Effect.mapError(toORPCError),
      ),
    );
  }

  private createEventStream<TOutput>(
    commandName: string,
    input: unknown,
    transportConfig: TauriTransportConfig | undefined,
  ): AsyncIterableIterator<TOutput> {
    // Check if transport config has stream ID configuration
    const hasStreamIdConfig =
      transportConfig?.kind === "stream" && transportConfig.id;

    let streamId: string;
    let eventNames: { data: string; error: string; done: string };
    let inputWithStreamParams: unknown;

    if (hasStreamIdConfig && transportConfig.kind === "stream") {
      // Case 1: Unique stream ID per call (default behavior)
      const idValue = transportConfig.id!.value;
      streamId = typeof idValue === "function" ? idValue() : idValue;

      // Use custom event generator or default strategy
      if (transportConfig.events) {
        eventNames = transportConfig.events.generator(streamId);
        // Include both streamId and eventNames in input
        inputWithStreamParams = {
          ...(input as Record<string, unknown>),
          [transportConfig.id!.name]: streamId,
          [transportConfig.events.name]: eventNames,
        };
      } else {
        // Use default event name strategy with unique stream ID
        eventNames = this.eventNameStrategy.getEventNames(streamId);
        // Include only streamId in input
        inputWithStreamParams = {
          ...(input as Record<string, unknown>),
          [transportConfig.id!.name]: streamId,
        };
      }
    } else {
      // Case 2: Global event names (no stream ID in input)
      // Use global default event names without unique ID
      streamId = ""; // No stream ID
      eventNames = {
        data: GLOBAL_EVENT_NAMES.DATA,
        error: GLOBAL_EVENT_NAMES.ERROR,
        done: GLOBAL_EVENT_NAMES.DONE,
      };
      // Don't add any stream parameters to input
      inputWithStreamParams = input;
    }

    const config: StreamConfig = {
      mode: "listen",
      listenConfig: {
        streamId: () => streamId,
        getEventNames: () => eventNames,
      },
    };

    return EffectTauriLink.stream<unknown, TOutput>(
      commandName,
      inputWithStreamParams,
      config,
    );
  }

  private createChannelStream<TOutput>(
    commandName: string,
    input: unknown,
    transportConfig: TauriTransportConfig | undefined,
  ): AsyncIterableIterator<TOutput> {
    let channelParam: string = DEFAULT_PARAMS.CHANNEL;
    if (transportConfig?.kind === "channel") {
      channelParam =
        typeof transportConfig.id === "string"
          ? transportConfig.id
          : transportConfig.id.name;
    }

    const config: StreamConfig = {
      mode: "channel",
      channelParam,
    };

    return EffectTauriLink.stream<unknown, TOutput>(commandName, input, config);
  }
}
