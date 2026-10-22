import { isDefinedError, ORPCError } from "@orpc/client";
import { Button } from "@orpc-tauri/ui/components/button";
import { Card } from "@orpc-tauri/ui/components/card";
import { ScrollArea } from "@orpc-tauri/ui/components/scroll-area";
import { useMutation } from "@tanstack/react-query";
import { Download, FileCheck, Loader2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	Dropzone,
	DropzoneContent,
	DropzoneEmptyState,
} from "@/components/dropzone";
import { client, orpc } from "@/rpc";

interface UploadResult {
	success: boolean;
	size: number;
	filename: string;
	mime_type?: string;
}

type DownloadStatus = "idle" | "downloading" | "done" | "error";

interface DownloadState {
	status: DownloadStatus;
	percent: number;
	received: number;
	totalBytes: number | null;
}

const INITIAL_DOWNLOAD_STATE: DownloadState = {
	status: "idle",
	percent: 0,
	received: 0,
	totalBytes: null,
};

const DEMO_DOWNLOAD_BYTES = 256 * 1024;

export function FileUploadTab() {
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [uploadedFiles, setUploadedFiles] = useState<
		Array<{ file: File; result: UploadResult }>
	>([]);
	const [download, setDownload] = useState<DownloadState>(
		INITIAL_DOWNLOAD_STATE,
	);
	const downloadAbortRef = useRef<AbortController | null>(null);

	// ---- raw binary download (tauri.binary() convention, §1) ---------------
	const [rawPath, setRawPath] = useState("Cargo.toml");
	const [rawDownload, setRawDownload] = useState<DownloadState>(
		INITIAL_DOWNLOAD_STATE,
	);
	const rawDownloadAbortRef = useRef<AbortController | null>(null);

	const uploadFileMutation = useMutation(
		orpc.file.upload_file.mutationOptions({
			onSuccess: (data) => {
				toast.success(`Uploaded: ${data.filename} (${formatBytes(data.size)})`);
			},
			onError: (error) => {
				toast.error(
					isDefinedError(error)
						? `Upload failed: ${error.message}`
						: `Unexpected Error: ${error.message}`,
				);
			},
		}),
	);

	const handleDrop = (acceptedFiles: File[]) => {
		setSelectedFiles(acceptedFiles);
	};

	const handleUpload = async () => {
		for (const file of selectedFiles) {
			try {
				// Convert File to Uint8Array (no base64 needed!)
				const arrayBuffer = await file.arrayBuffer();
				const uint8Array = new Uint8Array(arrayBuffer);

				const result = await uploadFileMutation.mutateAsync({
					input: {
						content: uint8Array,
						filename: file.name,
					},
				});

				setUploadedFiles((prev) => [...prev, { file, result }]);
			} catch (error) {
				console.error("Upload failed:", error);
			}
		}
		setSelectedFiles([]);
	};

	const handleClear = () => {
		setSelectedFiles([]);
	};

	const handleRemoveUploaded = (index: number) => {
		setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
	};

	const handleDownload = async () => {
		const controller = new AbortController();
		downloadAbortRef.current = controller;

		setDownload({
			status: "downloading",
			percent: 0,
			received: 0,
			totalBytes: DEMO_DOWNLOAD_BYTES,
		});

		try {
			let received = 0;

			const iterator = await client.file.download_file(
				{ input: { total_bytes: DEMO_DOWNLOAD_BYTES } },
				{
					// Progress comes from data-less control envelopes read by the link;
					// cumulative bytesTransferred is authoritative between ticks.
					onProgress: (info) => {
						setDownload((prev) => ({
							...prev,
							percent: Math.max(prev.percent, info.percentage ?? 0),
							received: Math.max(prev.received, info.bytesTransferred),
						}));
					},
					// Mid-stream cancellation: aborting tears the stream down and
					// rejects with ORPCError("CLIENT_CLOSED_REQUEST").
					signal: controller.signal,
				},
			);

			for await (const chunk of iterator) {
				received += chunk.length;
				// Chunk bytes and progress ticks are separate sources — take the
				// max so cumulative progress never double-counts chunk bytes.
				setDownload((prev) => ({
					...prev,
					received: Math.max(prev.received, received),
				}));
			}

			setDownload({
				status: "done",
				percent: 100,
				received: DEMO_DOWNLOAD_BYTES,
				totalBytes: DEMO_DOWNLOAD_BYTES,
			});
			toast.success(
				`Downloaded ${formatBytes(DEMO_DOWNLOAD_BYTES)} demo payload`,
			);
		} catch (error) {
			if (
				error instanceof ORPCError &&
				error.code === "CLIENT_CLOSED_REQUEST"
			) {
				setDownload(INITIAL_DOWNLOAD_STATE);
				toast.info("Download cancelled");
			} else if (error instanceof ORPCError) {
				setDownload((prev) => ({ ...prev, status: "error" }));
				toast.error(
					isDefinedError(error)
						? `Download failed: [${error.code}] ${error.message}`
						: `Download failed: ${(error as any).message}`,
				);
			} else {
				setDownload((prev) => ({ ...prev, status: "error" }));
				toast.error(
					`Download failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		} finally {
			downloadAbortRef.current = null;
		}
	};

	const handleCancelDownload = () => {
		downloadAbortRef.current?.abort();
	};

	const handleRawDownload = async () => {
		const controller = new AbortController();
		rawDownloadAbortRef.current = controller;

		setRawDownload({
			status: "downloading",
			percent: 0,
			received: 0,
			totalBytes: null, // announced by Rust once the file is opened
		});

		try {
			let received = 0;

			const iterator = await client.raw.raw_download(
				{ input: { path: rawPath } },
				{
					// Progress envelopes ride the same channel, still JSON —
					// their `totalBytes` is the file size announced by Rust.
					onProgress: (info) => {
						setRawDownload((prev) => ({
							...prev,
							percent: Math.max(prev.percent, info.percentage ?? 0),
							received: Math.max(prev.received, info.bytesTransferred),
							totalBytes: info.totalBytes ?? prev.totalBytes,
						}));
					},
					signal: controller.signal,
				},
			);

			for await (const chunk of iterator) {
				// Each chunk is a raw ArrayBuffer — zero JSON overhead.
				received += chunk.byteLength;
				setRawDownload((prev) => ({
					...prev,
					received: Math.max(prev.received, received),
				}));
			}

			setRawDownload((prev) => ({
				status: "done",
				percent: 100,
				received,
				totalBytes: prev.totalBytes ?? received,
			}));
			toast.success(`Raw-download finished in-byte-true: ${rawPath}`);
		} catch (error) {
			if (
				error instanceof ORPCError &&
				error.code === "CLIENT_CLOSED_REQUEST"
			) {
				setRawDownload(INITIAL_DOWNLOAD_STATE);
				toast.info("Raw download cancelled");
			} else if (error instanceof ORPCError) {
				setRawDownload((prev) => ({ ...prev, status: "error" }));
				toast.error(
					isDefinedError(error)
						? `Raw download failed: [${error.code}] ${error.message}`
						: `Raw download failed: ${(error as any).message}`,
				);
			} else {
				setRawDownload((prev) => ({ ...prev, status: "error" }));
				toast.error(
					`Raw download failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		} finally {
			rawDownloadAbortRef.current = null;
		}
	};

	const handleCancelRawDownload = () => {
		rawDownloadAbortRef.current?.abort();
	};

	return (
		<div className="flex h-full flex-col gap-6">
			<div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Upload Section */}
				<Card className="flex flex-col border-primary/30 bg-card p-6">
					<h3 className="mb-4 font-semibold text-primary text-sm">
						Upload Files
					</h3>

					<Dropzone
						src={selectedFiles.length > 0 ? selectedFiles : undefined}
						onDrop={handleDrop}
						maxFiles={5}
						maxSize={10 * 1024 * 1024} // 10MB
						className="mb-4"
					>
						<DropzoneEmptyState />
						<DropzoneContent />
					</Dropzone>

					{selectedFiles.length > 0 && (
						<>
							<div className="mb-4 min-h-0 flex-1 space-y-2 overflow-auto">
								{selectedFiles.map((file, index) => (
									<div
										key={index}
										className="flex items-center justify-between rounded border border-primary/20 bg-card/50 p-3"
									>
										<div className="min-w-0 flex-1">
											<p className="truncate font-mono text-sm">{file.name}</p>
											<p className="text-muted-foreground text-xs">
												{formatBytes(file.size)} • {file.type || "unknown"}
											</p>
										</div>
									</div>
								))}
							</div>

							<div className="flex gap-2">
								<Button
									onClick={handleUpload}
									disabled={uploadFileMutation.isPending}
									className="glow-hover flex-1"
								>
									<Upload className="mr-2 h-4 w-4" />
									{uploadFileMutation.isPending ? "Uploading..." : "Upload"}
								</Button>
								<Button
									onClick={handleClear}
									variant="outline"
									className="border-primary/50"
								>
									<X className="mr-2 h-4 w-4" />
									Clear
								</Button>
							</div>
						</>
					)}
				</Card>

				{/* Upload History */}
				<Card className="flex flex-col border-primary/30 bg-card p-6">
					<h3 className="mb-4 font-semibold text-primary text-sm">
						Upload History
					</h3>

					{uploadedFiles.length === 0 ? (
						<div className="flex flex-1 items-center justify-center">
							<p className="text-muted-foreground text-sm">
								No files uploaded yet
							</p>
						</div>
					) : (
						<ScrollArea className="min-h-0 flex-1">
							<div className="space-y-2">
								{uploadedFiles.map((item, index) => (
									<div
										key={index}
										className="flex items-start justify-between rounded border border-primary/20 bg-card/50 p-3 transition-all hover:border-primary/50"
									>
										<div className="flex min-w-0 flex-1 items-start gap-3">
											<FileCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
											<div className="min-w-0 flex-1">
												<p className="truncate font-mono text-sm">
													{item.result.filename}
												</p>
												<div className="mt-1 space-y-0.5 text-muted-foreground text-xs">
													<p>Size: {formatBytes(item.result.size)}</p>
													{item.result.mime_type && (
														<p>Type: {item.result.mime_type}</p>
													)}
													<p className="text-success">✓ Upload successful</p>
												</div>
											</div>
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => handleRemoveUploaded(index)}
											className="shrink-0"
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
								))}
							</div>
						</ScrollArea>
					)}
				</Card>
			</div>

			{/* Download Progress Demo */}
			<Card className="border-primary/30 bg-card p-6">
				<div className="mb-3 flex items-center justify-between">
					<h3 className="font-semibold text-primary text-sm">
						Download Demo — Channel Transfer Progress
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
					{download.status === "downloading" && (
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
						Chunks stream through the channel; data-less
						<code className="mx-1 font-mono text-primary">progress:</code>
						control envelopes drive the bar via onProgress.
					</p>
					{download.status === "done" && (
						<p className="text-success text-xs">
							✓ Received {formatBytes(DEMO_DOWNLOAD_BYTES)} via onProgress +
							channel stream
						</p>
					)}
					{download.status === "error" && (
						<p className="text-destructive text-xs">✕ Transfer failed</p>
					)}
				</div>
			</Card>

			{/* Raw Binary Download Demo (tauri.binary() convention) */}
			<Card className="border-primary/30 bg-card p-6">
				<div className="mb-3 flex items-center justify-between">
					<h3 className="font-semibold text-primary text-sm">
						Raw Binary Download — tauri.binary() (zero JSON)
					</h3>
					<span className="font-mono text-muted-foreground text-xs">
						{rawDownload.status === "downloading" ||
						rawDownload.status === "done"
							? `${formatBytes(rawDownload.received)}${rawDownload.totalBytes ? ` / ${formatBytes(rawDownload.totalBytes)}` : ""}`
							: "raw chunks → ArrayBuffer"}
					</span>
				</div>

				<div className="mb-3 h-2 overflow-hidden rounded border border-primary/20 bg-background/50">
					<div
						className="h-full bg-success transition-all duration-200"
						style={{ width: `${rawDownload.percent}%` }}
					/>
				</div>

				<div className="flex items-center gap-3">
					<input
						value={rawPath}
						onChange={(e) => setRawPath(e.target.value)}
						placeholder="relative to src-tauri/, e.g. target/debug/&lt;app&gt;.exe"
						spellCheck={false}
						className="h-9 min-w-0 flex-1 rounded border border-primary/30 bg-background/60 px-3 font-mono text-xs outline-none focus:border-primary/60"
					/>
					<Button
						onClick={handleRawDownload}
						disabled={
							rawDownload.status === "downloading" || rawPath.trim() === ""
						}
						className="glow-hover shrink-0"
					>
						{rawDownload.status === "downloading" ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Download className="mr-2 h-4 w-4" />
						)}
						{rawDownload.status === "downloading"
							? "Downloading..."
							: "Download"}
					</Button>
					{rawDownload.status === "downloading" && (
						<Button
							onClick={handleCancelRawDownload}
							variant="outline"
							className="border-destructive/50"
						>
							<X className="mr-2 h-4 w-4" />
							Cancel
						</Button>
					)}
				</div>
				<p className="mt-3 text-muted-foreground text-xs">
					Sends the real file through a raw channel: data chunks arrive as
					<code className="mx-1 font-mono text-primary">ArrayBuffer</code>
					(InvokeResponseBody::Raw — no <code>number[]</code> JSON inflation)
					while
					<code className="mx-1 font-mono text-primary">progress:</code>
					envelopes stay JSON. Try
					<code className="mx-1 font-mono">Cargo.toml</code>
					for a small file, or the debug exe for megabytes.
					{rawDownload.status === "done" && (
						<span className="text-success">
							{"  "}✓ {formatBytes(rawDownload.received)} in-byte-true
						</span>
					)}
					{rawDownload.status === "error" && (
						<span className="text-destructive"> ✕ failed (see toast)</span>
					)}
				</p>
			</Card>
		</div>
	);
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
	const units = ["B", "KB", "MB", "GB"];
	let size = bytes;
	let unitIndex = 0;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	return `${size.toFixed(2)} ${units[unitIndex]}`;
}
