import { StreamIterator } from "./stream-iterator";
import { ErrorHandler } from "../errors/error-handler";
import { handleSseEvent } from "./event-handler";
import type { SseEvent } from "./sse-types";
import type { Logger } from "../types";
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
  ): AsyncIterableIterator<T> {
    const iterator = new StreamIterator<T>();
    const channel = this.channelFactory.createChannel<SseEvent<T>>();

    channel.onmessage = (message) => {
      handleSseEvent(message, iterator, commandName, this.logger);
    };

    try {
      const args =
        input === undefined
          ? { onEvent: channel }
          : { input, onEvent: channel };

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
