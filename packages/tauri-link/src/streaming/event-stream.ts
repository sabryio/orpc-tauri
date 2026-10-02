import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ORPCError } from "@orpc/client";
import { StreamIterator } from "./stream-iterator";
import { ErrorHandler } from "../errors/error-handler";
import type { StreamResponse, TauriErrorPayload } from "../types";

type StreamEventMessage<T> =
  | { type: "flush" }
  | { type: "data"; data: T }
  | { type: "close" };

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

    const unlistenData = await listen<StreamEventMessage<T>>(
      dataEvent,
      (event) => {
        const message = event.payload;

        if (message.type === "flush") {
          // Flush event - connection established, ignore
          console.log(`[EventStream] Stream ${streamId} connected`);
        } else if (message.type === "data") {
          // Data event - push to iterator
          iterator.push({ type: "value", value: message.data });
        } else if (message.type === "close") {
          // Close event - mark stream as finished
          console.log(`[EventStream] Stream ${streamId} closed`);
          iterator.markFinished();
          iterator.push({ type: "done" });
        }
      },
    );
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
