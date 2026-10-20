import { ORPCError } from "@orpc/client";
import { toast } from "sonner";

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
