import { getEventMeta } from "@/rpc";

interface EventCardProps {
  event: {
    message: string;
    count: number;
    _meta?: { id?: string; retry?: number };
  };
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
      <p className="text-xs font-mono">
        <span className="text-muted-foreground">&gt;</span>{" "}
        <span className="text-primary">message:</span> {event.message}
      </p>
      <p className="text-xs font-mono">
        <span className="text-muted-foreground">&gt;</span>{" "}
        <span className="text-accent">count:</span> {event.count}
      </p>
      {displayMeta && (
        <>
          {displayMeta.id && (
            <p className="text-xs font-mono text-muted-foreground">
              <span className="text-muted-foreground">&gt;</span> event_id:{" "}
              {displayMeta.id}{" "}
              {preservedMeta && !meta && (
                <span className="text-green-500">(preserved)</span>
              )}
            </p>
          )}
          {displayMeta.retry && (
            <p className="text-xs font-mono text-muted-foreground">
              <span className="text-muted-foreground">&gt;</span> retry:{" "}
              {displayMeta.retry}ms{" "}
              {preservedMeta && !meta && (
                <span className="text-green-500">(preserved)</span>
              )}
            </p>
          )}
        </>
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
