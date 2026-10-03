import { Effect } from "effect";
import { describe, expect, it } from "vitest";

describe("Effect setup", () => {
	it("should create and run a simple Effect", async () => {
		const program = Effect.succeed(42);
		const result = await Effect.runPromise(program);
		expect(result).toBe(42);
	});
});
