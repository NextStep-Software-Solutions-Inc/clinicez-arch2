export const PERMISSIONS = {
  invoicesRead: 'invoices:read',
  invoicesCreate: 'invoices:create',
  discountsApply: 'discounts:apply',
  approvals: 'billing:approve',
  paymentsTake: 'payments:take',
  shiftsManage: 'shifts:manage',
  reportsRead: 'reports:read',
  staffManage: 'staff:manage',
} as const;
