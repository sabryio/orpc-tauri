import { ORPCError } from "@orpc/client";
import { StreamIterator } from "./stream-iterator";
import { ErrorHandler } from "../errors/error-handler";
import { attachEventMeta, type SseEvent } from "./sse-types";
import type { StreamResponse, TauriErrorPayload, Logger } from "../types";
import type { ITauriInvoker, ITauriListener } from "../adapters/tauri-adapter";

export class EventStreamHandler {
  constructor(
    private readonly invoker: ITauriInvoker,
    private readonly listener: ITauriListener,
    private readonly logger: Logger,
  ) {}
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
    const response = await this.invoker.invoke<StreamResponse>(commandName, args);

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

    const unlistenData = await this.listener.listen<SseEvent<T>>(
      dataEvent,
      (message) => {
        if (message.comment === "flush") {
          this.logger.log(`[EventStream] Stream ${streamId} connected`);
        } else if (message.event === "close") {
          this.logger.log(`[EventStream] Stream ${streamId} closed`);
          iterator.markFinished();
          iterator.push({ type: "done" });
        } else if (message.event === "message" && message.data !== undefined) {
          const value = message.data as T;
          attachEventMeta(value, message);
          iterator.push({ type: "value", value });
        } else if (message.comment !== undefined) {
          this.logger.log(`[EventStream] Keep-alive for ${streamId}`);
        }
      },
    );
    iterator.addUnlisten(unlistenData);

    const unlistenDone = await this.listener.listen(doneEvent, () => {
      iterator.markFinished();
      iterator.push({ type: "done" });
    });
    iterator.addUnlisten(unlistenDone);

    const unlistenError = await this.listener.listen<TauriErrorPayload>(
      errorEvent,
      (error) => {
        iterator.markFinished();
        const orpcError = ErrorHandler.toORPCError(error, "Stream error");
        iterator.push({ type: "error", error: orpcError });
      },
    );
    iterator.addUnlisten(unlistenError);
  }
}
