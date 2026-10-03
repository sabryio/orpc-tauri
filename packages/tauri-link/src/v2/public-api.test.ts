import { describe, expect, it, vi } from "vitest";
import { TauriLink } from "./public-api";
import { Effect, Layer } from "effect";
import { TauriInvoker } from "./services/invoker";

describe("TauriLink public API", () => {
	describe("input parameter wrapping", () => {
		it("should wrap input in { input: ... } for unary calls", async () => {
			let capturedArgs: Record<string, unknown> | undefined;

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>(_cmd: string, args?: Record<string, unknown>) => {
						capturedArgs = args;
						return Effect.succeed({ result: "test" } as T);
					},
				}),
			);

			vi.spyOn(
				(await import("./link")).EffectTauriLink,
				"AppLayer",
				"get",
			).mockReturnValue(mockInvoker as any);

			const contract = {
				test: {
					procedure: {
						"~orpc": {
							meta: {
								"~tauri": {
									command: "test_command",
								},
							},
						},
					},
				},
			};

			const link = new TauriLink(contract);
			await link.call(["test", "procedure"], { id: 123 });

			expect(capturedArgs).toEqual({ input: { id: 123 } });

			vi.restoreAllMocks();
		});

		it("should pass empty object when input is undefined", async () => {
			let capturedArgs: Record<string, unknown> | undefined;

			const mockInvoker = Layer.succeed(
				TauriInvoker,
				TauriInvoker.of({
					invoke: <T>(_cmd: string, args?: Record<string, unknown>) => {
						capturedArgs = args;
						return Effect.succeed({ result: "test" } as T);
					},
				}),
			);

			vi.spyOn(
				(await import("./link")).EffectTauriLink,
				"AppLayer",
				"get",
			).mockReturnValue(mockInvoker as any);

			const contract = {
				test: {
					procedure: {
						"~orpc": {
							meta: {
								"~tauri": {
									command: "test_command",
								},
							},
						},
					},
				},
			};

			const link = new TauriLink(contract);
			await link.call(["test", "procedure"], undefined);

			expect(capturedArgs).toEqual({});

			vi.restoreAllMocks();
		});
	});
});
