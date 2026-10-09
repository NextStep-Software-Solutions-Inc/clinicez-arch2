/**
 * Wire contracts of billing-api (`/api/v1`). Property names are camelCase and enums are their C# names, exactly as the
 * service serialises them (`JsonStringEnumConverter`, web defaults). Money is a JSON number with at most two decimals.
 */

export type StaffRole = 'Cashier' | 'Supervisor' | 'Admin';
export type FacilityKind = 'Clinic' | 'Organization' | 'Laboratory' | 'Pharmacy';
export type InvoiceStatus = 'Open' | 'PartiallyPaid' | 'Paid' | 'Void' | 'Refunded';
export type InvoiceOrigin = 'Requested' | 'WalkIn';
export type PaymentMethod = 'Cash' | 'Card' | 'GCash' | 'Maya' | 'Other' | 'Insurance';
export type InsurerKind = 'PhilHealth' | 'Hmo' | 'Other';
export type DiscountKind = 'Senior' | 'Pwd' | 'Promo' | 'Other';
export type DiscountMode = 'Percentage' | 'Fixed';
export type ShiftStatus = 'Open' | 'Closed';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
  tenantId: string;
  facilityId: string;
  permissions: string[];
}

export interface AuthToken {
  accessToken: string;
  expiresAtUtc: string;
  user: AuthUser;
}

export interface InvoiceLine {
  lineNo: number;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Discount {
  id: string;
  kind: DiscountKind;
  mode: DiscountMode;
  value: number;
  amount: number;
  reason: string;
  idNumber: string | null;
  appliedByName: string;
  approvedByName: string | null;
  appliedAtUtc: string;
}

export interface Invoice {
  id: string;
  facilityId: string;
  facilityType: FacilityKind;
  branchId: string | null;
  invoiceNumber: string;
  origin: InvoiceOrigin;
  invoiceRequestId: string | null;
  sourceType: string;
  sourceId: string;
  patientId: string | null;
  patientName: string;
  visitKey: string | null;
  currency: string;
  status: InvoiceStatus;
  subtotal: number;
  discountTotal: number;
  total: number;
  paidTotal: number;
  refundedTotal: number;
  balance: number;
  createdAtUtc: string;
  paidAtUtc: string | null;
  lines: InvoiceLine[];
  discounts: Discount[];
}

export interface VisitFacility {
  facilityId: string;
  facilityType: FacilityKind;
  total: number;
  balance: number;
}

export interface VisitBill {
  anchorInvoiceId: string;
  visitKey: string | null;
  branchId: string | null;
  patientId: string | null;
  patientName: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  paid: number;
  balance: number;
  facilities: VisitFacility[];
  invoices: Invoice[];
}

export interface VisitBillSummary {
  anchorInvoiceId: string;
  visitKey: string | null;
  branchId: string | null;
  patientId: string | null;
  patientName: string;
  currency: string;
  invoiceCount: number;
  facilityTypes: FacilityKind[];
  total: number;
  balance: number;
  oldestAtUtc: string;
}

export interface ApplyDiscountRequest {
  kind: DiscountKind;
  mode: DiscountMode | null;
  value: number | null;
  reason: string | null;
  idNumber: string | null;
}

export interface VisitDiscountResult {
  appliedInvoiceIds: string[];
  skippedInvoiceIds: string[];
  bill: VisitBill;
}

export interface TakePaymentRequest {
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  tendered: number | null;
  insurerKind: InsurerKind | null;
  anchorInvoiceId: string;
  allocations: null;
}

export interface PaymentAllocation {
  invoiceId: string;
  invoiceNumber: string;
  facilityId: string;
  facilityType: FacilityKind;
  amount: number;
  invoiceStatus: InvoiceStatus;
  invoiceBalance: number;
}

export interface Payment {
  id: string;
  receiptId: string;
  receiptNumber: string;
  method: PaymentMethod;
  insurerKind: InsurerKind | null;
  isExternal: boolean;
  currency: string;
  amount: number;
  tendered: number | null;
  change: number;
  reference: string | null;
  cashierName: string;
  paidAtUtc: string;
  allocations: PaymentAllocation[];
  isReplay: boolean;
}

export interface ReceiptInvoice {
  invoiceId: string;
  invoiceNumber: string;
  facilityId: string;
  facilityType: FacilityKind;
  sourceType: string;
  lines: InvoiceLine[];
  subtotal: number;
  discountTotal: number;
  total: number;
  appliedByThisPayment: number;
  balanceNow: number;
}

export interface Receipt {
  id: string;
  number: string;
  counterFacilityId: string;
  issuedAtUtc: string;
  patientName: string;
  currency: string;
  method: PaymentMethod;
  insurerKind: InsurerKind | null;
  isExternal: boolean;
  reference: string | null;
  amount: number;
  tendered: number | null;
  change: number;
  cashierName: string;
  invoices: ReceiptInvoice[];
  balanceRemaining: number;
}

export interface Shift {
  id: string;
  facilityId: string;
  cashierUserId: string;
  cashierName: string;
  status: ShiftStatus;
  openedAtUtc: string;
  openingFloat: number;
  closedAtUtc: string | null;
  cashCollected: number;
  cashRefunded: number;
  nonCashCollected: number;
  externalSettled: number;
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
  closeNotes: string | null;
}

export interface CollectionBucket {
  key: string;
  count: number;
  amount: number;
  externalAmount: number;
  refunded: number;
  net: number;
}

export interface CollectionDay {
  date: string;
  count: number;
  collected: number;
  externalSettled: number;
  refunded: number;
  net: number;
}

export interface DailyCollectionReport {
  from: string;
  to: string;
  utcOffsetMinutes: number;
  currency: string;
  receiptCount: number;
  collected: number;
  externalSettled: number;
  refunded: number;
  net: number;
  days: CollectionDay[];
  byMethod: CollectionBucket[];
  byCashier: CollectionBucket[];
  byBranch: CollectionBucket[];
  byFacility: CollectionBucket[];
}
