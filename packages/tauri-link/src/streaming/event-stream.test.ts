import { Effect, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { TauriInvoker } from "../services/invoker";
import { TauriListener } from "../services/listener";
import { createEventStream, type EventStreamConfig } from "./event-stream";
import { EVENT_META_SYMBOL, type SseEvent } from "./sse-types";

describe("createEventStream", () => {
	it("should emit data events from the stream", async () => {
		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: <T>() => Effect.succeed(null as T),
			}),
		);

		const mockListener = Layer.succeed(
			TauriListener,
			TauriListener.of({
				listen: <T>(_event: string, handler: (payload: T) => void) =>
					Effect.sync(() => {
						// Simulate SSE events being emitted
						if (_event.includes("data")) {
							handler({ event: "message", data: "message-1" } as T);
							handler({ event: "message", data: "message-2" } as T);
						} else if (_event.includes("done")) {
							handler({} as T);
						}
					}),
			}),
		);

		const config: EventStreamConfig = {
			streamId: () => "stream-123",
			getEventNames: (id) => ({
				data: `${id}:data`,
				error: `${id}:error`,
				done: `${id}:done`,
			}),
		};

		const stream = createEventStream<string>("test_command", { foo: "bar" }, config);

		const results = await Effect.runPromise(
			stream.pipe(
				Stream.runCollect,
				Effect.provide(mockInvoker),
				Effect.provide(mockListener),
				Effect.scoped,
			),
		);

		expect(Array.from(results)).toEqual(["message-1", "message-2"]);
	});

	it("should emit error and terminate stream on error event", async () => {
		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: <T>() => Effect.succeed(null as T),
			}),
		);

		const mockListener = Layer.succeed(
			TauriListener,
			TauriListener.of({
				listen: <T>(_event: string, handler: (payload: T) => void) =>
					Effect.sync(() => {
						// Simulate error event
						// Note: handler receives the payload directly
						if (_event.includes("error")) {
							handler(new Error("Stream failed") as T);
						}
					}),
			}),
		);

		const config: EventStreamConfig = {
			streamId: () => "stream-456",
			getEventNames: (id) => ({
				data: `${id}:data`,
				error: `${id}:error`,
				done: `${id}:done`,
			}),
		};

		const stream = createEventStream<string>("test_command", {}, config);

		const result = await Effect.runPromiseExit(
			stream.pipe(
				Stream.runCollect,
				Effect.provide(mockInvoker),
				Effect.provide(mockListener),
				Effect.scoped,
			),
		);

		expect(result._tag).toBe("Failure");
	});

	it("should complete stream on done event", async () => {
		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: <T>() => Effect.succeed(null as T),
			}),
		);

		const mockListener = Layer.succeed(
			TauriListener,
			TauriListener.of({
				listen: <T>(_event: string, handler: (payload: T) => void) =>
					Effect.sync(() => {
						if (_event.includes("data")) {
							handler({ event: "message", data: "first" } as T);
						} else if (_event.includes("done")) {
							// Simulate done event
							handler({} as T);
						}
					}),
			}),
		);

		const config: EventStreamConfig = {
			streamId: () => "stream-789",
			getEventNames: (id) => ({
				data: `${id}:data`,
				error: `${id}:error`,
				done: `${id}:done`,
			}),
		};

		const stream = createEventStream<string>("test_command", {}, config);

		const results = await Effect.runPromise(
			stream.pipe(
				Stream.runCollect,
				Effect.provide(mockInvoker),
				Effect.provide(mockListener),
				Effect.scoped,
			),
		);

		expect(Array.from(results)).toEqual(["first"]);
	});

	it("should pass streamId and eventNames to invoke", async () => {
		let capturedArgs: Record<string, unknown> = {};

		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: <T>(_command: string, args?: Record<string, unknown>) => {
					capturedArgs = args ?? {};
					return Effect.succeed(null as T);
				},
			}),
		);

		const mockListener = Layer.succeed(
			TauriListener,
			TauriListener.of({
				listen: <T>(_event: string, handler: (payload: T) => void) =>
					Effect.sync(() => {
						// Emit SSE events
						if (_event.includes("data")) {
							handler({ event: "message", data: { data: "test-data" } } as T);
						} else if (_event.includes("done")) {
							handler({} as T);
						}
					}),
			}),
		);

		const config: EventStreamConfig = {
			streamId: () => "unique-123",
			getEventNames: (id) => ({
				data: `${id}:data`,
				error: `${id}:error`,
				done: `${id}:done`,
			}),
		};

		const stream = createEventStream<string>(
			"stream_command",
			{ input: "test" },
			config,
		);

		await Effect.runPromise(
			stream.pipe(
				Stream.runCollect,
				Effect.provide(mockInvoker),
				Effect.provide(mockListener),
				Effect.scoped,
			),
		);

		expect(capturedArgs).toHaveProperty("input", "test");
		expect(capturedArgs).toHaveProperty("streamId", "unique-123");
		expect(capturedArgs).toHaveProperty("eventNames");
	});

	it("should preserve SSE metadata on emitted events", async () => {
		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: <T>() => Effect.succeed(null as T),
			}),
		);

		const mockListener = Layer.succeed(
			TauriListener,
			TauriListener.of({
				listen: <T>(_event: string, handler: (payload: T) => void) =>
					Effect.sync(() => {
						if (_event.includes("data")) {
							// Simulate SSE event with metadata
							// Use object payload (metadata only attaches to objects, not primitives)
							const sseEvent: SseEvent<{ message: string }> = {
								event: "message",
								id: "event-42",
								retry: 3000,
								data: { message: "data-with-meta" },
							};
							handler(sseEvent as T);
						} else if (_event.includes("done")) {
							handler({} as T);
						}
					}),
			}),
		);

		const config: EventStreamConfig = {
			streamId: () => "stream-meta",
			getEventNames: (id) => ({
				data: `${id}:data`,
				error: `${id}:error`,
				done: `${id}:done`,
			}),
		};

		const stream = createEventStream<{ message: string }>(
			"test_command",
			{},
			config,
		);

		const results = await Effect.runPromise(
			stream.pipe(
				Stream.runCollect,
				Effect.provide(mockInvoker),
				Effect.provide(mockListener),
				Effect.scoped,
			),
		);

		const events = Array.from(results);
		expect(events).toHaveLength(1);

		// Stream extracts sseEvent.data (object payload)
		const value = events[0];
		if (!value) throw new Error("Expected value");
		expect(value.message).toBe("data-with-meta");

		// Check that metadata symbol is attached (old implementation behavior)
		const meta = (value as any)[EVENT_META_SYMBOL];
		expect(meta).toBeDefined();
		expect(meta.id).toBe("event-42");
		expect(meta.retry).toBe(3000);
	});
});
