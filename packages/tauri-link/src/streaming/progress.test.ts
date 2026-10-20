import { describe, expect, it } from "vitest";
import { makeProgressParser, parseProgress } from "./progress";

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

describe("parseProgress with prefix override", () => {
	it("recognizes a custom prefix", () => {
		expect(parseProgress("pct:50/100", "pct:")).toEqual({
			bytesTransferred: 50,
			totalBytes: 100,
			percentage: 50,
		});
	});

	it("ignores the default prefix under a custom one", () => {
		expect(parseProgress("progress:50/100", "pct:")).toBeUndefined();
	});
});

describe("makeProgressParser", () => {
	it("defaults to the built-in progress: parser", () => {
		const parse = makeProgressParser();
		expect(parse("progress:25/50")).toEqual({
			bytesTransferred: 25,
			totalBytes: 50,
			percentage: 50,
		});
	});

	it("prefix config renames the expected prefix", () => {
		const parse = makeProgressParser({ prefix: "bytes=" });
		expect(parse("bytes=10")).toEqual({ bytesTransferred: 10 });
		expect(parse("progress:10")).toBeUndefined();
	});

	it("parser config wins over prefix config", () => {
		const parse = makeProgressParser({
			prefix: "unused:",
			parser: (comment) => {
				const m = comment.match(/^tick:(\d+)\/(\d+)$/);
				return m
					? {
							bytesTransferred: Number(m[1]),
							percentage: Number(m[2]),
						}
					: undefined;
			},
		});
		expect(parse("tick:3/60")).toEqual({ bytesTransferred: 3, percentage: 60 });
		expect(parse("progress:25/50")).toBeUndefined();
	});

	it("parser returning undefined swallows the envelope", () => {
		const parse = makeProgressParser({ parser: () => undefined });
		expect(parse("progress:25/50")).toBeUndefined();
	});
});
