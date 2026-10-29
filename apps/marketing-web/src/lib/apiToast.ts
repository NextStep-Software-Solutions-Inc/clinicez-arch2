import { toast } from "sonner";
import { describeApiError } from "@/lib/apiError";

/**
 * Shows an API failure as a toast. Plan-related failures (inactive subscription, missing feature,
 * limit reached) get an "Upgrade" action that opens the workspace's plan page.
 */
export function toastApiError(err: unknown, fallback: string, tenantSlug?: string): void {
  const info = describeApiError(err, fallback);
  if (info.needsUpgrade && tenantSlug) {
    toast.error(info.message, {
      action: {
        label: "View plans",
        onClick: () => window.location.assign(`/${tenantSlug}/dashboard/plan`),
      },
    });
    return;
  }
  toast.error(info.message);
}
