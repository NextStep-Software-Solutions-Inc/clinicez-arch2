import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clinicService, StaffMember } from '../services/clinicService';
import { useAuth } from './AuthContext';
import { useClinic } from './ClinicContext';

export function formatStaffName(staff: Pick<StaffMember, 'title' | 'firstName' | 'lastName'>): string {
  return [staff.title, staff.firstName, staff.lastName].filter(Boolean).join(' ').trim();
}

export function staffInitials(staff: Pick<StaffMember, 'firstName' | 'lastName'>): string {
  return `${staff.firstName?.[0] ?? ''}${staff.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export interface StaffContextValue {
  /** Active staff for the facility, from GET /staff. */
  staff: StaffMember[];
  /** The authenticated staff member (matched against the facility's staff list). */
  current: StaffMember | null;
  /** Display name for the current staff member, or empty string. */
  currentName: string;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const StaffContext = createContext<StaffContextValue>({
  staff: [],
  current: null,
  currentName: '',
  loading: false,
  error: null,
  reload: async () => {},
});

export const useStaff = () => useContext(StaffContext);

/**
 * Facility staff directory plus the signed-in user. Identity comes from the session (see AuthContext), so
 * every action is attributed to the authenticated account. When the signed-in account lacks `staff:view`
 * (and the directory cannot be listed), `current` falls back to a minimal record built from the session.
 */
export function StaffProvider({ children }: { children: React.ReactNode }) {
  const { license } = useClinic();
  const { user } = useAuth();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [data, err] = await clinicService.getStaff(undefined, true);
    if (err) {
      setError(err.message || 'Unable to load staff.');
    } else {
      setStaff(data ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload, license?.clinicId, user?.id]);

  const current = useMemo<StaffMember | null>(() => {
    if (!user) return null;
    const match = staff.find((s) => s.id === user.id);
    if (match) return match;
    const parts = user.name.trim().split(/\s+/).filter(Boolean);
    const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? '';
    return {
      id: user.id,
      tenantId: user.tenantId,
      clinicId: user.clinicId,
      roleName: user.roleName ?? undefined,
      firstName,
      lastName,
      role: user.role as StaffMember['role'],
      isActive: true,
      createdAt: '',
    };
  }, [staff, user]);

  const value = useMemo<StaffContextValue>(
    () => ({
      staff,
      current,
      currentName: current ? formatStaffName(current) : user?.name ?? '',
      loading,
      error,
      reload,
    }),
    [staff, current, user, loading, error, reload],
  );

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}
