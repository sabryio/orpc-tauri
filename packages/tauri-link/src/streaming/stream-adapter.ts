import { Context, Stream } from "effect";
import { toORPCError } from "../error-converter";

/**
 * Converts an Effect.Stream into an AsyncIterableIterator for the public API.
 *
 * This adapter bridges Effect's streaming primitives to the Promise-based
 * AsyncIterableIterator interface expected by oRPC clients.
 *
 * The stream must have all its service dependencies already provided (R = never).
 *
 * Boundary error conversion: stream failures are mapped through `toORPCError`
 * at this edge — internal typed errors (StreamError, TimeoutError, unknown
 * causes) surface to consumers as ORPCError, consistent with unary calls.
 *
 * @param stream - The Effect.Stream to convert (with all services provided)
 * @returns AsyncIterableIterator that yields stream values
 */
export async function* streamToAsyncIterator<T, E>(
	stream: Stream.Stream<T, E, never>,
): AsyncIterableIterator<T> {
	// Convert stream to ReadableStream (no services needed since R = never)
	const readableStream = Stream.toReadableStreamWith(stream, Context.empty());

	// Get the reader
	const reader = readableStream.getReader();
	let finished = false;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			yield value;
		}
		finished = true;
	} catch (error) {
		throw toORPCError(error);
	} finally {
		// Consumer exited without completion (break / .return()): cancel the
		// readable stream so the Effect stream's Scope tears down — which is
		// what unlistens listeners, unregisters channels, and (for
		// resource-backed streams) closes the announced Rust resource.
		// Completed streams just release the lock.
		if (!finished) {
			reader.cancel().catch(() => {});
		} else {
			reader.releaseLock();
		}
	}
}
