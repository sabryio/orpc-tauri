import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ORPCError } from "@orpc/client";
import { StreamIterator } from "./stream-iterator";
import { ErrorHandler } from "../errors/error-handler";
import type { StreamResponse, TauriErrorPayload } from "../types";

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

export class EventStreamHandler {
  async *createStream<T>(
    commandName: string,
    input?: unknown,
  ): AsyncIterableIterator<T> {
    const iterator = new StreamIterator<T>();

    try {
      const streamId = await this.startStream(commandName, input);
      await this.setupListeners(streamId, iterator);

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

  private async startStream(
    commandName: string,
    input?: unknown,
  ): Promise<string> {
    const args = input === undefined ? {} : { input };
    const response = await invoke<StreamResponse>(commandName, args);

    if (!response.stream_id) {
      throw new ORPCError<"INTERNAL_ERROR", unknown>("INTERNAL_ERROR", {
        message: `Stream command ${commandName} did not return stream_id`,
      });
    }

    return response.stream_id;
  }

  private async setupListeners<T>(
    streamId: string,
    iterator: StreamIterator<T>,
  ): Promise<void> {
    const dataEvent = `stream:${streamId}:data`;
    const doneEvent = `stream:${streamId}:done`;
    const errorEvent = `stream:${streamId}:error`;

    const unlistenData = await listen<SseEvent<T>>(dataEvent, (event) => {
      const message = event.payload;

      // Handle based on event type (Axum-style)
      if (message.comment === "flush") {
        // Flush event - connection established, ignore
        console.log(`[EventStream] Stream ${streamId} connected`);
      } else if (message.event === "close") {
        // Close event - mark stream as finished
        console.log(`[EventStream] Stream ${streamId} closed`);
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
        console.log(`[EventStream] Keep-alive for ${streamId}`);
      }
    });
    iterator.addUnlisten(unlistenData);

    const unlistenDone = await listen(doneEvent, () => {
      iterator.markFinished();
      iterator.push({ type: "done" });
    });
    iterator.addUnlisten(unlistenDone);

    const unlistenError = await listen<TauriErrorPayload>(
      errorEvent,
      (event) => {
        iterator.markFinished();
        const error = ErrorHandler.toORPCError(event.payload, "Stream error");
        iterator.push({ type: "error", error });
      },
    );
    iterator.addUnlisten(unlistenError);
  }
}
