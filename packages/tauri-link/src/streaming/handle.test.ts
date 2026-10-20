import { describe, expect, it } from "vitest";
import { HANDLE_PREFIX, parseHandleEnvelope } from "./handle";

describe("parseHandleEnvelope", () => {
	it("parses the standard handle:<rid> convention", () => {
		expect(parseHandleEnvelope("handle:7")).toEqual({ rid: 7 });
		expect(parseHandleEnvelope(`${HANDLE_PREFIX}0`)).toEqual({ rid: 0 });
		expect(parseHandleEnvelope("handle:4294967295")).toEqual({
			rid: 4294967295,
		});
	});

	it("rejects non-handle comments", () => {
		expect(parseHandleEnvelope("progress:40/80")).toBeUndefined();
		expect(parseHandleEnvelope("flush")).toBeUndefined();
		expect(parseHandleEnvelope("")).toBeUndefined();
		expect(parseHandleEnvelope("handles:1")).toBeUndefined();
	});

	it("rejects malformed handle envelopes (swallowed silently)", () => {
		expect(parseHandleEnvelope("handle:")).toBeUndefined();
		expect(parseHandleEnvelope("handle:abc")).toBeUndefined();
		expect(parseHandleEnvelope("handle:-1")).toBeUndefined();
		expect(parseHandleEnvelope("handle:1.5")).toBeUndefined();
		expect(parseHandleEnvelope("handle:1/2")).toBeUndefined();
	});
});
