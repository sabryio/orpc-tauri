import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { TauriInvokeError } from "./errors";
import { EffectTauriLink } from "./link";
import { TauriChannelFactory } from "./services/channel-factory";
import { TauriInvoker } from "./services/invoker";
import { TauriListener } from "./services/listener";

describe("EffectTauriLink", () => {
	describe("call", () => {
		it("should execute a unary command", async () => {
			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>() => Effect.succeed({ name: "Alice" } as T),
				}),
			);

			const result = await Effect.runPromise(
				EffectTauriLink.call<{ id: number }, { name: string }>("get_user", {
					id: 123,
				}).pipe(Effect.provide(mockInvoker)),
			);

			expect(result).toEqual({ name: "Alice" });
		});

		it("should propagate command errors", async () => {
			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: () =>
						Effect.fail(
							new TauriInvokeError({
								command: "fail_command",
								input: {},
								cause: new Error("Command failed"),
							}),
						),
				}),
			);

			const result = await Effect.runPromiseExit(
				EffectTauriLink.call("fail_command", {}).pipe(
					Effect.provide(mockInvoker),
				),
			);

			expect(result._tag).toBe("Failure");
		});

		it("forwards args untouched to the invoker (context rides inside args at the public API)", async () => {
			let captured: Record<string, unknown> | undefined;
			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>(_command: string, args?: Record<string, unknown>) => {
						captured = args;
						return Effect.succeed(null as T);
					},
				}),
			);

			await Effect.runPromise(
				EffectTauriLink.call("trace_command", { id: 7 }).pipe(
					Effect.provide(mockInvoker),
				),
			);

			// At this raw-driver level args pass through as-is; the reserved
			// `context` key is injected one layer up, in the public API.
			expect(captured).toEqual({ id: 7 });
		});
	});

	describe("stream", () => {
		it("should create event stream without errors", () => {
			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>() => Effect.succeed(null as T),
				}),
			);

			const mockListener = Layer.succeed(
				TauriListener,
				TauriListener.of({
					listen: () => Effect.void,
				}),
			);

			const mockChannelFactory = Layer.succeed(
				TauriChannelFactory,
				TauriChannelFactory.of({
					createChannel: <T>() =>
						Effect.succeed({ onmessage: null } as unknown as T),
				}),
			);

			const mockLayer = Layer.mergeAll(
				mockInvoker,
				mockListener,
				mockChannelFactory,
			);

			const stream = EffectTauriLink.stream<unknown, string>(
				"stream_command",
				{},
				{
					mode: "listen",
					listenConfig: {
						streamId: () => "test-123",
						getEventNames: (id: string) => ({
							data: `${id}:data`,
							error: `${id}:error`,
							done: `${id}:done`,
						}),
					},
				},
				mockLayer,
			);

			// Just verify the stream generator was created
			expect(stream).toBeDefined();
			expect(typeof stream[Symbol.asyncIterator]).toBe("function");
		});

		it("fires the inactivity timeout when no values arrive in time", async () => {
			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					// The forked invoke never sends channel messages
					invoke: <T>() => Effect.never as unknown as Effect.Effect<T>,
				}),
			);

			const mockListener = Layer.succeed(
				TauriListener,
				TauriListener.of({
					listen: () => Effect.void,
				}),
			);

			const mockChannelFactory = Layer.succeed(
				TauriChannelFactory,
				TauriChannelFactory.of({
					createChannel: <T>() =>
						Effect.succeed({ onmessage: null } as unknown as T),
				}),
			);

			const mockLayer = Layer.mergeAll(
				mockInvoker,
				mockListener,
				mockChannelFactory,
			);

			const iterator = EffectTauriLink.stream<unknown, string>(
				"silent_command",
				{},
				{
					mode: "channel",
					channelParam: "onEvent",
					timeoutMs: 30,
				},
				mockLayer,
			);

			await expect(iterator.next()).rejects.toMatchObject({
				code: "TIMEOUT",
				message: "silent_command timed out after 30ms",
				data: { operation: "silent_command", timeout: 30 },
			});
			await iterator.return?.();
		});

		it("interrupts the stream and rejects when the AbortSignal fires mid-stream", async () => {
			const mockChannel = {
				onmessage: null as ((msg: unknown) => void) | null,
			};

			const invocations: { command: string; args?: Record<string, unknown> }[] =
				[];

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>(command: string, args?: Record<string, unknown>) =>
						// Emit the resource announcement + one message, then go silent
						// forever (simulating an ongoing command the consumer cancels)
						Effect.sync(() => {
							invocations.push({ command, args });
							if (command === "streamy_command") {
								mockChannel.onmessage?.({ comment: "handle:77" });
								mockChannel.onmessage?.({ event: "message", data: "chunk-1" });
							}
							return null as T;
						}) as unknown as Effect.Effect<T>,
				}),
			);

			const mockListener = Layer.succeed(
				TauriListener,
				TauriListener.of({
					listen: () => Effect.void,
				}),
			);

			const mockChannelFactory = Layer.succeed(
				TauriChannelFactory,
				TauriChannelFactory.of({
					createChannel: <T>() => Effect.succeed(mockChannel as unknown as T),
				}),
			);

			const mockLayer = Layer.mergeAll(
				mockInvoker,
				mockListener,
				mockChannelFactory,
			);

			const controller = new AbortController();

			const iterator = EffectTauriLink.stream<unknown, string>(
				"streamy_command",
				{},
				{
					mode: "channel",
					channelParam: "onEvent",
					signal: controller.signal,
					resource: { autoClose: true },
				},
				mockLayer,
			);

			// First pull succeeds (starts the scope, forks the watcher)
			expect(await iterator.next()).toMatchObject({ value: "chunk-1" });

			// Cancel midstream — the next pull must fail promptly
			controller.abort();

			await expect(iterator.next()).rejects.toMatchObject({
				code: "CLIENT_CLOSED_REQUEST",
				message: "Request aborted",
			});

			// Give the Scope finalizer a tick to run the resource close
			await new Promise((resolve) => setTimeout(resolve, 0));

			// Consumer abort ⇒ server-side teardown: the rid announced via
			// `handle:77` was closed through the Tauri resource protocol
			expect(invocations).toContainEqual({
				command: "plugin:resources|close",
				args: { rid: 77 },
			});

			// Subsequent pulls see a dead stream (done — not hung)
			await expect(iterator.next()).resolves.toMatchObject({ done: true });
		});

		it("closes the announced resource when the consumer exits early (.return())", async () => {
			const mockChannel = {
				onmessage: null as ((msg: unknown) => void) | null,
			};

			const invocations: { command: string; args?: Record<string, unknown> }[] =
				[];

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>(command: string, args?: Record<string, unknown>) =>
						Effect.sync(() => {
							invocations.push({ command, args });
							if (command === "streamy_command") {
								mockChannel.onmessage?.({ comment: "handle:13" });
								mockChannel.onmessage?.({ event: "message", data: "chunk-1" });
								// Keep the stream fiber alive (like a real Rust worker):
								// late chunks arrive long after the consumer breaks out.
								setTimeout(() => {
									mockChannel.onmessage?.({
										event: "message",
										data: "chunk-2",
									});
									mockChannel.onmessage?.({ event: "done" });
								}, 500);
							}
							return null as T;
						}) as unknown as Effect.Effect<T>,
				}),
			);

			const mockListener = Layer.succeed(
				TauriListener,
				TauriListener.of({
					listen: () => Effect.void,
				}),
			);

			const mockChannelFactory = Layer.succeed(
				TauriChannelFactory,
				TauriChannelFactory.of({
					createChannel: <T>() => Effect.succeed(mockChannel as unknown as T),
				}),
			);

			const mockLayer = Layer.mergeAll(
				mockInvoker,
				mockListener,
				mockChannelFactory,
			);

			const iterator = EffectTauriLink.stream<unknown, string>(
				"streamy_command",
				{},
				{
					mode: "channel",
					channelParam: "onEvent",
					resource: { autoClose: true },
				},
				mockLayer,
			);

			// Consumer takes one value then breaks out of the for-await loop
			expect(await iterator.next()).toMatchObject({ value: "chunk-1" });
			await iterator.return?.();

			// reader.cancel() → scope teardown → finalizer runs asynchronously;
			// poll until the resource close lands
			await expect
				.poll(() => invocations.length > 1, { timeout: 2000 })
				.toBe(true);

			expect(invocations).toContainEqual({
				command: "plugin:resources|close",
				args: { rid: 13 },
			});
		});
	});

	describe("request context dispatch", () => {
		it("streams carry the reserved `context` key inside the invoke args", async () => {
			let captured: Record<string, unknown> | undefined;
			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>(_command: string, args?: Record<string, unknown>) => {
						captured = args;
						// Forked invoke runs to completion immediately
						return Effect.succeed(null as T);
					},
				}),
			);
			const mockListener = Layer.succeed(
				TauriListener,
				TauriListener.of({
					// Fire `done` as soon as the done listener is registered - the
					// stream completes immediately, so consumption ends naturally.
					listen: <T>(_event: string, handler: (payload: T) => void) =>
						Effect.sync(() => {
							if (_event.includes("done")) {
								setTimeout(() => handler({} as T), 1);
							}
							return Effect.void;
						}) as unknown as Effect.Effect<void>,
				}),
			);
			const mockChannelFactory = Layer.succeed(
				TauriChannelFactory,
				TauriChannelFactory.of({
					createChannel: <T>() =>
						Effect.succeed({ onmessage: null } as unknown as T),
				}),
			);
			const mockLayer = Layer.mergeAll(
				mockInvoker,
				mockListener,
				mockChannelFactory,
			);

			const iterator = EffectTauriLink.stream<unknown, string>(
				"trace_stream",
				// The public API injects the resolved context under the reserved
				// key before the dispatch layer ever sees the args.
				{ seed: 1, context: { correlationId: "trace-42" } },
				{
					mode: "listen",
					listenConfig: {
						streamId: () => "trace-stream-id",
						getEventNames: (id: string) => ({
							data: `${id}:data`,
							error: `${id}:error`,
							done: `${id}:done`,
						}),
					},
				},
				mockLayer,
			);

			// The first pull runs the scope setup, which forks the invoke;
			// done completes the iterator right after.
			for await (const _value of iterator) {
				void _value;
			}

			expect(captured).toEqual(
				expect.objectContaining({
					seed: 1,
					streamId: "trace-stream-id",
					context: { correlationId: "trace-42" },
				}),
			);
		});
	});
});
