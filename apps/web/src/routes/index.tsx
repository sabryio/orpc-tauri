import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@tauri-orpc-contract/ui/components/button";
import { Card } from "@tauri-orpc-contract/ui/components/card";
import { Input } from "@tauri-orpc-contract/ui/components/input";
import { Label } from "@tauri-orpc-contract/ui/components/label";
import { useState, useRef } from "react";
import { toast } from "sonner";

import { client, getEventMeta, isDefinedError, orpc, consumeAsyncIterator } from "@/rpc";
import { useStreamEvents } from "./use-stream-events";
import { mutationHandlers } from "./use-mutation-handlers";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function EventCard({ event, index }: { event: { message: string; count: number }; index: number }) {
  const meta = getEventMeta(event);
  return (
    <div key={index} className="p-3 bg-muted rounded-md">
      <p className="text-sm">
        <strong>Message:</strong> {event.message}
      </p>
      <p className="text-sm">
        <strong>Count:</strong> {event.count}
      </p>
      {meta && (
        <>
          {meta.id && (
            <p className="text-sm text-muted-foreground">
              <strong>Event ID:</strong> {meta.id}
            </p>
          )}
          {meta.retry && (
            <p className="text-sm text-muted-foreground">
              <strong>Retry:</strong> {meta.retry}ms
            </p>
          )}
          {meta.comments && meta.comments.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <strong>Comments:</strong> {meta.comments.join(", ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function HomeComponent() {
  const queryClient = useQueryClient();
  const [planetName, setPlanetName] = useState("");
  const [planetDescription, setPlanetDescription] = useState("");
  const [findId, setFindId] = useState("");

  const stream = useStreamEvents<{ message: string; count: number }>();
  const channelStream = useStreamEvents<{ message: string; count: number }>();

  // Async iterator pattern state
  const [asyncEvents, setAsyncEvents] = useState<Array<{ message: string; count: number; id?: string; retry?: number }>>([]);
  const [asyncStreaming, setAsyncStreaming] = useState(false);
  const [asyncError, setAsyncError] = useState<string | null>(null);
  const [asyncFinished, setAsyncFinished] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  // useQuery streamed pattern
  const streamedQuery = useQuery(
    orpc.stream.streamEvents.streamedOptions({ retry: false, enabled: false }),
  );

  // useQuery live pattern (latest event only)
  const liveQuery = useQuery(
    orpc.stream.streamEvents.liveOptions({ retry: false, enabled: false }),
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
      mutationHandlers(
        "Planet created",
        "Failed to create planet",
        () => {
          setPlanetName("");
          setPlanetDescription("");
          queryClient.invalidateQueries({ queryKey: orpc.planet.key() });
        },
      ),
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
      () => client.stream.streamEvents(undefined, { signal: new AbortController().signal }),
      "Stream completed!",
    );

  const handleChannelStreamEvents = () =>
    channelStream.startStream(
      () => client.stream.streamEventsChannel(undefined, { signal: new AbortController().signal }),
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
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="grid gap-6">
        <section>
          <h1 className="text-3xl font-bold mb-2">oRPC Tauri Test UI</h1>
          <p className="text-muted-foreground">
            Testing TauriLink with Tauri IPC commands
          </p>
        </section>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Ping Command</h2>
          <div className="space-y-2">
            <Button
              onClick={() => pingQuery.refetch()}
              disabled={pingQuery.isFetching}
            >
              {pingQuery.isFetching ? "Pinging..." : "Ping"}
            </Button>
            {pingQuery.data && (
              <div className="p-4 bg-muted rounded-md">
                <p>
                  <strong>ID:</strong> {pingQuery.data.id}
                </p>
                <p>
                  <strong>Message:</strong> {pingQuery.data.message}
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Create Planet</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="planetName">Name</Label>
              <Input
                id="planetName"
                value={planetName}
                onChange={(e) => setPlanetName(e.target.value)}
                placeholder="Mars"
              />
            </div>
            <div>
              <Label htmlFor="planetDescription">Description (optional)</Label>
              <Input
                id="planetDescription"
                value={planetDescription}
                onChange={(e) => setPlanetDescription(e.target.value)}
                placeholder="The red planet"
              />
            </div>
            <Button
              onClick={() =>
                createPlanetMutation.mutate({
                  name: planetName,
                  description: planetDescription || undefined,
                })
              }
              disabled={!planetName || createPlanetMutation.isPending}
            >
              {createPlanetMutation.isPending ? "Creating..." : "Create Planet"}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Find Planet by ID</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="findId">Planet ID</Label>
              <Input
                id="findId"
                type="number"
                value={findId}
                onChange={(e) => setFindId(e.target.value)}
                placeholder="1"
              />
            </div>
            <Button
              onClick={() =>
                findPlanetMutation.mutate({ id: Number.parseInt(findId) })
              }
              disabled={!findId || findPlanetMutation.isPending}
            >
              {findPlanetMutation.isPending ? "Finding..." : "Find Planet"}
            </Button>
            {findPlanetMutation.data && (
              <div className="p-4 bg-muted rounded-md">
                <p>
                  <strong>ID:</strong> {findPlanetMutation.data.id}
                </p>
                <p>
                  <strong>Name:</strong> {findPlanetMutation.data.name}
                </p>
                {findPlanetMutation.data.description && (
                  <p>
                    <strong>Description:</strong>{" "}
                    {findPlanetMutation.data.description}
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">All Planets</h2>
          <div className="space-y-4">
            <Button
              onClick={() => {
                console.log("Current planetsQuery.data:", planetsQuery.data);
                planetsQuery.refetch();
              }}
              disabled={planetsQuery.isFetching}
            >
              {planetsQuery.isFetching ? "Loading..." : "Refresh List"}
            </Button>
            {(() => {
              console.log("planetsQuery full state:", {
                data: planetsQuery.data,
                pages: planetsQuery.data?.pages,
                error: planetsQuery.error,
                status: planetsQuery.status,
              });
              const allPlanets = planetsQuery.data?.pages?.flatMap(p => {
                console.log("Page:", p);
                return p.items || [];
              }) || [];
              console.log("All planets:", allPlanets);
              return allPlanets.length > 0 ? (
              <div className="space-y-2">
                {allPlanets.map((planet) => {
                  console.log("Rendering planet:", planet);
                  return (
                  <div
                    key={planet.id}
                    className="flex items-center justify-between p-4 bg-muted rounded-md"
                  >
                    <div>
                      <p className="font-semibold">{planet.name}</p>
                      {planet.description && (
                        <p className="text-sm text-muted-foreground">
                          {planet.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        deletePlanetMutation.mutate({ id: planet.id })
                      }
                      disabled={deletePlanetMutation.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                  );
                })}
                {planetsQuery.hasNextPage && (
                  <Button
                    onClick={() => planetsQuery.fetchNextPage()}
                    disabled={planetsQuery.isFetchingNextPage}
                    variant="outline"
                    className="w-full"
                  >
                    {planetsQuery.isFetchingNextPage ? "Loading more..." : "Load More"}
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">
                No planets yet. Create one above!
              </p>
            );
            })()}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Stream Events Test</h2>
          <div className="space-y-4">
            <Button onClick={handleStreamEvents} disabled={stream.isStreaming}>
              {stream.isStreaming ? "Streaming..." : "Start Stream"}
            </Button>
            {stream.events.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold">Received Events:</p>
                {stream.events.map((event, index) => (
                  <EventCard key={index} event={event} index={index} />
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            Channel Stream Test (Tauri Native)
          </h2>
          <div className="space-y-4">
            <Button
              onClick={handleChannelStreamEvents}
              disabled={channelStream.isStreaming}
            >
              {channelStream.isStreaming ? "Streaming..." : "Start Channel Stream"}
            </Button>
            {channelStream.events.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold">Received Channel Events:</p>
                {channelStream.events.map((event, index) => (
                  <EventCard key={index} event={event} index={index} />
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            Async Iterator Pattern Test
          </h2>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={handleAsyncIteratorStream}
                disabled={asyncStreaming}
              >
                {asyncStreaming ? "Streaming..." : "Start Async Stream"}
              </Button>
              {asyncStreaming && (
                <Button
                  onClick={handleCancelAsyncStream}
                  variant="destructive"
                >
                  Cancel
                </Button>
              )}
            </div>
            {asyncError && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-md">
                <strong>Error:</strong> {asyncError}
              </div>
            )}
            {asyncFinished && (
              <div className="p-3 bg-green-500/10 text-green-500 rounded-md">
                Stream finished
              </div>
            )}
            {asyncEvents.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold">Received Async Events:</p>
                {asyncEvents.map((event, index) => (
                  <div key={index} className="p-3 bg-muted rounded-md">
                    <p className="text-sm">
                      <strong>Message:</strong> {event.message}
                    </p>
                    <p className="text-sm">
                      <strong>Count:</strong> {event.count}
                    </p>
                    {event.id && (
                      <p className="text-sm text-muted-foreground">
                        <strong>Event ID:</strong> {event.id}
                      </p>
                    )}
                    {event.retry && (
                      <p className="text-sm text-muted-foreground">
                        <strong>Retry:</strong> {event.retry}ms
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            useQuery Streamed Pattern Test
          </h2>
          <div className="space-y-4">
            <Button
              onClick={() => streamedQuery.refetch()}
              disabled={streamedQuery.isFetching}
            >
              {streamedQuery.isFetching ? "Streaming..." : "Start Streamed Query"}
            </Button>
            {streamedQuery.error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-md">
                <strong>Error:</strong> {String(streamedQuery.error)}
              </div>
            )}
            {streamedQuery.data && streamedQuery.data.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold">Received Query Events ({streamedQuery.data.length}):</p>
                {streamedQuery.data.map((event, index) => (
                  <EventCard key={index} event={event} index={index} />
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            useQuery Live Pattern Test (Latest Only)
          </h2>
          <div className="space-y-4">
            <Button
              onClick={() => liveQuery.refetch()}
              disabled={liveQuery.isFetching}
            >
              {liveQuery.isFetching ? "Streaming..." : "Start Live Query"}
            </Button>
            {liveQuery.error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-md">
                <strong>Error:</strong> {String(liveQuery.error)}
              </div>
            )}
            {liveQuery.data && (
              <div className="space-y-2">
                <p className="font-semibold">Latest Event:</p>
                <EventCard event={liveQuery.data} index={0} />
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
