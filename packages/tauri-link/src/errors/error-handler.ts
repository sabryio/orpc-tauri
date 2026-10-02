import { ORPCError } from "@orpc/client";
import type { TauriErrorPayload } from "../types";

export class ErrorHandler {
  static isTauriORPCError(error: unknown): error is TauriErrorPayload {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      "message" in error &&
      typeof (error as TauriErrorPayload).message === "string"
    );
  }

  static toORPCError(
    error: unknown,
    context: string,
  ): ORPCError<string, unknown> {
    if (this.isTauriORPCError(error)) {
      const orpcError = new ORPCError<string, unknown>(
        error.code || "INTERNAL_ERROR",
        {
          message: error.message || "Unknown error",
          data: error.data,
        },
      );

      if (error.defined === true) {
        Object.defineProperty(orpcError, "defined", {
          value: true,
          writable: false,
          enumerable: true,
          configurable: false,
        });
      }

      return orpcError;
    }

    if (error instanceof ORPCError) {
      return error as ORPCError<string, unknown>;
    }

    return new ORPCError<"INTERNAL_ERROR", unknown>("INTERNAL_ERROR", {
      message: error instanceof Error ? error.message : context,
      cause: error,
    });
  }
}
