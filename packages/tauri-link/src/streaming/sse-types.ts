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

/** Symbol for ORPC event metadata (matches @standard-server/core) */
export const EVENT_META_SYMBOL = Symbol.for("STANDARD_SERVER_EVENT_META");

export interface EventMeta {
  id?: string;
  retry?: number;
  comments?: string[];
}

export function attachEventMeta<T>(value: T, message: SseEvent<T>): void {
  if (typeof value === "object" && value !== null) {
    const meta: EventMeta = {};
    if (message.id) meta.id = message.id;
    if (message.retry) meta.retry = message.retry;
    if (message.comment) meta.comments = [message.comment];

    Object.defineProperty(value, EVENT_META_SYMBOL, {
      value: meta,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }
}
