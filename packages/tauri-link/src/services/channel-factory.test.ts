import { Channel } from "@tauri-apps/api/core";
import { Cause, Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { TauriInvokeError } from "../errors";
import { TauriChannelFactory } from "./channel-factory";

describe("TauriChannelFactory", () => {
	it("should successfully create a channel", async () => {
		const mockChannel = { onmessage: null } as unknown as Channel<string>;

		const mockFactory = Layer.succeed(
			TauriChannelFactory,
			TauriChannelFactory.of({
				createChannel: <T>() => Effect.succeed(mockChannel as Channel<T>),
			}),
		);

		const program = Effect.gen(function* () {
			const factory = yield* TauriChannelFactory;
			return yield* factory.createChannel<string>();
		});

		const result = await Effect.runPromise(
			program.pipe(Effect.provide(mockFactory)),
		);

		expect(result).toBe(mockChannel);
	});

	it("should return TauriInvokeError on failure", async () => {
		const mockFactory = Layer.succeed(
			TauriChannelFactory,
			TauriChannelFactory.of({
				createChannel: () =>
					Effect.fail(
						new TauriInvokeError({
							command: "Channel.new",
							input: undefined,
							cause: new Error("Channel creation failed"),
						}),
					),
			}),
		);

		const program = Effect.gen(function* () {
			const factory = yield* TauriChannelFactory;
			return yield* factory.createChannel();
		});

		const result = await Effect.runPromiseExit(
			program.pipe(Effect.provide(mockFactory)),
		);

		expect(result._tag).toBe("Failure");
		if (result._tag === "Failure") {
			const errorResult = Cause.findError(result.cause);
			expect(errorResult._tag).toBe("Success");
			if (errorResult._tag === "Success") {
				expect(errorResult.success).toBeInstanceOf(TauriInvokeError);
				expect(errorResult.success.command).toBe("Channel.new");
			}
		}
	});

	it("should create channels with different type parameters", async () => {
		const stringChannel = { onmessage: null } as unknown as Channel<string>;
		const numberChannel = { onmessage: null } as unknown as Channel<number>;
		const objectChannel = {
			onmessage: null,
		} as unknown as Channel<{ id: number }>;

		let callCount = 0;
		const channels = [stringChannel, numberChannel, objectChannel];

		const mockFactory = Layer.succeed(
			TauriChannelFactory,
			TauriChannelFactory.of({
				createChannel: <T>() =>
					Effect.succeed(channels[callCount++] as Channel<T>),
			}),
		);

		const program = Effect.gen(function* () {
			const factory = yield* TauriChannelFactory;
			const c1 = yield* factory.createChannel<string>();
			const c2 = yield* factory.createChannel<number>();
			const c3 = yield* factory.createChannel<{ id: number }>();
			return [c1, c2, c3];
		});

		const result = await Effect.runPromise(
			program.pipe(Effect.provide(mockFactory)),
		);

		expect(result).toEqual([stringChannel, numberChannel, objectChannel]);
	});
});
