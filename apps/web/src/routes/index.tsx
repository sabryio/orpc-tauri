import {
  useMutation,
  useQuery,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@tauri-orpc-contract/ui/components/button";
import { useState, useRef } from "react";
import { toast } from "sonner";
import {
  Activity,
  Database,
  Radio,
  Zap,
  Terminal,
  BarChart3,
} from "lucide-react";

import {
  client,
  getEventMeta,
  isDefinedError,
  orpc,
  consumeAsyncIterator,
} from "@/rpc";
import { useStreamEvents } from "@/hooks/use-stream-events";
import { mutationHandlers } from "@/hooks/use-mutation-handlers";
import { OverviewTab } from "./-components/overview-tab";
import { DataLayerTab } from "./-components/data-layer-tab";
import { StreamingTab } from "./-components/streaming-tab";
import { AdvancedTab } from "./-components/advanced-tab";
import { TitleBar } from "@/components/title-bar";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const queryClient = useQueryClient();
  const [planetName, setPlanetName] = useState("");
  const [planetDescription, setPlanetDescription] = useState("");
  const [findId, setFindId] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const stream = useStreamEvents<{ message: string; count: number }>();
  const channelStream = useStreamEvents<{ message: string; count: number }>();

  // Async iterator pattern state
  const [asyncEvents, setAsyncEvents] = useState<
    Array<{ message: string; count: number; id?: string; retry?: number }>
  >([]);
  const [asyncStreaming, setAsyncStreaming] = useState(false);
  const [asyncError, setAsyncError] = useState<string | null>(null);
  const [asyncFinished, setAsyncFinished] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  // useQuery streamed pattern
  const streamedQuery = useQuery(
    orpc.stream.streamEvents.streamedOptions({
      retry: false,
      enabled: false,
      gcTime: 0, // Immediately cleanup when query becomes inactive
    }),
  );

  // useQuery live pattern (latest event only)
  const liveQuery = useQuery(
    orpc.stream.streamEvents.liveOptions({
      retry: false,
      enabled: false,
      gcTime: 0, // Immediately cleanup when query becomes inactive
      structuralSharing: false, // Prevent React Query from cloning data and losing Symbol
      select: (data) => {
        // Preserve Symbol metadata by attaching it as a regular property
        const meta = getEventMeta(data);
        if (meta) {
          (data as any)._meta = meta;
        }
        return data;
      },
    }),
  );

  const pingQuery = useQuery(orpc.ping.ping.queryOptions());

  const planetsQuery = useInfiniteQuery(
    orpc.planet.listPlanetsPaginated.infiniteOptions({
      input: (pageParam: number | undefined) => ({
        limit: 10,
        offset: pageParam ?? 0,
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.next_page_param,
    }),
  );

  const createPlanetMutation = useMutation(
    orpc.planet.createPlanet.mutationOptions(
      mutationHandlers("Planet created", "Failed to create planet", () => {
        setPlanetName("");
        setPlanetDescription("");
        queryClient.invalidateQueries({ queryKey: orpc.planet.key() });
      }),
    ),
  );

  const findPlanetMutation = useMutation(
    orpc.planet.findPlanet.mutationOptions({
      onSuccess: (data) => toast.success(`Found planet: ${data.name}`),
      onError: (error) => {
        console.log("Error: ", JSON.stringify(error));
        toast.error(
          isDefinedError(error)
            ? `Contract Error [${error.code}]: ${error.message}`
            : `Unexpected Error: ${error.message || "Failed to find planet"}`,
        );
      },
    }),
  );

  const deletePlanetMutation = useMutation(
    orpc.planet.deletePlanet.mutationOptions(
      mutationHandlers("Planet deleted", "Failed to delete planet", () =>
        queryClient.invalidateQueries({ queryKey: orpc.planet.key() }),
      ),
    ),
  );

  const handleStreamEvents = () =>
    stream.startStream(
      () =>
        client.stream.streamEvents(undefined, {
          signal: new AbortController().signal,
        }),
      "Stream completed!",
    );

  const handleChannelStreamEvents = () =>
    channelStream.startStream(
      () =>
        client.stream.streamEventsChannel(undefined, {
          signal: new AbortController().signal,
        }),
      "Channel stream completed!",
    );

  const handleAsyncIteratorStream = () => {
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
      onSuccess: (value) => {
        console.log("Stream completed successfully:", value);
        setAsyncStreaming(false);
        toast.success("Async stream completed!");
      },
      onFinish: (state) => {
        console.log("Stream finished with state:", state);
        setAsyncFinished(true);
        setAsyncStreaming(false);
        cancelRef.current = null;
      },
    });

    cancelRef.current = cancel;
  };

  const handleCancelAsyncStream = () => {
    if (cancelRef.current) {
      cancelRef.current();
      toast.info("Stream cancelled");
    }
  };

  return (
    <div className="flex h-screen bg-background flex-col">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="flex-none w-64 border-r border-primary/30 bg-sidebar p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-8">
            <Terminal className="h-6 w-6 text-primary glow" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-primary">
                oRPC_TEST
              </h1>
              <p className="text-xs text-muted-foreground">v1.0.0-alpha</p>
            </div>
          </div>

          <nav className="space-y-1 flex-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-all ${
                activeTab === "overview"
                  ? "bg-primary/20 text-primary border border-primary/50 glow"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              }`}
            >
              <Activity className="h-4 w-4" />
              Overview
            </button>

            <button
              onClick={() => setActiveTab("data")}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-all ${
                activeTab === "data"
                  ? "bg-primary/20 text-primary border border-primary/50 glow"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              }`}
            >
              <Database className="h-4 w-4" />
              Data Layer
            </button>

            <button
              onClick={() => setActiveTab("streaming")}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-all ${
                activeTab === "streaming"
                  ? "bg-primary/20 text-primary border border-primary/50 glow"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              }`}
            >
              <Radio className="h-4 w-4" />
              Streaming
            </button>

            <button
              onClick={() => setActiveTab("advanced")}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-all ${
                activeTab === "advanced"
                  ? "bg-primary/20 text-primary border border-primary/50 glow"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Advanced
            </button>
          </nav>

          <div className="pt-4 border-t border-primary/30 space-y-2">
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="text-success">●</span>
              </div>
              <div className="flex justify-between">
                <span>Latency:</span>
                <span className="text-primary">~24ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Header */}
          <header className="flex-none h-16 border-b border-primary/30 px-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground tracking-tight">
                {activeTab === "overview" && "System Overview"}
                {activeTab === "data" && "Data Layer Tests"}
                {activeTab === "streaming" && "Stream Transport Tests"}
                {activeTab === "advanced" && "Advanced Patterns"}
              </h2>
              <p className="text-xs text-muted-foreground">
                Testing TauriLink with Tauri IPC
              </p>
            </div>
            <Button
              onClick={() => pingQuery.refetch()}
              disabled={pingQuery.isFetching}
              className="glow-hover"
            >
              <Zap className="h-4 w-4 mr-2" />
              {pingQuery.isFetching ? "Pinging..." : "Ping"}
            </Button>
          </header>

          {/* Content Area */}
          <main className="flex-1 min-h-0 overflow-auto p-6">
            {activeTab === "overview" && (
              <OverviewTab
                pingQuery={pingQuery}
                planetsQuery={planetsQuery}
                onTabChange={setActiveTab}
              />
            )}

            {activeTab === "data" && (
              <DataLayerTab
                planetName={planetName}
                setPlanetName={setPlanetName}
                planetDescription={planetDescription}
                setPlanetDescription={setPlanetDescription}
                findId={findId}
                setFindId={setFindId}
                planetsQuery={planetsQuery}
                createPlanetMutation={createPlanetMutation}
                findPlanetMutation={findPlanetMutation}
                deletePlanetMutation={deletePlanetMutation}
              />
            )}

            {activeTab === "streaming" && (
              <StreamingTab
                emitListenEvents={stream.events}
                isEmitListenStreaming={stream.isStreaming}
                onStartEmitListen={handleStreamEvents}
                channelEvents={channelStream.events}
                isChannelStreaming={channelStream.isStreaming}
                onStartChannel={handleChannelStreamEvents}
                asyncEvents={asyncEvents}
                isAsyncStreaming={asyncStreaming}
                asyncError={asyncError}
                asyncFinished={asyncFinished}
                onStartAsync={handleAsyncIteratorStream}
                onCancelAsync={handleCancelAsyncStream}
              />
            )}

            {activeTab === "advanced" && (
              <AdvancedTab
                streamedQuery={streamedQuery}
                liveQuery={liveQuery}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
