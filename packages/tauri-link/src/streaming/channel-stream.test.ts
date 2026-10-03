import { Channel } from "@tauri-apps/api/core";
import { Effect, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { TauriChannelFactory } from "../services/channel-factory";
import { TauriInvoker } from "../services/invoker";
import { createChannelStream } from "./channel-stream";

describe("createChannelStream", () => {
  it("should emit messages from channel", async () => {
    const mockChannel = {
      onmessage: null as ((msg: unknown) => void) | null,
    } as unknown as Channel<unknown>;

    const mockFactory = Layer.succeed(
      TauriChannelFactory,
      TauriChannelFactory.of({
        createChannel: () => Effect.succeed(mockChannel),
      }),
    );

    const mockInvoker = Layer.succeed(
      TauriInvoker,
      TauriInvoker.of({
        invoke: <T>() =>
          Effect.sync(() => {
            // Simulate channel messages
            if (mockChannel.onmessage) {
              mockChannel.onmessage({ event: "message", data: "msg-1" });
              mockChannel.onmessage({ event: "message", data: "msg-2" });
              mockChannel.onmessage({ event: "done" });
            }
            return null as T;
          }),
      }),
    );

    const stream = createChannelStream<string>("test_command", {}, "onEvent");

    const results = await Effect.runPromise(
      stream.pipe(
        Stream.runCollect,
        Effect.provide(mockFactory),
        Effect.provide(mockInvoker),
        Effect.scoped,
      ),
    );

    expect(Array.from(results)).toEqual(["msg-1", "msg-2"]);
  });

  it("should fail stream on error event", async () => {
    const mockChannel = {
      onmessage: null as ((msg: unknown) => void) | null,
    } as unknown as Channel<unknown>;

    const mockFactory = Layer.succeed(
      TauriChannelFactory,
      TauriChannelFactory.of({
        createChannel: () => Effect.succeed(mockChannel),
      }),
    );

    const mockInvoker = Layer.succeed(
      TauriInvoker,
      TauriInvoker.of({
        invoke: <T>() =>
          Effect.sync(() => {
            if (mockChannel.onmessage) {
              mockChannel.onmessage({
                event: "error",
                error: new Error("Channel error"),
              });
            }
            return null as T;
          }),
      }),
    );

    const stream = createChannelStream<string>("test_command", {}, "onEvent");

    const result = await Effect.runPromiseExit(
      stream.pipe(
        Stream.runCollect,
        Effect.provide(mockFactory),
        Effect.provide(mockInvoker),
        Effect.scoped,
      ),
    );

    expect(result._tag).toBe("Failure");
  });

  it("should pass channel as parameter to invoke", async () => {
    const mockChannel = {
      onmessage: null as ((msg: unknown) => void) | null,
    } as unknown as Channel<unknown>;

    let capturedArgs: Record<string, unknown> = {};

    const mockFactory = Layer.succeed(
      TauriChannelFactory,
      TauriChannelFactory.of({
        createChannel: () => Effect.succeed(mockChannel),
      }),
    );

    const mockInvoker = Layer.succeed(
      TauriInvoker,
      TauriInvoker.of({
        invoke: <T>(_command: string, args?: Record<string, unknown>) => {
          capturedArgs = args ?? {};
          return Effect.sync(() => {
            if (mockChannel.onmessage) {
              mockChannel.onmessage({ event: "done" });
            }
            return null as T;
          });
        },
      }),
    );

    const stream = createChannelStream<string>(
      "stream_cmd",
      { input: "value" },
      "channelParam",
    );

    await Effect.runPromise(
      stream.pipe(
        Stream.runCollect,
        Effect.provide(mockFactory),
        Effect.provide(mockInvoker),
        Effect.scoped,
      ),
    );

    expect(capturedArgs).toHaveProperty("input", "value");
    expect(capturedArgs).toHaveProperty("channelParam", mockChannel);
  });

  it("should handle different payload types", async () => {
    const mockChannel = {
      onmessage: null as ((msg: unknown) => void) | null,
    } as unknown as Channel<unknown>;

    const mockFactory = Layer.succeed(
      TauriChannelFactory,
      TauriChannelFactory.of({
        createChannel: () => Effect.succeed(mockChannel),
      }),
    );

    const mockInvoker = Layer.succeed(
      TauriInvoker,
      TauriInvoker.of({
        invoke: <T>() =>
          Effect.sync(() => {
            if (mockChannel.onmessage) {
              mockChannel.onmessage({ event: "message", data: { id: 1 } });
              mockChannel.onmessage({ event: "message", data: { id: 2 } });
              mockChannel.onmessage({ event: "done" });
            }
            return null as T;
          }),
      }),
    );

    const stream = createChannelStream<{ id: number }>(
      "test_command",
      {},
      "onEvent",
    );

    const results = await Effect.runPromise(
      stream.pipe(
        Stream.runCollect,
        Effect.provide(mockFactory),
        Effect.provide(mockInvoker),
        Effect.scoped,
      ),
    );

    expect(Array.from(results)).toEqual([{ id: 1 }, { id: 2 }]);
  });
});
