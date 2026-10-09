/**
 * Permission keys issued by the pharmacy server in the session token (mirrors PharmacyPermissions in pharmacy-api).
 * Use with `usePermission()` to hide actions the signed-in staff member cannot perform; the server enforces them regardless.
 */
export const PERMISSIONS = {
  prescriptionsRead: 'prescriptions:read',
  prescriptionsReview: 'prescriptions:review',
  prescriptionsClaim: 'prescriptions:claim',
  staffManage: 'staff:manage',
} as const;
