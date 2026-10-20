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
	});
});
