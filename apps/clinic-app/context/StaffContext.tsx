import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clinicService, StaffMember } from '../services/clinicService';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';
import { useClinic } from './ClinicContext';

const STORAGE_PREFIX = 'clinicez.workingAs';

export function formatStaffName(staff: Pick<StaffMember, 'title' | 'firstName' | 'lastName'>): string {
  return [staff.title, staff.firstName, staff.lastName].filter(Boolean).join(' ').trim();
}

export function staffInitials(staff: Pick<StaffMember, 'firstName' | 'lastName'>): string {
  return `${staff.firstName?.[0] ?? ''}${staff.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export interface StaffContextValue {
  /** Active staff for the facility, from GET /staff. */
  staff: StaffMember[];
  /** Staff member this device is currently working as (not authentication). */
  current: StaffMember | null;
  /** Display name for the current staff member, or empty string. */
  currentName: string;
  select: (staffId: string | null) => void;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const StaffContext = createContext<StaffContextValue>({
  staff: [],
  current: null,
  currentName: '',
  select: () => {},
  loading: false,
  error: null,
  reload: async () => {},
});

export const useStaff = () => useContext(StaffContext);

/**
 * "Working as" selection. clinic-app has no login or current-user endpoint, so the
 * staff member acting on this workstation is chosen from the facility's staff list and
 * remembered per device. It labels actions (calling a queue item, signing a prescription);
 * it is NOT an authorization boundary.
 */
export function StaffProvider({ children }: { children: React.ReactNode }) {
  const { license } = useClinic();
  const storageKey = `${STORAGE_PREFIX}:${license?.clinicId ?? 'default'}`;

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => getDeviceItem(storageKey));
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
  }, [reload, license?.clinicId]);

  // Re-read the remembered selection when the facility (storage key) changes.
  useEffect(() => {
    setSelectedId(getDeviceItem(storageKey));
  }, [storageKey]);

  const select = useCallback(
    (staffId: string | null) => {
      setSelectedId(staffId);
      setDeviceItem(storageKey, staffId);
    },
    [storageKey],
  );

  const current = useMemo(() => staff.find((s) => s.id === selectedId) ?? null, [staff, selectedId]);

  const value = useMemo<StaffContextValue>(
    () => ({
      staff,
      current,
      currentName: current ? formatStaffName(current) : '',
      select,
      loading,
      error,
      reload,
    }),
    [staff, current, select, loading, error, reload],
  );

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}
