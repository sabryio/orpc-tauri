import type { Channel } from "@tauri-apps/api/core";
import { Effect, Exit, Layer, Stream } from "effect";
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
		it("does not unregister on success — Tauri's own `{end}` envelope owns that cleanup", async () => {
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

			// Simulate a Rust envelope arriving AFTER teardown (the `{end}`
			// envelope's trailing data can still land): the finalizer's no-op
			// onmessage must swallow it — no onProgress, no yields.
			mockChannel.onmessage?.({ comment: "progress:99/100" });

			expect(Array.from(results)).toEqual(["chunk"]);
			expect(progress).toEqual([]);

			// Success exit: Tauri sends `{ end: true }` when the backend's last
			// Channel clone drops, and the JS Channel unregisters itself then.
			// Unregistering here first makes Tauri warn
			// `Couldn't find callback id` on every normal completion.
			expect(cleanupCalled).toBe(false);
		});

		it("unregisters the IPC callback on abnormal exit (no `end` can come)", async () => {
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

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>() =>
						Effect.sync(() => {
							// Rust emits one chunk, then the command fails — the
							// stream fails, no `done`/`end` follows.
							mockChannel.onmessage?.({ event: "message", data: "chunk" });
							mockChannel.onmessage?.({ event: "error", error: "boom" });
							return null as T;
						}),
				}),
			);

			const stream = createChannelStream<string>("test_command", {}, "onEvent");

			const exit = await Effect.runPromiseExit(
				stream.pipe(
					Stream.runCollect,
					Effect.provide(Layer.mergeAll(mockFactory, mockInvoker)),
					Effect.scoped,
				),
			);

			expect(Exit.isFailure(exit)).toBe(true);

			// Abnormal exit: Rust is still holding its channel clone — no `{end}`
			// envelope will ever arrive — so the finalizer must unregister now.
			expect(cleanupCalled).toBe(true);
		});
	});

	describe("rust resources (tauri.resource)", () => {
		interface CloseCall {
			command: string;
			args?: Record<string, unknown>;
		}

		const makeChannel = () =>
			({
				onmessage: null as ((msg: unknown) => void) | null,
			}) as unknown as Channel<unknown>;

		const runStream = async (
			channel: Channel<unknown>,
			invokeScript: (command: string) => void,
			resource?: { readonly autoClose?: boolean },
		): Promise<{ closes: CloseCall[] }> => {
			const closes: CloseCall[] = [];

			const mockFactory = Layer.succeed(
				TauriChannelFactory,
				TauriChannelFactory.of({
					createChannel: () => Effect.succeed(channel),
				}),
			);

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>(command: string, args?: Record<string, unknown>) => {
						if (command === "plugin:resources|close") {
							closes.push({ command, args });
							return Effect.succeed(null as T);
						}
						invokeScript(command);
						return Effect.succeed(null as T);
					},
				}),
			);

			const stream = createChannelStream<string>(
				"test_command",
				{},
				"onEvent",
				undefined,
				undefined,
				resource,
			);

			await Effect.runPromiseExit(
				stream.pipe(
					Stream.runCollect,
					Effect.provide(Layer.mergeAll(mockFactory, mockInvoker)),
					Effect.scoped,
				),
			);

			return { closes };
		};

		it("closes the announced rid when the stream fails", async () => {
			const channel = makeChannel();
			const { closes } = await runStream(channel, () => {
				channel.onmessage?.({ comment: "handle:42" });
				channel.onmessage?.({ event: "error", error: new Error("boom") });
			});

			expect(closes).toEqual([
				{ command: "plugin:resources|close", args: { rid: 42 } },
			]);
		});

		it("never closes on normal completion (done) — Rust owns its lifecycle", async () => {
			const channel = makeChannel();
			const { closes } = await runStream(channel, () => {
				channel.onmessage?.({ comment: "handle:42" });
				channel.onmessage?.({ event: "message", data: "chunk" });
				channel.onmessage?.({ event: "done" });
			});

			expect(closes).toEqual([]);
		});

		it("first announcement wins (duplicates ignored)", async () => {
			const channel = makeChannel();
			const { closes } = await runStream(channel, () => {
				channel.onmessage?.({ comment: "handle:42" });
				channel.onmessage?.({ comment: "handle:99" });
				channel.onmessage?.({ event: "error", error: new Error("boom") });
			});

			expect(closes).toEqual([
				{ command: "plugin:resources|close", args: { rid: 42 } },
			]);
		});

		it("autoClose: false keeps the resource fully manual", async () => {
			const channel = makeChannel();
			const { closes } = await runStream(
				channel,
				() => {
					channel.onmessage?.({ comment: "handle:42" });
					channel.onmessage?.({ event: "error", error: new Error("boom") });
				},
				{ autoClose: false },
			);

			expect(closes).toEqual([]);
		});

		it("no handle announcement → close never invoked (backward compatible)", async () => {
			const channel = makeChannel();
			const { closes } = await runStream(channel, () => {
				channel.onmessage?.({ event: "error", error: new Error("boom") });
			});

			expect(closes).toEqual([]);
		});
	});
});
