import { describe, expect, it } from "vitest";
import { parseProgress } from "./progress";

describe("parseProgress", () => {
	it("parses a full progress comment", () => {
		expect(parseProgress("progress:50/100")).toEqual({
			bytesTransferred: 50,
			totalBytes: 100,
			percentage: 50,
		});
	});

	it("parses progress without a total", () => {
		expect(parseProgress("progress:1024")).toEqual({
			bytesTransferred: 1024,
		});
		expect(parseProgress("progress:1024/")).toEqual({
			bytesTransferred: 1024,
		});
	});

	it("clamps percentage at 100", () => {
		expect(parseProgress("progress:150/100")?.percentage).toBe(100);
	});

	it("rounds percentage", () => {
		expect(parseProgress("progress:1/3")?.percentage).toBe(33);
	});

	it("returns undefined for non-progress comments", () => {
		expect(parseProgress("flush")).toBeUndefined();
		expect(parseProgress("progress-retries: 3")).toBeUndefined();
	});

	it("returns undefined for malformed values", () => {
		expect(parseProgress("progress:abc")).toBeUndefined();
		expect(parseProgress("progress:-5/100")).toBeUndefined();
		expect(parseProgress("progress:1.5/10")).toBeUndefined();
		expect(parseProgress("progress:0/0")).toBeUndefined();
		expect(parseProgress("progress:50/NaN")).toBeUndefined();
		expect(parseProgress("progress:")).toBeUndefined();
	});
});
