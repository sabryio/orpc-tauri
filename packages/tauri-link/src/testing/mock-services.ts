import { Effect, Layer } from "effect";
import type { Scope } from "effect/Scope";
import { TauriInvoker } from "../services/invoker";
import { TauriListener } from "../services/listener";
import { TauriChannelFactory } from "../services/channel-factory";
import { TauriInvokeError, TauriListenError } from "../errors";
import type { Channel } from "@tauri-apps/api/core";

/**
 * Creates a mock TauriInvoker layer for testing.
 *
 * @param impl - Partial implementation to override default behavior
 * @returns Layer providing mock TauriInvoker service
 *
 * @example
 * ```typescript
 * const mock = createMockInvoker({
 *   invoke: () => Effect.succeed({ name: "Alice" }),
 * });
 *
 * const result = await Effect.runPromise(
 *   TauriInvoker.invoke("get_user", {}).pipe(Effect.provide(mock))
 * );
 * ```
 */
export const createMockInvoker = (
  impl: Partial<{
    invoke: <T>(
      command: string,
      args?: Record<string, unknown>,
    ) => Effect.Effect<T, TauriInvokeError>;
  }> = {},
) =>
  Layer.succeed(
    TauriInvoker,
    TauriInvoker.of({
      invoke: impl.invoke ?? (<T>() => Effect.succeed(null as T)),
    }),
  );

/**
 * Creates a mock TauriListener layer for testing.
 *
 * @param impl - Partial implementation to override default behavior
 * @returns Layer providing mock TauriListener service
 *
 * @example
 * ```typescript
 * const mock = createMockListener({
 *   listen: (event, handler) => Effect.void,
 * });
 *
 * await Effect.runPromise(
 *   TauriListener.listen("test-event", (data) => {}).pipe(Effect.provide(mock))
 * );
 * ```
 */
export const createMockListener = (
  impl: Partial<{
    listen: <T>(
      event: string,
      handler: (payload: T) => void,
    ) => Effect.Effect<void, TauriListenError, Scope>;
  }> = {},
) =>
  Layer.succeed(
    TauriListener,
    TauriListener.of({
      listen: impl.listen ?? (() => Effect.void),
    }),
  );

/**
 * Creates a mock TauriChannelFactory layer for testing.
 *
 * @param impl - Partial implementation to override default behavior
 * @returns Layer providing mock TauriChannelFactory service
 *
 * @example
 * ```typescript
 * const mock = createMockChannelFactory({
 *   createChannel: () => Effect.succeed({ onmessage: null }),
 * });
 *
 * const channel = await Effect.runPromise(
 *   TauriChannelFactory.createChannel().pipe(Effect.provide(mock))
 * );
 * ```
 */
export const createMockChannelFactory = (
  impl: Partial<{
    createChannel: <T>() => Effect.Effect<Channel<T>, TauriInvokeError>;
  }> = {},
) =>
  Layer.succeed(
    TauriChannelFactory,
    TauriChannelFactory.of({
      createChannel:
        impl.createChannel ??
        (<T>() => Effect.succeed({ onmessage: null } as unknown as Channel<T>)),
    }),
  );
