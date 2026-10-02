export interface Logger {
  log(message: string, data?: unknown): void;
  error(message: string, error?: unknown): void;
}

export class ConsoleLogger implements Logger {
  log(message: string, data?: unknown): void {
    if (data !== undefined) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  }

  error(message: string, error?: unknown): void {
    if (error !== undefined) {
      console.error(message, error);
    } else {
      console.error(message);
    }
  }
}

export class NoopLogger implements Logger {
  log(): void {}
  error(): void {}
}
