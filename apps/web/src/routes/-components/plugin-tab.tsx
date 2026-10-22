import { isDefinedError, ORPCError } from "@orpc/client";
import { Button } from "@orpc-tauri/ui/components/button";
import { Card } from "@orpc-tauri/ui/components/card";
import { Input } from "@orpc-tauri/ui/components/input";
import { Label } from "@orpc-tauri/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	BellRing,
	CheckCircle2,
	HelpCircle,
	ShieldCheck,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/rpc";

interface NotifyLogEntry {
	command: string;
	at: string;
}

/**
 * Plugin-as-procedure demo — the contract routes at the Tauri plugin's own
 * IPC namespace (`plugin:notification|*` via `tauri.command(...)`); no
 * custom Rust command in between. The input courier is the plugin's own
 * parameter name (`options`), and the capability JSON stays the source of
 * truth for grants.
 */
export function PluginTab() {
	const [permission, setPermission] = useState<boolean | null | undefined>(
		undefined, // undefined = not checked yet
	);
	const [title, setTitle] = useState("Sync complete");
	const [body, setBody] = useState("Cold archive upload finished in 12m 40s");
	const [log, setLog] = useState<NotifyLogEntry[]>([]);
	const [port, setPort] = useState("4180");
	const [portTaken, setPortTaken] = useState<boolean | null>(null);
	const [freePort, setFreePort] = useState<number | null>(null);

	const checkPermission = useMutation(
		orpc.desktop.desktop_is_permission_granted.mutationOptions({
			onSuccess: (granted) => {
				setPermission(granted);
			},
			onError: (error) => {
				toast.error(
					isDefinedError(error) || error instanceof ORPCError
						? `Permission check failed: [${error.code}] ${error.message}`
						: "Permission check failed",
				);
				setPermission(null);
			},
		}),
	);

	const notify = useMutation(
		orpc.desktop.desktop_notify.mutationOptions({
			onSuccess: () => {
				setLog((prev) => [
					{
						command: "plugin:notification|notify",
						at: new Date().toLocaleTimeString(),
					},
					...prev,
				]);
			},
			onError: (error) => {
				// Permission errors surface with their ACL message — the same
				// loud path as `plugin:resources|close`.
				toast.error(
					isDefinedError(error) || error instanceof ORPCError
						? `Notify failed: [${error.code}] ${error.message}`
						: "Notify failed",
				);
			},
		}),
	);

	// ---------------------------------------------------------------------------
	// Network — plugin:network|* (same zero-cost routing; this plugin's
	// `Result<T, String>` errors still land as ORPCError messages).
	// ---------------------------------------------------------------------------

	const interfaces = useQuery(
		orpc.network.get_non_empty_interfaces.queryOptions(),
	);
	const localNetworks = useQuery(
		orpc.network.non_localhost_networks.queryOptions(),
	);

	const checkPort = useMutation(
		orpc.network.is_port_taken.mutationOptions({
			onSuccess: (taken) => {
				setPortTaken(taken);
			},
			onError: (error) => {
				setPortTaken(null);
				toast.error(
					isDefinedError(error) || error instanceof ORPCError
						? `Port check failed: [${error.code}] ${error.message}`
						: "Port check failed",
				);
			},
		}),
	);

	const findFreePort = useMutation(
		orpc.network.find_available_port.mutationOptions({
			onSuccess: (found) => {
				setFreePort(found);
			},
			onError: (error) => {
				toast.error(
					isDefinedError(error) || error instanceof ORPCError
						? `Port scan failed: [${error.code}] ${error.message}`
						: "Port scan failed",
				);
			},
		}),
	);

	const parsedPort = Number.parseInt(port, 10);

	return (
		<div className="flex h-full flex-col gap-6">
			<Card className="border-primary/30 bg-card p-6">
				<div className="mb-3 flex items-center justify-between">
					<h3 className="font-semibold text-primary text-sm">
						Plugin-as-procedure — tauri.command("plugin:notification|…")
					</h3>
					<span className="font-mono text-muted-foreground text-xs">
						no custom Rust command
					</span>
				</div>

				<p className="mb-4 text-muted-foreground text-xs">
					The contract routes these procedures straight at the Tauri
					notification plugin&apos;s IPC namespace — they are typed RPC calls
					like every other procedure. This is{" "}
					<code>plugin:notification|is_permission_granted</code> and{" "}
					<code>plugin:notification|notify</code>, invoked verbatim; the{" "}
					<code>options</code> input key is the plugin&apos;s own parameter
					name, and <code>notification:default</code> in the capabilities JSON
					holds the grant.
				</p>

				<div className="mb-6 flex items-center gap-3">
					<Button
						variant="outline"
						className="gap-2"
						onClick={() => checkPermission.mutate()}
						disabled={checkPermission.isPending}
					>
						<ShieldCheck className="h-4 w-4" />
						Check permission
					</Button>
					{permission !== undefined && (
						<span className="flex items-center gap-2 text-sm">
							{permission === true ? (
								<>
									<CheckCircle2 className="h-4 w-4 text-success" />
									<span className="text-success">granted</span>
								</>
							) : permission === false ? (
								<>
									<XCircle className="h-4 w-4 text-destructive" />
									<span className="text-destructive">denied</span>
								</>
							) : (
								<>
									<HelpCircle className="h-4 w-4 text-muted-foreground" />
									<span className="text-muted-foreground">prompt (null)</span>
								</>
							)}
						</span>
					)}
				</div>

				<div className="mb-6 grid gap-3">
					<div className="grid gap-1.5">
						<Label
							className="text-muted-foreground text-xs"
							htmlFor="notify-title"
						>
							Title
						</Label>
						<Input
							id="notify-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Notification title"
							className="h-9"
						/>
					</div>
					<div className="grid gap-1.5">
						<Label
							htmlFor="notify-body"
							className="text-muted-foreground text-xs"
						>
							Body
						</Label>
						<Input
							id="notify-body"
							value={body}
							onChange={(e) => setBody(e.target.value)}
							placeholder="Notification body"
							className="h-9"
						/>
					</div>
					<div>
						<Button
							className="glow-hover"
							onClick={() =>
								notify.mutate({
									options: {
										title: title.trim() || "oRPC_Test",
										body: body.trim() || undefined,
									},
								})
							}
							disabled={notify.isPending}
						>
							<BellRing className="mr-2 h-4 w-4" />
							Show notification
						</Button>
					</div>
				</div>

				{log.length > 0 && (
					<div className="rounded border border-primary/20 bg-background/50 p-3">
						<p className="mb-2 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
							Invoked
						</p>
						<div className="space-y-1">
							{log.map((entry) => (
								<div
									key={`${entry.at}-${entry.command}`}
									className="flex items-center justify-between font-mono text-xs"
								>
									<span className="text-primary">{entry.command}</span>
									<span className="text-muted-foreground">{entry.at}</span>
								</div>
							))}
						</div>
					</div>
				)}
			</Card>

			<Card className="border-primary/30 bg-card p-6">
				<div className="mb-3 flex items-center justify-between">
					<h3 className="font-semibold text-primary text-sm">
						Network — plugin:network|*
					</h3>
					<button
						type="button"
						className="font-mono text-muted-foreground text-xs hover:text-primary"
						onClick={() => {
							interfaces.refetch();
							localNetworks.refetch();
						}}
					>
						refresh
					</button>
				</div>

				<p className="mb-4 text-muted-foreground text-xs">
					Another plugin, typed procedures only: local network chips come from{" "}
					<code>plugin:network|non_localhost_networks</code>, the interface
					table from <code>plugin:network|get_non_empty_interfaces</code>. Port
					tools pass the plugin&apos;s own <code>port</code> parameter — again
					no <code>input</code> courier.
				</p>

				{localNetworks.data && localNetworks.data.length > 0 ? (
					<div className="mb-4 flex flex-wrap gap-2">
						{localNetworks.data.map((net) => (
							<span
								key={`${net.addr}/${net.prefix}`}
								className="rounded border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-primary text-xs"
							>
								{net.addr}/{net.prefix}
							</span>
						))}
					</div>
				) : (
					<p className="mb-4 text-muted-foreground text-xs">
						{localNetworks.isPending
							? "Loading local networks…"
							: "No routed local networks reported"}
					</p>
				)}

				<div className="mb-4 overflow-hidden rounded border border-primary/20">
					{interfaces.isPending ? (
						<p className="p-3 text-muted-foreground text-xs">
							Loading interfaces…
						</p>
					) : interfaces.data?.length ? (
						<div className="divide-y divide-primary/10">
							{interfaces.data.map((iface) => (
								<div
									key={`${iface.index}-${iface.name}`}
									className="flex items-center justify-between px-3 py-2 text-xs"
								>
									<div className="flex items-center gap-2">
										<span className="font-semibold">{iface.name}</span>
										{iface.mac_addr && (
											<span className="font-mono text-muted-foreground">
												{iface.mac_addr}
											</span>
										)}
									</div>
									<div className="flex gap-2 font-mono text-muted-foreground">
										{iface.v4_addrs.map((addr) => (
											<span key={addr.ip}>
												{addr.ip}
												{addr.prefix !== undefined ? `/${addr.prefix}` : ""}
											</span>
										))}
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="p-3 text-muted-foreground text-xs">
							No interfaces with addresses
						</p>
					)}
				</div>

				<div className="flex items-center gap-2">
					<Input
						value={port}
						onChange={(e) => {
							setPort(e.target.value);
							setPortTaken(null);
						}}
						placeholder="port"
						className="h-9 max-w-32"
						inputMode="numeric"
					/>
					<Button
						variant="outline"
						className="shrink-0"
						onClick={() =>
							Number.isInteger(parsedPort) &&
							checkPort.mutate({ port: parsedPort })
						}
						disabled={
							checkPort.isPending ||
							!Number.isInteger(parsedPort) ||
							parsedPort < 0 ||
							parsedPort > 65535
						}
					>
						Is port taken?
					</Button>
					<span className="font-mono text-xs">
						{checkPort.isPending ? (
							"checking…"
						) : portTaken === true ? (
							<span className="text-destructive">taken</span>
						) : portTaken === false ? (
							<span className="text-success">free</span>
						) : null}
					</span>
					<Button
						className="glow-hover shrink-0"
						onClick={() => findFreePort.mutate()}
						disabled={findFreePort.isPending}
					>
						Find free port
					</Button>
					{freePort !== null && (
						<span className="font-mono text-primary text-xs">→ {freePort}</span>
					)}
				</div>
			</Card>
		</div>
	);
}
