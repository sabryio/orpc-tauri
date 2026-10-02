import { Button } from "@tauri-orpc-contract/ui/components/button";
import { Card } from "@tauri-orpc-contract/ui/components/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@tauri-orpc-contract/ui/components/tabs";
import { ScrollArea } from "@tauri-orpc-contract/ui/components/scroll-area";
import { Play } from "lucide-react";
import { EventCard } from "./event-card";
import type { UseQueryResult } from "@tanstack/react-query";

interface StreamEvent {
  message: string;
  count: number;
  id?: string;
  retry?: number;
}

interface AdvancedTabProps {
  streamedQuery: UseQueryResult<StreamEvent[]>;
  liveQuery: UseQueryResult<StreamEvent>;
}

export function AdvancedTab({ streamedQuery, liveQuery }: AdvancedTabProps) {
  return (
    <Tabs defaultValue="streamed" className="h-full flex flex-col">
      <TabsList className="mb-4 bg-card border border-primary/30">
        <TabsTrigger
          value="streamed"
          className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
        >
          Streamed Query
        </TabsTrigger>
        <TabsTrigger
          value="live"
          className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
        >
          Live Query
        </TabsTrigger>
      </TabsList>

      <TabsContent value="streamed" className="flex flex-col flex-1 min-h-0">
        <Card className="p-6 border-primary/30 bg-card flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-4 flex-none">
            <h3 className="text-sm font-semibold text-primary">
              useQuery Streamed Pattern
            </h3>
            <Button
              onClick={() => streamedQuery.refetch()}
              disabled={streamedQuery.isFetching}
              className="glow-hover"
            >
              <Play className="h-4 w-4 mr-2" />
              {streamedQuery.isFetching ? "Streaming..." : "Start"}
            </Button>
          </div>
          {streamedQuery.error && (
            <div className="p-3 bg-destructive/10 border border-destructive/50 rounded mb-4 text-sm flex-none">
              <strong>Error:</strong> {String(streamedQuery.error)}
            </div>
          )}
          {streamedQuery.data && streamedQuery.data.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground mb-2 flex-none">
                Received {streamedQuery.data.length} events
              </p>
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-2">
                  {streamedQuery.data.map((event, index) => (
                    <EventCard key={index} event={event} index={index} />
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="live" className="flex flex-col flex-1 min-h-0">
        <Card className="p-6 border-primary/30 bg-card flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-4 flex-none">
            <h3 className="text-sm font-semibold text-primary">
              useQuery Live Pattern (Latest Only)
            </h3>
            <Button
              onClick={() => liveQuery.refetch()}
              disabled={liveQuery.isFetching}
              className="glow-hover"
            >
              <Play className="h-4 w-4 mr-2" />
              {liveQuery.isFetching ? "Streaming..." : "Start"}
            </Button>
          </div>
          {liveQuery.error && (
            <div className="p-3 bg-destructive/10 border border-destructive/50 rounded mb-4 text-sm flex-none">
              <strong>Error:</strong> {String(liveQuery.error)}
            </div>
          )}
          {liveQuery.data && (
            <div className="flex-none">
              <p className="text-xs text-muted-foreground mb-2">
                Latest Event:
              </p>
              <EventCard event={liveQuery.data} index={0} />
            </div>
          )}
        </Card>
      </TabsContent>
    </Tabs>
  );
}
