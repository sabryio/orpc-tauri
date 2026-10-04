import { describe, expect, it, vi } from "vitest";
import { TauriLink } from "./public-api";

describe("TauriLink - Custom Invoke", () => {
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

  it("should use custom invoke function", async () => {
    const mockInvoke = vi.fn().mockResolvedValue({ result: "custom" });

    const link = new TauriLink(contract, {
      invoke: mockInvoke,
    });

    const result = await link.call(["test", "procedure"], { id: 123 });

    expect(mockInvoke).toHaveBeenCalledWith("test_command", { id: 123 });
    expect(result).toEqual({ result: "custom" });
  });

  it("should allow middleware in custom invoke", async () => {
    const callLog: string[] = [];

    const link = new TauriLink(contract, {
      invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
        callLog.push(`before:${command}`);
        const result = { data: "test" } as T;
        callLog.push(`after:${command}`);
        return result;
      },
    });

    await link.call(["test", "procedure"], { id: 456 });

    expect(callLog).toEqual(["before:test_command", "after:test_command"]);
  });

  it("should allow adding auth headers via custom invoke", async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const link = new TauriLink(contract, {
      invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
        // Add auth token to every request
        capturedArgs = { ...args, auth: "token-123" };
        return { success: true } as T;
      },
    });

    await link.call(["test", "procedure"], { userId: 1 });

    expect(capturedArgs).toEqual({ userId: 1, auth: "token-123" });
  });

  it("should allow mocking for tests", async () => {
    const mockData = {
      users: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    };

    const link = new TauriLink(contract, {
      invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
        // Return mock data based on command
        if (command === "test_command") {
          return mockData as T;
        }
        throw new Error(`Unknown command: ${command}`);
      },
    });

    const result = await link.call(["test", "procedure"], undefined);

    expect(result).toEqual(mockData);
  });

  it("should handle errors in custom invoke", async () => {
    const link = new TauriLink(contract, {
      invoke: async () => {
        throw new Error("Custom error");
      },
    });

    await expect(link.call(["test", "procedure"], undefined)).rejects.toThrow();
  });

  it("should allow logging without affecting the result", async () => {
    const logs: Array<{ command: string; args?: unknown }> = [];

    const link = new TauriLink(contract, {
      invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
        logs.push({ command, args });
        return { logged: true } as T;
      },
    });

    const result = await link.call(["test", "procedure"], { test: true });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual({
      command: "test_command",
      args: { test: true },
    });
    expect(result).toEqual({ logged: true });
  });

  it("should allow conditional behavior based on command", async () => {
    const results = new Map([
      ["command_a", { a: 1 }],
      ["command_b", { b: 2 }],
    ]);

    const link = new TauriLink(contract, {
      invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
        return (results.get(command) ?? { default: true }) as T;
      },
    });

    const result = await link.call(["test", "procedure"], undefined);

    expect(result).toEqual({ default: true });
  });

  it("should allow timing/performance tracking", async () => {
    const timings: Array<{ command: string; duration: number }> = [];

    const link = new TauriLink(contract, {
      invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
        const start = Date.now();
        const result = { data: "test" } as T;
        const duration = Date.now() - start;
        timings.push({ command, duration });
        return result;
      },
    });

    await link.call(["test", "procedure"], undefined);

    expect(timings).toHaveLength(1);
    expect(timings[0].command).toBe("test_command");
    expect(typeof timings[0].duration).toBe("number");
  });

  it("should allow request transformation", async () => {
    let transformed: Record<string, unknown> | undefined;

    const link = new TauriLink(contract, {
      invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
        // Transform snake_case to camelCase
        transformed = args
          ? Object.fromEntries(
              Object.entries(args).map(([k, v]) => [
                k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
                v,
              ]),
            )
          : undefined;
        return { ok: true } as T;
      },
    });

    await link.call(["test", "procedure"], { user_id: 123, first_name: "Alice" });

    expect(transformed).toEqual({ userId: 123, firstName: "Alice" });
  });

  it("should work with async auth token retrieval", async () => {
    const getToken = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "async-token-456";
    };

    let capturedAuth: string | undefined;

    const link = new TauriLink(contract, {
      invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
        const token = await getToken();
        capturedAuth = token;
        return { authenticated: true } as T;
      },
    });

    await link.call(["test", "procedure"], undefined);

    expect(capturedAuth).toBe("async-token-456");
  });
});
