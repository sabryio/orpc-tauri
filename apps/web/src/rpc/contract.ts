import { z } from "zod";
import { oc } from "@orpc/contract";
import { asyncIteratorObject } from "@orpc/contract";
import { tauri } from "@sabryio/orpc-tauri/meta";
import { camelCase } from "change-case";

const PlanetSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().optional(),
});

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

export const contract = {
  ping: {
    ping: oc
      .meta(tauri.command("ping"))
      .input(z.void())
      .output(PingResponseSchema),
  },
  planet: {
    deletePlanet: oc
      .meta(tauri.command("delete_planet"))
      .input(z.object({ input: z.object({ id: z.number().int() }) }))
      .output(z.void())
      .errors(StandardApiErrors),
    createPlanet: oc
      .meta(tauri.command("create_planet"))
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
    findPlanet: oc
      .meta(tauri.command("find_planet"))
      .input(
        z.object({
          input: z.object({ id: z.number().int(), q: z.string().optional() }),
        }),
      )
      .output(PlanetSchema)
      .errors(StandardApiErrors),
    listPlanetsPaginated: oc
      .meta(tauri.command("list_planets_paginated"))
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
    listPlanets: oc
      .meta(tauri.command("list_planets"))
      .input(z.void())
      .output(z.array(PlanetSchema))
      .errors(StandardApiErrors),
  },
  stream: {
    streamEvents: oc
      .meta(tauri.command("stream_events"))
      .meta(
        tauri.transport({
          kind: "stream",
        }),
      )
      .input(z.void())
      .output(asyncIteratorObject(AppEventSchema)),
    streamEventsChannel: oc
      .meta(tauri.command("stream_events_channel"))
      .meta(tauri.transport({ kind: "channel", id: camelCase("on_event") }))
      .input(z.void())
      .output(asyncIteratorObject(AppEventSchema)),
  },
  file: {
    uploadFile: oc
      .meta(tauri.command("upload_file"))
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
  },
} as const;

export type Contract = typeof contract;
