import { Context, Effect, Layer } from "effect";

/**
 * Logger service for structured logging with Effect.
 *
 * Provides Effect-based logging operations that can be composed,
 * tested with mock implementations, and integrated with Effect's
 * execution model.
 */
export class Logger extends Context.Service<
	Logger,
	{
		readonly log: (
			message: string,
			data?: unknown,
		) => Effect.Effect<void, never, never>;
		readonly error: (
			message: string,
			error?: unknown,
		) => Effect.Effect<void, never, never>;
	}
>()("@tauri-link/Logger") {}

/**
 * Console-based logger implementation.
 */
export const ConsoleLoggerLive = Layer.succeed(
	Logger,
	Logger.of({
		log: (message: string, data?: unknown) =>
			Effect.sync(() => {
				if (data !== undefined) {
					console.log(message, data);
				} else {
					console.log(message);
				}
			}),
		error: (message: string, error?: unknown) =>
			Effect.sync(() => {
				if (error !== undefined) {
					console.error(message, error);
				} else {
					console.error(message);
				}
			}),
	}),
);

/**
 * No-op logger implementation for testing or production.
 */
export const NoopLoggerLive = Layer.succeed(
	Logger,
	Logger.of({
		log: () => Effect.void,
		error: () => Effect.void,
	}),
);
