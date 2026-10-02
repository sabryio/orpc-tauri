import { StreamIterator } from "./stream-iterator";
import { ErrorHandler } from "../errors/error-handler";
import { handleSseEvent } from "./event-handler";
import type { SseEvent } from "./sse-types";
import type {
  TauriErrorPayload,
  Logger,
  TauriParamConfig,
  EventNamesConfig,
} from "../types";
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
    paramConfig?: TauriParamConfig,
    eventsConfig?: EventNamesConfig,
  ): AsyncIterableIterator<T> {
    const iterator = new StreamIterator<T>();

    try {
      const streamId = await this.startStream(
        commandName,
        input,
        paramConfig,
        eventsConfig,
      );
      await this.setupListeners(streamId, iterator, eventsConfig);
      yield* this.consumeStream(iterator);
    } finally {
      iterator.cleanup();
    }
  }

  private async startStream(
    commandName: string,
    input?: unknown,
    paramConfig?: TauriParamConfig,
    eventsConfig?: EventNamesConfig,
  ): Promise<string> {
    // Determine stream ID and parameter name
    const streamId =
      paramConfig?.kind === "stream" && paramConfig.value
        ? paramConfig.value
        : commandName;

    const paramName =
      paramConfig?.kind === "stream" ? paramConfig.name : "streamId";

    // Generate event names using custom config or default strategy
    const eventNames = eventsConfig
      ? eventsConfig.generator(streamId)
      : this.eventNameStrategy.getEventNames(streamId);

    const eventsParamName = eventsConfig?.paramName ?? "eventNames";

    // Build args with stream param and event names
    const streamParam = {
      [paramName]: streamId,
      [eventsParamName]: eventNames, // ← Custom param name for event names
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
    eventsConfig?: EventNamesConfig,
  ): Promise<void> {
    // Use custom generator or default strategy
    const events = eventsConfig
      ? eventsConfig.generator(streamId)
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
