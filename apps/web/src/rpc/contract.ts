import { z } from "zod";
import { oc } from "@orpc/contract";
import { asyncIteratorObject } from "@orpc/contract";
import { tauri } from "@tauri-orpc-contract/tauri-link";

export const PlanetSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().optional(),
});

// ============================================================================
// SSE Event Types
// ============================================================================

export const SseEventSchema = z.object({
  message: z.string(),
  count: z.number().int(),
});

export type SseEvent = z.infer<typeof SseEventSchema>;

// ============================================================================
// Domain Types - Ping
// ============================================================================

export const PingResponseSchema = z.object({
  id: z.uuid(),
  message: z.string(),
});

export type PingResponse = z.infer<typeof PingResponseSchema>;

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
      .input(z.object({ id: z.number().int() }))
      .output(z.void())
      .errors(StandardApiErrors),
    createPlanet: oc
      .meta(tauri.command("create_planet"))
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
        }),
      )
      .output(PlanetSchema)
      .errors(StandardApiErrors),
    findPlanet: oc
      .meta(tauri.command("find_planet"))
      .input(z.object({ id: z.number().int(), q: z.string().optional() }))
      .output(PlanetSchema)
      .errors(StandardApiErrors),
    listPlanetsPaginated: oc
      .meta(tauri.command("list_planets_paginated"))
      .input(
        z.object({
          limit: z.number().int(),
          offset: z.number().int().optional(),
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
      .meta(tauri.transport("emit-listen"))
      .input(z.void())
      .output(asyncIteratorObject(SseEventSchema)),
    streamEventsChannel: oc
      .meta(tauri())
      .meta(tauri.command("stream_events_channel"))
      .meta(tauri.transport("channel"))
      .input(z.void())
      .output(asyncIteratorObject(SseEventSchema)),
  },
} as const;

export type Contract = typeof contract;
