import { invoke, Channel } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface ITauriInvoker {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export interface ITauriListener {
  listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn>;
}

export interface ITauriChannel<T> {
  onmessage: ((message: T) => void) | null;
}

export interface ITauriChannelFactory {
  createChannel<T>(): ITauriChannel<T>;
}

export class TauriAdapter implements ITauriInvoker, ITauriListener {
  async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(command, args);
  }

  async listen<T>(
    event: string,
    handler: (payload: T) => void,
  ): Promise<UnlistenFn> {
    return listen<T>(event, (e) => handler(e.payload));
  }
}

export class TauriChannelFactory implements ITauriChannelFactory {
  createChannel<T>(): ITauriChannel<T> {
    return new Channel<T>() as unknown as ITauriChannel<T>;
  }
}
