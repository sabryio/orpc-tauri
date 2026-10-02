import { toast } from "sonner";
import { ORPCError } from "@/rpc";

export function mutationHandlers(
  successMsg: string,
  errorMsg: string,
  onSuccess?: () => void,
) {
  return {
    onSuccess: () => {
      toast.success(successMsg);
      onSuccess?.();
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof ORPCError ? `Error: ${error.message}` : errorMsg;
      toast.error(errorMessage);
    },
  };
}
