import { Context, Stream } from "effect";

/**
 * Converts an Effect.Stream into an AsyncIterableIterator for the public API.
 *
 * This adapter bridges Effect's streaming primitives to the Promise-based
 * AsyncIterableIterator interface expected by oRPC clients.
 *
 * The stream must have all its service dependencies already provided (R = never).
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
	} finally {
		reader.releaseLock();
	}
}
