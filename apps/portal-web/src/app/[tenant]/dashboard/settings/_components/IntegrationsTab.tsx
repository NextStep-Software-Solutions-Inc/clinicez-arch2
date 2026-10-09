"use client";

import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";
import { tenantService } from "@/services/tenant.service";
import { ApiKeysCard } from "./ApiKeysCard";
import { WebhooksCard } from "./WebhooksCard";

export function IntegrationsTab({ tenantSlug }: { tenantSlug: string }) {
    const { data, error, isLoading, mutate } = useSWR(
        `integrations/${tenantSlug}`,
        () => tenantService.getIntegrations(tenantSlug),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    );

    if (isLoading) return <Skeleton className="h-72 w-full rounded-3xl" />;

    if (error || !data) {
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-6 text-sm text-red-700 dark:text-red-300">
                Integrations could not be loaded. Please refresh and try again.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <ApiKeysCard tenantSlug={tenantSlug} integrations={data} onChanged={() => mutate()} />
            <WebhooksCard tenantSlug={tenantSlug} integrations={data} onChanged={() => mutate()} />
        </div>
    );
}
