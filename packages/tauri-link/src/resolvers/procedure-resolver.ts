import { ORPCError } from "@orpc/client";
import { extractTauriMeta } from "../metadata";
import type { Contract, ORPCMeta } from "../types";

export class ProcedureResolver {
  constructor(private readonly contract: Contract) {}

  resolve(path: string[]): Record<string, unknown> | null {
    let target: unknown = this.contract;

    for (const segment of path) {
      if (!target || typeof target !== "object") return null;
      target = (target as Record<string, unknown>)[segment];
      if (!target) return null;
    }

    return target as Record<string, unknown>;
  }

  extractCommandName(path: string[]): string {
    const procedure = this.resolve(path);
    if (!procedure) {
      throw new ORPCError<"INTERNAL_ERROR", unknown>("INTERNAL_ERROR", {
        message: `Invalid procedure path: ${path.join(".")}`,
      });
    }

    const meta = (procedure["~orpc"] as ORPCMeta | undefined)?.meta?.[
      "~openapi"
    ];
    const commandPath = meta?.path;

    if (!commandPath) {
      throw new ORPCError<"INTERNAL_ERROR", unknown>("INTERNAL_ERROR", {
        message: `No openapi path found for procedure: ${path.join(".")}`,
      });
    }

    return commandPath.startsWith("/")
      ? commandPath.substring(1)
      : commandPath;
  }

  isStreaming(path: string[]): boolean {
    const procedure = this.resolve(path);
    if (!procedure) return false;

    const orpcMeta = procedure["~orpc"] as ORPCMeta | undefined;
    if (!orpcMeta) return false;

    const outputSchemas = orpcMeta.outputSchemas;
    if (!outputSchemas || outputSchemas.length === 0) return false;

    const outputSchema = outputSchemas[0];
    if (!outputSchema || typeof outputSchema !== "object") return false;

    const standard = (outputSchema as Record<string, unknown>)["~standard"];
    if (!standard || typeof standard !== "object") return false;

    const symbols = Object.getOwnPropertySymbols(standard);
    return symbols.some((sym) =>
      sym.toString().includes("ORPC_ASYNC_ITERATOR_OBJECT_SCHEMA_DETAILS"),
    );
  }

  getTransport(path: string[]): "emit-listen" | "channel" {
    const procedure = this.resolve(path);
    if (!procedure) return "emit-listen";

    const tauriMeta = extractTauriMeta(procedure);
    return tauriMeta?.transport ?? "emit-listen";
  }
}
