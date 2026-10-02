import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@tauri-orpc-contract/ui/components/button";
import { Card } from "@tauri-orpc-contract/ui/components/card";
import { Input } from "@tauri-orpc-contract/ui/components/input";
import { Label } from "@tauri-orpc-contract/ui/components/label";
import { useState } from "react";
import { toast } from "sonner";

import { client, getEventMeta, isDefinedError, orpc } from "@/rpc";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const queryClient = useQueryClient();
  const [planetName, setPlanetName] = useState("");
  const [planetDescription, setPlanetDescription] = useState("");
  const [findId, setFindId] = useState("");
  const [streamEvents, setStreamEvents] = useState<
    Array<{ message: string; count: number }>
  >([]);
  const [channelStreamEvents, setChannelStreamEvents] = useState<
    Array<{ message: string; count: number }>
  >([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isChannelStreaming, setIsChannelStreaming] = useState(false);

  const pingQuery = useQuery(orpc.ping.ping.queryOptions());

  const planetsQuery = useQuery(orpc.planet.listPlanets.queryOptions());

  const createPlanetMutation = useMutation(
    orpc.planet.createPlanet.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Planet created: ${data.name}`);
        setPlanetName("");
        setPlanetDescription("");
        queryClient.invalidateQueries({ queryKey: orpc.planet.key() });
      },
      onError: (error) => {
        if (isDefinedError(error)) {
          toast.error(`Error: ${error.message}`);
        } else {
          toast.error("Failed to create planet");
        }
      },
    }),
  );

  const findPlanetMutation = useMutation(
    orpc.planet.findPlanet.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Found planet: ${data.name}`);
      },
      onError: (error) => {
        console.log("Error: ", JSON.stringify(error));

        if (isDefinedError(error)) {
          // This is a defined error from the contract
          toast.error(`Contract Error [${error.code}]: ${error.message}`);
        } else {
          // This is an undefined/unexpected error
          toast.error(
            `Unexpected Error: ${error.message || "Failed to find planet"}`,
          );
        }
      },
    }),
  );

  const deletePlanetMutation = useMutation(
    orpc.planet.deletePlanet.mutationOptions({
      onSuccess: () => {
        toast.success("Planet deleted");
        queryClient.invalidateQueries({ queryKey: orpc.planet.key() });
      },
      onError: (error) => {
        if (isDefinedError(error)) {
          toast.error(`Error: ${error.message}`);
        } else {
          toast.error("Failed to delete planet");
        }
      },
    }),
  );

  const handleStreamEvents = async () => {
    setIsStreaming(true);
    setStreamEvents([]);
    const controller = new AbortController();

    try {
      const iterator = await client.stream.streamEvents(undefined, {
        signal: controller.signal,
      });

      for await (const event of iterator) {
        console.log("Received stream event:", event);
        setStreamEvents((prev) => [...prev, event]);
      }

      toast.success("Stream completed!");
    } catch (error) {
      console.error("Stream error:", error);
      if (isDefinedError(error)) {
        toast.error(`Stream error: ${error}`);
      } else {
        toast.error("Stream failed");
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleChannelStreamEvents = async () => {
    setIsChannelStreaming(true);
    setChannelStreamEvents([]);
    const controller = new AbortController();

    try {
      const iterator = await client.stream.streamEventsChannel(undefined, {
        signal: controller.signal,
      });

      for await (const event of iterator) {
        console.log("Received channel stream event:", event);
        setChannelStreamEvents((prev) => [...prev, event]);
      }

      toast.success("Channel stream completed!");
    } catch (error) {
      console.error("Channel stream error:", error);
      if (isDefinedError(error)) {
        toast.error(`Channel stream error: ${error}`);
      } else {
        toast.error("Channel stream failed");
      }
    } finally {
      setIsChannelStreaming(false);
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
              onClick={() => planetsQuery.refetch()}
              disabled={planetsQuery.isFetching}
            >
              {planetsQuery.isFetching ? "Loading..." : "Refresh List"}
            </Button>
            {planetsQuery.data && planetsQuery.data.length > 0 ? (
              <div className="space-y-2">
                {planetsQuery.data.map((planet) => (
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
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">
                No planets yet. Create one above!
              </p>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Stream Events Test</h2>
          <div className="space-y-4">
            <Button onClick={handleStreamEvents} disabled={isStreaming}>
              {isStreaming ? "Streaming..." : "Start Stream"}
            </Button>
            {streamEvents.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold">Received Events:</p>
                {streamEvents.map((event, index) => {
                  // Get SSE event metadata (id, retry, comments)
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
                              <strong>Comments:</strong>{" "}
                              {meta.comments.join(", ")}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
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
              disabled={isChannelStreaming}
            >
              {isChannelStreaming ? "Streaming..." : "Start Channel Stream"}
            </Button>
            {channelStreamEvents.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold">Received Channel Events:</p>
                {channelStreamEvents.map((event, index) => {
                  // Get SSE event metadata (id, retry, comments)
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
                              <strong>Comments:</strong>{" "}
                              {meta.comments.join(", ")}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
