import { asyncIteratorObject, oc } from "@orpc/contract";
import { tauri } from "orpc-tauri/meta";
import { z } from "zod";

const PlanetSchema = z.object({
	id: z.number().int(),
	name: z.string(),
	description: z.string().optional(),
});

// ============================================================================
// Resource Handles - Rust resource table refs (Tauri Resource protocol)
// ============================================================================

// Wire format is a plain `{ rid }` — matching `RustResourceHandle` from
// `orpc-tauri` (the brand there is compile-time only, never serialized).
const ResourceRefSchema = z.object({ rid: z.number().int().min(0) });
const ResourceHandleSchema = ResourceRefSchema;

// ============================================================================
// SSE Event Types - Discriminated Union matching Rust AppEvent enum
// ============================================================================

// Planet operation types
const PlanetOperationSchema = z.enum([
	"created",
	"updated",
	"deleted",
	"listed",
]);

// System status types
const SystemStatusSchema = z.enum(["healthy", "warning", "error"]);

// Discriminated union for all app events
const AppEventSchema = z.discriminatedUnion("type", [
	// Stream events
	z.object({
		type: z.literal("stream"),
		data: z.object({
			message: z.string(),
			count: z.number().int(),
		}),
	}),

	// Planet CRUD events
	z.object({
		type: z.literal("planet"),
		data: z.object({
			operation: PlanetOperationSchema,
			planet_id: z.number().int().optional(),
			planet_name: z.string().optional(),
			timestamp: z.number().int(),
		}),
	}),

	// System/health events
	z.object({
		type: z.literal("system"),
		data: z.object({
			status: SystemStatusSchema,
			message: z.string(),
		}),
	}),
]);

export type AppEvent = z.infer<typeof AppEventSchema>;

// Helper type extractors for type-safe event handling
export type StreamEvent = Extract<AppEvent, { type: "stream" }>;
export type PlanetEvent = Extract<AppEvent, { type: "planet" }>;
export type SystemEvent = Extract<AppEvent, { type: "system" }>;

// ============================================================================
// Domain Types - Ping
// ============================================================================

const PingResponseSchema = z.object({
	id: z.uuid(),
	message: z.string(),
});

// ============================================================================
// Domain Types - File Transfer
// ============================================================================

// Each download chunk arrives as a JSON byte array (Vec<u8> over IPC);
// transform into raw bytes for the consumer.
const FileChunkSchema = z
	.array(z.number())
	.transform((bytes) => new Uint8Array(bytes));

// ============================================================================
// Domain Types - Duplex Chat (link.duplex: rid + channel + unary)
// ============================================================================

const ChatMessageSchema = z.object({
	id: z.number().int(),
	/** `you` = JS sender echo, `rust` = the bot worker. */
	from: z.string(),
	text: z.string(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ============================================================================
// Error Schemas
// ============================================================================

const StandardApiErrors = {
	NOT_FOUND: {},
	INTERNAL: {
		data: z.object({ msg: z.string() }),
	},
} as const;

// ============================================================================
// API Contract - Pure Tauri (No OpenAPI)
// ============================================================================
//
// Route keys are the Rust command names (snake_case, verbatim). The link
// derives the command from the last route segment, so `tauri.command(...)`
// meta is only needed as an explicit override.

export const contract = {
	ping: {
		ping: oc.input(z.void()).output(PingResponseSchema),
	},
	planet: {
		delete_planet: oc
			.input(z.object({ input: z.object({ id: z.number().int() }) }))
			.output(z.void())
			.errors(StandardApiErrors),
		create_planet: oc
			.input(
				z.object({
					input: z.object({
						name: z.string(),
						description: z.string().optional(),
					}),
				}),
			)
			.output(PlanetSchema)
			.errors(StandardApiErrors),
		find_planet: oc
			.input(
				z.object({
					input: z.object({ id: z.number().int(), q: z.string().optional() }),
				}),
			)
			.output(PlanetSchema)
			.errors(StandardApiErrors),
		list_planets_paginated: oc
			.input(
				z.object({
					input: z.object({
						limit: z.number().int(),
						offset: z.number().int().optional(),
					}),
				}),
			)
			.output(
				z.object({
					items: z.array(PlanetSchema),
					next_page_param: z.number().int().optional(),
				}),
			)
			.errors(StandardApiErrors),
		list_planets: oc
			.input(z.void())
			.output(z.array(PlanetSchema))
			.errors(StandardApiErrors),
	},
	stream: {
		stream_events: oc
			.meta(
				tauri.listen(), // Event-based streaming (SSE-style) — frontend listens
			)
			.input(z.void())
			.output(asyncIteratorObject(AppEventSchema)),
		stream_events_channel: oc
			.meta(
				tauri.channel("on_event"), // Rust command param, verbatim — normalized over IPC
			)
			.input(z.void())
			.output(asyncIteratorObject(AppEventSchema)),
	},
	file: {
		upload_file: oc
			.input(
				z.object({
					input: z.object({
						content: z.instanceof(Uint8Array), // Raw bytes
						filename: z.string(),
					}),
				}),
			)
			.output(
				z.object({
					success: z.boolean(),
					size: z.number().int(),
					filename: z.string(),
					mime_type: z.string().optional(),
				}),
			)
			.errors(StandardApiErrors),
		download_file: oc
			.meta(
				tauri.channel("on_event"), // Rust command param, verbatim — normalized over IPC
				tauri.resource(), // Announces handle:<rid>; autoClose on abnormal stream exit
			)
			.input(
				z.object({
					input: z.object({
						total_bytes: z.number().int().optional(), // Defaults to 256 KiB in Rust (capped at 2 MB)
					}),
				}),
			)
			.output(asyncIteratorObject(FileChunkSchema)),
	},
	resource: {
		db_open: oc
			.meta(tauri.resource())
			.input(z.object({ input: z.object({ path: z.string().min(1) }) }))
			.output(ResourceRefSchema)
			.errors(StandardApiErrors),
		db_query: oc
			.meta(tauri.resource())
			.input(
				z.object({
					input: z.object({
						handle: ResourceHandleSchema,
						sql: z.string().min(1),
					}),
				}),
			)
			.output(z.array(PlanetSchema))
			.errors(StandardApiErrors),
		db_close: oc
			.input(z.object({ input: z.object({ handle: ResourceHandleSchema }) }))
			.output(z.void())
			.errors(StandardApiErrors),
		resource_file_download: oc
			.meta(
				tauri.channel("on_event"), // Rust command param, verbatim — normalized over IPC
				tauri.resource(), // handle:<rid> → JS-cancelable server-side transfer
			)
			.input(
				z.object({
					input: z.object({
						total_bytes: z.number().int().optional(), // Defaults to 256 KiB in Rust (capped at 2 MB)
					}),
				}),
			)
			.output(asyncIteratorObject(FileChunkSchema)),
	},

	// ============================================================================
	// Duplex Chat - link.duplex (rid + channel + unary = WebSockets)
	// ============================================================================
	//
	// The session is a Rust resource (`tokio::mpsc` inside); the rid is
	// announced as `handle:<rid>` and injected into the paired send command
	// by the link — the send payload excludes `handle` (link-owned field).

	chat: {
		chat_session: oc
			.meta(
				tauri.channel("on_event"), // Rust command param, verbatim — normalized over IPC
				tauri.resource(), // the session rid announced as handle:<rid>; autoClose on break/abort
			)
			.input(z.object({ input: z.object({ room: z.string().min(1) }) }))
			.output(asyncIteratorObject(ChatMessageSchema))
			.errors(StandardApiErrors),
		chat_session_send: oc
			.input(
				z.object({
					input: z.object({
						handle: ResourceHandleSchema, // injected by link.duplex from the captured rid
						text: z.string().max(2000),
					}),
				}),
			)
			.output(z.void())
			.errors(StandardApiErrors),
	},

	// ============================================================================
	// Raw Binary - `tauri.binary()` convention (ADVANCED_FEATURES.md item 1)
	// ============================================================================

	// Chunks arrive from the link as real ArrayBuffers — raw IPC bodies
	// (`Channel<InvokeResponseBody>`), NOT JSON byte arrays: the channel
	// transport yields the decoded raw message untouched and keeps parsing
	// JSON control envelopes (flush / progress / done).
	raw: {
		raw_download: oc
			.meta(tauri.channel("on_event"))
			.input(z.object({ input: z.object({ path: z.string().min(1) }) }))
			.output(asyncIteratorObject(z.instanceof(ArrayBuffer)))
			.errors(StandardApiErrors),
	},
} as const;

export type Contract = typeof contract;
