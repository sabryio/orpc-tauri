import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { EffectTauriLink } from "./link";
import { TauriLink } from "./public-api";
import { createMockInvoker } from "./testing/mock-services";

describe("TauriLink public API", () => {
	describe("input parameter passing", () => {
		it("should pass input directly without wrapping for unary calls", async () => {
			let capturedArgs: Record<string, unknown> | undefined;

			const mockInvoker = createMockInvoker({
				invoke: <T>(_cmd: string, args?: Record<string, unknown>) => {
					capturedArgs = args;
					return Effect.succeed({ result: "test" } as T);
				},
			});

			await Effect.runPromise(
				EffectTauriLink.call("test_command", { id: 123 }).pipe(
					Effect.provide(mockInvoker),
				),
			);

			expect(capturedArgs).toEqual({ id: 123 });
		});

		it("should pass undefined when input is undefined", async () => {
			let capturedArgs: Record<string, unknown> | undefined;

			const mockInvoker = createMockInvoker({
				invoke: <T>(_cmd: string, args?: Record<string, unknown>) => {
					capturedArgs = args;
					return Effect.succeed({ result: "test" } as T);
				},
			});

			await Effect.runPromise(
				EffectTauriLink.call("test_command", undefined).pipe(
					Effect.provide(mockInvoker),
				),
			);

			expect(capturedArgs).toBeUndefined();
		});
	});

	describe("timeout meta", () => {
		const contract = {
			test: {
				procedure: {
					"~orpc": {
						meta: {
							"~tauri": {
								command: "slow_command",
								timeout: 20,
							},
						},
					},
				},
			},
		};

		it("rejects with ORPCError('TIMEOUT') when the call exceeds the budget", async () => {
			const link = new TauriLink(contract, {
				invoke: <T>() =>
					// Never settles — the timeout must interrupt it
					new Promise<T>(() => {}),
			});

			await expect(
				link.call(["test", "procedure"], { id: 1 }),
			).rejects.toMatchObject({
				code: "TIMEOUT",
				message: "slow_command timed out after 20ms",
				data: { operation: "slow_command", timeout: 20 },
			});
		});

		it("does not cut off calls completing within the budget", async () => {
			const link = new TauriLink(
				{
					test: {
						procedure: {
							"~orpc": {
								meta: {
									"~tauri": { command: "slow_command", timeout: 2000 },
								},
							},
						},
					},
				},
				{
					invoke: async <T>() => {
						await new Promise((resolve) => setTimeout(resolve, 30));
						return { done: true } as T;
					},
				},
			);

			await expect(
				link.call(["test", "procedure"], { id: 1 }),
			).resolves.toEqual({ done: true });
		});
	});
});
