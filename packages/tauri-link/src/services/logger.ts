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

/**
 * Simple logger interface for users who don't want to use Effect.
 */
export interface SimpleLogger {
	log(message: string, data?: unknown): void;
	error(message: string, error?: unknown): void;
}

/**
 * Console-based simple logger.
 */
export class ConsoleLogger implements SimpleLogger {
	log(message: string, data?: unknown): void {
		if (data !== undefined) {
			console.log(message, data);
		} else {
			console.log(message);
		}
	}

	error(message: string, error?: unknown): void {
		if (error !== undefined) {
			console.error(message, error);
		} else {
			console.error(message);
		}
	}
}

/**
 * No-op simple logger.
 */
export class NoopLogger implements SimpleLogger {
	log(): void {}
	error(): void {}
}

/**
 * Convert a simple logger class/object to an Effect Layer.
 */
export function fromSimpleLogger(logger: SimpleLogger): Layer.Layer<Logger> {
	return Layer.succeed(
		Logger,
		Logger.of({
			log: (message: string, data?: unknown) =>
				Effect.sync(() => logger.log(message, data)),
			error: (message: string, error?: unknown) =>
				Effect.sync(() => logger.error(message, error)),
		}),
	);
}
