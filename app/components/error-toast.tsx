import { useId } from "react";
import { useMount, useUnmount } from "react-use";
import { toast } from "sonner";

/**
 * Shows `message` in an error toast while it is rendered. Render it after the page's `Toaster`,
 * which only shows the toasts raised once it listens.
 */
export function ErrorToast({ message }: { message: string }) {
  const id = useId();
  useMount(() => {
    toast.error(message, { id });
  });
  useUnmount(() => {
    toast.dismiss(id);
  });
  return null;
}
