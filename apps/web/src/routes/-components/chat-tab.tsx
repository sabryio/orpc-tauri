import { ORPCError } from "@orpc/client";
import { Button } from "@orpc-tauri/ui/components/button";
import { Card } from "@orpc-tauri/ui/components/card";
import { Input } from "@orpc-tauri/ui/components/input";
import { ScrollArea } from "@orpc-tauri/ui/components/scroll-area";
import { Loader2, LogOut, MessagesSquare, Send } from "lucide-react";
import type { DuplexSession } from "@sabryio/orpc-tauri";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { link } from "@/rpc";
import type { ChatMessage } from "@/rpc/contract";

type SessionStatus = "idle" | "connecting" | "live" | "closed";
type ChatSessionHandle = DuplexSession<ChatMessage, { text: string }>;

const DEFAULT_ROOM = "lobby";

/**
 * Duplex session demo — `link.duplex` (rid + channel + unary = WebSockets).
 *
 * One session object owns both directions: `for await` drains the Rust→JS
 * channel while `.send()` pushes JS→Rust through the paired unary command.
 * The rid is captured from Rust's `handle:<rid>` announcement and injected
 * into every send — nothing `handle`-shaped ever reaches this component.
 * Leaving = `.return()`, which closes the rid server-side through autoClose.
 */
export function ChatTab() {
  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [status, setSessionStatus] = useState<SessionStatus>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sendPending, setSendPending] = useState(false);

  const sessionRef = useRef<ChatSessionHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startSession = async () => {
    const targetRoom = room.trim() || DEFAULT_ROOM;
    const controller = new AbortController();
    abortRef.current = controller;

    setSessionStatus("connecting");
    let chat: ChatSessionHandle;
    try {
      chat = await link.duplex<ChatMessage, { text: string }>(
        ["chat", "chat_session"],
        { send: ["chat", "chat_session_send"] },
        { signal: controller.signal, startInput: { room: targetRoom } },
      );
    } catch (error) {
      setSessionStatus("idle");
      abortRef.current = null;
      toast.error(
        `Could not join #${targetRoom}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    sessionRef.current = chat;
    setMessages([]);
    setRoom(targetRoom);
    setSessionStatus("live");

    try {
      // Rust → JS: ends when `leave()` (`.return()`) runs or the signal
      // aborts — autoClose then closes the rid server-side.
      for await (const message of chat) {
        setMessages((prev) => [...prev, message]);
      }
      setSessionStatus("closed");
      sessionRef.current = null;
      toast.info("Session ended");
    } catch (error) {
      if (
        error instanceof ORPCError &&
        error.code === "CLIENT_CLOSED_REQUEST"
      ) {
        setSessionStatus("closed");
        sessionRef.current = null;
      } else if (error instanceof ORPCError) {
        // The duplex facade yields plain ORPCError (no contract-typed
        // code universe) — surface code + message verbatim.
        toast.error(`Session error: [${error.code}] ${error.message}`);
        setSessionStatus("closed");
        sessionRef.current = null;
      } else {
        toast.error(
          `Session failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        setSessionStatus("closed");
        sessionRef.current = null;
      }
    }
  };

  const handleSend = async () => {
    const session = sessionRef.current;
    const text = draft.trim();
    if (!session || status !== "live" || !text) return;

    setSendPending(true);
    try {
      // JS → Rust — the link injects the rid; Rust echoes the message
      // back through the channel (`from: "you"`), nothing local to add.
      await session.send({ text });
      setDraft("");
    } catch (error) {
      if (
        error instanceof ORPCError &&
        error.code === "CLIENT_CLOSED_REQUEST"
      ) {
        toast.info("Session closed");
      } else if (error instanceof ORPCError) {
        toast.error(`Send failed: [${error.code}] ${error.message}`);
      } else {
        toast.error(
          `Send failed: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    } finally {
      setSendPending(false);
    }
  };

  const leave = async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    if (!session) return;

    try {
      // Consumer early exit — the delegated `.return()` tears the stream
      // down and autoClose closes the rid on the Rust side.
      await session.return?.();
    } catch {
      // Teardown races (cancel envelope vs. return) are expected.
    } finally {
      setSessionStatus("closed");
    }
  };

  // Leaving the tab is leaving the session.
  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      sessionRef.current = null;
      session?.return?.();
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const live = status === "live";

  return (
    <div className="flex min-h-full flex-col gap-6">
      <Card className="border-primary/30 bg-card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-primary text-sm">
            Duplex Chat — link.duplex (rid + channel + unary = WebSockets)
          </h3>
          <span
            className={`font-mono text-xs ${
              live
                ? "text-success"
                : status === "closed"
                  ? "text-muted-foreground"
                  : "text-primary"
            }`}
          >
            {status === "live" ? "● live" : status}
          </span>
        </div>

        <p className="mb-4 text-muted-foreground text-xs">
          One session, two directions: <code>for await</code> drains the Rust→JS
          channel, <code>.send()</code> rides the paired unary command — the rid
          comes from the <code>handle:&lt;rid&gt;</code> announcement and the
          link injects it automatically. Leave with <code>.return()</code> —
          autoClose cancels the Rust session for you.
        </p>

        {status === "idle" || status === "closed" ? (
          <div className="flex items-center gap-3">
            <Input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="room"
              className="h-9 max-w-48"
              onKeyDown={(e) => {
                if (e.key === "Enter") void startSession();
              }}
            />
            <Button onClick={() => void startSession()} className="glow-hover">
              <MessagesSquare className="mr-2 h-4 w-4" />
              Join
            </Button>
          </div>
        ) : (
          <>
            <ScrollArea className="h-72 rounded border border-primary/20 bg-background/50 p-3">
              <div className="space-y-2">
                {messages.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    {status === "connecting" ? "Joining…" : "No messages yet"}
                  </p>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.from === "you"
                        ? "flex justify-end"
                        : "flex justify-start"
                    }
                  >
                    <div
                      className={`max-w-[75%] rounded px-3 py-2 ${
                        message.from === "you"
                          ? "bg-primary/20"
                          : "border border-primary/20 bg-card"
                      }`}
                    >
                      <p className="mb-0.5 font-mono text-[10px] text-muted-foreground">
                        {message.from === "you" ? "you" : "rust"}
                      </p>
                      <p className="text-sm">{message.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="mt-3 flex items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`message #${room}`}
                disabled={!live}
                className="h-9 flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    void handleSend();
                  }
                }}
              />
              <Button
                onClick={() => void handleSend()}
                disabled={!live || !draft.trim() || sendPending}
                className="glow-hover shrink-0"
              >
                {sendPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send
              </Button>
              <Button
                onClick={() => void leave()}
                variant="outline"
                className="shrink-0 border-destructive/50"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Leave
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
