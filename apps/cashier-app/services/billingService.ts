import { billingApiClient, type ApiResult } from './apiClient';
import type {
  ApplyDiscountRequest,
  DailyCollectionReport,
  Payment,
  Receipt,
  Shift,
  TakePaymentRequest,
  VisitBill,
  VisitBillSummary,
  VisitDiscountResult,
  Invoice,
} from '../types/billing';

const IDEMPOTENCY_HEADER = 'Idempotency-Key';

export interface VisitSearch {
  search?: string;
  visitKey?: string;
}

export interface ReportQuery {
  from: string;
  to: string;
  utcOffsetMinutes: number;
}

export const billingService = {
  searchVisits({ search, visitKey }: VisitSearch): Promise<ApiResult<VisitBillSummary[]>> {
    return billingApiClient.get<VisitBillSummary[]>('/visit-bills', {
      params: { search: search?.trim() || undefined, visitKey: visitKey?.trim() || undefined },
    });
  },

  getVisitBill(anchorInvoiceId: string): Promise<ApiResult<VisitBill>> {
    return billingApiClient.get<VisitBill>(`/visit-bills/${anchorInvoiceId}`);
  },

  applyVisitDiscount(anchorInvoiceId: string, request: ApplyDiscountRequest): Promise<ApiResult<VisitDiscountResult>> {
    return billingApiClient.post<VisitDiscountResult>(`/visit-bills/${anchorInvoiceId}/discounts`, request);
  },

  applyInvoiceDiscount(invoiceId: string, request: ApplyDiscountRequest): Promise<ApiResult<Invoice>> {
    return billingApiClient.post<Invoice>(`/invoices/${invoiceId}/discounts`, request);
  },

  /** Retrying with the same key returns the original payment instead of charging twice. */
  takePayment(request: TakePaymentRequest, idempotencyKey: string): Promise<ApiResult<Payment>> {
    return billingApiClient.post<Payment>('/payments', request, { headers: { [IDEMPOTENCY_HEADER]: idempotencyKey } });
  },

  getReceipt(receiptId: string): Promise<ApiResult<Receipt>> {
    return billingApiClient.get<Receipt>(`/receipts/${receiptId}`);
  },

  currentShift(): Promise<ApiResult<Shift>> {
    return billingApiClient.get<Shift>('/shifts/current');
  },

  openShift(openingFloat: number): Promise<ApiResult<Shift>> {
    return billingApiClient.post<Shift>('/shifts/open', { openingFloat });
  },

  closeShift(shiftId: string, countedCash: number, notes: string | null): Promise<ApiResult<Shift>> {
    return billingApiClient.post<Shift>(`/shifts/${shiftId}/close`, { countedCash, notes });
  },

  dailyCollection({ from, to, utcOffsetMinutes }: ReportQuery): Promise<ApiResult<DailyCollectionReport>> {
    return billingApiClient.get<DailyCollectionReport>('/reports/daily-collection', { params: { from, to, utcOffsetMinutes } });
  },
};
