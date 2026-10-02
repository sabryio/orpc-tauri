import { StreamIterator } from "./stream-iterator";
import { ErrorHandler } from "../errors/error-handler";
import { handleSseEvent } from "./event-handler";
import type { SseEvent } from "./sse-types";
import type { TauriErrorPayload, Logger, TauriTransportConfig } from "../types";
import type { ITauriInvoker, ITauriListener } from "../adapters/tauri-adapter";
import type { EventNameStrategy } from "./event-name-strategy";

export class EventStreamHandler {
  constructor(
    private readonly invoker: ITauriInvoker,
    private readonly listener: ITauriListener,
    private readonly logger: Logger,
    private readonly eventNameStrategy: EventNameStrategy,
  ) {}

  async *createStream<T>(
    commandName: string,
    input?: unknown,
    transportConfig?: TauriTransportConfig,
  ): AsyncIterableIterator<T> {
    const iterator = new StreamIterator<T>();

    try {
      const streamId = await this.startStream(
        commandName,
        input,
        transportConfig,
      );
      await this.setupListeners(streamId, iterator, transportConfig);
      yield* this.consumeStream(iterator);
    } finally {
      iterator.cleanup();
    }
  }

  private async startStream(
    commandName: string,
    input?: unknown,
    transportConfig?: TauriTransportConfig,
  ): Promise<string> {
    // Only stream transport is valid here
    if (transportConfig?.kind !== "stream") {
      throw new Error("EventStreamHandler requires stream transport config");
    }

    // Resolve stream ID - call function if it's a generator
    const streamIdValue = transportConfig.id.value;
    const streamId =
      typeof streamIdValue === "function" ? streamIdValue() : streamIdValue;
    const paramName = transportConfig.id.name;

    // Generate event names using custom config or default strategy
    const eventNames = transportConfig.events
      ? transportConfig.events.generator(streamId)
      : this.eventNameStrategy.getEventNames(streamId);

    const eventsParamName = transportConfig.events?.name ?? "eventNames";

    // Build args with stream param and event names
    const streamParam = {
      [paramName]: streamId,
      [eventsParamName]: eventNames,
    };

    const args =
      input === undefined ? streamParam : { ...input, ...streamParam };

    await this.invoker.invoke(commandName, args);

    return streamId;
  }

  private async *consumeStream<T>(
    iterator: StreamIterator<T>,
  ): AsyncIterableIterator<T> {
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
  }

  private async setupListeners<T>(
    streamId: string,
    iterator: StreamIterator<T>,
    transportConfig?: TauriTransportConfig,
  ): Promise<void> {
    // Only stream transport is valid here
    if (transportConfig?.kind !== "stream") {
      throw new Error("EventStreamHandler requires stream transport config");
    }

    // Use custom generator or default strategy
    const events = transportConfig.events
      ? transportConfig.events.generator(streamId)
      : this.eventNameStrategy.getEventNames(streamId);

    const unlistenData = await this.listener.listen<SseEvent<T>>(
      events.data,
      (message) => handleSseEvent(message, iterator, streamId, this.logger),
    );
    iterator.addUnlisten(unlistenData);

    const unlistenDone = await this.listener.listen(events.done, () => {
      iterator.markFinished();
      iterator.push({ type: "done" });
    });
    iterator.addUnlisten(unlistenDone);

    const unlistenError = await this.listener.listen<TauriErrorPayload>(
      events.error,
      (error) => {
        iterator.markFinished();
        const orpcError = ErrorHandler.toORPCError(error, "Stream error");
        iterator.push({ type: "error", error: orpcError });
      },
    );
    iterator.addUnlisten(unlistenError);
  }
}
