import { apiClient } from "@/transport/apiClient";

/** Money collected, reversed and net, for one currency over some slice of the rollup. */
export interface FinanceTotals {
  currency: string;
  paid: number;
  reversed: number;
  net: number;
  paidInvoices: number;
  reversedInvoices: number;
}

export interface FinanceFacilityTotals {
  facilityId: string;
  facilityName: string;
  facilityType: string;
  branchId: string | null;
  totals: FinanceTotals;
}

export interface FinanceBranchTotals {
  branchId: string | null;
  branchName: string;
  totals: FinanceTotals;
}

export interface FinanceDay {
  /** ISO date (yyyy-MM-dd). */
  day: string;
  totals: FinanceTotals;
}

export interface FinanceSource {
  sourceType: string;
  totals: FinanceTotals;
}

/** Mirrors `FinanceSummaryDto`: totals only, never patient or invoice-line detail. */
export interface FinanceSummary {
  from: string;
  to: string;
  totals: FinanceTotals[];
  byFacility: FinanceFacilityTotals[];
  byBranch: FinanceBranchTotals[];
  bySource: FinanceSource[];
  daily: FinanceDay[];
}

export interface FinanceQuery {
  from?: string;
  to?: string;
  facilityId?: string;
  branchId?: string;
}

export const financeService = {
  /** Owner, Admin or Billing members only; the range defaults to the last 30 days and may not exceed 366 days. */
  getSummary: async (tenantSlug: string, query: FinanceQuery): Promise<FinanceSummary> => {
    const params = new URLSearchParams();
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.facilityId) params.set("facilityId", query.facilityId);
    if (query.branchId) params.set("branchId", query.branchId);
    const qs = params.toString();
    const res = await apiClient.get<FinanceSummary>(`/tenants/${encodeURIComponent(tenantSlug)}/finance/summary${qs ? `?${qs}` : ""}`);
    return res.data;
  },
};
