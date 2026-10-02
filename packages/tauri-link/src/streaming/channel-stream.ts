import { invoke, Channel } from "@tauri-apps/api/core";
import { StreamIterator } from "./stream-iterator";
import { ErrorHandler } from "../errors/error-handler";

/**
 * Axum-style SSE Event structure
 * Matches the Rust Event<T> type for seamless migration
 */
export interface SseEvent<T = unknown> {
  /** Event name (maps to 'event:' field in SSE) */
  event?: string;
  /** Event ID (maps to 'id:' field in SSE) */
  id?: string;
  /** Retry timeout in milliseconds (maps to 'retry:' field in SSE) */
  retry?: number;
  /** Comment (maps to ':' field in SSE, used for keep-alive) */
  comment?: string;
  /** Event data payload (maps to 'data:' field in SSE) */
  data?: T;
}

export class ChannelStreamHandler {
  async *createStream<T>(
    commandName: string,
    input?: unknown,
  ): AsyncIterableIterator<T> {
    const iterator = new StreamIterator<T>();

    const channel = new Channel<SseEvent<T>>();

    channel.onmessage = (message) => {
      // Handle based on event type (Axum-style)
      if (message.comment === "flush") {
        // Flush event - connection established, ignore
        console.log(`[ChannelStream] Channel connected for ${commandName}`);
      } else if (message.event === "close") {
        // Close event - mark stream as finished
        console.log(`[ChannelStream] Channel closed for ${commandName}`);
        iterator.markFinished();
        iterator.push({ type: "done" });
      } else if (message.event === "message" && message.data !== undefined) {
        // Data event - push to iterator
        // Store event metadata on the value for getEventMeta() support
        const value = message.data as T & {
          __sse_event?: string;
          __sse_id?: string;
          __sse_retry?: number;
        };
        if (typeof value === "object" && value !== null) {
          if (message.event) value.__sse_event = message.event;
          if (message.id) value.__sse_id = message.id;
          if (message.retry) value.__sse_retry = message.retry;
        }
        iterator.push({ type: "value", value });
      } else if (message.comment !== undefined) {
        // Keep-alive or other comment - ignore
        console.log(`[ChannelStream] Keep-alive for ${commandName}`);
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
