import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { EffectTauriLink } from "./link";
import { TauriLink } from "./public-api";
import { createMockInvoker } from "./testing/mock-services";

// The duplex tests run TauriLink's live streaming path end-to-end, which
// constructs Channels through TauriChannelFactoryLive → the real Tauri
// `Channel` requires `window.__TAURI_INTERNALS__`, unavailable under vitest.
// Mock it with a controlled fake; every other core member stays real
// (the custom `invoke` override intercepts command transport entirely).
vi.mock("@tauri-apps/api/core", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	const createdChannels: Array<{
		onmessage: ((msg: unknown) => void) | null;
	}> = [];

	class MockChannel {
		onmessage: ((msg: unknown) => void) | null = null;
		constructor() {
			createdChannels.push(this);
		}
	}

	return { ...actual, Channel: MockChannel, createdChannels };
});

/** The stream's live channel is created on first pull — tests grab it here. */
const lastChannel = async (): Promise<{
	onmessage: ((msg: unknown) => void) | null;
}> => {
	const core = (await import("@tauri-apps/api/core")) as unknown as {
		createdChannels: Array<{ onmessage: ((msg: unknown) => void) | null }>;
	};
	const channel = core.createdChannels.at(-1);
	expect(channel).toBeDefined();
	return channel!;
};

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

	describe("timeout meta", () => {
		const contract = {
			test: {
				procedure: {
					"~orpc": {
						meta: {
							"~tauri": {
								command: "slow_command",
								timeout: 20,
							},
						},
					},
				},
			},
		};

		it("rejects with ORPCError('TIMEOUT') when the call exceeds the budget", async () => {
			const link = new TauriLink(contract, {
				invoke: <T>() =>
					// Never settles — the timeout must interrupt it
					new Promise<T>(() => {}),
			});

			await expect(
				link.call(["test", "procedure"], { id: 1 }),
			).rejects.toMatchObject({
				code: "TIMEOUT",
				message: "slow_command timed out after 20ms",
				data: { operation: "slow_command", timeout: 20 },
			});
		});

		it("does not cut off calls completing within the budget", async () => {
			const link = new TauriLink(
				{
					test: {
						procedure: {
							"~orpc": {
								meta: {
									"~tauri": { command: "slow_command", timeout: 2000 },
								},
							},
						},
					},
				},
				{
					invoke: async <T>() => {
						await new Promise((resolve) => setTimeout(resolve, 30));
						return { done: true } as T;
					},
				},
			);

			await expect(
				link.call(["test", "procedure"], { id: 1 }),
			).resolves.toEqual({ done: true });
		});
	});

	describe("duplex sessions (rid + channel + unary = WebSockets)", () => {
		// Fabricates the ~standard shape `isStreaming` detects: an oRPC
		// async-iterator output schema (symbol name per ORPC_SYMBOLS).
		const ASYNC_ITERATOR_SYMBOL = Symbol(
			"ORPC_ASYNC_ITERATOR_OBJECT_SCHEMA_DETAILS",
		);
		const streamingOutputSchema = {
			"~standard": {
				[ASYNC_ITERATOR_SYMBOL]: true,
				validate: (value: unknown) => ({ value }),
			},
		};

		const contract = {
			chat: {
				chat_session: {
					"~orpc": {
						meta: {
							"~tauri": {
								transport: { kind: "channel", id: "onEvent" },
								resource: { autoClose: true },
							},
						},
						outputSchemas: [streamingOutputSchema],
					},
				},
				chat_session_send: {
					"~orpc": {
						meta: { "~tauri": {} },
					},
				},
			},
		};

		/** Recorded `invoke` calls: command + args, in order. */
		type Invocation = { command: string; args?: Record<string, unknown> };

		const makeLink = (
			invokeImpl: (
				command: string,
				args: Record<string, unknown> | undefined,
			) => void,
		): { link: TauriLink<unknown>; invocations: Invocation[] } => {
			const invocations: Invocation[] = [];
			const link = new TauriLink(contract as never as Record<string, unknown>, {
				invoke: async <T>(
					command: string,
					args?: Record<string, unknown>,
				): Promise<T> => {
					invocations.push({ command, args });
					if (command === "chat_session") {
						invokeImpl(command, args);
						// Simulated Rust session — long-running; the Rust side
						// ends it via the `done` event or the consumer's teardown.
						await new Promise<void>(() => {});
					}
					return null as T;
				},
			});
			return { link, invocations };
		};

		it("routes .send() through the paired unary command with the captured rid", async () => {
			const { link, invocations } = makeLink(async () => {
				const channel = await lastChannel();
				channel.onmessage?.({ comment: "flush" });
				channel.onmessage?.({ comment: "handle:42" });
				channel.onmessage?.({
					event: "message",
					data: { id: 1, text: "joined" },
				});
			});

			const session = await link.duplex(
				["chat", "chat_session"],
				{ send: ["chat", "chat_session_send"] },
				{ startInput: { room: "lobby" } },
			);

			// Rust → JS: the session's messages arrive via the same client
			// streaming path as any channel-backed procedure.
			const first = await session.next();
			expect(first.done).toBe(false);
			expect(first.value).toEqual({ id: 1, text: "joined" });

			// JS → Rust: the rid never appears in the payload.
			await session.send({ text: "hi" });
			expect(invocations).toContainEqual({
				command: "chat_session_send",
				args: { input: { text: "hi", handle: { rid: 42 } } },
			});

			// The start invoke carried the `{ input: … }` courier with the
			// channel parameter alongside (the link's usual invoke args).
			const startInvocation = invocations.find(
				(i) => i.command === "chat_session",
			);
			expect(startInvocation?.args).toMatchObject({
				input: { room: "lobby" },
			});
		});

		it("queues .send() messages until the rid announcement lands", async () => {
			const { link, invocations } = makeLink(async () => {
				// Rust answers a moment after join — the rid announcement is
				// NOT synchronous with the facade call.
				setTimeout(async () => {
					const channel = await lastChannel();
					channel.onmessage?.({ comment: "handle:9" });
					channel.onmessage?.({ event: "message", data: "joined" });
				}, 10);
			});

			const session = await link.duplex(
				["chat", "chat_session"],
				{ send: ["chat", "chat_session_send"] },
				{ startInput: { room: "lobby" } },
			);

			// Send-before-rid must not reject or hang: it queues.
			const firstPull = session.next();
			await session.send({ text: "hi" });
			await firstPull;

			expect(invocations).toContainEqual({
				command: "chat_session_send",
				args: { input: { text: "hi", handle: { rid: 9 } } },
			});
		});

		it("fails a queued .send() when the session is aborted before the rid lands", async () => {
			const { link, invocations } = makeLink(() => {
				// The Rust side never announces a rid — abort hits a still-
				// unannounced session.
			});

			const controller = new AbortController();
			const session = await link.duplex(
				["chat", "chat_session"],
				{ send: ["chat", "chat_session_send"] },
				{ signal: controller.signal, startInput: { room: "lobby" } },
			);

			const firstPull = session.next();
			const sendPromise = session.send({ text: "hi" });

			controller.abort();

			await expect(sendPromise).rejects.toMatchObject({
				code: "CLIENT_CLOSED_REQUEST",
				message: "Duplex session aborted",
			});
			// The interrupted stream rejects the pull with the same code.
			await expect(firstPull).rejects.toMatchObject({
				code: "CLIENT_CLOSED_REQUEST",
			});
			// No rid ever landed — nothing to close.
			expect(
				invocations.some((i) => i.command === "plugin:resources|close"),
			).toBe(false);
		});

		it("closes the session rid when the consumer exits early (break → .return())", async () => {
			const { link, invocations } = makeLink(async () => {
				const channel = await lastChannel();
				channel.onmessage?.({ comment: "handle:99" });
				channel.onmessage?.({ event: "message", data: "chunk-1" });
			});

			const session = await link.duplex(
				["chat", "chat_session"],
				{ send: ["chat", "chat_session_send"] },
				{ startInput: { room: "lobby" } },
			);

			const first = await session.next();
			expect(first.done).toBe(false);
			expect(first.value).toBe("chunk-1");

			// Consumer break: the session's delegated .return() triggers rid
			// autoClose through the stream teardown.
			await session.return?.();
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(invocations).toContainEqual({
				command: "plugin:resources|close",
				args: { rid: 99 },
			});
		});

		it("propagates paired-command failures as ORPCError on .send()", async () => {
			const invocations: Invocation[] = [];

			// Combined rig: the session announces its rid, the paired send
			// command rejects with a Tauri-style error payload.
			const link = new TauriLink(contract as never as Record<string, unknown>, {
				invoke: async <T>(command: string): Promise<T> => {
					invocations.push({ command });
					if (command === "chat_session_send") {
						throw { code: "VALIDATION_ERROR", message: "text too long" };
					}
					const channel = await lastChannel();
					channel.onmessage?.({ comment: "handle:7" });
					channel.onmessage?.({ event: "message", data: "joined" });
					return new Promise<T>(() => {});
				},
			});

			const session = await link.duplex(
				["chat", "chat_session"],
				{ send: ["chat", "chat_session_send"] },
				{ startInput: { room: "lobby" } },
			);
			await session.next();

			await expect(session.send({ text: "hi" })).rejects.toMatchObject({
				// The Tauri code isn't an oRPC standard code → the converter's
				// fallback keeps it in `data.originalCode`.
				code: "INTERNAL_SERVER_ERROR",
				message: "text too long",
				data: { originalCode: "VALIDATION_ERROR", data: undefined },
			});
			expect(invocations).toContainEqual({ command: "chat_session_send" });
		});

		it("fails fast on invalid pairings — before the session starts", async () => {
			const { link } = makeLink(() => {});

			// Start proc must be streaming.
			await expect(
				link.duplex(
					["chat", "chat_session_send"],
					{ send: ["chat", "chat_session_send"] },
					{ startInput: { room: "x" } },
				),
			).rejects.toThrowError(/must be a streaming procedure/);

			// Send proc must be unary.
			await expect(
				link.duplex(
					["chat", "chat_session"],
					{ send: ["chat", "chat_session"] },
					{ startInput: { room: "x" } },
				),
			).rejects.toThrowError(/must be unary/);

			// Unknown send route fails at pairing time, not at first send.
			await expect(
				link.duplex(
					["chat", "chat_session"],
					{ send: ["chat", "does_not_exist"] },
					{ startInput: { room: "x" } },
				),
			).rejects.toThrowError(/does_not_exist|not found/i);
		});

		it("fails queued sends when the Rust side completes without announcing", async () => {
			const { link } = makeLink(async () => {
				// Never announces a rid; closes the session gracefully instead.
				setTimeout(async () => {
					const channel = await lastChannel();
					channel.onmessage?.({ event: "done" });
				}, 20);
			});

			const session = await link.duplex(
				["chat", "chat_session"],
				{ send: ["chat", "chat_session_send"] },
				{ startInput: { room: "lobby" } },
			);

			const firstPull = session.next();
			const sendPromise = session.send({ text: "hi" });
			await firstPull; // done — no value

			// The queued sender learns of the terminal state instead of hanging.
			await expect(sendPromise).rejects.toMatchObject({
				code: "INTERNAL_SERVER_ERROR",
				message: "Duplex session closed",
			});
		});
	});
});
