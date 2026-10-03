import { Effect, Layer } from "effect";
import { EffectTauriLink } from "./link";
import {
	Logger,
	ConsoleLoggerLive,
	fromSimpleLogger,
} from "./services/logger";
import { toORPCError } from "./error-converter";
import { validateContract } from "./resolvers/contract-validator";
import { ProcedureResolver } from "./resolvers/procedure-resolver";
import { DefaultEventNameStrategy } from "./streaming/event-name-strategy";
import { AbortError } from "./errors";
import { DEFAULT_PARAMS } from "./constants";
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

        return self.createEventStream<TOutput>(commandName, input) as TOutput;
      }

      // Unary call
      const args =
        input === undefined ? {} : { input: input === null ? null : input };
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
  ): AsyncIterableIterator<TOutput> {
    const streamId = crypto.randomUUID();
    const eventNames = this.eventNameStrategy.getEventNames(streamId);

    const config: StreamConfig = {
      mode: "listen",
      listenConfig: {
        streamId: () => streamId,
        getEventNames: () => eventNames,
      },
    };

    return EffectTauriLink.stream<unknown, TOutput>(commandName, input, config);
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
