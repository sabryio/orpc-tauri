import { Button } from "@orpc-tauri/ui/components/button";
import { Card } from "@orpc-tauri/ui/components/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@orpc-tauri/ui/components/tabs";
import { ScrollArea } from "@orpc-tauri/ui/components/scroll-area";
import { Play, X } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { EventCard } from "./event-card";
import { CodeBlock } from "@/components/code-block";
import { useStreamEvents } from "@/hooks/use-stream-events";
import { client, getEventMeta, consumeAsyncIterator } from "@/rpc";
import type { AppEvent } from "@/rpc/contract";

const STREAM_HOOK_CODE = `// Custom hook pattern
const stream = useStreamEvents<EventType>();

stream.startStream(
  () => client.stream.streamEvents(undefined, {
    signal: new AbortController().signal,
  }),
  "Stream completed!",
);

// Access events
stream.events.map(event => ...)
stream.isStreaming // boolean`;

const ASYNC_ITERATOR_CODE = `// Direct async iterator consumption
const cancel = consumeAsyncIterator(
  client.stream.streamEvents(),
  {
    onEvent: (event) => {
      const meta = getEventMeta(event);
      setEvents(prev => [...prev, event]);
    },
    onError: (err) => toast.error("Failed"),
    onSuccess: () => toast.success("Done"),
    onFinish: () => setCancelled(true),
  }
);

// Cancel anytime
cancel();`;

const CHANNEL_CODE = `// Tauri Channel transport (no race condition)
const channelStream = useStreamEvents();

channelStream.startStream(
  () => client.stream.streamEventsChannel(undefined, {
    signal: new AbortController().signal,
  }),
  "Channel completed!",
);`;

type StreamEventWithMeta = AppEvent & {
  id?: string;
  retry?: number;
};

export function StreamingTab() {
  const stream = useStreamEvents<AppEvent>();
  const channelStream = useStreamEvents<AppEvent>();

  const [asyncEvents, setAsyncEvents] = useState<StreamEventWithMeta[]>([]);
  const [asyncStreaming, setAsyncStreaming] = useState(false);
  const [asyncError, setAsyncError] = useState<string | null>(null);
  const [asyncFinished, setAsyncFinished] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  const handleStartEmitListen = () =>
    stream.startStream(
      () =>
        client.stream.streamEvents(undefined, {
          signal: new AbortController().signal,
        }),
      "Stream completed!",
    );

  const handleStartChannel = () =>
    channelStream.startStream(
      () =>
        client.stream.streamEventsChannel(undefined, {
          signal: new AbortController().signal,
        }),
      "Channel stream completed!",
    );

  const handleStartAsync = () => {
    setAsyncStreaming(true);
    setAsyncEvents([]);
    setAsyncError(null);
    setAsyncFinished(false);

    const cancel = consumeAsyncIterator(client.stream.streamEvents(), {
      onEvent: (event) => {
        const meta = getEventMeta(event);
        setAsyncEvents((prev) => [
          ...prev,
          { ...event, id: meta?.id, retry: meta?.retry },
        ]);
      },
      onError: (err) => {
        setAsyncError(String(err));
        setAsyncStreaming(false);
        toast.error("Async stream failed");
      },
      onSuccess: () => {
        setAsyncStreaming(false);
        toast.success("Async stream completed!");
      },
      onFinish: () => {
        setAsyncFinished(true);
        setAsyncStreaming(false);
        cancelRef.current = null;
      },
    });

    cancelRef.current = cancel;
  };

  const handleCancelAsync = () => {
    if (cancelRef.current) {
      cancelRef.current();
      toast.info("Stream cancelled");
    }
  };

  const emitListenEvents = stream.events;
  const isEmitListenStreaming = stream.isStreaming;
  const channelEvents = channelStream.events;
  const isChannelStreaming = channelStream.isStreaming;
  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-3 gap-3 mb-4 flex-none">
        <CodeBlock title="Stream Hook Pattern" code={STREAM_HOOK_CODE} />
        <CodeBlock title="Async Iterator" code={ASYNC_ITERATOR_CODE} />
        <CodeBlock title="Channel Transport" code={CHANNEL_CODE} />
      </div>

      <Tabs defaultValue="emit-listen" className="flex flex-col flex-1 min-h-0">
        <TabsList className="mb-4 bg-card border border-primary/30 flex-none">
          <TabsTrigger
            value="emit-listen"
            className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
          >
            Emit-Listen
          </TabsTrigger>
          <TabsTrigger
            value="channel"
            className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
          >
            Channel
          </TabsTrigger>
          <TabsTrigger
            value="async-iterator"
            className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
          >
            Async Iterator
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="emit-listen"
          className="flex flex-col flex-1 min-h-0"
        >
          <Card className="p-6 border-primary/30 bg-card flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-4 flex-none">
              <h3 className="text-sm font-semibold text-primary">
                Emit-Listen Transport
              </h3>
              <Button
                onClick={handleStartEmitListen}
                disabled={isEmitListenStreaming}
                className="glow-hover"
              >
                <Play className="h-4 w-4 mr-2" />
                {isEmitListenStreaming ? "Streaming..." : "Start Stream"}
              </Button>
            </div>
            {emitListenEvents.length > 0 && (
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-2">
                  {emitListenEvents.map((event, index) => (
                    <EventCard key={index} event={event} index={index} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="channel" className="flex flex-col flex-1 min-h-0">
          <Card className="p-6 border-primary/30 bg-card flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-4 flex-none">
              <h3 className="text-sm font-semibold text-primary">
                Channel Transport (Tauri Native)
              </h3>
              <Button
                onClick={handleStartChannel}
                disabled={isChannelStreaming}
                className="glow-hover"
              >
                <Play className="h-4 w-4 mr-2" />
                {isChannelStreaming ? "Streaming..." : "Start Stream"}
              </Button>
            </div>
            {channelEvents.length > 0 && (
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-2">
                  {channelEvents.map((event, index) => (
                    <EventCard key={index} event={event} index={index} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </Card>
        </TabsContent>

        <TabsContent
          value="async-iterator"
          className="flex flex-col flex-1 min-h-0"
        >
          <Card className="p-6 border-primary/30 bg-card flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-4 flex-none">
              <h3 className="text-sm font-semibold text-primary">
                Async Iterator Pattern
              </h3>
              <div className="flex gap-2">
                <Button
                  onClick={handleStartAsync}
                  disabled={asyncStreaming}
                  className="glow-hover"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {asyncStreaming ? "Streaming..." : "Start"}
                </Button>
                {asyncStreaming && (
                  <Button onClick={handleCancelAsync} variant="destructive">
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            <div className="flex-none space-y-4">
              {asyncError && (
                <div className="p-3 bg-destructive/10 border border-destructive/50 rounded text-sm">
                  <strong>Error:</strong> {asyncError}
                </div>
              )}
              {asyncFinished && !asyncStreaming && (
                <div className="p-3 bg-success/10 border border-success/50 rounded text-sm">
                  Stream finished
                </div>
              )}
            </div>
            {asyncEvents.length > 0 && (
              <ScrollArea className="flex-1 min-h-0 mt-4">
                <div className="space-y-2">
                  {asyncEvents.map((event, index) => (
                    <EventCard key={index} event={event} index={index} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
