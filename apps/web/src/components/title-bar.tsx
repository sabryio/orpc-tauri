import { X, Minus, Square, Terminal } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });
    appWindow.isMaximized().then(setIsMaximized);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = async () => {
    await getCurrentWindow().minimize();
  };

  const handleMaximize = async () => {
    await getCurrentWindow().toggleMaximize();
  };

  const handleClose = async () => {
    await getCurrentWindow().close();
  };

  return (
    <div
      data-tauri-drag-region
      className="flex-none h-10 bg-card/50 backdrop-blur-xl border-b border-primary/20 flex items-center justify-between select-none group hover:bg-card/80 transition-all duration-300"
      style={{ WebkitAppRegion: "drag" } as any}
    >
      {/* Left: App branding - draggable */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-3 px-4 flex-1"
        style={{ WebkitAppRegion: "drag" } as any}
      >
        <div className="relative">
          <Terminal className="h-4 w-4 text-primary" />
          <div className="absolute inset-0 blur-md bg-primary/30 animate-pulse-slow" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-primary tracking-wider font-semibold">oRPC</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground font-mono">Test Suite</span>
        </div>
        <div className="px-2 py-0.5 rounded-md text-[10px] bg-primary/10 text-primary/80 border border-primary/20 font-mono tracking-wide">
          ALPHA
        </div>
      </div>

      {/* Center: Drag hint - only visible on hover */}
      <div
        data-tauri-drag-region
        className="absolute left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-40 transition-opacity duration-300 pointer-events-none"
        style={{ WebkitAppRegion: "drag" } as any}
      >
        <div className="flex gap-1">
          <div className="w-1 h-1 rounded-full bg-muted-foreground" />
          <div className="w-1 h-1 rounded-full bg-muted-foreground" />
          <div className="w-1 h-1 rounded-full bg-muted-foreground" />
        </div>
      </div>

      {/* Right: Window controls - NOT draggable */}
      <div
        className="flex items-center gap-0.5 px-2 flex-none"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        <button
          onClick={handleMinimize}
          className="w-10 h-8 flex items-center justify-center hover:bg-secondary/80 rounded-md transition-all duration-200 group/btn"
          aria-label="Minimize"
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          <Minus className="h-3.5 w-3.5 text-muted-foreground group-hover/btn:text-foreground transition-colors" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-10 h-8 flex items-center justify-center hover:bg-secondary/80 rounded-md transition-all duration-200 group/btn"
          aria-label={isMaximized ? "Restore" : "Maximize"}
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          <Square className={`h-3.5 w-3.5 text-muted-foreground group-hover/btn:text-foreground transition-all ${isMaximized ? "scale-90" : ""}`} />
        </button>
        <button
          onClick={handleClose}
          className="w-10 h-8 flex items-center justify-center hover:bg-destructive/90 rounded-md transition-all duration-200 group/btn ml-1"
          aria-label="Close"
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          <X className="h-3.5 w-3.5 text-muted-foreground group-hover/btn:text-destructive-foreground transition-colors" />
        </button>
      </div>
    </div>
  );
}
