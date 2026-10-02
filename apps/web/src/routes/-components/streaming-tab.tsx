import { Button } from "@tauri-orpc-contract/ui/components/button";
import { Card } from "@tauri-orpc-contract/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@tauri-orpc-contract/ui/components/tabs";
import { ScrollArea } from "@tauri-orpc-contract/ui/components/scroll-area";
import { Play, X } from "lucide-react";
import { EventCard } from "./event-card";

interface StreamEvent {
  message: string;
  count: number;
  id?: string;
  retry?: number;
}

interface StreamingTabProps {
  // Emit-Listen
  emitListenEvents: StreamEvent[];
  isEmitListenStreaming: boolean;
  onStartEmitListen: () => void;

  // Channel
  channelEvents: StreamEvent[];
  isChannelStreaming: boolean;
  onStartChannel: () => void;

  // Async Iterator
  asyncEvents: StreamEvent[];
  isAsyncStreaming: boolean;
  asyncError: string | null;
  asyncFinished: boolean;
  onStartAsync: () => void;
  onCancelAsync: () => void;
}

export function StreamingTab({
  emitListenEvents,
  isEmitListenStreaming,
  onStartEmitListen,
  channelEvents,
  isChannelStreaming,
  onStartChannel,
  asyncEvents,
  isAsyncStreaming,
  asyncError,
  asyncFinished,
  onStartAsync,
  onCancelAsync,
}: StreamingTabProps) {
  return (
    <Tabs defaultValue="emit-listen" className="h-full flex flex-col">
      <TabsList className="mb-4 bg-card border border-primary/30">
        <TabsTrigger value="emit-listen" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
          Emit-Listen
        </TabsTrigger>
        <TabsTrigger value="channel" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
          Channel
        </TabsTrigger>
        <TabsTrigger value="async-iterator" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
          Async Iterator
        </TabsTrigger>
      </TabsList>

      <TabsContent value="emit-listen" className="flex flex-col flex-1 min-h-0">
        <Card className="p-6 border-primary/30 bg-card flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-4 flex-none">
            <h3 className="text-sm font-semibold text-primary">Emit-Listen Transport</h3>
            <Button onClick={onStartEmitListen} disabled={isEmitListenStreaming} className="glow-hover">
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
            <h3 className="text-sm font-semibold text-primary">Channel Transport (Tauri Native)</h3>
            <Button onClick={onStartChannel} disabled={isChannelStreaming} className="glow-hover">
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

      <TabsContent value="async-iterator" className="flex flex-col flex-1 min-h-0">
        <Card className="p-6 border-primary/30 bg-card flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-4 flex-none">
            <h3 className="text-sm font-semibold text-primary">Async Iterator Pattern</h3>
            <div className="flex gap-2">
              <Button onClick={onStartAsync} disabled={isAsyncStreaming} className="glow-hover">
                <Play className="h-4 w-4 mr-2" />
                {isAsyncStreaming ? "Streaming..." : "Start"}
              </Button>
              {isAsyncStreaming && (
                <Button onClick={onCancelAsync} variant="destructive">
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
            {asyncFinished && (
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
  );
}
