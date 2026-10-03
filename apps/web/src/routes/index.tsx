import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@orpc-tauri/ui/components/button";
import { useState } from "react";
import {
  Activity,
  Database,
  Radio,
  Zap,
  Terminal,
  BarChart3,
  Upload,
} from "lucide-react";

import { orpc } from "@/rpc";
import { OverviewTab } from "./-components/overview-tab";
import { DataLayerTab } from "./-components/data-layer-tab";
import { StreamingTab } from "./-components/streaming-tab";
import { AdvancedTab } from "./-components/advanced-tab";
import { FileUploadTab } from "./-components/file-upload-tab";
import { TitleBar } from "@/components/title-bar";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const [activeTab, setActiveTab] = useState("overview");
  const pingQuery = useQuery(orpc.ping.ping.queryOptions());

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

            <button
              onClick={() => setActiveTab("files")}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-all ${
                activeTab === "files"
                  ? "bg-primary/20 text-primary border border-primary/50 glow"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              }`}
            >
              <Upload className="h-4 w-4" />
              File Upload
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
                {activeTab === "files" && "File Upload"}
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
              <OverviewTab pingQuery={pingQuery} onTabChange={setActiveTab} />
            )}
            {activeTab === "data" && <DataLayerTab />}
            {activeTab === "streaming" && <StreamingTab />}
            {activeTab === "advanced" && <AdvancedTab />}
            {activeTab === "files" && <FileUploadTab />}
          </main>
        </div>
      </div>
    </div>
  );
}
