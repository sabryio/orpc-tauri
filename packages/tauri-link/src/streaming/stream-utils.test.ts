import { Cause, Context, Effect, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { StreamError } from "../errors";
import { TauriInvoker } from "../services/invoker";
import { createQueueStream, forkInvoke } from "./stream-utils";

describe("stream-utils", () => {
	describe("createQueueStream", () => {
		it("should emit values through the queue", async () => {
			const stream = createQueueStream<number, never>((emit) =>
				Effect.gen(function* () {
					emit.value(1);
					emit.value(2);
					emit.value(3);
					emit.done();
				}),
			);

			const result = await Effect.runPromise(
				stream.pipe(Stream.runCollect, Effect.scoped),
			);
			expect(Array.from(result)).toEqual([1, 2, 3]);
		});

		it("should emit error through the queue", async () => {
			const stream = createQueueStream<number, never>((emit) =>
				Effect.gen(function* () {
					emit.value(1);
					emit.error({ message: "test error" });
				}),
			);

			const result = await Effect.runPromiseExit(
				stream.pipe(Stream.runCollect, Effect.scoped),
			);

			expect(result._tag).toBe("Failure");
			if (result._tag === "Failure") {
				const error = Cause.findError(result.cause);
				expect(error._tag).toBe("Success");
				if (error._tag === "Success") {
					expect(error.success).toBeInstanceOf(StreamError);
					expect(error.success.cause).toEqual({ message: "test error" });
				}
			}
		});

		it("should complete stream via emit.done()", async () => {
			const stream = createQueueStream<number, never>((emit) =>
				Effect.gen(function* () {
					emit.value(1);
					emit.done();
					emit.value(2); // Should not emit
				}),
			);

			const result = await Effect.runPromise(
				stream.pipe(Stream.runCollect, Effect.scoped),
			);
			expect(Array.from(result)).toEqual([1]);
		});

		it("should wrap setup errors in StreamError", async () => {
			const stream = createQueueStream<number, never>(() =>
				Effect.fail(new Error("setup failed")),
			);

			const result = await Effect.runPromiseExit(
				stream.pipe(Stream.runCollect, Effect.scoped),
			);

			expect(result._tag).toBe("Failure");
			if (result._tag === "Failure") {
				const error = Cause.findError(result.cause);
				expect(error._tag).toBe("Success");
				if (error._tag === "Success") {
					expect(error.success).toBeInstanceOf(StreamError);
				}
			}
		});

		it("should thread service requirements through", async () => {
			class TestService extends Context.Service<
				TestService,
				{
					getValue: () => number;
				}
			>()("TestService") {}

			const stream = createQueueStream<number, TestService>((emit) =>
				Effect.gen(function* () {
					const service = yield* TestService;
					emit.value(service.getValue());
					emit.done();
				}),
			);

			const testLayer = Layer.succeed(
				TestService,
				TestService.of({ getValue: () => 42 }),
			);

			const result = await Effect.runPromise(
				stream.pipe(Stream.runCollect, Effect.provide(testLayer), Effect.scoped),
			);

			expect(Array.from(result)).toEqual([42]);
		});

		it("should support scoped operations in setup", async () => {
			const cleanupCalls: string[] = [];

			const stream = createQueueStream<number, never>((emit) =>
				Effect.gen(function* () {
					yield* Effect.acquireRelease(
						Effect.sync(() => {
							cleanupCalls.push("acquired");
							return "resource";
						}),
						() =>
							Effect.sync(() => {
								cleanupCalls.push("released");
							}),
					);

					emit.value(1);
					emit.done();
				}),
			);

			await Effect.runPromise(
				stream.pipe(Stream.runCollect, Effect.scoped),
			);

			expect(cleanupCalls).toEqual(["acquired", "released"]);
		});

		it("should handle multiple sequential emissions", async () => {
			const stream = createQueueStream<number, never>((emit) =>
				Effect.gen(function* () {
					for (let i = 0; i < 10; i++) {
						emit.value(i);
					}
					emit.done();
				}),
			);

			const result = await Effect.runPromise(
				stream.pipe(Stream.runCollect, Effect.scoped),
			);
			expect(Array.from(result)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		});
	});

	describe("forkInvoke", () => {
		it("should fork successful invoke call", async () => {
			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>() => Effect.succeed({ data: "success" } as T),
				}),
			);

			const errorCalls: unknown[] = [];

			await Effect.runPromise(
				forkInvoke("test_command", { arg: "value" }, (error) =>
					errorCalls.push(error),
				).pipe(Effect.provide(mockInvoker), Effect.scoped),
			);

			// Wait a bit for forked effect to complete
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(errorCalls).toEqual([]);
		});

		it("should catch invoke errors and call onError", async () => {
			const testError = new Error("invoke failed");

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>() => Effect.fail(testError) as Effect.Effect<T, any, never>,
				}),
			);

			const errorCalls: unknown[] = [];

			// Keep scope alive while forked fiber runs
			await Effect.runPromise(
				Effect.gen(function* () {
					yield* forkInvoke("test_command", { arg: "value" }, (error) =>
						errorCalls.push(error),
					);
					// Wait for forked effect to complete
					yield* Effect.sleep(50);
				}).pipe(Effect.provide(mockInvoker), Effect.scoped),
			);

			expect(errorCalls).toHaveLength(1);
			expect(errorCalls[0]).toBe(testError);
		});

		it("should pass command and input to invoker", async () => {
			const invokeCalls: Array<{ command: string; input: unknown }> = [];

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>(command: string, args?: Record<string, unknown>) => {
						invokeCalls.push({ command, input: args });
						return Effect.succeed({} as T);
					},
				}),
			);

			// Keep scope alive while forked fiber runs
			await Effect.runPromise(
				Effect.gen(function* () {
					yield* forkInvoke(
						"test_command",
						{ arg1: "value1", arg2: 42 },
						() => {},
					);
					// Wait for forked effect to complete
					yield* Effect.sleep(50);
				}).pipe(Effect.provide(mockInvoker), Effect.scoped),
			);

			expect(invokeCalls).toHaveLength(1);
			expect(invokeCalls[0]).toEqual({
				command: "test_command",
				input: { arg1: "value1", arg2: 42 },
			});
		});

		it("should return immediately (non-blocking)", async () => {
			let invokeCompleted = false;

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>() =>
						Effect.gen(function* () {
							yield* Effect.sleep(100);
							invokeCompleted = true;
							return {} as T;
						}),
				}),
			);

			const startTime = Date.now();

			// Keep scope alive while forked fiber runs
			await Effect.runPromise(
				Effect.gen(function* () {
					yield* forkInvoke("test_command", {}, () => {});
					// forkInvoke returns immediately, so we exit quickly
				}).pipe(Effect.provide(mockInvoker), Effect.scoped),
			);

			const duration = Date.now() - startTime;

			// Should complete quickly (forked, not waiting)
			expect(duration).toBeLessThan(50);
			expect(invokeCompleted).toBe(false);

			// Scope closed, fiber interrupted - invoke won't complete
			// This is expected behavior for forkScoped
		});
	});

	describe("integration: createQueueStream + forkInvoke", () => {
		it("should work together for streaming pattern", async () => {
			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>() =>
						Effect.gen(function* () {
							yield* Effect.sleep(10);
							return { status: "complete" } as T;
						}),
				}),
			);

			const stream = createQueueStream<number, TauriInvoker>((emit) =>
				Effect.gen(function* () {
					emit.value(1);
					emit.value(2);

					yield* forkInvoke("stream_command", { id: "123" }, (error) =>
						emit.error(error),
					);

					emit.value(3);
					emit.done();
				}),
			);

			const result = await Effect.runPromise(
				stream.pipe(Stream.runCollect, Effect.provide(mockInvoker), Effect.scoped),
			);

			expect(Array.from(result)).toEqual([1, 2, 3]);
		});

		it("should propagate invoke errors through emit.error", async () => {
			const testError = new Error("command failed");

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>() => Effect.fail(testError) as Effect.Effect<T, any, never>,
				}),
			);

			const stream = createQueueStream<number, TauriInvoker>((emit) =>
				Effect.gen(function* () {
					emit.value(1);

					yield* forkInvoke("failing_command", {}, (error) =>
						emit.error(error),
					);

					// Keep stream alive long enough for forked error to propagate
					yield* Effect.sleep(100);
				}),
			);

			const result = await Effect.runPromiseExit(
				stream.pipe(Stream.runCollect, Effect.provide(mockInvoker), Effect.scoped),
			);

			expect(result._tag).toBe("Failure");
			if (result._tag === "Failure") {
				const error = Cause.findError(result.cause);
				expect(error._tag).toBe("Success");
				if (error._tag === "Success") {
					expect(error.success).toBeInstanceOf(StreamError);
					expect(error.success.cause).toBe(testError);
				}
			}
		});
	});
});
