import { ORPCError } from "@orpc/client";
import { Effect } from "effect";
import { EffectTauriLink } from "./link";
import { toORPCError } from "./error-converter";
import { ContractValidator } from "./resolvers/contract-validator";
import { ProcedureResolver } from "./resolvers/procedure-resolver";
import { ConsoleLogger } from "./logger";
import { DefaultEventNameStrategy } from "./streaming/event-name-strategy";
import type {
	Contract,
	CallOptions,
	TauriLinkOptions,
	Logger,
	TauriTransportConfig,
} from "./types";
import type { StreamConfig } from "./link";
import type { EventNameStrategy } from "./streaming/event-name-strategy";

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
			const result = await Effect.runPromise(
				effect.pipe(Effect.provide(EffectTauriLink.AppLayer)),
			);

			if (debug) {
				this.logger.log(`[TauriLink] ${commandName} →`, result);
			}

			return result;
		} catch (error) {
			if (debug) {
				this.logger.error(`[TauriLink] ${commandName} ✗`, error);
			}
			throw toORPCError(error);
		}
	}

	private createEventStream<TOutput>(
		commandName: string,
		input: unknown,
	): AsyncIterableIterator<TOutput> {
		// Generate unique stream ID
		const streamId = crypto.randomUUID();
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
}
