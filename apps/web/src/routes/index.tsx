import { Button } from "@orpc-tauri/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Activity,
	BarChart3,
	Boxes,
	Database,
	MessagesSquare,
	Radio,
	Terminal,
	Upload,
	Zap,
} from "lucide-react";
import { useState } from "react";
import { TitleBar } from "@/components/title-bar";
import { orpc } from "@/rpc";
import { AdvancedTab } from "./-components/advanced-tab";
import { ChatTab } from "./-components/chat-tab";
import { DataLayerTab } from "./-components/data-layer-tab";
import { FileUploadTab } from "./-components/file-upload-tab";
import { OverviewTab } from "./-components/overview-tab";
import { ResourceTab } from "./-components/resource-tab";
import { StreamingTab } from "./-components/streaming-tab";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

function HomeComponent() {
	const [activeTab, setActiveTab] = useState("overview");
	const pingQuery = useQuery(orpc.ping.ping.queryOptions());

	return (
		<div className="flex h-screen flex-col bg-background">
			<TitleBar />
			<div className="flex min-h-0 flex-1">
				{/* Sidebar */}
				<div className="flex w-64 flex-none flex-col border-primary/30 border-r bg-sidebar p-4">
					<div className="mb-8 flex items-center gap-2">
						<Terminal className="glow h-6 w-6 text-primary" />
						<div>
							<h1 className="font-bold text-lg text-primary tracking-tight">
								oRPC_TEST
							</h1>
							<p className="text-muted-foreground text-xs">v1.0.0-alpha</p>
						</div>
					</div>

					<nav className="flex-1 space-y-1">
						<button
							type="button"
							onClick={() => setActiveTab("overview")}
							className={`flex w-full items-center gap-3 rounded px-3 py-2 text-sm transition-all ${
								activeTab === "overview"
									? "glow border border-primary/50 bg-primary/20 text-primary"
									: "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
							}`}
						>
							<Activity className="h-4 w-4" />
							Overview
						</button>

						<button
							type="button"
							onClick={() => setActiveTab("data")}
							className={`flex w-full items-center gap-3 rounded px-3 py-2 text-sm transition-all ${
								activeTab === "data"
									? "glow border border-primary/50 bg-primary/20 text-primary"
									: "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
							}`}
						>
							<Database className="h-4 w-4" />
							Data Layer
						</button>

						<button
							type="button"
							onClick={() => setActiveTab("streaming")}
							className={`flex w-full items-center gap-3 rounded px-3 py-2 text-sm transition-all ${
								activeTab === "streaming"
									? "glow border border-primary/50 bg-primary/20 text-primary"
									: "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
							}`}
						>
							<Radio className="h-4 w-4" />
							Streaming
						</button>

						<button
							type="button"
							onClick={() => setActiveTab("advanced")}
							className={`flex w-full items-center gap-3 rounded px-3 py-2 text-sm transition-all ${
								activeTab === "advanced"
									? "glow border border-primary/50 bg-primary/20 text-primary"
									: "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
							}`}
						>
							<BarChart3 className="h-4 w-4" />
							Advanced
						</button>

						<button
							type="button"
							onClick={() => setActiveTab("files")}
							className={`flex w-full items-center gap-3 rounded px-3 py-2 text-sm transition-all ${
								activeTab === "files"
									? "glow border border-primary/50 bg-primary/20 text-primary"
									: "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
							}`}
						>
							<Upload className="h-4 w-4" />
							File Upload
						</button>

						<button
							type="button"
							onClick={() => setActiveTab("chat")}
							className={`flex w-full items-center gap-3 rounded px-3 py-2 text-sm transition-all ${
								activeTab === "chat"
									? "glow border border-primary/50 bg-primary/20 text-primary"
									: "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
							}`}
						>
							<MessagesSquare className="h-4 w-4" />
							Duplex Chat
						</button>

						<button
							type="button"
							onClick={() => setActiveTab("resources")}
							className={`flex w-full items-center gap-3 rounded px-3 py-2 text-sm transition-all ${
								activeTab === "resources"
									? "glow border border-primary/50 bg-primary/20 text-primary"
									: "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
							}`}
						>
							<Boxes className="h-4 w-4" />
							Resources
						</button>
					</nav>

					<div className="space-y-2 border-primary/30 border-t pt-4">
						<div className="space-y-1 text-muted-foreground text-xs">
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
				<div className="flex min-h-0 flex-1 flex-col">
					{/* Header */}
					<header className="flex h-16 flex-none items-center justify-between border-primary/30 border-b px-6">
						<div>
							<h2 className="font-bold text-foreground text-xl tracking-tight">
								{activeTab === "overview" && "System Overview"}
								{activeTab === "data" && "Data Layer Tests"}
								{activeTab === "streaming" && "Stream Transport Tests"}
								{activeTab === "advanced" && "Advanced Patterns"}
								{activeTab === "files" && "File Upload"}
								{activeTab === "chat" && "Duplex Chat"}
								{activeTab === "resources" && "Rust Resources"}
							</h2>
							<p className="text-muted-foreground text-xs">
								Testing TauriLink with Tauri IPC
							</p>
						</div>
						<Button
							type="button"
							onClick={() => pingQuery.refetch()}
							disabled={pingQuery.isFetching}
							className="glow-hover"
						>
							<Zap className="mr-2 h-4 w-4" />
							{pingQuery.isFetching ? "Pinging..." : "Ping"}
						</Button>
					</header>

					{/* Content Area */}
					<main className="min-h-0 flex-1 overflow-auto p-6">
						{activeTab === "overview" && (
							<OverviewTab pingQuery={pingQuery} onTabChange={setActiveTab} />
						)}
						{activeTab === "data" && <DataLayerTab />}
						{activeTab === "streaming" && <StreamingTab />}
						{activeTab === "advanced" && <AdvancedTab />}
						{activeTab === "files" && <FileUploadTab />}
						{activeTab === "chat" && <ChatTab />}
						{activeTab === "resources" && <ResourceTab />}
					</main>
				</div>
			</div>
		</div>
	);
}
