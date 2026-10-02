import { useState } from "react";
import { Button } from "@tauri-orpc-contract/ui/components/button";
import { Card } from "@tauri-orpc-contract/ui/components/card";
import { ScrollArea } from "@tauri-orpc-contract/ui/components/scroll-area";
import { Code, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

interface CodeBlockProps {
  title: string;
  code: string;
}

export function CodeBlock({ title, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-primary/30 bg-card/50 backdrop-blur">
      <div className="flex items-center justify-between p-3 border-b border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-primary" />
          <span className="text-xs font-mono text-primary font-semibold">{title}</span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2 hover:bg-primary/10"
          >
            {copied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3 text-muted-foreground hover:text-primary" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-7 px-2 hover:bg-primary/10"
          >
            {expanded ? (
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>
      {expanded && (
        <ScrollArea className="max-h-[400px]">
          <pre className="p-4 text-[11px] font-mono leading-relaxed bg-muted/30">
            <code className="text-foreground/90">{code}</code>
          </pre>
        </ScrollArea>
      )}
    </Card>
  );
}
