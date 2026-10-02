import type { UnlistenFn } from "@tauri-apps/api/event";
import type { StreamEvent } from "../types";

export class StreamIterator<T> {
  private queue: StreamEvent<T>[] = [];
  private waiting: ((item: StreamEvent<T>) => void) | null = null;
  private finished = false;
  private readonly unlisten: UnlistenFn[] = [];

  push(item: StreamEvent<T>): void {
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve(item);
    } else {
      this.queue.push(item);
    }
  }

  async dequeue(): Promise<StreamEvent<T>> {
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }
    if (this.finished) {
      return { type: "done" };
    }
    return new Promise<StreamEvent<T>>((resolve) => {
      this.waiting = resolve;
    });
  }

  markFinished(): void {
    this.finished = true;
  }

  addUnlisten(fn: UnlistenFn): void {
    this.unlisten.push(fn);
  }

  cleanup(): void {
    this.unlisten.forEach((fn) => fn());
  }
}
