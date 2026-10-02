import { StreamIterator } from "./stream-iterator";
import { ErrorHandler } from "../errors/error-handler";
import { attachEventMeta, type SseEvent } from "./sse-types";
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
      if (message.comment === "flush") {
        this.logger.log(`[ChannelStream] Channel connected for ${commandName}`);
      } else if (message.event === "close") {
        this.logger.log(`[ChannelStream] Channel closed for ${commandName}`);
        iterator.markFinished();
        iterator.push({ type: "done" });
      } else if (message.event === "message" && message.data !== undefined) {
        const value = message.data as T;
        attachEventMeta(value, message);
        iterator.push({ type: "value", value });
      } else if (message.comment !== undefined) {
        this.logger.log(`[ChannelStream] Keep-alive for ${commandName}`);
      }
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
}
