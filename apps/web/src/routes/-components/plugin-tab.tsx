import { isDefinedError, ORPCError } from "@orpc/client";
import { Button } from "@orpc-tauri/ui/components/button";
import { Card } from "@orpc-tauri/ui/components/card";
import { Input } from "@orpc-tauri/ui/components/input";
import { Label } from "@orpc-tauri/ui/components/label";
import { useMutation } from "@tanstack/react-query";
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
		</div>
	);
}
