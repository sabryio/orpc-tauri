import { Effect, Layer } from "effect";
import { injectContextArg, resolveCallContext } from "./call-context";
import { camelCase } from "./casing";
import { DEFAULT_PARAMS, GLOBAL_EVENT_NAMES } from "./constants";
import { toORPCError } from "./error-converter";
import type { ContractValidationError } from "./errors";
import { AbortError, TimeoutError } from "./errors";
import type { StreamConfig } from "./link";
import { EffectTauriLink } from "./link";
import { validateContract } from "./resolvers/contract-validator";
import { ProcedureResolver } from "./resolvers/procedure-resolver";
import type { RustResourceHandle } from "./resource-handle";
import { fromCustomInvoke, TauriInvokerLive } from "./services/invoker";
import { ConsoleLoggerLive, fromSimpleLogger, Logger } from "./services/logger";
import { closeResource } from "./services/resource";
import type { EventNameStrategy } from "./streaming/event-name-strategy";
import { DefaultEventNameStrategy } from "./streaming/event-name-strategy";
import { makeProgressParser } from "./streaming/progress";
import type { ProgressInfo } from "./streaming/progress-types";
import type {
	CallOptions,
	Contract,
	DuplexOptions,
	DuplexSession,
	TauriLinkOptions,
	TauriResourceConfig,
	TauriTransportConfig,
} from "./types";

/**
 * Named boundary cast for streaming returns.
 *
 * For streaming procedures the link only ever produces the payload iterator;
 * oRPC's client owns the full `TOutput` contract shape (the `IteratorObject`
 * wrapper, `.streamed()` chainable, and friends), so the link's local typing
 * is deliberately narrower than the real `TOutput`. This helper documents
 * that boundary in one place instead of a bare `as TOutput` at every
 * streaming callsite — oRPC owns the type contract, the link contributes
 * only the values.
 */
const asProducer = <T>(it: AsyncIterableIterator<T>): T => it as T;

/**
 * Promise-based TauriLink facade over Effect implementation.
 *
 * Use `new TauriLink(contract, options)` for synchronous construction (throws on validation errors).
 * Or use `TauriLink.make()` factory for Effect-based construction with typed errors.
 *
 * `TauriLink<TContext>` types the request context (mirrors `OpenAPILink<TContext>`
 * — context is data-associated with calls, no HTML headers over IPC): link-level
 * defaults merge with per-call `context` (per-call wins) and are injected into
 * invoke args under the reserved `context` key, plus mirrored to a custom
 * `invoke`'s third argument. Rust commands opt in via `context: Option<CallCtx>`.
 */
export class TauriLink<TContext = unknown> {
	private readonly resolver: ProcedureResolver;
	private readonly appLayer;
	private readonly eventNameStrategy: EventNameStrategy;
	private readonly contextDefaults: TContext | (() => TContext) | undefined;

	constructor(contract: Contract, options?: TauriLinkOptions<TContext>) {
		const loggerLayer = options?.logger
			? fromSimpleLogger(options.logger)
			: ConsoleLoggerLive;

		// Use custom invoke if provided, otherwise default
		const invokerLayer = options?.invoke
			? fromCustomInvoke(options.invoke)
			: TauriInvokerLive;

		this.appLayer = Layer.merge(
			Layer.merge(EffectTauriLink.AppLayer, loggerLayer),
			invokerLayer,
		);
		this.eventNameStrategy =
			options?.eventNameStrategy ?? new DefaultEventNameStrategy();
		this.contextDefaults = options?.context;
		this.resolver = new ProcedureResolver(contract);

		// Run validation synchronously
		Effect.runSync(validateContract(contract));
	}

	/**
	 * Effect-based factory with typed errors.
	 *
	 * Recommended for applications using Effect throughout.
	 */
	static make<TContext = unknown>(
		contract: Contract,
		options?: TauriLinkOptions<TContext>,
	): Effect.Effect<TauriLink<TContext>, ContractValidationError> {
		return Effect.gen(function* () {
			yield* validateContract(contract);
			return new TauriLink<TContext>(contract, options);
		});
	}

	/**
	 * Execute a call using Effect internally.
	 *
	 * This is the Effect-native implementation. The public `call()` method
	 * wraps this with Promise conversion and error mapping.
	 */
	private callEffect<TInput, TOutput>(
		path: string[],
		input: TInput,
		callOptions?: CallOptions<TContext>,
		onHandle?: (rid: number) => void,
	) {
		const self = this;
		return Effect.gen(function* () {
			// Extract command name
			const commandName = yield* self.resolver.extractCommandName(path);
			const debug = self.resolver.getDebug(path);

			if (debug) {
				const logger = yield* Logger;
				yield* logger.log(`[TauriLink] ${commandName}`, {
					input,
					path: path.join("."),
				});
			}

			// Check abort signal
			if (callOptions?.signal?.aborted) {
				return yield* new AbortError({ reason: "Request aborted" });
			}

			// Client-side deadline from `tauri.timeout(...)` meta
			const timeoutMs = self.resolver.getTimeout(path);

			// Request context: link-level defaults merged with the per-call
			// override (per-call wins). Injected into invoke args under the
			// reserved `context` key; Rust commands opt in via
			// `context: Option<CallCtx>`.
			const context = resolveCallContext(
				self.contextDefaults,
				callOptions?.context,
			);

			// Handle streaming vs unary
			if (self.resolver.isStreaming(path)) {
				const transport = self.resolver.getTransport(path);
				const transportConfig = self.resolver.getTransportConfig(path);

				// Same injection as unary: the reserved `context` key rides the
				// args (next to streamId/eventNames/the channel param). No
				// separate parameter — the args are the single delivery path.
				const streamInput = injectContextArg(input, context);

				if (transport === "channel") {
					return asProducer(
						self.createChannelStream<TOutput>(
							commandName,
							streamInput,
							transportConfig,
							callOptions?.onProgress,
							timeoutMs,
							callOptions?.signal,
							self.resolver.getResource(path),
							onHandle,
						),
					);
				}

				return asProducer(
					self.createEventStream<TOutput>(
						commandName,
						streamInput,
						transportConfig,
						callOptions?.onProgress,
						timeoutMs,
						callOptions?.signal,
						self.resolver.getResource(path),
						onHandle,
					),
				);
			}

			// Unary call - pass input directly without wrapping
			const args = injectContextArg(
				input === undefined ? undefined : input,
				context,
			) as Record<string, unknown>;
			const callEffect = EffectTauriLink.call<Record<string, unknown>, TOutput>(
				commandName,
				args,
			);

			const timedEffect =
				timeoutMs !== undefined
					? callEffect.pipe(
							Effect.timeoutOrElse({
								duration: timeoutMs,
								orElse: () =>
									Effect.fail(
										new TimeoutError({
											operation: commandName,
											timeout: timeoutMs,
										}),
									),
							}),
						)
					: callEffect;

			const result = yield* timedEffect;

			if (debug) {
				const logger = yield* Logger;
				yield* logger.log(`[TauriLink] ${commandName} →`, result);
			}

			return result;
		});
	}

	async call<TInput, TOutput>(
		path: string[],
		input: TInput,
		callOptions?: CallOptions<TContext>,
	): Promise<TOutput> {
		return Effect.runPromise(
			this.callEffect<TInput, TOutput>(path, input, callOptions).pipe(
				Effect.provide(this.appLayer),
				Effect.mapError(toORPCError),
			),
		);
	}

	/**
	 * `call` plus the internal duplex rid-observation hook (`onHandle`) —
	 * same invocation path, just observes handle announcements. Not part
	 * of the public surface: only `duplex` passes a callback.
	 */
	private callInternal<TInput, TOutput>(
		path: string[],
		input: TInput,
		callOptions?: CallOptions<TContext>,
		onHandle?: (rid: number) => void,
	): Promise<TOutput> {
		return Effect.runPromise(
			this.callEffect<TInput, TOutput>(path, input, callOptions, onHandle).pipe(
				Effect.provide(this.appLayer),
				Effect.mapError(toORPCError),
			),
		);
	}
	private createEventStream<TOutput>(
		commandName: string,
		input: unknown,
		transportConfig: TauriTransportConfig | undefined,
		onProgress?: (info: ProgressInfo) => void,
		timeoutMs?: number,
		signal?: AbortSignal,
		resource?: TauriResourceConfig,
		onHandle?: (rid: number) => void,
	): AsyncIterableIterator<TOutput> {
		const listenConfig =
			transportConfig?.kind === "listen" ? transportConfig : undefined;

		// Check if transport config has stream ID configuration
		const hasStreamIdConfig = listenConfig?.id !== undefined;

		let streamId: string;
		let eventNames: { data: string; error: string; done: string };
		let inputWithStreamParams: unknown;

		if (hasStreamIdConfig && listenConfig) {
			// Case 1: Unique stream ID per call (default behavior)
			const idValue = listenConfig.id!.value;
			streamId = typeof idValue === "function" ? idValue() : idValue;

			// Use custom event generator or default strategy
			if (listenConfig.events) {
				eventNames = listenConfig.events.generator(streamId);
				// Include both streamId and eventNames in input
				inputWithStreamParams = {
					...(input as Record<string, unknown>),
					[listenConfig.id!.name]: streamId,
					[listenConfig.events.name]: eventNames,
				};
			} else {
				// Use default event name strategy with unique stream ID
				eventNames = this.eventNameStrategy.getEventNames(streamId);
				// Include only streamId in input
				inputWithStreamParams = {
					...(input as Record<string, unknown>),
					[listenConfig.id!.name]: streamId,
				};
			}
		} else {
			// Case 2: Global event names (no stream ID in input)
			// Use global default event names without unique ID
			streamId = ""; // No stream ID
			eventNames = {
				data: GLOBAL_EVENT_NAMES.DATA,
				error: GLOBAL_EVENT_NAMES.ERROR,
				done: GLOBAL_EVENT_NAMES.DONE,
			};
			// Don't add any stream parameters to input
			inputWithStreamParams = input;
		}

		const config: StreamConfig = {
			mode: "listen",
			listenConfig: {
				streamId: () => streamId,
				getEventNames: () => eventNames,
			},
			onProgress,
			progressParser: makeProgressParser(listenConfig?.progress),
			timeoutMs,
			signal,
			resource,
			onHandle,
		};

		// Same layering as the channel path — streams honor the custom
		// `invoke` option.
		return EffectTauriLink.stream<unknown, TOutput>(
			commandName,
			inputWithStreamParams,
			config,
			this.appLayer,
		);
	}

	private createChannelStream<TOutput>(
		commandName: string,
		input: unknown,
		transportConfig: TauriTransportConfig | undefined,
		onProgress?: (info: ProgressInfo) => void,
		timeoutMs?: number,
		signal?: AbortSignal,
		resource?: TauriResourceConfig,
		onHandle?: (rid: number) => void,
	): AsyncIterableIterator<TOutput> {
		const channelConfig =
			transportConfig?.kind === "channel" ? transportConfig : undefined;
		const transportId = channelConfig?.id;
		const channelParam: string =
			typeof transportId === "string"
				? camelCase(transportId)
				: transportId?.name
					? camelCase(transportId.name)
					: DEFAULT_PARAMS.CHANNEL;

		const config: StreamConfig = {
			mode: "channel",
			channelParam,
			onProgress,
			progressParser: makeProgressParser(channelConfig?.progress),
			timeoutMs,
			signal,
			resource,
			onHandle,
		};

		// Honors the custom `invoke` option for streams too: pass the
		// instance's own appLayer (custom invoker/logger) instead of the
		// static default AppLayer.
		return EffectTauriLink.stream<unknown, TOutput>(
			commandName,
			input,
			config,
			this.appLayer,
		);
	}

	/**
	 * Rust-resource lifecycle facade (mirrors `.call` / `.stream`).
	 */
	get resource(): {
		close: (
			handle: RustResourceHandle | { rid: number } | number,
		) => Promise<void>;
	} {
		return {
			// Rejects on failure (converted to ORPCError like every other
			// boundary) — a failed close leaves the Rust task running, so a
			// silent "successful" close would be a lie.
			close: async (handle): Promise<void> => {
				await Effect.runPromise(
					closeResource(handle).pipe(
						Effect.mapError(toORPCError),
						Effect.provide(this.appLayer),
					),
				);
			},
		};
	}

	/**
	 * Full-duplex session facade — rid + channel + unary = WebSockets.
	 *
	 * Pairs a streaming (session-starting) procedure with a unary (send)
	 * procedure. The rid is captured from the Rust side's `handle:<rid>`
	 * announcement and routed into every `send` automatically — the rid
	 * never enters consumer code. Teardown stays the stream's own:
	 * `break` (early `.return()`) or an aborted `signal` closes the rid
	 * through the default `autoClose` path; queued (pre-announcement)
	 * `send` calls reject when the session reaches any terminal state.
	 *
	 * ```ts
	 * const chat = await link.duplex(
	 *   ["chat", "chat_session"],
	 *   { send: ["chat", "chat_session_send"] },
	 *   { signal, startInput: { room } },
	 * );
	 * for await (const msg of chat) renderMessage(msg);
	 * await chat.send({ text: "hi" });
	 * ```
	 */
	async duplex<TMessage, TSendPayload>(
		startPath: readonly string[],
		pairing: {
			/** Route path of the paired unary (send) procedure. */
			readonly send: readonly string[];
			/**
			 * Input field of the send procedure that carries the rid. Must
			 * match the proc's own schema (`handle: ResourceHandleSchema` by
			 * convention); the payload passed to `.send()` excludes it.
			 */
			readonly handleField?: string;
		},
		options?: DuplexOptions<TContext>,
	): Promise<DuplexSession<TMessage, TSendPayload>> {
		const start = [...startPath];
		const send = [...pairing.send];
		const handleField = pairing.handleField ?? DEFAULT_PARAMS.HANDLE;

		// Fail BEFORE the stream starts — a mis-paired duplex should never
		// spin up a session it cannot send into.
		if (!this.resolver.isStreaming(start)) {
			throw toORPCError(
				new Error(
					`link.duplex: session procedure "${start.join(".")}" must be a streaming procedure (tauri.channel / tauri.listen meta)`,
				),
			);
		}
		if (this.resolver.isStreaming(send)) {
			throw toORPCError(
				new Error(
					`link.duplex: send procedure "${send.join(".")}" must be unary (non-streaming)`,
				),
			);
		}
		// Resolve the send route now so an unknown path fails fast with a
		// ProcedureNotFoundError instead of on the first `.send()` call.
		await Effect.runPromise(
			this.resolver.extractCommandName(send).pipe(Effect.mapError(toORPCError)),
		);

		// rid deferred — resolved by the `handle:<rid>` announcement,
		// rejected on abort or any terminal session state.
		let ridResolve!: (rid: number) => void;
		let ridReject!: (error: unknown) => void;
		let ridSettled = false;
		const ridPromise = new Promise<number>((resolve, reject) => {
			ridResolve = resolve;
			ridReject = reject;
		});

		const settleRid = (error: unknown) => {
			if (ridSettled) return;
			ridSettled = true;
			ridReject(error);
		};

		if (options?.signal) {
			const onAbort = () =>
				settleRid(new AbortError({ reason: "Duplex session aborted" }));
			options.signal.addEventListener("abort", onAbort, { once: true });
		}

		const callOptions: CallOptions<TContext> = {
			signal: options?.signal,
			onProgress: options?.onProgress,
			context: options?.context,
		};

		const iterator = await this.callInternal<unknown, TMessage>(
			start,
			{ input: options?.startInput },
			callOptions,
			// onHandle — first announcement wins (de-duplicated here).
			(rid) => {
				if (!ridSettled) {
					ridSettled = true;
					ridResolve(rid);
				}
			},
		);

		return new DuplexSessionIterator<TMessage, TSendPayload>(
			iterator as AsyncIterableIterator<TMessage>,
			() => ridPromise,
			// JS→Rust dispatch: the rid is injected AFTER the spread so the
			// injected handle always wins, whatever the payload claims.
			async (rid, payload) => {
				const sendInput = {
					...(payload as Record<string, unknown>),
					[handleField]: { rid },
				};
				await this.call<Record<string, unknown>, void>(
					send,
					{ input: sendInput },
					{ signal: options?.signal, context: options?.context },
				);
			},
			(error) => settleRid(error ?? new Error("Duplex session closed")),
		);
	}
}

/**
 * The public session state machine over an inner stream iterator.
 *
 * Delegates iteration (delegating `.return()` is what keeps `break` wired
 * to rid autoClose) and routes `send()` through the rid deferred: sends
 * arriving before the `handle:<rid>` announcement queue on the deferred
 * and either fire once it lands, or reject with the session's terminal
 * outcome (normal end, failure, or abort) — a queued send can never hang.
 */
class DuplexSessionIterator<TMessage, TSendPayload>
	implements DuplexSession<TMessage, TSendPayload>
{
	constructor(
		private readonly iterator: AsyncIterableIterator<TMessage>,
		private readonly waitRid: () => Promise<number>,
		private readonly invokeSend: (
			rid: number,
			payload: TSendPayload,
		) => Promise<void>,
		private readonly onTerminal: (error?: unknown) => void,
	) {}

	[Symbol.asyncIterator](): AsyncIterableIterator<TMessage> {
		return this;
	}

	async next(): Promise<IteratorResult<TMessage, undefined>> {
		try {
			const result = await this.iterator.next();
			if (result.done) {
				// Normal completion — Rust owns the rid; queued sends just
				// learn the session is over.
				this.onTerminal();
			}
			return result;
		} catch (error) {
			this.onTerminal(error);
			throw error;
		}
	}

	async return(
		value?: undefined,
	): Promise<IteratorResult<TMessage, undefined>> {
		// Consumer break: settle queued senders first (prompt failure), then
		// delegate — the inner `.return()` is what triggers rid autoClose.
		this.onTerminal();
		return (
			(await this.iterator.return?.(value)) ??
			({ done: true, value } as IteratorResult<TMessage, undefined>)
		);
	}

	async throw(error?: unknown): Promise<IteratorResult<TMessage, undefined>> {
		try {
			return (
				(await this.iterator.throw?.(error)) ??
				({ done: true } as IteratorResult<TMessage, undefined>)
			);
		} catch (e) {
			this.onTerminal(e);
			throw e;
		}
	}

	async send(payload: TSendPayload): Promise<void> {
		let rid: number;
		try {
			rid = await this.waitRid();
		} catch (error) {
			// Terminal session state — convert at the boundary (idempotent
			// for already-converted ORPCError).
			throw toORPCError(error);
		}
		await this.invokeSend(rid, payload);
	}
}
