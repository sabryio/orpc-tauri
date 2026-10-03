import { SSE_EVENT_SUFFIXES } from "../constants";

/**
 * Event names for SSE streaming (data, error, done).
 */
export interface StreamEventNames {
  readonly data: string;
  readonly error: string;
  readonly done: string;
}

/**
 * Strategy for generating SSE event names.
 */
export interface EventNameStrategy {
  getEventNames(streamId: string): StreamEventNames;
}

/**
 * Default strategy: uses stream ID with standard suffixes.
 */
export class DefaultEventNameStrategy implements EventNameStrategy {
  getEventNames(streamId: string): StreamEventNames {
    return {
      data: `${streamId}${SSE_EVENT_SUFFIXES.DATA}`,
      error: `${streamId}${SSE_EVENT_SUFFIXES.ERROR}`,
      done: `${streamId}${SSE_EVENT_SUFFIXES.DONE}`,
    };
  }
}
