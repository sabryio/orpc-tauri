import { ORPCError } from "@orpc/client";
import { ContractValidator } from "./resolvers/contract-validator";
import { ProcedureResolver } from "./resolvers/procedure-resolver";
import { EventStreamHandler } from "./streaming/event-stream";
import { ChannelStreamHandler } from "./streaming/channel-stream";
import { ErrorHandler } from "./errors/error-handler";
import { ConsoleLogger } from "./logger";
import { DefaultEventNameStrategy } from "./streaming/event-name-strategy";
import {
  TauriAdapter,
  TauriChannelFactory,
  type ITauriInvoker,
} from "./adapters/tauri-adapter";
import type { Contract, CallOptions, TauriLinkOptions, Logger } from "./types";

export class TauriLink<TContext = unknown> {
  private readonly resolver: ProcedureResolver;
  private readonly eventStream: EventStreamHandler;
  private readonly channelStream: ChannelStreamHandler;
  private readonly invoker: ITauriInvoker;
  private readonly logger: Logger;

  constructor(contract: Contract, options?: TauriLinkOptions) {
    this.logger = options?.logger ?? new ConsoleLogger();
    this.invoker = new TauriAdapter();

    const listener = new TauriAdapter();
    const channelFactory = new TauriChannelFactory();
    const eventNameStrategy =
      options?.eventNameStrategy ?? new DefaultEventNameStrategy();

    this.resolver = new ProcedureResolver(contract);
    this.eventStream = new EventStreamHandler(
      this.invoker,
      listener,
      this.logger,
      eventNameStrategy,
    );
    this.channelStream = new ChannelStreamHandler(
      this.invoker,
      channelFactory,
      this.logger,
    );

    new ContractValidator().validate(contract);
  }

  async call<TInput, TOutput>(
    path: string[],
    input: TInput,
    callOptions?: CallOptions<TContext>,
  ): Promise<TOutput> {
    const commandName = this.resolver.extractCommandName(path);
    const debug = this.resolver.getDebug(path);

    if (debug) {
      this.logger.log(`[TauriLink] ${commandName}`, {
        input,
        path: path.join("."),
      });
    }

    if (callOptions?.signal?.aborted) {
      throw new ORPCError<"INTERNAL_ERROR", unknown>("INTERNAL_ERROR", {
        message: "Request aborted",
      });
    }

    try {
      if (this.resolver.isStreaming(path)) {
        const transport = this.resolver.getTransport(path);

        if (transport === "channel") {
          return this.channelStream.createStream<TOutput>(
            commandName,
            input,
          ) as TOutput;
        }

        return this.eventStream.createStream<TOutput>(
          commandName,
          input,
        ) as TOutput;
      }

      const result = await this.invokeCommand<TInput, TOutput>(commandName, input);

      if (debug) {
        this.logger.log(`[TauriLink] ${commandName} →`, result);
      }

      return result;
    } catch (error) {
      if (debug) {
        this.logger.error(`[TauriLink] ${commandName} ✗`, error);
      }
      throw ErrorHandler.toORPCError(error, `${commandName} failed`);
    }
  }

  private async invokeCommand<TInput, TOutput>(
    commandName: string,
    input: TInput,
  ): Promise<TOutput> {
    const args =
      input === undefined ? {} : { input: input === null ? null : input };
    return await this.invoker.invoke<TOutput>(commandName, args);
  }
}
