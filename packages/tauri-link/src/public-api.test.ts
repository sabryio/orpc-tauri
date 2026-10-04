import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { EffectTauriLink } from "./link";
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
});
