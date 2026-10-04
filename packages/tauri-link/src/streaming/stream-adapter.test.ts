import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { streamToAsyncIterator } from "./stream-adapter";

describe("streamToAsyncIterator", () => {
  it("should convert a simple stream to async iterator", async () => {
    const stream = Stream.make(1, 2, 3);
    const results: number[] = [];

    for await (const value of streamToAsyncIterator(stream)) {
      results.push(value);
    }

    expect(results).toEqual([1, 2, 3]);
  });

  it("should convert an empty stream", async () => {
    const stream = Stream.empty;
    const results: unknown[] = [];

    for await (const value of streamToAsyncIterator(stream)) {
      results.push(value);
    }

    expect(results).toEqual([]);
  });

  it("should handle stream with effects", async () => {
    const stream = Stream.fromIterable([1, 2, 3]).pipe(
      Stream.mapEffect((n) => Effect.succeed(n * 2)),
    );
    const results: number[] = [];

    for await (const value of streamToAsyncIterator(stream)) {
      results.push(value);
    }

    expect(results).toEqual([2, 4, 6]);
  });

  it("should propagate stream errors", async () => {
    const stream = Stream.make(1, 2).pipe(
      Stream.flatMap((n) =>
        n === 2 ? Stream.fail(new Error("test error")) : Stream.succeed(n),
      ),
    );

    const results: number[] = [];

    await expect(
      (async () => {
        for await (const value of streamToAsyncIterator(stream)) {
          results.push(value);
        }
      })(),
    ).rejects.toThrow("test error");

    expect(results).toEqual([1]);
  });

  it("should handle large streams", async () => {
    const stream = Stream.range(0, 99);
    const results: number[] = [];

    for await (const value of streamToAsyncIterator(stream)) {
      results.push(value);
    }

    expect(results.length).toBe(100);
    expect(results[0]).toBe(0);
    expect(results[99]).toBe(99);
  });

  it("should allow breaking out of iteration early", async () => {
    const stream = Stream.range(0, 100);
    const results: number[] = [];

    for await (const value of streamToAsyncIterator(stream)) {
      results.push(value);
      if (value === 5) break;
    }

    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
