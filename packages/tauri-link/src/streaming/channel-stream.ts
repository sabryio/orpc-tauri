import { invoke, Channel } from "@tauri-apps/api/core";
import { ORPCError } from "@orpc/client";
import { StreamIterator } from "./stream-iterator";
import { ErrorHandler } from "../errors/error-handler";

type ChannelEventMessage<T> =
  | { event: "flush" }
  | { event: "data"; data: T }
  | { event: "close" }
  | { event: "error"; data: { message: string } };

export class ChannelStreamHandler {
  async *createStream<T>(
    commandName: string,
    input?: unknown,
  ): AsyncIterableIterator<T> {
    const iterator = new StreamIterator<T>();

    const channel = new Channel<ChannelEventMessage<T>>();

    channel.onmessage = (message) => {
      if (message.event === "flush") {
        // Flush event - connection established, ignore
        console.log(`[ChannelStream] Channel connected for ${commandName}`);
      } else if (message.event === "data") {
        // Data event - push to iterator
        iterator.push({ type: "value", value: message.data });
      } else if (message.event === "close") {
        // Close event - mark stream as finished
        console.log(`[ChannelStream] Channel closed for ${commandName}`);
        iterator.markFinished();
        iterator.push({ type: "done" });
      } else if (message.event === "error") {
        // Error event
        iterator.markFinished();
        const error = new ORPCError<"INTERNAL_ERROR", unknown>(
          "INTERNAL_ERROR",
          { message: message.data.message },
        );
        iterator.push({ type: "error", error });
      }
    };

    try {
      const args =
        input === undefined
          ? { onEvent: channel }
          : { input, onEvent: channel };

      invoke(commandName, args).catch((error) => {
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
