import { AuthUser, hasPermission } from './authSession';
import { StaffMember } from './clinicService';

/**
 * Determines whether `GET /staff` should be requested for the signed-in user.
 * When an explicit non-empty permissions list lacks `staff:read`, skipping the directory
 * request avoids an unnecessary 403 Forbidden response while `GET /staff/me` still loads
 * the user's authoritative profile and credentials.
 */
export function shouldFetchStaffDirectory(user: AuthUser | null): boolean {
  if (!user) return false;
  if (!Array.isArray(user.permissions) || user.permissions.length === 0) return true;
  return hasPermission(user.permissions, 'staff:read');
}

/**
 * Suppresses HTTP 403 errors from `GET /staff` so restricted roles do not surface a fatal
 * directory error when `GET /staff/me` resolves the signed-in user's own profile.
 */
export function normalizeStaffLoadError(
  staffErr: { status?: number; message?: string } | null | undefined,
): string | null {
  if (!staffErr || staffErr.status === 403) return null;
  return staffErr.message || 'Unable to load staff.';
}

/**
 * Resolves the signed-in staff member record from `GET /staff/me` (`myProfile`),
 * the facility staff directory (`staff`), and the session identity (`user`).
 */
export function resolveCurrentStaffMember(
  user: AuthUser | null,
  staff: StaffMember[],
  myProfile: StaffMember | null,
): StaffMember | null {
  if (!user) return null;

  const validMyProfile = myProfile && myProfile.id === user.id ? myProfile : null;
  const match = staff.find((s) => s.id === user.id) ?? null;

  if (match && validMyProfile) {
    return {
      ...match,
      ...validMyProfile,
      email: validMyProfile.email || match.email || user.email || undefined,
    };
  }

  if (validMyProfile) {
    return {
      ...validMyProfile,
      email: validMyProfile.email || user.email || undefined,
    };
  }

  if (match) {
    return {
      ...match,
      email: match.email || user.email || undefined,
    };
  }

  const parts = (user.name ?? '').trim().split(/\s+/).filter(Boolean);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? '';
  return {
    id: user.id,
    tenantId: user.tenantId,
    clinicId: user.clinicId,
    roleName: user.roleName ?? undefined,
    firstName,
    lastName,
    email: user.email ?? undefined,
    role: user.role as StaffMember['role'],
    isActive: true,
    createdAt: '',
  };
}
