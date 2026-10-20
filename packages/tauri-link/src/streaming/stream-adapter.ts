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

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			yield value;
		}
	} catch (error) {
		throw toORPCError(error);
	} finally {
		reader.releaseLock();
	}
}
