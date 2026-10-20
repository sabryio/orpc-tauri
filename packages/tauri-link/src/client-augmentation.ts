/**
 * Ambient module augmentation shipped by the package.
 *
 * Adds the transfer-progress call option to oRPC's client options so
 * consumers get typed `onProgress` at every `client.*` / `orpc.*` callsite
 * with zero boilerplate:
 *
 * ```ts
 * client.file.download_file(
 *   { input: { total_bytes: 1024 } },
 *   { onProgress: (info) => console.log(info.percentage) },
 * );
 * ```
 *
 * The augmentation block is kept in this single file and inlined verbatim in
 * the entrypoint declarations (`index.ts`, `link.export.ts`) so it is present
 * in emitted `.d.ts` output of whichever entrypoint a consumer imports.
 * Keep all three copies identical.
 */
import type { ProgressInfo } from "./streaming/progress-types";

declare module "@orpc/client" {
	interface ClientOptions<T> {
		/**
		 * Transfer progress callback — fires for channel-mode streams
		 * (data-less `progress:` control envelopes; see ProgressInfo).
		 */
		onProgress?: (info: ProgressInfo) => void;
	}
}
