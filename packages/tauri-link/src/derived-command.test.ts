import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { ContractValidationError } from "./errors";
import { tauri } from "./metadata";
import { validateContract } from "./resolvers/contract-validator";
import { ProcedureResolver } from "./resolvers/procedure-resolver";

/**
 * Minimal procedure shape mirroring what octave oRPC attaches to contract
 * leaves: a `~orpc` key containing meta (which may carry `~tauri`).
 */
function procedure(command?: string): Record<string, unknown> {
	return {
		"~orpc": {
			meta: command ? { "~tauri": { command } } : {},
			outputSchemas: [],
		},
	};
}

describe("derived command names", () => {
	describe("ProcedureResolver.extractCommandName", () => {
		it("derives the command from the last route segment when no meta exists", async () => {
			const resolver = new ProcedureResolver({
				planet: { delete_planet: procedure() },
			});

			const result = Effect.runPromise(
				resolver.extractCommandName(["planet", "delete_planet"]),
			);

			await expect(result).resolves.toBe("delete_planet");
		});

		it("uses the last route segment verbatim (no case conversion)", async () => {
			const resolver = new ProcedureResolver({
				planet: { list_planets_paginated: procedure() },
				file: { upload_file: procedure() },
			});

			await expect(
				Effect.runPromise(
					resolver.extractCommandName(["planet", "list_planets_paginated"]),
				),
			).resolves.toBe("list_planets_paginated");

			await expect(
				Effect.runPromise(resolver.extractCommandName(["file", "upload_file"])),
			).resolves.toBe("upload_file");
		});

		it("explicit command metadata wins over the derived route key", async () => {
			const resolver = new ProcedureResolver({
				planet: { delete_planet: procedure("custom_command") },
			});

			await expect(
				Effect.runPromise(
					resolver.extractCommandName(["planet", "delete_planet"]),
				),
			).resolves.toBe("custom_command");
		});

		it("fails with ProcedureNotFoundError for unknown paths", async () => {
			const resolver = new ProcedureResolver({});

			const exit = await Effect.runPromiseExit(
				resolver.extractCommandName(["missing", "path"]),
			);

			expect(Exit.isFailure(exit)).toBe(true);
		});
	});

	describe("validateContract", () => {
		it("accepts derived names that are unique", async () => {
			const contract = {
				planet: {
					delete_planet: procedure(),
					create_planet: procedure(),
				},
				file: { upload_file: procedure("upload_file") },
			};

			const exit = await Effect.runPromiseExit(validateContract(contract));

			expect(Exit.isSuccess(exit)).toBe(true);
		});

		it("rejects duplicate derived names from different routes", async () => {
			const contract = {
				planet: { delete_planet: procedure() },
				other: { delete_planet: procedure() },
			};

			await expect(
				Effect.runPromise(validateContract(contract)),
			).rejects.toBeInstanceOf(ContractValidationError);
		});

		it("rejects an explicit command colliding with a derived one", async () => {
			const contract = {
				planet: { delete_planet: procedure() },
				other: { renamed: procedure("delete_planet") },
			};

			await expect(
				Effect.runPromise(validateContract(contract)),
			).rejects.toBeInstanceOf(ContractValidationError);
		});
	});

	describe("tauri.listen / tauri.channel helpers", () => {
		it("tauri.listen() sets a listen transport", () => {
			const meta = tauri.listen().init({})["~tauri" as never] as unknown as {
				transport?: { kind: string };
			};

			expect(meta.transport).toEqual({ kind: "listen" });
		});

		it("tauri.channel('onEvent') sets a channel transport with an id", () => {
			const meta = tauri.channel("onEvent").init({})[
				"~tauri" as never
			] as unknown as {
				transport?: { kind: string; id?: unknown };
			};

			expect(meta.transport).toEqual({ kind: "channel", id: "onEvent" });
		});

		it("normalizes snake_case channel ids to camelCase", () => {
			const meta = tauri.channel("on_event").init({})[
				"~tauri" as never
			] as unknown as {
				transport?: { kind: string; id?: unknown };
			};

			expect(meta.transport).toEqual({ kind: "channel", id: "onEvent" });
		});

		it("normalizes the name of id objects passed to tauri.channel", () => {
			const meta = tauri.channel({ name: "event_received" }).init({})[
				"~tauri" as never
			] as unknown as {
				transport?: { kind: string; id?: unknown };
			};

			expect(meta.transport).toEqual({
				kind: "channel",
				id: { name: "eventReceived" },
			});
		});

		it("tauri.channel() omits id (link falls back to the default param)", () => {
			const meta = tauri.channel().init({})["~tauri" as never] as unknown as {
				transport?: { kind: string; id?: unknown };
			};

			expect(meta.transport).toEqual({ kind: "channel" });
		});

		it("tauri.channel attaches the progress convention to the transport", () => {
			const parser = (comment: string) =>
				comment.startsWith("tick:") ? { bytesTransferred: 1 } : undefined;

			const meta = tauri.channel("on_event", { prefix: "pct:" }).init({})[
				"~tauri" as never
			] as unknown as {
				transport?: { kind: string; id?: unknown; progress?: unknown };
			};

			expect(meta.transport).toEqual({
				kind: "channel",
				id: "onEvent",
				progress: { prefix: "pct:" },
			});

			const custom = tauri
				.channel(undefined, {
					parser,
				})
				.init({})["~tauri" as never] as unknown as {
				transport?: { kind: string; progress?: unknown };
			};

			expect(custom.transport?.progress).toEqual({ parser });
		});
	});
});
