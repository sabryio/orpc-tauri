import { ORPCError } from "@orpc/client";
import { StreamIterator } from "./stream-iterator";
import { ErrorHandler } from "../errors/error-handler";
import { handleSseEvent } from "./event-handler";
import type { SseEvent } from "./sse-types";
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
      yield* this.consumeStream(iterator);
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
  ): Promise<void> {
    const events = {
      data: `stream:${streamId}:data`,
      done: `stream:${streamId}:done`,
      error: `stream:${streamId}:error`,
    };

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
