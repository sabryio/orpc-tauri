import { z } from "zod";
import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import { asyncIteratorObject } from "@orpc/contract";

export const PlanetSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().optional(),
});

// ============================================================================
// SSE Event Types
// ============================================================================

// ============================================================================
// Enum Types
// ============================================================================

export const SseEventSchema = z.object({
  message: z.string(),
  count: z.number().int(),
});

export type SseEvent = z.infer<typeof SseEventSchema>;

export const StreamChannelEventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("data"),
    data: z.object({
      message: z.string(),
      count: z.number().int(),
    }),
  }),
  z.object({
    event: z.literal("done"),
  }),
  z.object({
    event: z.literal("error"),
    data: z.object({
      message: z.string(),
    }),
  }),
]);

export type StreamChannelEvent = z.infer<typeof StreamChannelEventSchema>;

// ============================================================================
// Domain Types - Better Auth Rorpc Example Domain Models Ping
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
// API Contract
// ============================================================================

export const contract = {
  ping: {
    ping: oc
      .meta(openapi({ method: "GET", path: "/ping" }))
      .input(z.void())
      .output(PingResponseSchema),
  },
  planet: {
    deletePlanet: oc
      .meta(openapi({ method: "DELETE", path: "/delete_planet" }))
      .input(z.object({ id: z.number().int() }))
      .output(z.void())
      .errors(StandardApiErrors),
    createPlanet: oc
      .meta(openapi({ method: "POST", path: "/create_planet" }))
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
        }),
      )
      .output(PlanetSchema)
      .errors(StandardApiErrors),
    findPlanet: oc
      .meta(openapi({ method: "GET", path: "/find_planet" }))
      .input(z.object({ id: z.number().int(), q: z.string().optional() }))
      .output(PlanetSchema)
      .errors(StandardApiErrors),
    listPlanetsPaginated: oc
      .meta(openapi({ method: "GET", path: "/list_planets_paginated" }))
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
      .meta(openapi({ method: "GET", path: "/list_planets" }))
      .input(z.void())
      .output(z.array(PlanetSchema))
      .errors(StandardApiErrors),
  },
  stream: {
    streamEvents: oc
      .meta(openapi({ method: "GET", path: "/stream_events" }))
      .input(z.void())
      .output(asyncIteratorObject(SseEventSchema)),
    streamEventsChannel: oc
      .meta(openapi({ method: "GET", path: "/stream_events_channel" }))
      .input(z.void())
      .output(asyncIteratorObject(SseEventSchema)),
  },
} as const;

export type Contract = typeof contract;
