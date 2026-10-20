import { ORPCError } from "@orpc/client";
import { Button } from "@orpc-tauri/ui/components/button";
import { Card } from "@orpc-tauri/ui/components/card";
import { Download, Loader2, Plus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { client, link } from "@/rpc";

interface ResourceRef {
	rid: number;
}

interface PlanetRow {
	id: number;
	name: string;
	description?: string;
}

type DownloadStatus = "idle" | "downloading" | "done" | "error";

interface DownloadState {
	status: DownloadStatus;
	percent: number;
	received: number;
}

const INITIAL_DOWNLOAD_STATE: DownloadState = {
	status: "idle",
	percent: 0,
	received: 0,
};

const DEMO_DOWNLOAD_BYTES = 256 * 1024;
const DEMO_DB_PATH = "sqlite://demo/planets.db";

export function ResourceTab() {
	const [conn, setConn] = useState<ResourceRef | null>(null);
	const [rows, setRows] = useState<PlanetRow[]>([]);
	const [opening, setOpening] = useState(false);
	const [querying, setQuerying] = useState(false);
	const [download, setDownload] = useState<DownloadState>(
		INITIAL_DOWNLOAD_STATE,
	);
	const [downloadActive, setDownloadActive] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	// ---- db_open ----------------------------------------------------------
	const handleOpen = async () => {
		setOpening(true);
		try {
			const opened = await client.resource.db_open({
				input: { path: DEMO_DB_PATH },
			});
			setConn(opened);
			setRows([]);
			toast.success(`Rust resource table entry created (rid ${opened.rid})`);
		} catch (error) {
			toast.error(toRpcMessage(error, "db_open failed"));
		} finally {
			setOpening(false);
		}
	};

	// ---- db_query ---------------------------------------------------------
	const handleQuery = async () => {
		if (!conn) return;
		setQuerying(true);
		try {
			const result = await client.resource.db_query({
				input: {
					handle: conn,
					sql: "SELECT * FROM planets",
				},
			});
			setRows(result);
		} catch (error) {
			toast.error(toRpcMessage(error, "db_query failed"));
		} finally {
			setQuerying(false);
		}
	};

	// ---- db_close (contract command → Rust closes the rid) ----------------
	const handleClose = async () => {
		if (!conn) return;
		try {
			await client.resource.db_close({
				input: { handle: conn },
			});
			toast.info(`Closed rid ${conn.rid} via db_close command`);
		} catch (error) {
			toast.error(toRpcMessage(error, "db_close failed"));
		} finally {
			setConn(null);
			setRows([]);
		}
	};

	// ---- link.resource.close (link facade → plugin:resources|close) -------
	const handleCloseViaLink = async () => {
		if (!conn) return;
		try {
			await link.resource.close(conn);
			toast.info(`Closed rid ${conn.rid} via link.resource.close()`);
		} catch (error) {
			toast.error(toRpcMessage(error, "link close failed"));
		} finally {
			setConn(null);
			setRows([]);
		}
	};

	// ---- resource-backed download (cancel drops the rid server-side) ------
	const handleDownload = async () => {
		const controller = new AbortController();
		abortRef.current = controller;
		setDownloadActive(true);
		setDownload({
			status: "downloading",
			percent: 0,
			received: 0,
		});

		try {
			let received = 0;
			const iterator = await client.resource.resource_file_download(
				{ input: { total_bytes: DEMO_DOWNLOAD_BYTES } },
				{
					onProgress: (info) => {
						setDownload((prev) => ({
							...prev,
							percent: Math.max(prev.percent, info.percentage ?? 0),
							received: Math.max(prev.received, info.bytesTransferred),
						}));
					},
					// Cancel drop: abort tears the stream down; the link's
					// autoClose closes the announced rid server-side, and
					// Resource::close notifies the Rust task immediately.
					signal: controller.signal,
				},
			);

			for await (const chunk of iterator) {
				received += chunk.length;
				setDownload((prev) => ({
					...prev,
					received: Math.max(prev.received, received),
				}));
			}

			setDownload({
				status: "done",
				percent: 100,
				received: DEMO_DOWNLOAD_BYTES,
			});
			toast.success(
				`Downloaded ${formatBytes(DEMO_DOWNLOAD_BYTES)} — Rust dropped its own resource on completion`,
			);
		} catch (error) {
			if (
				error instanceof ORPCError &&
				error.code === "CLIENT_CLOSED_REQUEST"
			) {
				setDownload(INITIAL_DOWNLOAD_STATE);
				toast.info(
					"Download cancelled — TransferHandle rid closed server-side",
				);
			} else {
				setDownload((prev) => ({ ...prev, status: "error" }));
				toast.error(toRpcMessage(error, "Download failed"));
			}
		} finally {
			setDownloadActive(false);
			abortRef.current = null;
		}
	};

	const handleCancelDownload = () => {
		abortRef.current?.abort();
	};

	return (
		<div className="flex flex-col gap-6">
			{/* Lifecycle Demo */}
			<Card className="border-primary/30 bg-card p-6">
				<h3 className="mb-1 font-semibold text-primary text-sm">
					Resource Lifecycle — db_open / db_query / db_close
				</h3>
				<p className="mb-4 text-muted-foreground text-xs">
					Rust objects behind a rid (resource table). JS stores only{" "}
					<code className="font-mono text-primary">{"{ rid: number }"}</code> —
					the wire format of{" "}
					<code className="mx-1 font-mono text-primary">
						RustResourceHandle
					</code>
					.
				</p>

				<div className="mb-4 flex flex-wrap items-center gap-3">
					<Button
						onClick={handleOpen}
						disabled={opening}
						className="glow-hover"
					>
						{opening ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Plus className="mr-2 h-4 w-4" />
						)}
						{opening ? "Opening..." : "db_open"}
					</Button>
					<Button
						onClick={handleQuery}
						disabled={conn === null || querying}
						variant="outline"
						className="border-primary/50"
					>
						{querying ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Download className="mr-2 h-4 w-4" />
						)}
						db_query
					</Button>
					<Button
						onClick={handleClose}
						disabled={conn === null}
						variant="outline"
						className="border-primary/50"
					>
						<Trash2 className="mr-2 h-4 w-4" />
						db_close (command)
					</Button>
					<Button
						onClick={handleCloseViaLink}
						disabled={conn === null}
						variant="outline"
						className="border-primary/50"
					>
						<X className="mr-2 h-4 w-4" />
						link.resource.close()
					</Button>
				</div>

				<div className="space-y-1 font-mono text-xs">
					<p className="text-muted-foreground">
						Connection:{" "}
						{conn ? (
							<span className="text-primary">rid {conn.rid}</span>
						) : (
							<span className="text-muted-foreground">
								none — db_open first
							</span>
						)}
					</p>
					<p className="text-muted-foreground">
						SQL: <code className="text-primary">SELECT * FROM planets</code>
					</p>
				</div>

				{rows.length > 0 && (
					<div className="mt-4 overflow-hidden rounded border border-primary/20">
						<div className="grid grid-cols-[3rem_10rem_1fr] gap-2 border-primary/30 border-b bg-primary/10 px-3 py-2 font-mono text-primary text-xs">
							<span>id</span>
							<span>name</span>
							<span>description</span>
						</div>
						{rows.map((planet) => (
							<div
								key={planet.id}
								className="grid grid-cols-[3rem_10rem_1fr] gap-2 border-primary/20 border-b px-3 py-2 text-sm last:border-b-0"
							>
								<span className="font-mono">{planet.id}</span>
								<span>{planet.name}</span>
								<span className="text-muted-foreground">
									{planet.description ?? "—"}
								</span>
							</div>
						))}
					</div>
				)}
			</Card>

			{/* Cancellable transfer backed by a TransferHandle resource */}
			<Card className="border-primary/30 bg-card p-6">
				<div className="mb-3 flex items-center justify-between">
					<h3 className="font-semibold text-primary text-sm">
						Resource-Backed Download — Server-Side Cancellation
					</h3>
					<span className="font-mono text-muted-foreground text-xs">
						{download.status === "downloading"
							? `${formatBytes(download.received)} / ${formatBytes(DEMO_DOWNLOAD_BYTES)}`
							: `${formatBytes(DEMO_DOWNLOAD_BYTES)} payload`}
					</span>
				</div>

				<div className="mb-3 h-2 overflow-hidden rounded border border-primary/20 bg-background/50">
					<div
						className="h-full bg-primary transition-all duration-200"
						style={{ width: `${download.percent}%` }}
					/>
				</div>

				<div className="flex items-center gap-3">
					<Button
						onClick={handleDownload}
						disabled={download.status === "downloading"}
						className="glow-hover"
					>
						{download.status === "downloading" ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Download className="mr-2 h-4 w-4" />
						)}
						{download.status === "downloading" ? "Downloading..." : "Download"}
					</Button>
					{downloadActive && (
						<Button
							onClick={handleCancelDownload}
							variant="outline"
							className="border-destructive/50"
						>
							<X className="mr-2 h-4 w-4" />
							Cancel
						</Button>
					)}
					<p className="text-muted-foreground text-xs">
						Rust registers a{" "}
						<code className="mx-1 font-mono text-primary">TransferHandle</code>
						and announces{" "}
						<code className="mx-1 font-mono text-primary">
							handle:&lt;rid&gt;
						</code>
						; cancelling closes the rid →{" "}
						<code className="mx-1 font-mono text-primary">Resource::close</code>{" "}
						stops the transfer on the Rust side.
					</p>
					{download.status === "done" && (
						<p className="text-success text-xs">
							✓ Completed — Rust removed its own resource (link never closes a
							healthy stream)
						</p>
					)}
					{download.status === "error" && (
						<p className="text-destructive text-xs">✕ Transfer failed</p>
					)}
				</div>
			</Card>
		</div>
	);
}

function toRpcMessage(error: unknown, prefix: string): string {
	if (error instanceof ORPCError) {
		// isDefinedError() narrows the complement to `never` — but every
		// ORPCError carries a code, so the shape check is equivalent here.
		return error.code
			? `${prefix}: [${error.code}] ${error.message}`
			: `${prefix}: ${error.message}`;
	}
	return `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
}

function formatBytes(bytes: number): string {
	const units = ["B", "KB", "MB", "GB"];
	let size = bytes;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex += 1;
	}
	return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
}
