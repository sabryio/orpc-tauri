import { getEventMeta } from "@/rpc";
import type { AppEvent } from "@/rpc/contract";

interface EventCardProps {
  event: AppEvent & { _meta?: { id?: string; retry?: number } };
  index: number;
}

export function EventCard({ event, index }: EventCardProps) {
  const meta = getEventMeta(event);
  const preservedMeta = event._meta;

  // Use preserved metadata if Symbol metadata is lost
  const displayMeta = meta || preservedMeta;

  return (
    <div
      key={index}
      className="p-3 bg-card/50 border border-primary/20 rounded glow-hover transition-all"
    >
      {/* Event Type Badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono font-semibold text-primary/80 uppercase">
          {event.type}
        </span>
        {displayMeta?.id && (
          <span className="text-xs font-mono text-muted-foreground">
            #{displayMeta.id}
          </span>
        )}
      </div>

      {/* Event Data based on type */}
      {event.type === "stream" && (
        <>
          <p className="text-xs font-mono">
            <span className="text-muted-foreground">&gt;</span>{" "}
            <span className="text-primary">message:</span> {event.data.message}
          </p>
          <p className="text-xs font-mono">
            <span className="text-muted-foreground">&gt;</span>{" "}
            <span className="text-accent">count:</span> {event.data.count}
          </p>
        </>
      )}

      {event.type === "planet" && (
        <>
          <p className="text-xs font-mono">
            <span className="text-muted-foreground">&gt;</span>{" "}
            <span className="text-primary">operation:</span>{" "}
            <span className="text-green-500">{event.data.operation}</span>
          </p>
          {event.data.planet_id && (
            <p className="text-xs font-mono">
              <span className="text-muted-foreground">&gt;</span>{" "}
              <span className="text-accent">planet_id:</span>{" "}
              {event.data.planet_id}
            </p>
          )}
          {event.data.planet_name && (
            <p className="text-xs font-mono">
              <span className="text-muted-foreground">&gt;</span>{" "}
              <span className="text-accent">planet_name:</span>{" "}
              {event.data.planet_name}
            </p>
          )}
          <p className="text-xs font-mono text-muted-foreground">
            <span className="text-muted-foreground">&gt;</span> timestamp:{" "}
            {new Date(event.data.timestamp * 1000).toLocaleTimeString()}
          </p>
        </>
      )}

      {event.type === "system" && (
        <>
          <p className="text-xs font-mono">
            <span className="text-muted-foreground">&gt;</span>{" "}
            <span className="text-primary">status:</span>{" "}
            <span
              className={
                event.data.status === "healthy"
                  ? "text-green-500"
                  : event.data.status === "warning"
                    ? "text-yellow-500"
                    : "text-red-500"
              }
            >
              {event.data.status}
            </span>
          </p>
          <p className="text-xs font-mono">
            <span className="text-muted-foreground">&gt;</span>{" "}
            <span className="text-accent">message:</span> {event.data.message}
          </p>
        </>
      )}

      {/* Metadata */}
      {displayMeta && displayMeta.retry && (
        <p className="text-xs font-mono text-muted-foreground mt-1">
          <span className="text-muted-foreground">&gt;</span> retry:{" "}
          {displayMeta.retry}ms{" "}
          {preservedMeta && !meta && (
            <span className="text-green-500">(preserved)</span>
          )}
        </p>
      )}
      {!displayMeta && (
        <p className="text-xs font-mono text-destructive">
          <span className="text-muted-foreground">&gt;</span> ⚠️ No metadata
          (Symbol lost)
        </p>
      )}
    </div>
  );
}
