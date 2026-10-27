import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clinicService, StaffMember } from '../services/clinicService';
import {
  normalizeStaffLoadError,
  resolveCurrentStaffMember,
  shouldFetchStaffDirectory,
} from '../services/staffProfileResolver';
import { useAuth } from './AuthContext';
import { useClinic } from './ClinicContext';

export { normalizeStaffLoadError, resolveCurrentStaffMember, shouldFetchStaffDirectory };

export function formatStaffName(staff: Pick<StaffMember, 'title' | 'firstName' | 'lastName'>): string {
  return [staff.title, staff.firstName, staff.lastName].filter(Boolean).join(' ').trim();
}

export function staffInitials(staff: Pick<StaffMember, 'firstName' | 'lastName'>): string {
  return `${staff.firstName?.[0] ?? ''}${staff.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export interface StaffContextValue {
  /** Active staff for the facility, from GET /staff. */
  staff: StaffMember[];
  /** The authenticated staff member (resolved from /staff/me and/or the facility's staff list). */
  current: StaffMember | null;
  /** Display name for the current staff member, or empty string. */
  currentName: string;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export const StaffContext = createContext<StaffContextValue>({
  staff: [],
  current: null,
  currentName: '',
  loading: false,
  error: null,
  reload: async () => {},
});

export const useStaff = (): StaffContextValue => {
  const globalMock = (globalThis as any).__mockStaffContext;
  if (globalMock) return globalMock;
  return useContext(StaffContext);
};

/**
 * Facility staff directory plus the signed-in user. Identity comes from the session (see AuthContext), so
 * every action is attributed to the authenticated account. The signed-in user's full staff record (email,
 * clinical credentials, signature specimen) is loaded from `GET /staff/me`, ensuring full profile fidelity
 * even when the signed-in role lacks `staff:read` directory permissions.
 */
export function StaffProvider({ children }: { children: React.ReactNode }) {
  const { license } = useClinic();
  const { user } = useAuth();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [myProfile, setMyProfile] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const reqId = ++requestIdRef.current;

    if (!user) {
      setStaff([]);
      setMyProfile(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const canReadDirectory = shouldFetchStaffDirectory(user);

    const [[profileData], [staffData, staffErr]] = await Promise.all([
      clinicService.getMyProfile(),
      canReadDirectory
        ? clinicService.getStaff(undefined, true)
        : Promise.resolve([null, null] as const),
    ]);

    if (reqId !== requestIdRef.current) return;

    if (profileData && profileData.id === user.id) {
      setMyProfile(profileData);
    } else {
      setMyProfile((prev) => (prev && prev.id === user.id ? prev : null));
    }

    if (staffData) {
      setStaff(staffData);
      setError(null);
    } else {
      setStaff([]);
      setError(normalizeStaffLoadError(staffErr));
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload, license?.clinicId, user?.id]);

  const current = useMemo<StaffMember | null>(
    () => resolveCurrentStaffMember(user, staff, myProfile),
    [user, staff, myProfile],
  );

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
