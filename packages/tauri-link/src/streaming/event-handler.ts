import type { SseEvent } from "./sse-types";
import type { StreamIterator } from "./stream-iterator";
import { attachEventMeta } from "./sse-types";
import type { Logger } from "../types";

export function handleSseEvent<T>(
  message: SseEvent<T>,
  iterator: StreamIterator<T>,
  streamId: string,
  logger: Logger,
): void {
  if (message.comment === "flush") {
    logger.log(`[Stream] ${streamId} connected`);
  } else if (message.event === "close") {
    logger.log(`[Stream] ${streamId} closed`);
    iterator.markFinished();
    iterator.push({ type: "done" });
  } else if (message.event === "message" && message.data !== undefined) {
    const value = message.data as T;
    attachEventMeta(value, message);
    iterator.push({ type: "value", value });
  } else if (message.comment !== undefined) {
    logger.log(`[Stream] Keep-alive for ${streamId}`);
  }
}
