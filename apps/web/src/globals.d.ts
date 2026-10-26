import type { ProgressInfo } from "@sabryio/orpc-tauri";

declare module "@orpc/client" {
  interface ClientOptions<T> {
    onProgress?: (info: ProgressInfo) => void;
  }
}
