import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@tauri-orpc-contract/ui/components/button";
import { Card } from "@tauri-orpc-contract/ui/components/card";
import { Activity, Database, BarChart3, Radio, Zap } from "lucide-react";
import { orpc } from "@/rpc";
import type { UseQueryResult } from "@tanstack/react-query";

interface OverviewTabProps {
  pingQuery: UseQueryResult<{ id: string; message: string }>;
  onTabChange: (tab: string) => void;
}

export function OverviewTab({ pingQuery, onTabChange }: OverviewTabProps) {
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
  const totalPlanets = planetsQuery.data?.pages.flatMap(p => p.items).length ?? 0;
  const pagesLoaded = planetsQuery.data?.pages.length ?? 0;

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <Card className="p-6 border-primary/30 bg-card glow">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold text-primary">Connection Status</h3>
        </div>
        {pingQuery.data && (
          <div className="space-y-2 font-mono text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID:</span>
              <span className="text-foreground">{pingQuery.data.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Message:</span>
              <span className="text-success">{pingQuery.data.message}</span>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6 border-accent/30 bg-card glow-accent">
        <div className="flex items-center gap-3 mb-4">
          <Database className="h-5 w-5 text-accent" />
          <h3 className="text-sm font-semibold text-accent">Data Statistics</h3>
        </div>
        <div className="space-y-2 font-mono text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Planets:</span>
            <span className="text-foreground">{totalPlanets}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pages Loaded:</span>
            <span className="text-accent">{pagesLoaded}</span>
          </div>
        </div>
      </Card>

      <Card className="col-span-2 p-6 border-primary/30 bg-card/50">
        <h3 className="text-sm font-semibold text-primary mb-4">Quick Actions</h3>
        <div className="grid grid-cols-4 gap-3">
          <Button onClick={() => onTabChange("data")} variant="outline" className="border-primary/50">
            <Database className="h-4 w-4 mr-2" />
            Data Tests
          </Button>
          <Button onClick={() => onTabChange("streaming")} variant="outline" className="border-primary/50">
            <Radio className="h-4 w-4 mr-2" />
            Streaming
          </Button>
          <Button onClick={() => onTabChange("advanced")} variant="outline" className="border-primary/50">
            <BarChart3 className="h-4 w-4 mr-2" />
            Advanced
          </Button>
          <Button onClick={() => pingQuery.refetch()} variant="outline" className="border-primary/50">
            <Zap className="h-4 w-4 mr-2" />
            Ping
          </Button>
        </div>
      </Card>
    </div>
  );
}
