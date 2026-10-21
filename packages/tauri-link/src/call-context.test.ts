import { describe, expect, it, vi } from "vitest";
import { injectContextArg, resolveCallContext } from "./call-context";
import { TauriLink } from "./public-api";

describe("call-context helpers", () => {
	it("resolveCallContext returns undefined when neither side provides one", () => {
		expect(resolveCallContext(undefined, undefined)).toBeUndefined();
		expect(resolveCallContext({ a: 1 }, undefined)).toEqual({ a: 1 });
		expect(resolveCallContext(undefined, { b: 2 })).toEqual({ b: 2 });
	});

	it("resolveCallContext shallow-merges with per-call winning", () => {
		expect(resolveCallContext({ a: 1, b: 1 }, { b: 2, c: 3 })).toEqual({
			a: 1,
			b: 2,
			c: 3,
		});
		expect(resolveCallContext({ a: { nested: 1 } }, { a: "override" })).toEqual(
			{
				a: "override",
			},
		);
	});

	it("resolveCallContext evaluates function defaults per call", () => {
		let counter = 0;
		const merged = resolveCallContext(() => ({ n: ++counter }), undefined);
		expect(merged).toEqual({ n: 1 });
		expect(resolveCallContext(() => ({ n: ++counter }), undefined)).toEqual({
			n: 2,
		});
	});
});

describe("context injection (client → Rust metadata)", () => {
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

	it("injects the link-level context into invoke args under the reserved key", async () => {
		let capturedArgs: Record<string, unknown> | undefined;
		const link = new TauriLink<{ locale: string }>(contract, {
			invoke: async <T>(
				_command: string,
				args?: Record<string, unknown>,
			): Promise<T> => {
				capturedArgs = args;
				return null as T;
			},
			context: { locale: "tr-TR" },
		});

		await link.call(["test", "procedure"], { id: 1 });

		expect(capturedArgs).toEqual({
			id: 1,
			context: { locale: "tr-TR" },
		});
	});

	it("injects merged per-call override into invoke args under the reserved key", async () => {
		const mockInvoke = vi.fn().mockResolvedValue({ ok: true });

		const link = new TauriLink<{ token?: string }>(contract, {
			invoke: mockInvoke,
			context: () => ({ token: "session" }),
		});

		await link.call(
			["test", "procedure"],
			{ id: 2 },
			{ context: { token: "override" } },
		);

		// Args: merged context under the reserved key (per-call wins)
		expect(mockInvoke).toHaveBeenCalledWith("test_command", {
			id: 2,
			context: { token: "override" },
		});
	});

	it("leaves args completely untouched when no context exists anywhere", async () => {
		let capturedArgs: Record<string, unknown> | undefined;
		const link = new TauriLink(contract, {
			invoke: async <T>(
				_command: string,
				args?: Record<string, unknown>,
			): Promise<T> => {
				capturedArgs = args;
				return null as T;
			},
		});

		await link.call(["test", "procedure"], { id: 3 });

		expect(capturedArgs).toEqual({ id: 3 });
		expect(capturedArgs).not.toHaveProperty("context");
	});
});

describe("injectContextArg", () => {
	it("no-ops when the resolved context is undefined", () => {
		expect(injectContextArg({ a: 1 }, undefined)).toEqual({ a: 1 });
		expect(injectContextArg(undefined, undefined)).toBeUndefined();
	});

	it("creates the args object when the command received none", () => {
		expect(injectContextArg(undefined, { a: 1 })).toEqual({
			context: { a: 1 },
		});
	});
});
