import useSWR from "swr";
import {
  teleconsultBillingService,
  type TeleconsultBillingDto,
  type UpdateTeleconsultBillingRequest,
} from "@/services/teleconsultBilling.service";

export function useTeleconsultBilling(tenantSlug: string) {
  const { data, error, isLoading, mutate } = useSWR<TeleconsultBillingDto>(
    tenantSlug ? `/tenants/${tenantSlug}/teleconsult-billing` : null,
    () => teleconsultBillingService.getTeleconsultBilling(tenantSlug),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const updateBilling = async (request: UpdateTeleconsultBillingRequest) => {
    const updated = await teleconsultBillingService.updateTeleconsultBilling(tenantSlug, request);
    await mutate(updated, { revalidate: false });
    return updated;
  };

  return {
    billing: data,
    isLoading,
    error,
    mutate,
    updateBilling,
  };
}
