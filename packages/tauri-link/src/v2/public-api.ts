import { ORPCError } from "@orpc/client";
import { Effect } from "effect";
import { EffectTauriLink } from "./link";
import { ContractValidator } from "../resolvers/contract-validator";
import { ProcedureResolver } from "../resolvers/procedure-resolver";
import { ConsoleLogger } from "../logger";
import { DefaultEventNameStrategy } from "../streaming/event-name-strategy";
import type {
	Contract,
	CallOptions,
	TauriLinkOptions,
	Logger,
	TauriTransportConfig,
} from "../types";
import type { StreamConfig } from "./link";
import type { EventNameStrategy } from "../streaming/event-name-strategy";

/**
 * Promise-based TauriLink facade over Effect implementation.
 *
 * Maintains backward compatibility - same constructor, same method signatures,
 * same error types. Effect is used internally for resource management and
 * type safety, but the public API remains Promise-based.
 */
export class TauriLink<TContext = unknown> {
	private readonly resolver: ProcedureResolver;
	private readonly logger: Logger;
	private readonly eventNameStrategy: EventNameStrategy;

	constructor(contract: Contract, options?: TauriLinkOptions) {
		this.logger = options?.logger ?? new ConsoleLogger();
		this.eventNameStrategy =
			options?.eventNameStrategy ?? new DefaultEventNameStrategy();

		this.resolver = new ProcedureResolver(contract);
		new ContractValidator().validate(contract);
	}

	async call<TInput, TOutput>(
		path: string[],
		input: TInput,
		callOptions?: CallOptions<TContext>,
	): Promise<TOutput> {
		const commandName = this.resolver.extractCommandName(path);
		const debug = this.resolver.getDebug(path);

		if (debug) {
			this.logger.log(`[TauriLink] ${commandName}`, {
				input,
				path: path.join("."),
			});
		}

		if (callOptions?.signal?.aborted) {
			throw new ORPCError<"INTERNAL_ERROR", unknown>("INTERNAL_ERROR", {
				message: "Request aborted",
			});
		}

		try {
			if (this.resolver.isStreaming(path)) {
				const transport = this.resolver.getTransport(path);
				const transportConfig = this.resolver.getTransportConfig(path);

				if (transport === "channel") {
					return this.createChannelStream<TOutput>(
						commandName,
						input,
						transportConfig,
					) as TOutput;
				}

				return this.createEventStream<TOutput>(commandName, input) as TOutput;
			}

			// Unary call - run Effect and convert to Promise
			// Wrap input in { input: ... } to match Tauri command signature
			const args =
				input === undefined ? {} : { input: input === null ? null : input };
			const effect = EffectTauriLink.call<
				Record<string, unknown>,
				TOutput
			>(commandName, args);
			return await Effect.runPromise(
				effect.pipe(Effect.provide(EffectTauriLink.AppLayer)),
			);
		} catch (error) {
			throw this.toORPCError(error);
		}
	}

	private createEventStream<TOutput>(
		commandName: string,
		input: unknown,
	): AsyncIterableIterator<TOutput> {
		// Generate unique stream ID
		const streamId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		const eventNames = this.eventNameStrategy.getEventNames(streamId);

		const config: StreamConfig = {
			mode: "event",
			eventConfig: {
				streamId: () => streamId,
				getEventNames: () => eventNames,
			},
		};

		// createEventStream will merge input with streamId/eventNames internally
		return EffectTauriLink.stream<unknown, TOutput>(commandName, input, config);
	}

	private createChannelStream<TOutput>(
		commandName: string,
		input: unknown,
		transportConfig: TauriTransportConfig | undefined,
	): AsyncIterableIterator<TOutput> {
		// Extract channel parameter name from transport config
		let channelParam = "channel"; // default
		if (transportConfig?.kind === "channel") {
			channelParam =
				typeof transportConfig.id === "string"
					? transportConfig.id
					: transportConfig.id.name;
		}

		const config: StreamConfig = {
			mode: "channel",
			channelParam,
		};

		// createChannelStream will merge input with channel parameter internally
		return EffectTauriLink.stream<unknown, TOutput>(commandName, input, config);
	}

	private toORPCError(error: unknown): ORPCError<string, unknown> {
		// Unwrap Effect errors (TauriInvokeError, etc.) to get the original Tauri error
		const unwrapped =
			error &&
			typeof error === "object" &&
			"cause" in error &&
			error.cause !== undefined
				? error.cause
				: error;

		// Check if it's a Tauri error payload with code/message/data structure
		if (
			typeof unwrapped === "object" &&
			unwrapped !== null &&
			"code" in unwrapped &&
			typeof unwrapped.code === "string" &&
			"message" in unwrapped &&
			typeof (unwrapped as any).message === "string"
		) {
			const tauriError = unwrapped as {
				code: string;
				message: string;
				data?: unknown;
				defined?: boolean;
			};

			const orpcError = new ORPCError(tauriError.code, {
				message: tauriError.message,
				data: tauriError.data,
			});

			// Preserve 'defined' flag for contract-defined errors
			if (tauriError.defined === true) {
				Object.defineProperty(orpcError, "defined", {
					value: true,
					writable: false,
					enumerable: true,
					configurable: false,
				});
			}

			return orpcError;
		}

		// Already an ORPCError
		if (unwrapped instanceof ORPCError) {
			return unwrapped;
		}

		// Generic error fallback
		if (unwrapped instanceof Error) {
			return new ORPCError("INTERNAL_ERROR", {
				message: unwrapped.message,
				cause: unwrapped,
			});
		}

		return new ORPCError("INTERNAL_ERROR", {
			message: "Unknown error",
			cause: unwrapped,
		});
	}
}
