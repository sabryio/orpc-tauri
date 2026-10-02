import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@tauri-orpc-contract/ui/components/button";
import { Card } from "@tauri-orpc-contract/ui/components/card";
import { Input } from "@tauri-orpc-contract/ui/components/input";
import { Label } from "@tauri-orpc-contract/ui/components/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@tauri-orpc-contract/ui/components/tabs";
import { ScrollArea } from "@tauri-orpc-contract/ui/components/scroll-area";
import { Database, Plus, Globe, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { NumberInput } from "@/components/number-input";
import { CodeBlock } from "@/components/code-block";
import { orpc, isDefinedError } from "@/rpc";
import { mutationHandlers } from "@/hooks/use-mutation-handlers";

const ORPC_MUTATION_CODE = `// useMutation with oRPC
const createPlanetMutation = useMutation(
  orpc.planet.createPlanet.mutationOptions({
    onSuccess: () => {
      toast.success("Planet created");
      queryClient.invalidateQueries({
        queryKey: orpc.planet.key()
      });
    },
  }),
);

// Trigger mutation
createPlanetMutation.mutate({
  name: "Mars",
  description: "The red planet"
});`;

const ORPC_QUERY_CODE = `// useInfiniteQuery for pagination
const planetsQuery = useInfiniteQuery(
  orpc.planet.listPlanetsPaginated.infiniteOptions({
    input: (pageParam) => ({
      limit: 10,
      offset: pageParam ?? 0,
    }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) =>
      lastPage.next_page_param,
  }),
);`;

const ORPC_ERROR_CODE = `// Error handling with oRPC
const findPlanetMutation = useMutation(
  orpc.planet.findPlanet.mutationOptions({
    onError: (error) => {
      toast.error(
        isDefinedError(error)
          ? \`Contract Error [\${error.code}]: \${error.message}\`
          : \`Unexpected Error: \${error.message}\`,
      );
    },
  }),
);`;

interface Planet {
  id: number;
  name: string;
  description?: string;
}

export function DataLayerTab() {
  const queryClient = useQueryClient();
  const [planetName, setPlanetName] = useState("");
  const [planetDescription, setPlanetDescription] = useState("");
  const [findId, setFindId] = useState("");

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
  const allPlanets: Planet[] =
    planetsQuery.data?.pages.flatMap((p) => p.items) || [];

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-3 gap-3 mb-4 flex-none">
        <CodeBlock title="oRPC Mutations" code={ORPC_MUTATION_CODE} />
        <CodeBlock title="oRPC Pagination" code={ORPC_QUERY_CODE} />
        <CodeBlock title="oRPC Error Handling" code={ORPC_ERROR_CODE} />
      </div>

      <Tabs defaultValue="planets" className="flex flex-col flex-1 min-h-0">
      <TabsList className="mb-4 bg-card border border-primary/30 flex-none">
        <TabsTrigger
          value="planets"
          className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
        >
          <Database className="h-4 w-4 mr-2" />
          Planets
        </TabsTrigger>
        <TabsTrigger
          value="create"
          className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create
        </TabsTrigger>
        <TabsTrigger
          value="find"
          className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
        >
          <Globe className="h-4 w-4 mr-2" />
          Find
        </TabsTrigger>
      </TabsList>

      <TabsContent value="planets" className="flex flex-col flex-1 min-h-0">
        <Card className="p-4 border-primary/30 bg-card flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-4 flex-none">
            <h3 className="text-sm font-semibold text-primary">All Planets</h3>
            <Button
              onClick={() => planetsQuery.refetch()}
              disabled={planetsQuery.isFetching}
              size="sm"
              variant="outline"
              className="border-primary/50"
            >
              {planetsQuery.isFetching ? "Loading..." : "Refresh"}
            </Button>
          </div>
          {allPlanets.length > 0 ? (
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-2">
                {allPlanets.map((planet: Planet) => (
                  <div
                    key={planet.id}
                    className="flex items-center justify-between p-3 bg-card/50 border border-primary/20 rounded hover:border-primary/50 transition-all"
                  >
                    <div className="font-mono text-sm">
                      <p className="text-foreground font-semibold">
                        {planet.name}
                      </p>
                      {planet.description && (
                        <p className="text-xs text-muted-foreground">
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
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {planetsQuery.hasNextPage && (
                  <Button
                    onClick={() => planetsQuery.fetchNextPage()}
                    disabled={planetsQuery.isFetchingNextPage}
                    variant="outline"
                    className="w-full border-primary/50"
                  >
                    {planetsQuery.isFetchingNextPage
                      ? "Loading..."
                      : "Load More"}
                  </Button>
                )}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">
              No planets yet. Create one in the Create tab.
            </p>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="create" className="flex flex-col flex-1 min-h-0">
        <ScrollArea className="flex-1 min-h-0">
          <Card className="p-6 border-primary/30 bg-card max-w-2xl">
            {/* ponytail: ScrollArea wraps Card for form scrolling if needed */}
            <h3 className="text-sm font-semibold text-primary mb-4">
              Create Planet
            </h3>
            <div className="space-y-4">
              <div>
                <Label
                  htmlFor="planetName"
                  className="text-xs text-muted-foreground"
                >
                  Name
                </Label>
                <Input
                  id="planetName"
                  value={planetName}
                  onChange={(e) => setPlanetName(e.target.value)}
                  placeholder="Mars"
                  className="font-mono bg-input border-primary/30"
                />
              </div>
              <div>
                <Label
                  htmlFor="planetDescription"
                  className="text-xs text-muted-foreground"
                >
                  Description (optional)
                </Label>
                <Input
                  id="planetDescription"
                  value={planetDescription}
                  onChange={(e) => setPlanetDescription(e.target.value)}
                  placeholder="The red planet"
                  className="font-mono bg-input border-primary/30"
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
                className="glow-hover"
              >
                <Plus className="h-4 w-4 mr-2" />
                {createPlanetMutation.isPending
                  ? "Creating..."
                  : "Create Planet"}
              </Button>
            </div>
          </Card>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="find" className="flex flex-col flex-1 min-h-0">
        <ScrollArea className="flex-1 min-h-0">
          <Card className="p-6 border-primary/30 bg-card max-w-2xl">
            {/* ponytail: ScrollArea wraps Card for form scrolling if needed */}
            <h3 className="text-sm font-semibold text-primary mb-4">
              Find Planet by ID
            </h3>
            <div className="space-y-4">
              <NumberInput
                id="findId"
                label="Planet ID"
                value={findId}
                onChange={setFindId}
                placeholder="1"
              />
              <Button
                onClick={() =>
                  findPlanetMutation.mutate({ id: Number.parseInt(findId) })
                }
                disabled={!findId || findPlanetMutation.isPending}
                className="glow-hover"
              >
                <Globe className="h-4 w-4 mr-2" />
                {findPlanetMutation.isPending ? "Finding..." : "Find Planet"}
              </Button>
              {findPlanetMutation.data && (
                <div className="p-4 bg-card/50 border border-primary/20 rounded font-mono text-sm">
                  <p className="text-foreground font-semibold mb-2">
                    {findPlanetMutation.data.name}
                  </p>
                  {findPlanetMutation.data.description && (
                    <p className="text-muted-foreground">
                      {findPlanetMutation.data.description}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>
        </ScrollArea>
      </TabsContent>
    </Tabs>
    </div>
  );
}
