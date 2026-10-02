import { useState } from "react";
import { toast } from "sonner";
import { isDefinedError } from "@/rpc";

export function useStreamEvents<T>() {
  const [events, setEvents] = useState<T[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const startStream = async (
    streamFn: () => Promise<AsyncIterableIterator<T>>,
    successMsg: string,
  ) => {
    setIsStreaming(true);
    setEvents([]);

    try {
      const iterator = await streamFn();
      for await (const event of iterator) {
        console.log("Received event:", event);
        setEvents((prev) => [...prev, event]);
      }
      toast.success(successMsg);
    } catch (error) {
      console.error("Stream error:", error);
      toast.error(
        isDefinedError(error) ? `Stream error: ${error}` : "Stream failed",
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return { events, isStreaming, startStream };
}
