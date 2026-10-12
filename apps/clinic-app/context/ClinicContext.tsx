import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clinicService, ClinicSettingsRecord, FacilityLicenseStatus } from '../services/clinicService';
import { useFacilityLicense } from '../components/FacilityActivationGate';

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
  /** Print/receipt letterhead, sourced from settings - never hardcoded. */
  letterhead: Letterhead;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const EMPTY_LETTERHEAD: Letterhead = { header: '', subHeader: '', address: '', contact: '', footer: '' };

const ClinicContext = createContext<ClinicContextValue>({
  facilityName: '',
  accreditationNumber: '',
  taxIdentificationNumber: '',
  planTier: '',
  queuePrefix: '',
  invoicePrefix: '',
  preferredChartLayout: 'modal',
  settings: null,
  license: null,
  letterhead: EMPTY_LETTERHEAD,
  loading: false,
  error: null,
  refresh: async () => {},
});

export const useClinic = () => useContext(ClinicContext);

/**
 * Supplies the active facility's identity (name, accreditation, plan, letterhead) to the
 * whole app so no screen has to hardcode a clinic. Must render inside FacilityActivationGate.
 */
export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const { license } = useFacilityLicense();
  const [settings, setSettings] = useState<ClinicSettingsRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [data, err] = await clinicService.getSettings();
    if (err) {
      setError(err.message || 'Unable to load clinic settings.');
    } else {
      setSettings(data);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, license?.clinicId]);

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
      letterhead: {
        header: settings?.letterheadHeader || settings?.clinicName || license?.clinicName || '',
        subHeader: settings?.letterheadSubHeader || '',
        address: settings?.letterheadAddress || '',
        contact: settings?.letterheadContact || '',
        footer: settings?.letterheadFooter || '',
      },
      loading,
      error,
      refresh,
    }),
    [settings, license, loading, error, refresh],
  );

  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>;
}
