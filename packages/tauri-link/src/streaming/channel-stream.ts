import { StreamIterator } from "./stream-iterator";
import { ErrorHandler } from "../errors/error-handler";
import { handleSseEvent } from "./event-handler";
import type { SseEvent } from "./sse-types";
import type { Logger, TauriTransportConfig } from "../types";
import type {
  ITauriInvoker,
  ITauriChannelFactory,
} from "../adapters/tauri-adapter";

export class ChannelStreamHandler {
  constructor(
    private readonly invoker: ITauriInvoker,
    private readonly channelFactory: ITauriChannelFactory,
    private readonly logger: Logger,
  ) {}

  async *createStream<T>(
    commandName: string,
    input?: unknown,
    transportConfig?: TauriTransportConfig,
  ): AsyncIterableIterator<T> {
    const iterator = new StreamIterator<T>();
    const channel = this.channelFactory.createChannel<SseEvent<T>>();

    channel.onmessage = (message) => {
      handleSseEvent(message, iterator, commandName, this.logger);
    };

    try {
      // Determine channel parameter name
      let paramName = "onEvent";
      if (transportConfig?.kind === "channel") {
        paramName =
          typeof transportConfig.id === "string"
            ? transportConfig.id
            : transportConfig.id.name;
      }

      // Build args with custom parameter name
      const channelParam = { [paramName]: channel };
      const args =
        input === undefined ? channelParam : { ...input, ...channelParam };

      this.invoker.invoke(commandName, args).catch((error) => {
        iterator.markFinished();
        iterator.push({
          type: "error",
          error: ErrorHandler.toORPCError(error, "Channel stream failed"),
        });
      });

      yield* this.consumeStream(iterator);
    } finally {
      iterator.cleanup();
    }
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
}
