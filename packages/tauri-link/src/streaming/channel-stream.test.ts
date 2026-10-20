import type { Channel } from "@tauri-apps/api/core";
import { Effect, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { TauriChannelFactory } from "../services/channel-factory";
import { TauriInvoker } from "../services/invoker";
import { createChannelStream } from "./channel-stream";
import type { ProgressInfo } from "./progress-types";

describe("createChannelStream", () => {
	it("should emit messages from channel", async () => {
		const mockChannel = {
			onmessage: null as ((msg: unknown) => void) | null,
		} as unknown as Channel<unknown>;

		const mockFactory = Layer.succeed(
			TauriChannelFactory,
			TauriChannelFactory.of({
				createChannel: () => Effect.succeed(mockChannel),
			}),
		);

		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: <T>() =>
					Effect.sync(() => {
						// Simulate channel messages
						if (mockChannel.onmessage) {
							mockChannel.onmessage({ event: "message", data: "msg-1" });
							mockChannel.onmessage({ event: "message", data: "msg-2" });
							mockChannel.onmessage({ event: "done" });
						}
						return null as T;
					}),
			}),
		);

		const stream = createChannelStream<string>("test_command", {}, "onEvent");

		const results = await Effect.runPromise(
			stream.pipe(
				Stream.runCollect,
				Effect.provide(Layer.mergeAll(mockFactory, mockInvoker)),
				Effect.scoped,
			),
		);

		expect(Array.from(results)).toEqual(["msg-1", "msg-2"]);
	});

	it("should fail stream on error event", async () => {
		const mockChannel = {
			onmessage: null as ((msg: unknown) => void) | null,
		} as unknown as Channel<unknown>;

		const mockFactory = Layer.succeed(
			TauriChannelFactory,
			TauriChannelFactory.of({
				createChannel: () => Effect.succeed(mockChannel),
			}),
		);

		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: <T>() =>
					Effect.sync(() => {
						if (mockChannel.onmessage) {
							mockChannel.onmessage({
								event: "error",
								error: new Error("Channel error"),
							});
						}
						return null as T;
					}),
			}),
		);

		const stream = createChannelStream<string>("test_command", {}, "onEvent");

		const result = await Effect.runPromiseExit(
			stream.pipe(
				Stream.runCollect,
				Effect.provide(Layer.mergeAll(mockFactory, mockInvoker)),
				Effect.scoped,
			),
		);

		expect(result._tag).toBe("Failure");
	});

	it("should pass channel as parameter to invoke", async () => {
		const mockChannel = {
			onmessage: null as ((msg: unknown) => void) | null,
		} as unknown as Channel<unknown>;

		let capturedArgs: Record<string, unknown> = {};

		const mockFactory = Layer.succeed(
			TauriChannelFactory,
			TauriChannelFactory.of({
				createChannel: () => Effect.succeed(mockChannel),
			}),
		);

		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: <T>(_command: string, args?: Record<string, unknown>) => {
					capturedArgs = args ?? {};
					return Effect.sync(() => {
						if (mockChannel.onmessage) {
							mockChannel.onmessage({ event: "done" });
						}
						return null as T;
					});
				},
			}),
		);

		const stream = createChannelStream<string>(
			"stream_cmd",
			{ input: "value" },
			"channelParam",
		);

		await Effect.runPromise(
			stream.pipe(
				Stream.runCollect,
				Effect.provide(Layer.mergeAll(mockFactory, mockInvoker)),
				Effect.scoped,
			),
		);

		expect(capturedArgs).toHaveProperty("input", "value");
		expect(capturedArgs).toHaveProperty("channelParam", mockChannel);
	});

	it("should handle different payload types", async () => {
		const mockChannel = {
			onmessage: null as ((msg: unknown) => void) | null,
		} as unknown as Channel<unknown>;

		const mockFactory = Layer.succeed(
			TauriChannelFactory,
			TauriChannelFactory.of({
				createChannel: () => Effect.succeed(mockChannel),
			}),
		);

		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: <T>() =>
					Effect.sync(() => {
						if (mockChannel.onmessage) {
							mockChannel.onmessage({ event: "message", data: { id: 1 } });
							mockChannel.onmessage({ event: "message", data: { id: 2 } });
							mockChannel.onmessage({ event: "done" });
						}
						return null as T;
					}),
			}),
		);

		const stream = createChannelStream<{ id: number }>(
			"test_command",
			{},
			"onEvent",
		);

		const results = await Effect.runPromise(
			stream.pipe(
				Stream.runCollect,
				Effect.provide(Layer.mergeAll(mockFactory, mockInvoker)),
				Effect.scoped,
			),
		);

		expect(Array.from(results)).toEqual([{ id: 1 }, { id: 2 }]);
	});

	describe("progress envelopes", () => {
		it("fires onProgress for progress envelopes without yielding them", async () => {
			const mockChannel = {
				onmessage: null as ((msg: unknown) => void) | null,
			} as unknown as Channel<unknown>;

			const mockFactory = Layer.succeed(
				TauriChannelFactory,
				TauriChannelFactory.of({
					createChannel: () => Effect.succeed(mockChannel),
				}),
			);

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>() =>
						Effect.sync(() => {
							if (mockChannel.onmessage) {
								mockChannel.onmessage({ event: "message", data: "chunk-1" });
								mockChannel.onmessage({ comment: "progress:50/100" });
								mockChannel.onmessage({ comment: "flush" });
								mockChannel.onmessage({ event: "message", data: "chunk-2" });
								mockChannel.onmessage({ event: "done" });
							}
							return null as T;
						}),
				}),
			);

			const progress: ProgressInfo[] = [];

			const stream = createChannelStream<string>(
				"test_command",
				{},
				"onEvent",
				(info) => progress.push(info),
			);

			const results = await Effect.runPromise(
				stream.pipe(
					Stream.runCollect,
					Effect.provide(Layer.mergeAll(mockFactory, mockInvoker)),
					Effect.scoped,
				),
			);

			// Progress envelopes must never reach the consumer's payload stream
			expect(Array.from(results)).toEqual(["chunk-1", "chunk-2"]);
			expect(progress).toEqual([
				{ bytesTransferred: 50, totalBytes: 100, percentage: 50 },
			]);
		});

		it("ignores malformed progress envelopes silently", async () => {
			const mockChannel = {
				onmessage: null as ((msg: unknown) => void) | null,
			} as unknown as Channel<unknown>;

			const mockFactory = Layer.succeed(
				TauriChannelFactory,
				TauriChannelFactory.of({
					createChannel: () => Effect.succeed(mockChannel),
				}),
			);

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>() =>
						Effect.sync(() => {
							if (mockChannel.onmessage) {
								mockChannel.onmessage({ comment: "progress:abc" });
								mockChannel.onmessage({ comment: "progress:-5/100" });
								mockChannel.onmessage({ event: "message", data: "chunk" });
								mockChannel.onmessage({ event: "done" });
							}
							return null as T;
						}),
				}),
			);

			const progress: ProgressInfo[] = [];

			const stream = createChannelStream<string>(
				"test_command",
				{},
				"onEvent",
				(info) => progress.push(info),
			);

			const results = await Effect.runPromise(
				stream.pipe(
					Stream.runCollect,
					Effect.provide(Layer.mergeAll(mockFactory, mockInvoker)),
					Effect.scoped,
				),
			);

			expect(Array.from(results)).toEqual(["chunk"]);
			expect(progress).toEqual([]);
		});

		it("honors a custom progress parser (procedure-level convention)", async () => {
			const mockChannel = {
				onmessage: null as ((msg: unknown) => void) | null,
			} as unknown as Channel<unknown>;

			const mockFactory = Layer.succeed(
				TauriChannelFactory,
				TauriChannelFactory.of({
					createChannel: () => Effect.succeed(mockChannel),
				}),
			);

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>() =>
						Effect.sync(() => {
							if (mockChannel.onmessage) {
								mockChannel.onmessage({ comment: "pct:40/80" });
								mockChannel.onmessage({ comment: "progress:1/2" });
								mockChannel.onmessage({ comment: "tick:xx" });
								mockChannel.onmessage({ event: "message", data: "chunk" });
								mockChannel.onmessage({ event: "done" });
							}
							return null as T;
						}),
				}),
			);

			const progress: ProgressInfo[] = [];

			const stream = createChannelStream<string>(
				"test_command",
				{},
				"onEvent",
				(info) => progress.push(info),
				(comment) => {
					const m = /^pct:(\d+)\/(\d+)$/.exec(comment);
					return m
						? {
								bytesTransferred: Number(m[1]),
								totalBytes: Number(m[2]),
								percentage: Math.round((Number(m[1]) / Number(m[2])) * 100),
							}
						: undefined;
				},
			);

			const results = await Effect.runPromise(
				stream.pipe(
					Stream.runCollect,
					Effect.provide(Layer.mergeAll(mockFactory, mockInvoker)),
					Effect.scoped,
				),
			);

			// Custom parser owns recognition: built-in prefix ignored, unmatched
			// comments swallowed, payload stream untouched.
			expect(Array.from(results)).toEqual(["chunk"]);
			expect(progress).toEqual([
				{ bytesTransferred: 40, totalBytes: 80, percentage: 50 },
			]);
		});
		it("tears the channel pipeline down when the stream exits (cancellation safety)", async () => {
			const mockChannel = {
				onmessage: null as ((msg: unknown) => void) | null,
				cleanupCallback: () => {
					cleanupCalled = true;
				},
			} as unknown as Channel<unknown>;

			let cleanupCalled = false;

			const mockFactory = Layer.succeed(
				TauriChannelFactory,
				TauriChannelFactory.of({
					createChannel: () => Effect.succeed(mockChannel),
				}),
			);

			const progress: ProgressInfo[] = [];

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>() =>
						Effect.sync(() => {
							mockChannel.onmessage?.({ event: "message", data: "chunk" });
							mockChannel.onmessage?.({ event: "done" });
							return null as T;
						}),
				}),
			);

			const stream = createChannelStream<string>(
				"test_command",
				{},
				"onEvent",
				(info) => progress.push(info),
			);

			const results = await Effect.runPromise(
				stream.pipe(
					Stream.runCollect,
					Effect.provide(Layer.mergeAll(mockFactory, mockInvoker)),
					Effect.scoped,
				),
			);

			// Simulate a Rust envelope arriving AFTER teardown (e.g. the backend
			// keeps emitting for a cancelled stream): the finalizer's no-op
			// onmessage must swallow it — no onProgress, no yields.
			mockChannel.onmessage?.({ comment: "progress:99/100" });

			expect(Array.from(results)).toEqual(["chunk"]);
			expect(progress).toEqual([]);
			expect(cleanupCalled).toBe(true);
		});
	});
});
