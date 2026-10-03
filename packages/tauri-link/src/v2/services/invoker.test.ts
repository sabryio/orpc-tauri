import { Cause, Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { TauriInvokeError } from "../errors";
import { TauriInvoker } from "./invoker";

describe("TauriInvoker", () => {
	it("should successfully invoke command and return result", async () => {
		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: <T>() => Effect.succeed({ id: 123, name: "Alice" } as T),
			}),
		);

		const program = Effect.gen(function* () {
			const invoker = yield* TauriInvoker;
			return yield* invoker.invoke<{ id: number; name: string }>("get_user", {
				id: 123,
			});
		});

		const result = await Effect.runPromise(program.pipe(Effect.provide(mockInvoker)));

		expect(result).toEqual({ id: 123, name: "Alice" });
	});

	it("should return TauriInvokeError on failure", async () => {
		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: () =>
					Effect.fail(
						new TauriInvokeError({
							command: "get_user",
							input: { id: 999 },
							cause: new Error("User not found"),
						}),
					),
			}),
		);

		const program = Effect.gen(function* () {
			const invoker = yield* TauriInvoker;
			return yield* invoker.invoke("get_user", { id: 999 });
		});

		const result = await Effect.runPromiseExit(
			program.pipe(Effect.provide(mockInvoker)),
		);

		expect(result._tag).toBe("Failure");
		if (result._tag === "Failure") {
			const errorResult = Cause.findError(result.cause);
			expect(errorResult._tag).toBe("Success");
			if (errorResult._tag === "Success") {
				expect(errorResult.success).toBeInstanceOf(TauriInvokeError);
				expect(errorResult.success.command).toBe("get_user");
			}
		}
	});

	it("should pass args to invoke call", async () => {
		let capturedCommand = "";
		let capturedArgs: Record<string, unknown> = {};

		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: <T>(command: string, args?: Record<string, unknown>) => {
					capturedCommand = command;
					capturedArgs = args ?? {};
					return Effect.succeed("ok" as T);
				},
			}),
		);

		const program = Effect.gen(function* () {
			const invoker = yield* TauriInvoker;
			return yield* invoker.invoke("test_command", { foo: "bar", num: 42 });
		});

		await Effect.runPromise(program.pipe(Effect.provide(mockInvoker)));

		expect(capturedCommand).toBe("test_command");
		expect(capturedArgs).toEqual({ foo: "bar", num: 42 });
	});

	it("should handle invoke with no args", async () => {
		const mockInvoker = Layer.succeed(
			TauriInvoker,
			TauriInvoker.of({
				invoke: <T>() => Effect.succeed("no-args-result" as T),
			}),
		);

		const program = Effect.gen(function* () {
			const invoker = yield* TauriInvoker;
			return yield* invoker.invoke<string>("no_args_command");
		});

		const result = await Effect.runPromise(program.pipe(Effect.provide(mockInvoker)));

		expect(result).toBe("no-args-result");
	});
});
