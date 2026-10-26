import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  clinicService,
  ClinicRoom,
  ClinicSettingsRecord,
  FacilityLicenseStatus,
  WorkspaceProfile,
  ClinicTimeFormat,
  setClinicTimeZoneId,
  setClinicRegionalConfig,
  getClinicDateFormat,
  getClinicTimeFormat,
  getClinicTimeZoneId,
} from '../services/clinicService';
import { useFacilityLicense } from '../components/FacilityActivationGate';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';
import { theme } from '../constants/theme';
import {
  resolveClinicBrandColor,
  DEFAULT_CLINIC_BRAND_COLOR,
  HEX_COLOR,
  LEGACY_UNSET_ACCENT,
} from '../constants/color';

export const CLINIC_LOGO_STORAGE_KEY = 'clinicez_clinic_logo';
export const CLINIC_PRIMARY_COLOR_OVERRIDE_KEY = 'clinicez_clinic_primary_color_override';
export const CLINIC_WORKSPACE_ACCENT_STORAGE_KEY = 'clinicez_workspace_accent_color';
export const CLINIC_WORKSPACE_TIMEZONE_STORAGE_KEY = 'clinicez_workspace_timezone';
export const CLINIC_WORKSPACE_DATE_FORMAT_STORAGE_KEY = 'clinicez_workspace_date_format';
export const CLINIC_TIMEZONE_OVERRIDE_KEY = 'clinicez_clinic_timezone_override';
export const CLINIC_DATE_FORMAT_OVERRIDE_KEY = 'clinicez_clinic_date_format_override';
export const CLINIC_TIME_FORMAT_OVERRIDE_KEY = 'clinicez_clinic_time_format_override';



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
  /** Effective resolved brand accent color (inherited from workspace or overridden by clinic). */
  primaryColorHex: string;
  /** Brand color inherited from portal tenant workspace (null if unconfigured). */
  workspaceAccentColorHex: string | null;
  /** Workspace profile inherited from portal tenant workspace. */
  workspaceProfile: WorkspaceProfile | null;
  /** Effective configured IANA timezone ID (clinic override -> workspace profile -> 'Asia/Manila'). */
  timeZoneId: string;
  /** Effective configured date format pattern (clinic override -> workspace profile -> 'MMM d, yyyy'). */
  dateFormat: string;
  /** Effective configured time format ('12h' or '24h'). */
  timeFormat: ClinicTimeFormat;
  /** Timezone inherited from portal tenant workspace (defaults to 'Asia/Manila'). */
  workspaceTimeZoneId: string;
  /** Date format inherited from portal tenant workspace (defaults to 'MMM d, yyyy'). */
  workspaceDateFormat: string;
  /** Time format inherited from portal tenant workspace (defaults to '12h'). */
  workspaceTimeFormat: ClinicTimeFormat;
  /** True if the clinic facility has overridden any regional setting (timezone, date format, or time format). */
  isRegionalOverridden: boolean;
  /** True if the clinic facility has an active custom color override. */
  isColorOverridden: boolean;
  /** Color source: 'clinic_override' | 'workspace_inherited' | 'default_fallback'. */
  colorSource: 'clinic_override' | 'workspace_inherited' | 'default_fallback';
  /** Set clinic brand color override (pass null to revert to inheriting from workspace). */
  setPrimaryColorHex: (colorHex: string | null) => Promise<boolean>;
  /** Set clinic regional overrides for timezone, date format, and time format (pass null values to inherit from workspace). */
  setRegionalSettings: (overrides: {
    timeZoneId?: string | null;
    dateFormat?: string | null;
    timeFormat?: ClinicTimeFormat | null;
  }) => Promise<boolean>;
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
  primaryColorHex: DEFAULT_CLINIC_BRAND_COLOR,
  workspaceAccentColorHex: null,
  workspaceProfile: null,
  get timeZoneId() { return getClinicTimeZoneId(); },
  get dateFormat() { return getClinicDateFormat(); },
  get timeFormat() { return getClinicTimeFormat(); },
  workspaceTimeZoneId: 'Asia/Manila',
  workspaceDateFormat: 'MMM d, yyyy',
  workspaceTimeFormat: '12h',
  isRegionalOverridden: false,
  isColorOverridden: false,
  colorSource: 'default_fallback',
  setPrimaryColorHex: async () => false,
  setRegionalSettings: async () => false,
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
  const [localOverrideColor, setLocalOverrideColor] = useState<string | null>(() =>
    getDeviceItem(CLINIC_PRIMARY_COLOR_OVERRIDE_KEY)
  );
  const [workspaceProfile, setWorkspaceProfile] = useState<WorkspaceProfile | null>(null);
  const [cachedWorkspaceAccent, setCachedWorkspaceAccent] = useState<string | null>(() =>
    getDeviceItem(CLINIC_WORKSPACE_ACCENT_STORAGE_KEY)
  );
  const [cachedWorkspaceTimeZone, setCachedWorkspaceTimeZone] = useState<string | null>(() => {
    const cachedTz = getDeviceItem(CLINIC_WORKSPACE_TIMEZONE_STORAGE_KEY);
    return cachedTz;
  });
  const [cachedWorkspaceDateFormat, setCachedWorkspaceDateFormat] = useState<string | null>(() =>
    getDeviceItem(CLINIC_WORKSPACE_DATE_FORMAT_STORAGE_KEY)
  );
  const [localTimeZoneOverride, setLocalTimeZoneOverride] = useState<string | null>(() =>
    getDeviceItem(CLINIC_TIMEZONE_OVERRIDE_KEY)
  );
  const [localDateFormatOverride, setLocalDateFormatOverride] = useState<string | null>(() =>
    getDeviceItem(CLINIC_DATE_FORMAT_OVERRIDE_KEY)
  );
  const [localTimeFormatOverride, setLocalTimeFormatOverride] = useState<string | null>(() =>
    getDeviceItem(CLINIC_TIME_FORMAT_OVERRIDE_KEY)
  );
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
    const [[data, err], [roomsData], profileRes] = await Promise.all([
      clinicService.getSettings(),
      clinicService.getRooms(),
      clinicService.getWorkspaceProfile().catch(() => [null, null] as any),
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

      if (data?.primaryColorHex && data.primaryColorHex.toUpperCase() !== LEGACY_UNSET_ACCENT.toUpperCase()) {
        setDeviceItem(CLINIC_PRIMARY_COLOR_OVERRIDE_KEY, data.primaryColorHex);
        setLocalOverrideColor(data.primaryColorHex);
      } else if (
        data &&
        (!data.primaryColorHex ||
          data.primaryColorHex?.toUpperCase() === LEGACY_UNSET_ACCENT.toUpperCase())
      ) {
        setDeviceItem(CLINIC_PRIMARY_COLOR_OVERRIDE_KEY, null);
        setLocalOverrideColor(null);
      }

      if (data?.timeZoneId) {
        setDeviceItem(CLINIC_TIMEZONE_OVERRIDE_KEY, data.timeZoneId);
        setLocalTimeZoneOverride(data.timeZoneId);
      } else if (data && data.timeZoneId === null) {
        setDeviceItem(CLINIC_TIMEZONE_OVERRIDE_KEY, null);
        setLocalTimeZoneOverride(null);
      }

      if (data?.dateFormat) {
        setDeviceItem(CLINIC_DATE_FORMAT_OVERRIDE_KEY, data.dateFormat);
        setLocalDateFormatOverride(data.dateFormat);
      } else if (data && data.dateFormat === null) {
        setDeviceItem(CLINIC_DATE_FORMAT_OVERRIDE_KEY, null);
        setLocalDateFormatOverride(null);
      }

      if (data?.timeFormat) {
        setDeviceItem(CLINIC_TIME_FORMAT_OVERRIDE_KEY, data.timeFormat);
        setLocalTimeFormatOverride(data.timeFormat);
      } else if (data && data.timeFormat === null) {
        setDeviceItem(CLINIC_TIME_FORMAT_OVERRIDE_KEY, null);
        setLocalTimeFormatOverride(null);
      }

      setError(null);
    }

    if (profileRes && Array.isArray(profileRes)) {
      const [profile] = profileRes;
      if (profile) {
        setWorkspaceProfile(profile);
        if (profile.accentColorHex) {
          setCachedWorkspaceAccent(profile.accentColorHex);
          setDeviceItem(CLINIC_WORKSPACE_ACCENT_STORAGE_KEY, profile.accentColorHex);
        }
        if (profile.timeZoneId) {
          setCachedWorkspaceTimeZone(profile.timeZoneId);
          setDeviceItem(CLINIC_WORKSPACE_TIMEZONE_STORAGE_KEY, profile.timeZoneId);
        }
        if (profile.dateFormat) {
          setCachedWorkspaceDateFormat(profile.dateFormat);
          setDeviceItem(CLINIC_WORKSPACE_DATE_FORMAT_STORAGE_KEY, profile.dateFormat);
        }
      }
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

  const setPrimaryColorHex = useCallback(async (colorHex: string | null): Promise<boolean> => {
    const isReset = !colorHex || !colorHex.trim() || colorHex === 'inherit';
    const targetHex = isReset ? null : colorHex.trim().toUpperCase();

    setLocalOverrideColor(targetHex);
    setDeviceItem(CLINIC_PRIMARY_COLOR_OVERRIDE_KEY, targetHex);

    try {
      const [updated, err] = await clinicService.updateSettings({
        primaryColorHex: targetHex ?? '',
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

  const setRegionalSettings = useCallback(
    async (overrides: {
      timeZoneId?: string | null;
      dateFormat?: string | null;
      timeFormat?: ClinicTimeFormat | null;
    }): Promise<boolean> => {
      const nextTz =
        overrides.timeZoneId !== undefined
          ? overrides.timeZoneId && overrides.timeZoneId.trim() && overrides.timeZoneId !== 'inherit'
            ? overrides.timeZoneId.trim()
            : null
          : localTimeZoneOverride;
      const nextDf =
        overrides.dateFormat !== undefined
          ? overrides.dateFormat && overrides.dateFormat.trim() && overrides.dateFormat !== 'inherit'
            ? overrides.dateFormat.trim()
            : null
          : localDateFormatOverride;
      const nextTf =
        overrides.timeFormat !== undefined
          ? overrides.timeFormat && overrides.timeFormat.trim() && (overrides.timeFormat as string) !== 'inherit'
            ? (overrides.timeFormat.trim() as ClinicTimeFormat)
            : null
          : localTimeFormatOverride;

      setLocalTimeZoneOverride(nextTz);
      setDeviceItem(CLINIC_TIMEZONE_OVERRIDE_KEY, nextTz);
      setLocalDateFormatOverride(nextDf);
      setDeviceItem(CLINIC_DATE_FORMAT_OVERRIDE_KEY, nextDf);
      setLocalTimeFormatOverride(nextTf);
      setDeviceItem(CLINIC_TIME_FORMAT_OVERRIDE_KEY, nextTf);

      try {
        const [updated, err] = await clinicService.updateSettings({
          timeZoneId: nextTz ?? 'inherit',
          dateFormat: nextDf ?? 'inherit',
          timeFormat: nextTf ?? 'inherit',
        });
        if (!err && updated) {
          setSettings(updated);
          return true;
        }
        return !err;
      } catch {
        return false;
      }
    },
    [localTimeZoneOverride, localDateFormatOverride, localTimeFormatOverride],
  );

  const activeWorkspaceAccent = workspaceProfile?.accentColorHex || cachedWorkspaceAccent || null;
  const workspaceTimeZoneId = workspaceProfile?.timeZoneId || cachedWorkspaceTimeZone || 'Asia/Manila';
  const workspaceDateFormat = workspaceProfile?.dateFormat || cachedWorkspaceDateFormat || 'MMM d, yyyy';
  const workspaceTimeFormat: ClinicTimeFormat = '12h';

  const effectiveTimeZoneId =
    localTimeZoneOverride || settings?.timeZoneId || workspaceTimeZoneId || 'Asia/Manila';
  const effectiveDateFormat =
    localDateFormatOverride || settings?.dateFormat || workspaceDateFormat || 'MMM d, yyyy';
  const effectiveTimeFormat: ClinicTimeFormat =
    (localTimeFormatOverride || settings?.timeFormat) === '24h' ? '24h' : '12h';
  const isRegionalOverridden = Boolean(
    localTimeZoneOverride ||
      settings?.timeZoneId ||
      localDateFormatOverride ||
      settings?.dateFormat ||
      localTimeFormatOverride ||
      settings?.timeFormat,
  );

  useEffect(() => {
    setClinicRegionalConfig({
      timeZoneId: effectiveTimeZoneId,
      dateFormat: effectiveDateFormat,
      timeFormat: effectiveTimeFormat,
    });
  }, [effectiveTimeZoneId, effectiveDateFormat, effectiveTimeFormat]);

  const resolvedBrand = useMemo(
    () =>
      resolveClinicBrandColor({
        clinicOverrideHex: localOverrideColor ?? settings?.primaryColorHex,
        workspaceAccentHex: activeWorkspaceAccent,
        defaultHex: DEFAULT_CLINIC_BRAND_COLOR,
      }),
    [localOverrideColor, settings?.primaryColorHex, activeWorkspaceAccent],
  );

  // Synchronize active brand color across theme and web CSS variables
  useEffect(() => {
    if (resolvedBrand.color) {
      (theme.colors as any).primary = resolvedBrand.color;
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const root = document.documentElement;
        root.style.setProperty('--primary', resolvedBrand.color);
        root.style.setProperty('--primary-color', resolvedBrand.color);
      }
    }
  }, [resolvedBrand.color]);

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
      primaryColorHex: resolvedBrand.color,
      workspaceAccentColorHex: activeWorkspaceAccent,
      workspaceProfile,
      timeZoneId: effectiveTimeZoneId,
      dateFormat: effectiveDateFormat,
      timeFormat: effectiveTimeFormat,
      workspaceTimeZoneId,
      workspaceDateFormat,
      workspaceTimeFormat,
      isRegionalOverridden,
      isColorOverridden: resolvedBrand.isOverridden,
      colorSource: resolvedBrand.source,
      setPrimaryColorHex,
      setRegionalSettings,
      setClinicLogo,
      loading,
      error,
      refresh,
      refreshRooms,
    }),
    [
      settings,
      license,
      rooms,
      localLogo,
      resolvedBrand,
      activeWorkspaceAccent,
      workspaceProfile,
      effectiveTimeZoneId,
      effectiveDateFormat,
      effectiveTimeFormat,
      workspaceTimeZoneId,
      workspaceDateFormat,
      workspaceTimeFormat,
      isRegionalOverridden,
      setPrimaryColorHex,
      setRegionalSettings,
      setClinicLogo,
      loading,
      error,
      refresh,
      refreshRooms,
    ],
  );

  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>;
}
