import { getEventMeta } from "@/rpc";

interface EventCardProps {
  event: { message: string; count: number };
  index: number;
}

export function EventCard({ event, index }: EventCardProps) {
  const meta = getEventMeta(event);
  return (
    <div key={index} className="p-3 bg-card/50 border border-primary/20 rounded glow-hover transition-all">
      <p className="text-xs font-mono">
        <span className="text-muted-foreground">&gt;</span> <span className="text-primary">message:</span> {event.message}
      </p>
      <p className="text-xs font-mono">
        <span className="text-muted-foreground">&gt;</span> <span className="text-accent">count:</span> {event.count}
      </p>
      {meta && (
        <>
          {meta.id && (
            <p className="text-xs font-mono text-muted-foreground">
              <span className="text-muted-foreground">&gt;</span> event_id: {meta.id}
            </p>
          )}
          {meta.retry && (
            <p className="text-xs font-mono text-muted-foreground">
              <span className="text-muted-foreground">&gt;</span> retry: {meta.retry}ms
            </p>
          )}
        </>
      )}
    </div>
  );
}
