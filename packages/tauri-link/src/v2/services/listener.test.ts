import { Cause, Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { TauriListenError } from "../errors";
import { TauriListener } from "./listener";

describe("TauriListener", () => {
	it("should successfully listen to event and call handler", async () => {
		const receivedPayloads: string[] = [];

		const mockListener = Layer.succeed(
			TauriListener,
			TauriListener.of({
				listen: <T>(_event: string, handler: (payload: T) => void) =>
					Effect.sync(() => {
						// Simulate event emission
						handler("test-payload" as T);
					}),
			}),
		);

		const program = Effect.gen(function* () {
			const listener = yield* TauriListener;
			yield* listener.listen<string>("test:event", (payload) => {
				receivedPayloads.push(payload);
			});
		});

		await Effect.runPromise(
			program.pipe(Effect.provide(mockListener), Effect.scoped),
		);

		expect(receivedPayloads).toEqual(["test-payload"]);
	});

	it("should return TauriListenError on failure", async () => {
		const mockListener = Layer.succeed(
			TauriListener,
			TauriListener.of({
				listen: () =>
					Effect.fail(
						new TauriListenError({
							event: "fail:event",
							cause: new Error("Listener setup failed"),
						}),
					),
			}),
		);

		const program = Effect.gen(function* () {
			const listener = yield* TauriListener;
			yield* listener.listen("fail:event", () => {});
		});

		const result = await Effect.runPromiseExit(
			program.pipe(Effect.provide(mockListener), Effect.scoped),
		);

		expect(result._tag).toBe("Failure");
		if (result._tag === "Failure") {
			const errorResult = Cause.findError(result.cause);
			expect(errorResult._tag).toBe("Success");
			if (errorResult._tag === "Success") {
				expect(errorResult.success).toBeInstanceOf(TauriListenError);
				expect(errorResult.success.event).toBe("fail:event");
			}
		}
	});

	it("should call handler multiple times for multiple events", async () => {
		const receivedPayloads: number[] = [];

		const mockListener = Layer.succeed(
			TauriListener,
			TauriListener.of({
				listen: <T>(_event: string, handler: (payload: T) => void) =>
					Effect.sync(() => {
						// Simulate multiple event emissions
						handler(1 as T);
						handler(2 as T);
						handler(3 as T);
					}),
			}),
		);

		const program = Effect.gen(function* () {
			const listener = yield* TauriListener;
			yield* listener.listen<number>("multi:event", (payload) => {
				receivedPayloads.push(payload);
			});
		});

		await Effect.runPromise(program.pipe(Effect.provide(mockListener), Effect.scoped));

		expect(receivedPayloads).toEqual([1, 2, 3]);
	});

	it("should handle listen with void handler", async () => {
		let handlerCalled = false;

		const mockListener = Layer.succeed(
			TauriListener,
			TauriListener.of({
				listen: <T>(_event: string, handler: (payload: T) => void) =>
					Effect.sync(() => {
						handler({} as T);
					}),
			}),
		);

		const program = Effect.gen(function* () {
			const listener = yield* TauriListener;
			yield* listener.listen("void:event", () => {
				handlerCalled = true;
			});
		});

		await Effect.runPromise(program.pipe(Effect.provide(mockListener), Effect.scoped));

		expect(handlerCalled).toBe(true);
	});
});
