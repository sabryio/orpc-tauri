import type { Channel } from "@tauri-apps/api/core";
import { Effect, Exit, Layer, Stream } from "effect";
import { describe, expect, it, vi } from "vitest";
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
		it("hands the IPC callback to Tauri's `{end}` cleanup on success (no eager unregister)", async () => {
			// Fake ONLY the timers our teardown uses — faking every timer
			// starves Effect's async runtime (it schedules with setImmediate).
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				const mockChannel = {
					onmessage: null as ((msg: unknown) => void) | null,
					cleanupCallback: vi.fn(() => {
						cleanupCalls++;
					}),
				} as unknown as Channel<unknown>;

				let cleanupCalls = 0;

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

				// Simulate a Rust envelope arriving AFTER teardown: the finalizer's
				// no-op onmessage must swallow it — no onProgress, no yields.
				mockChannel.onmessage?.({ comment: "progress:99/100" });

				expect(Array.from(results)).toEqual(["chunk"]);
				expect(progress).toEqual([]);

				// Success exit: never unregistered eagerly — Tauri sends
				// `{ end: true }` when the backend's last Channel clone drops and
				// the JS Channel unregisters itself (eager unregister made Tauri
				// warn `Couldn't find callback id` on every completion).
				expect(cleanupCalls).toBe(0);

				// `{end}` arrives → Tauri's own cleanup runs (routed through the
				// link's once-guard) and cancels the grace timer.
				(mockChannel as any).cleanupCallback?.();
				expect(cleanupCalls).toBe(1);
				await vi.advanceTimersByTimeAsync(10_001);
				expect(cleanupCalls).toBe(1);
			} finally {
				vi.useRealTimers();
			}
		});

		it("unregisters via the grace timer on abnormal exit (no `{end}` can come)", async () => {
			// Fake ONLY the timers our teardown uses — faking every timer
			// starves Effect's async runtime (it schedules with setImmediate).
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				const mockChannel = {
					onmessage: null as ((msg: unknown) => void) | null,
					cleanupCallback: vi.fn(() => {
						cleanupCalls++;
					}),
				} as unknown as Channel<unknown>;

				let cleanupCalls = 0;

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
								// Backend emits one chunk, then the command fails — the
								// stream fails and no `done`/`end` would ever follow.
								mockChannel.onmessage?.({ event: "message", data: "chunk" });
								mockChannel.onmessage?.({ event: "error", error: "boom" });
								return null as T;
							}),
					}),
				);

				const stream = createChannelStream<string>(
					"test_command",
					{},
					"onEvent",
				);

				const exit = await Effect.runPromiseExit(
					stream.pipe(
						Stream.runCollect,
						Effect.provide(Layer.mergeAll(mockFactory, mockInvoker)),
						Effect.scoped,
					),
				);

				expect(Exit.isFailure(exit)).toBe(true);

				// Abnormal exit: callback left registered — a well-behaved backend
				// stops and drops its channel clone, its `{end}` then unregisters
				// cleanly. The grace timer is the leak bound for hung backends.
				expect(cleanupCalls).toBe(0);
				await vi.advanceTimersByTimeAsync(10_001);
				expect(cleanupCalls).toBe(1);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe("rust resources (handle:<rid> envelope — tauri.resource() meta optional)", () => {
		// NOTE: `resource` (the link-level config that meta.tauri.resource()
		// resolves to) is NOT passed in the default tests here on purpose:
		// detection is envelope-driven. Any backend that emits the data-less
		// `handle:<rid>` comment envelope gets auto-closed on abnormal exits
		// WITHOUT declaring tauri.resource() in the contract; the meta exists
		// only for the `autoClose: false` opt-out and contract documentation.
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

	describe("raw binary payloads (Channel<InvokeResponseBody>)", () => {
		it("yields ArrayBuffers as-is while JSON control envelopes keep parsing", async () => {
			const mockChannel = {
				onmessage: null as ((msg: unknown) => void) | null,
			} as unknown as Channel<unknown>;

			const chunk1 = new Uint8Array([7, 8, 9, 10]).buffer as ArrayBuffer;
			const chunk2 = new Uint8Array([11, 12]).buffer as ArrayBuffer;

			const closes: number[] = [];
			const mockFactory = Layer.succeed(
				TauriChannelFactory,
				TauriChannelFactory.of({
					createChannel: () => Effect.succeed(mockChannel),
				}),
			);

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>(command: string, args?: Record<string, unknown>) => {
						if (command === "plugin:resources|close") {
							closes.push(args?.rid as number);
							return Effect.succeed(null as T);
						}
						if (mockChannel.onmessage) {
							// Raw chunk — arrives as the decoded ArrayBuffer.
							mockChannel.onmessage(chunk1);
							// Control envelopes stay JSON objects.
							mockChannel.onmessage({ comment: "progress:64/128" });
							mockChannel.onmessage({ comment: "handle:9" });
							mockChannel.onmessage(chunk2);
							mockChannel.onmessage({ event: "done" });
						}
						return Effect.succeed(null as T);
					},
				}),
			);

			const progress: ProgressInfo[] = [];

			const stream = createChannelStream<ArrayBuffer>(
				"raw_command",
				{},
				"onEvent",
				(info) => progress.push(info),
				undefined,
				{ autoClose: true },
			);

			const results = await Effect.runPromise(
				stream.pipe(
					Stream.runCollect,
					Effect.provide(Layer.mergeAll(mockFactory, mockInvoker)),
					Effect.scoped,
				),
			);

			// Payloads yield the exact ArrayBuffer instances — no JSON round-trip.
			expect(Array.from(results)).toEqual([chunk1, chunk2]);
			// Control envelopes (progress, handle announcement) still parse.
			expect(progress).toEqual([
				{ bytesTransferred: 64, totalBytes: 128, percentage: 50 },
			]);
			expect(closes).toEqual([]);
		});

		it("an ArrayBuffer never masquerades as an SSE envelope", async () => {
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
							// Raw bytes even spelling "done" are still bytes — they
							// must yield, never terminate the stream.
							mockChannel.onmessage(
								new Uint8Array([100, 111, 110, 101]).buffer as ArrayBuffer,
							);
							mockChannel.onmessage(new ArrayBuffer(0));
							mockChannel.onmessage({ event: "done" });
							return null as T;
						}),
				}),
			);

			const stream = createChannelStream<ArrayBuffer>(
				"raw_command",
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

			expect(Array.from(results).length).toBe(2);
		});
	});
});
