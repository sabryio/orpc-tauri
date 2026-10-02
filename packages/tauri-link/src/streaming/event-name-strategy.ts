export interface StreamEventNames {
  data: string;
  done: string;
  error: string;
}

export interface EventNameStrategy {
  getEventNames(streamId: string): StreamEventNames;
}

export class DefaultEventNameStrategy implements EventNameStrategy {
  constructor(
    private readonly prefix: string = "stream",
    private readonly separator: string = ":",
  ) {}

  getEventNames(streamId: string): StreamEventNames {
    const base = `${this.prefix}${this.separator}${streamId}${this.separator}`;
    return {
      data: `${base}data`,
      done: `${base}done`,
      error: `${base}error`,
    };
  }
}
