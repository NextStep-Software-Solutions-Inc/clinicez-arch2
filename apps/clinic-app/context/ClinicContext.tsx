import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clinicService, ClinicRoom, ClinicSettingsRecord, FacilityLicenseStatus } from '../services/clinicService';
import { useFacilityLicense } from '../components/FacilityActivationGate';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';
import { theme } from '../constants/theme';

export const CLINIC_LOGO_STORAGE_KEY = 'clinicez_clinic_logo';

export interface Letterhead {
  header: string;
  subHeader: string;
  address: string;
  contact: string;
  footer: string;
}

export interface ClinicContextValue {
  /** Real facility name from clinic settings (falls back to the license record). Empty while loading. */
  facilityName: string;
  accreditationNumber: string;
  taxIdentificationNumber: string;
  planTier: string;
  queuePrefix: string;
  invoicePrefix: string;
  preferredChartLayout: 'modal' | 'split' | 'drawer';
  settings: ClinicSettingsRecord | null;
  license: FacilityLicenseStatus | null;
  /** Configured clinic rooms and stations (Consultation, Triage, Treatment). */
  rooms: ClinicRoom[];
  /** Print/receipt letterhead, sourced from settings - never hardcoded. */
  letterhead: Letterhead;
  /** Clinic custom logo URL / base64 data URI, backed by database settings and cached locally. */
  clinicLogo: string | null;
  /** Brand primary accent color from database settings. */
  primaryColorHex: string;
  setClinicLogo: (logoUri: string | null) => Promise<boolean>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshRooms: () => Promise<void>;
}

const EMPTY_LETTERHEAD: Letterhead = { header: '', subHeader: '', address: '', contact: '', footer: '' };

export const ClinicContext = createContext<ClinicContextValue>({
  facilityName: '',
  accreditationNumber: '',
  taxIdentificationNumber: '',
  planTier: '',
  queuePrefix: '',
  invoicePrefix: '',
  preferredChartLayout: 'modal',
  settings: null,
  license: null,
  rooms: [],
  letterhead: EMPTY_LETTERHEAD,
  clinicLogo: null,
  primaryColorHex: theme.colors.primary,
  setClinicLogo: async () => false,
  loading: false,
  error: null,
  refresh: async () => {},
  refreshRooms: async () => {},
});

export const useClinic = (): ClinicContextValue => {
  const globalMock = (globalThis as any).__mockClinicContext;
  if (globalMock) return globalMock;
  return useContext(ClinicContext);
};

/**
 * Supplies the active facility's identity (name, accreditation, plan, letterhead, rooms) to the
 * whole app so no screen has to hardcode a clinic. Must render inside FacilityActivationGate.
 */
export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const { license } = useFacilityLicense();
  const [settings, setSettings] = useState<ClinicSettingsRecord | null>(null);
  const [localLogo, setLocalLogo] = useState<string | null>(() => getDeviceItem(CLINIC_LOGO_STORAGE_KEY));
  const [rooms, setRooms] = useState<ClinicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshRooms = useCallback(async () => {
    const [roomsData] = await clinicService.getRooms();
    if (Array.isArray(roomsData)) {
      setRooms(roomsData);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [[data, err], [roomsData]] = await Promise.all([
      clinicService.getSettings(),
      clinicService.getRooms(),
    ]);
    if (err) {
      setError(err.message || 'Unable to load clinic settings.');
    } else {
      setSettings(data);
      if (data?.primaryLogoUrl) {
        setLocalLogo(data.primaryLogoUrl);
        setDeviceItem(CLINIC_LOGO_STORAGE_KEY, data.primaryLogoUrl);
      } else if (data && data.primaryLogoUrl === null) {
        setLocalLogo(null);
        setDeviceItem(CLINIC_LOGO_STORAGE_KEY, null);
      }
      setError(null);
    }
    if (Array.isArray(roomsData)) {
      setRooms(roomsData);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, license?.clinicId]);

  const setClinicLogo = useCallback(async (logoUri: string | null): Promise<boolean> => {
    setLocalLogo(logoUri);
    setDeviceItem(CLINIC_LOGO_STORAGE_KEY, logoUri);
    try {
      const [updated, err] = await clinicService.updateSettings({
        primaryLogoUrl: logoUri ?? '',
      });
      if (!err && updated) {
        setSettings(updated);
        return true;
      }
      return !err;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<ClinicContextValue>(
    () => ({
      facilityName: settings?.clinicName || license?.clinicName || '',
      accreditationNumber: settings?.accreditationNumber || '',
      taxIdentificationNumber: settings?.taxIdentificationNumber || '',
      planTier: license?.planTier || '',
      queuePrefix: settings?.queuePrefix || '',
      invoicePrefix: settings?.invoicePrefix || '',
      preferredChartLayout: settings?.preferredChartLayout || 'modal',
      settings,
      license,
      rooms,
      letterhead: {
        header: settings?.letterheadHeader || settings?.clinicName || license?.clinicName || '',
        subHeader: settings?.letterheadSubHeader || '',
        address: settings?.letterheadAddress || '',
        contact: settings?.letterheadContact || '',
        footer: settings?.letterheadFooter || '',
      },
      clinicLogo: localLogo || settings?.primaryLogoUrl || null,
      primaryColorHex: settings?.primaryColorHex || theme.colors.primary,
      setClinicLogo,
      loading,
      error,
      refresh,
      refreshRooms,
    }),
    [settings, license, rooms, localLogo, setClinicLogo, loading, error, refresh, refreshRooms],
  );

  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>;
}
