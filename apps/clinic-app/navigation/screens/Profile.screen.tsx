import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Input, Card, CardContent, SkeletonList } from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { HEX_COLOR } from '../../constants/color';
import { useAuth } from '../../context/AuthContext';
import { useStaff, formatStaffName } from '../../context/StaffContext';
import { useClinic } from '../../context/ClinicContext';
import { useConnection } from '../../components/connection/ConnectionGate';
import { clinicService, SignatureMode, StaffMember } from '../../services/clinicService';
import { notify } from '@utils/feedback';
import { validatePasswordPolicy } from '../../services/passwordPolicy';
import { useTextScale } from '../../context/TextScaleContext';
import {
  THEME_MODE_OPTIONS,
  useThemeMode,
  type ThemeMode,
} from '../../context/ThemeModeContext';
import { useUiDensity } from '../../context/UiDensityContext';
import { usePersistedScrollPosition } from '../../hooks/usePersistedScrollPosition';
import {
  SoundTheme,
  UserAudioPreferences,
  playAlertTone,
  validateAudioFile,
  setActiveAudioPreferences,
  getActiveAudioPreferences,
} from '../../utils/alertSounds';
import {
  type ProfileTabKey,
  type ProfileRouteParams,
  type PreferencesSyncState,
  type PersonalChartLayoutMode,
  type ExistingCredentialsInput,
  type ProfileCredentialVisibility,
  PROFILE_TAB_CATALOG,
  initialsOf,
  resolveProfileCredentialVisibility,
  getVisibleProfileTabs,
  resolveProfileTabIntent,
  ProfileHeroCard,
  ProfileTabBar,
  ProfileContactTab,
  ProfileCredentialsTab,
  ProfilePreferencesTab,
  ProfileSecurityTab,
  ProfileSessionFooter,
} from '../../components/profile';

export {
  type ProfileTabKey,
  type ProfileRouteParams,
  type PreferencesSyncState,
  type PersonalChartLayoutMode,
  type ExistingCredentialsInput,
  type ProfileCredentialVisibility,
  PROFILE_TAB_CATALOG,
  initialsOf,
  resolveProfileCredentialVisibility,
  getVisibleProfileTabs,
  resolveProfileTabIntent,
};

export interface ProfileScreenProps {
  route?: {
    params?: ProfileRouteParams;
  };
}

function useOptionalNavigation(): any {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useNavigation<any>();
  } catch {
    return null;
  }
}

function useOptionalRoute(): { params?: ProfileRouteParams } | null {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRoute<any>();
  } catch {
    return null;
  }
}

function getWebLocationSearch(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location?.search ?? null;
  }
  return null;
}

function syncWebHistoryTabParam(nextTab: ProfileTabKey): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const loc = window.location;
    if (!loc?.href || !loc.pathname?.toLowerCase().includes('profile')) return;
    const url = new URL(loc.href);
    if (url.searchParams.get('tab') !== nextTab) {
      url.searchParams.set('tab', nextTab);
      window.history?.replaceState?.(window.history.state, '', url.toString());
    }
  } catch {
    // Ignore URL sync errors in restricted or non-DOM test environments
  }
}

export function serializeAudioPreferences(prefs: UserAudioPreferences): string {
  const layout = prefs.preferredChartLayout as PersonalChartLayoutMode | undefined;
  const cleanUserHex =
    typeof prefs.userBrandColorHex === 'string' && HEX_COLOR.test(prefs.userBrandColorHex.trim())
      ? prefs.userBrandColorHex.trim().toUpperCase()
      : null;
  return JSON.stringify({
    soundTheme: prefs.soundTheme || 'gentleBell',
    customAudioDataUri: prefs.soundTheme === 'custom' ? prefs.customAudioDataUri || null : null,
    customAudioFileName: prefs.soundTheme === 'custom' ? prefs.customAudioFileName || null : null,
    isMuted: Boolean(prefs.isMuted),
    preferredChartLayout: layout && layout !== 'default' ? layout : undefined,
    themeMode: prefs.themeMode || 'light',
    userBrandColorHex: cleanUserHex,
  });
}

export default function ProfileScreen({ route: propRoute }: ProfileScreenProps = {}) {
  const navigation = useOptionalNavigation();
  const navRoute = useOptionalRoute();
  const { state: authState, user, offline, logout, changePassword } = useAuth();
  const { current: staffCurrent, loading: staffLoading, reload: reloadStaff } = useStaff();
  const { facilityName, planTier, primaryColorHex, loading: clinicLoading } = useClinic();
  const { serverLabel, serverUrl, changeServer } = useConnection();
  const { density, setDensity } = useUiDensity();
  const { preset, scale, setPreset, stepDown, stepUp } = useTextScale();
  const {
    themeMode,
    isDark,
    setThemeMode,
    userBrandColorHex,
    setUserBrandColorHex,
  } = useThemeMode();

  // Authoritative profile record fetched directly from GET /staff/me
  const [selfStaff, setSelfStaff] = useState<StaffMember | null>(null);
  const effectiveStaff = (selfStaff && selfStaff.id === user?.id ? selfStaff : null) ?? staffCurrent;

  const resolveDefaultNames = useCallback(
    (s: StaffMember | null, u: typeof user) => {
      const parts = (u?.name || '').trim().split(/\s+/).filter(Boolean);
      const defaultLastName = parts.length > 1 ? parts[parts.length - 1] : '';
      const defaultFirstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? '';
      return {
        firstName: s?.firstName || defaultFirstName,
        lastName: s?.lastName || defaultLastName,
      };
    },
    [],
  );

  // Profile & Contact Form State
  const [title, setTitle] = useState(() => effectiveStaff?.title || '');
  const [firstName, setFirstName] = useState(() => resolveDefaultNames(effectiveStaff, user).firstName);
  const [middleName, setMiddleName] = useState(() => effectiveStaff?.middleName || '');
  const [lastName, setLastName] = useState(() => resolveDefaultNames(effectiveStaff, user).lastName);
  const [phone, setPhone] = useState(() => effectiveStaff?.phoneNumber || '');
  const [specialty, setSpecialty] = useState(() => effectiveStaff?.specialty || '');

  // Clinical Credentials & Signature Specimen State
  const [prc, setPrc] = useState(() => effectiveStaff?.prcLicenseNumber || '');
  const [ptr, setPtr] = useState(() => effectiveStaff?.ptrNumber || '');
  const [s2, setS2] = useState(() => effectiveStaff?.s2LicenseNumber || '');
  const [pan, setPan] = useState(() => effectiveStaff?.philHealthPan || '');
  const [signatureSpecimen, setSignatureSpecimen] = useState<string | null>(
    () => effectiveStaff?.signatureSpecimen || null,
  );
  const [defaultSignatureMode, setDefaultSignatureMode] = useState<SignatureMode>(
    () => effectiveStaff?.defaultSignatureMode || 'ESignatureSpecimen',
  );

  // Independent Save & Error States
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Personal Workstation & Alert Audio Preferences State
  const [soundTheme, setSoundTheme] = useState<SoundTheme>(
    () => getActiveAudioPreferences().soundTheme || 'gentleBell',
  );
  const [customAudioDataUri, setCustomAudioDataUri] = useState<string | null>(
    () => getActiveAudioPreferences().customAudioDataUri || null,
  );
  const [customAudioFileName, setCustomAudioFileName] = useState<string | null>(
    () => getActiveAudioPreferences().customAudioFileName || null,
  );
  const [isAlertMuted, setIsAlertMuted] = useState<boolean>(() =>
    Boolean(getActiveAudioPreferences().isMuted),
  );
  const [personalChartLayout, setPersonalChartLayout] = useState<PersonalChartLayoutMode>(
    () => (getActiveAudioPreferences().preferredChartLayout as PersonalChartLayoutMode) || 'default',
  );
  const [selectedThemeMode, setSelectedThemeMode] = useState<ThemeMode>(() => themeMode);
  const [selectedUserBrandColorHex, setSelectedUserBrandColorHex] = useState<string | null>(
    () => userBrandColorHex ?? null,
  );
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<PreferencesSyncState>(() =>
    offline ? 'offline' : 'synced',
  );
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);

  const hydratedStaffIdRef = useRef<string | null>(effectiveStaff?.id ?? null);
  const lastSyncedPrefsJsonRef = useRef<string>(
    serializeAudioPreferences({
      ...getActiveAudioPreferences(),
      themeMode,
      userBrandColorHex: userBrandColorHex ?? null,
    }),
  );
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelectedThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    setSelectedUserBrandColorHex(userBrandColorHex ?? null);
  }, [userBrandColorHex]);

  // Role-aware credential visibility
  const roleArchetype =
    effectiveStaff?.role === 'Doctor' || user?.role === 'Doctor'
      ? 'Doctor'
      : effectiveStaff?.role || user?.role || '';

  const credentialVisibility = useMemo(
    () =>
      resolveProfileCredentialVisibility(roleArchetype, {
        prcLicenseNumber: effectiveStaff?.prcLicenseNumber || prc,
        ptrNumber: effectiveStaff?.ptrNumber || ptr,
        philHealthPan: effectiveStaff?.philHealthPan || pan,
        s2LicenseNumber: effectiveStaff?.s2LicenseNumber || s2,
      }),
    [
      roleArchetype,
      effectiveStaff?.prcLicenseNumber,
      effectiveStaff?.ptrNumber,
      effectiveStaff?.philHealthPan,
      effectiveStaff?.s2LicenseNumber,
      prc,
      ptr,
      pan,
      s2,
    ],
  );

  const visibleTabs = useMemo(
    () => getVisibleProfileTabs(credentialVisibility),
    [credentialVisibility],
  );

  const incomingRouteParams = propRoute?.params ?? navRoute?.params;
  const prevObservedRouteTabRef = useRef<string | undefined>(incomingRouteParams?.tab);
  const lastIncomingTabRef = useRef<string | undefined>(incomingRouteParams?.tab);
  const hasUserSelectedTabRef = useRef(false);

  const [activeTab, setActiveTab] = useState<ProfileTabKey>(() =>
    resolveProfileTabIntent(
      incomingRouteParams,
      getWebLocationSearch(),
      credentialVisibility.showCredentialsTab,
    ),
  );
  const activeTabRef = useRef<ProfileTabKey>(activeTab);
  activeTabRef.current = activeTab;

  const showProfileSkeletons = !user || (Boolean(staffLoading) && !effectiveStaff);
  const {
    scrollViewRef,
    onScroll,
    onContentSizeChange,
    resetScrollPosition,
  } = usePersistedScrollPosition({
    storageKey: `clinicez.scroll.profile.${activeTab}`,
    ready: !showProfileSkeletons,
  });

  // Sync activeTab ONLY on genuine external route changes (or initial /staff/me role hydration),
  // never including activeTab in deps so user clicks do not ping-pong while navigation.setParams lags.
  useEffect(() => {
    const nextRawTab = incomingRouteParams?.tab;
    const prevObserved = prevObservedRouteTabRef.current;
    prevObservedRouteTabRef.current = nextRawTab;

    if (nextRawTab === undefined) return;

    if (nextRawTab !== prevObserved && nextRawTab !== lastIncomingTabRef.current) {
      lastIncomingTabRef.current = nextRawTab;
      hasUserSelectedTabRef.current = false;
      const next = resolveProfileTabIntent(
        incomingRouteParams,
        null,
        credentialVisibility.showCredentialsTab,
      );
      if (next !== activeTabRef.current) {
        activeTabRef.current = next;
        resetScrollPosition(`clinicez.scroll.profile.${next}`);
      }
      setActiveTab(next);
    } else if (!hasUserSelectedTabRef.current && nextRawTab === lastIncomingTabRef.current) {
      const next = resolveProfileTabIntent(
        incomingRouteParams,
        null,
        credentialVisibility.showCredentialsTab,
      );
      setActiveTab(next);
    }
  }, [incomingRouteParams?.tab, credentialVisibility.showCredentialsTab, resetScrollPosition]);

  // Dedicated role-visibility fallback when credentials tab becomes disallowed
  useEffect(() => {
    if (!credentialVisibility.showCredentialsTab) {
      if (activeTabRef.current === 'credentials') {
        activeTabRef.current = 'profile';
        lastIncomingTabRef.current = 'profile';
        navigation?.setParams?.({ tab: 'profile' });
        syncWebHistoryTabParam('profile');
        resetScrollPosition('clinicez.scroll.profile.profile');
        setActiveTab('profile');
      }
    }
  }, [credentialVisibility.showCredentialsTab, navigation, resetScrollPosition]);

  const handleSelectTab = useCallback(
    (nextTab: ProfileTabKey) => {
      const allowedTab =
        nextTab === 'credentials' && !credentialVisibility.showCredentialsTab ? 'profile' : nextTab;
      hasUserSelectedTabRef.current = true;
      lastIncomingTabRef.current = allowedTab;
      if (allowedTab !== activeTabRef.current) {
        activeTabRef.current = allowedTab;
        resetScrollPosition(`clinicez.scroll.profile.${allowedTab}`);
      }
      setActiveTab(allowedTab);
      navigation?.setParams?.({ tab: allowedTab });
      syncWebHistoryTabParam(allowedTab);
    },
    [credentialVisibility.showCredentialsTab, navigation, resetScrollPosition],
  );

  // Load authoritative staff record from GET /staff/me on mount / user switch
  const loadMyProfile = useCallback(async () => {
    if (!user?.id || offline) return;
    const [data] = await clinicService.getMyProfile();
    if (data && data.id === user.id) {
      setSelfStaff(data);
    }
  }, [user?.id, offline]);

  useEffect(() => {
    setSelfStaff((prev) => (prev && prev.id === user?.id ? prev : null));
    void loadMyProfile();
  }, [loadMyProfile, user?.id]);

  // Sync personal audio & workstation preferences from authoritative staff record
  useEffect(() => {
    const prevStaffId = hydratedStaffIdRef.current;
    const nextStaffId = effectiveStaff?.id ?? null;
    const switchedStaffAccount =
      prevStaffId !== null && nextStaffId !== null && prevStaffId !== nextStaffId;
    hydratedStaffIdRef.current = nextStaffId;

    if (effectiveStaff?.preferencesJson) {
      try {
        const prefs: UserAudioPreferences = JSON.parse(effectiveStaff.preferencesJson);
        const nextTheme = prefs.soundTheme || 'gentleBell';
        const nextDataUri = prefs.customAudioDataUri || null;
        const nextFileName = prefs.customAudioFileName || null;
        const nextMuted = typeof prefs.isMuted === 'boolean' ? prefs.isMuted : false;
        const nextLayout: PersonalChartLayoutMode = prefs.preferredChartLayout || 'default';
        const savedThemeMode =
          prefs.themeMode === 'light' || prefs.themeMode === 'dark' || prefs.themeMode === 'system'
            ? prefs.themeMode
            : null;
        const savedUserColor =
          typeof prefs.userBrandColorHex === 'string' &&
          HEX_COLOR.test(prefs.userBrandColorHex.trim())
            ? prefs.userBrandColorHex.trim().toUpperCase()
            : null;

        setSoundTheme(nextTheme);
        setCustomAudioDataUri(nextDataUri);
        setCustomAudioFileName(nextFileName);
        setIsAlertMuted(nextMuted);
        setPersonalChartLayout(nextLayout);
        if (savedThemeMode) {
          setSelectedThemeMode(savedThemeMode);
          setThemeMode(savedThemeMode);
        }
        setSelectedUserBrandColorHex(savedUserColor);
        setUserBrandColorHex(savedUserColor);

        const resolvedMode = savedThemeMode ?? selectedThemeMode;
        const normalizedPrefs: UserAudioPreferences = {
          soundTheme: nextTheme,
          customAudioDataUri: nextTheme === 'custom' ? nextDataUri : null,
          customAudioFileName: nextTheme === 'custom' ? nextFileName : null,
          isMuted: nextMuted,
          preferredChartLayout: nextLayout !== 'default' ? nextLayout : undefined,
          themeMode: resolvedMode,
          userBrandColorHex: savedUserColor,
        };
        lastSyncedPrefsJsonRef.current = serializeAudioPreferences(normalizedPrefs);
        setActiveAudioPreferences(normalizedPrefs);
      } catch {
        // Ignore malformed preferencesJson
      }
    } else if (switchedStaffAccount) {
      setSelectedUserBrandColorHex(null);
      setUserBrandColorHex(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStaff?.id, effectiveStaff?.preferencesJson, setThemeMode, setUserBrandColorHex]);

  // Sync form fields with authoritative staff record
  const syncFormFromStaff = useCallback(
    (s: StaffMember | null) => {
      const { firstName: nextFirst, lastName: nextLast } = resolveDefaultNames(s, user);
      setTitle(s?.title || '');
      setFirstName(nextFirst);
      setLastName(nextLast);
      setMiddleName(s?.middleName || '');
      setPhone(s?.phoneNumber || '');
      setSpecialty(s?.specialty || '');
      setPrc(s?.prcLicenseNumber || '');
      setPtr(s?.ptrNumber || '');
      setS2(s?.s2LicenseNumber || '');
      setPan(s?.philHealthPan || '');
      setSignatureSpecimen(s?.signatureSpecimen || null);
      setDefaultSignatureMode(s?.defaultSignatureMode || 'ESignatureSpecimen');
    },
    [resolveDefaultNames, user],
  );

  useEffect(() => {
    syncFormFromStaff(effectiveStaff);
  }, [effectiveStaff, syncFormFromStaff]);

  const currentPreferencesPayload = useMemo<UserAudioPreferences>(
    () => ({
      soundTheme,
      customAudioDataUri: soundTheme === 'custom' ? customAudioDataUri : null,
      customAudioFileName: soundTheme === 'custom' ? customAudioFileName : null,
      isMuted: isAlertMuted,
      preferredChartLayout: personalChartLayout !== 'default' ? personalChartLayout : undefined,
      themeMode: selectedThemeMode,
      userBrandColorHex: selectedUserBrandColorHex,
    }),
    [
      soundTheme,
      customAudioDataUri,
      customAudioFileName,
      isAlertMuted,
      personalChartLayout,
      selectedThemeMode,
      selectedUserBrandColorHex,
    ],
  );

  const syncPreferencesToServer = useCallback(
    async (payload: UserAudioPreferences) => {
      setActiveAudioPreferences(payload);
      if (!user || offline) {
        setSyncState('offline');
        return;
      }

      setSyncState('syncing');
      setSyncErrorMessage(null);

      const defaults = resolveDefaultNames(effectiveStaff, user);
      const isDoc = user.role === 'Doctor' || effectiveStaff?.role === 'Doctor';
      const serialized = serializeAudioPreferences(payload);

      const [updated, err] = await clinicService.updateMyProfile({
        firstName: firstName.trim() || defaults.firstName,
        lastName: lastName.trim() || defaults.lastName,
        middleName: middleName.trim() || effectiveStaff?.middleName || undefined,
        title: title.trim() || effectiveStaff?.title || undefined,
        phoneNumber: phone.trim() || effectiveStaff?.phoneNumber || undefined,
        specialty: specialty.trim() || effectiveStaff?.specialty || undefined,
        prcLicenseNumber: isDoc
          ? prc.trim() || effectiveStaff?.prcLicenseNumber || undefined
          : prc.trim() || effectiveStaff?.prcLicenseNumber || undefined,
        ptrNumber: ptr.trim() || effectiveStaff?.ptrNumber || undefined,
        s2LicenseNumber: s2.trim() || effectiveStaff?.s2LicenseNumber || undefined,
        philHealthPan: pan.trim() || effectiveStaff?.philHealthPan || undefined,
        signatureSpecimen: isDoc ? signatureSpecimen : effectiveStaff?.signatureSpecimen,
        defaultSignatureMode: isDoc ? defaultSignatureMode : effectiveStaff?.defaultSignatureMode,
        preferencesJson: serialized,
      });

      if (err || !updated) {
        setSyncState('error');
        setSyncErrorMessage(err?.message || 'Could not save your preferences online.');
        return;
      }

      lastSyncedPrefsJsonRef.current = serialized;
      setSelfStaff(updated);
      await reloadStaff();
      setSyncState('synced');
      setSyncErrorMessage(null);
    },
    [
      user,
      offline,
      resolveDefaultNames,
      effectiveStaff,
      firstName,
      lastName,
      middleName,
      title,
      phone,
      specialty,
      prc,
      ptr,
      s2,
      pan,
      signatureSpecimen,
      defaultSignatureMode,
      reloadStaff,
    ],
  );

  // Automatic debounced unified persistence for Workstation & Alert preferences
  useEffect(() => {
    setActiveAudioPreferences(currentPreferencesPayload);
    const serialized = serializeAudioPreferences(currentPreferencesPayload);

    if (offline) {
      setSyncState('offline');
      return;
    }

    if (serialized === lastSyncedPrefsJsonRef.current) {
      if (syncState !== 'error') {
        setSyncState('synced');
      }
      return;
    }

    setSyncState('syncing');
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = setTimeout(() => {
      void syncPreferencesToServer(currentPreferencesPayload);
    }, 450);

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, [currentPreferencesPayload, offline, syncPreferencesToServer, syncState]);

  if (!user) {
    if (authState === 'booting') {
      return (
        <ResponsiveLayout
          headerTitle="My Profile & Preferences"
          headerSubtitle="Update your personal details, professional licenses, display and sound settings, and password"
        >
          <ScrollView
            style={[styles.scrollContainer, { backgroundColor: theme.colors.background }]}
            contentContainerStyle={styles.content}
          >
            <Card>
              <CardContent>
                <SkeletonList rows={4} />
              </CardContent>
            </Card>
          </ScrollView>
        </ResponsiveLayout>
      );
    }
    return null;
  }

  const resolvedFacilityName = (facilityName || user.clinicName || '').trim();
  const isClinicMetaLoading = Boolean(clinicLoading) && !resolvedFacilityName;

  const isDoctor = user.role === 'Doctor' || effectiveStaff?.role === 'Doctor';
  const baselineNames = resolveDefaultNames(effectiveStaff, user);
  const baselineTitle = effectiveStaff?.title || '';

  const isContactDirty =
    title.trim() !== baselineTitle.trim() ||
    firstName.trim() !== (baselineNames.firstName || '').trim() ||
    middleName.trim() !== (effectiveStaff?.middleName || '').trim() ||
    lastName.trim() !== (baselineNames.lastName || '').trim() ||
    phone.trim() !== (effectiveStaff?.phoneNumber || '').trim() ||
    specialty.trim() !== (effectiveStaff?.specialty || '').trim();

  const isCredentialsDirty =
    prc.trim() !== (effectiveStaff?.prcLicenseNumber || '').trim() ||
    ptr.trim() !== (effectiveStaff?.ptrNumber || '').trim() ||
    pan.trim() !== (effectiveStaff?.philHealthPan || '').trim() ||
    s2.trim() !== (effectiveStaff?.s2LicenseNumber || '').trim() ||
    (signatureSpecimen || null) !== (effectiveStaff?.signatureSpecimen || null) ||
    defaultSignatureMode !== (effectiveStaff?.defaultSignatureMode || 'ESignatureSpecimen');

  const displayName = (effectiveStaff ? formatStaffName(effectiveStaff) : user.name || '').trim();
  const accountEmail = effectiveStaff?.email?.trim() || user.email?.trim() || '';
  const permissionProfileLabel = effectiveStaff?.roleName || user.roleName || null;
  const roleSummaryLabel = permissionProfileLabel || roleArchetype;

  const handleResetContact = () => {
    setContactError(null);
    setTitle(baselineTitle);
    setFirstName(baselineNames.firstName);
    setMiddleName(effectiveStaff?.middleName || '');
    setLastName(baselineNames.lastName);
    setPhone(effectiveStaff?.phoneNumber || '');
    setSpecialty(effectiveStaff?.specialty || '');
  };

  const handleResetCredentials = () => {
    setCredentialsError(null);
    setPrc(effectiveStaff?.prcLicenseNumber || '');
    setPtr(effectiveStaff?.ptrNumber || '');
    setPan(effectiveStaff?.philHealthPan || '');
    setS2(effectiveStaff?.s2LicenseNumber || '');
    setSignatureSpecimen(effectiveStaff?.signatureSpecimen || null);
    setDefaultSignatureMode(effectiveStaff?.defaultSignatureMode || 'ESignatureSpecimen');
  };

  const handleSaveContactProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setContactError('First and last name are required.');
      return;
    }

    setSavingContact(true);
    setContactError(null);

    const serializedPrefs = serializeAudioPreferences(currentPreferencesPayload);
    setActiveAudioPreferences(currentPreferencesPayload);

    const [updated, err] = await clinicService.updateMyProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      middleName: middleName.trim() || undefined,
      title: title.trim() || undefined,
      phoneNumber: phone.trim() || undefined,
      specialty: specialty.trim() || undefined,
      prcLicenseNumber: prc.trim() || effectiveStaff?.prcLicenseNumber || undefined,
      ptrNumber: ptr.trim() || effectiveStaff?.ptrNumber || undefined,
      s2LicenseNumber: s2.trim() || effectiveStaff?.s2LicenseNumber || undefined,
      philHealthPan: pan.trim() || effectiveStaff?.philHealthPan || undefined,
      signatureSpecimen: isDoctor ? signatureSpecimen : effectiveStaff?.signatureSpecimen,
      defaultSignatureMode: isDoctor ? defaultSignatureMode : effectiveStaff?.defaultSignatureMode,
      preferencesJson: serializedPrefs,
    });

    setSavingContact(false);

    if (err || !updated) {
      setContactError(err?.message || 'Could not save profile.');
      return;
    }

    lastSyncedPrefsJsonRef.current = serializedPrefs;
    setSelfStaff(updated);
    syncFormFromStaff(updated);
    await reloadStaff();
    notify.success('Personal information saved.');
  };

  const handleSaveCredentials = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setCredentialsError('First and last name are required before saving licenses.');
      return;
    }

    if (credentialVisibility.requirePrc && !prc.trim()) {
      setCredentialsError('PRC License Number is required for Doctors.');
      return;
    }

    setSavingCredentials(true);
    setCredentialsError(null);

    const serializedPrefs = serializeAudioPreferences(currentPreferencesPayload);
    setActiveAudioPreferences(currentPreferencesPayload);

    const [updated, err] = await clinicService.updateMyProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      middleName: middleName.trim() || undefined,
      title: title.trim() || undefined,
      phoneNumber: phone.trim() || undefined,
      prcLicenseNumber: credentialVisibility.showPrc ? prc.trim() || undefined : undefined,
      ptrNumber: isDoctor ? ptr.trim() || undefined : ptr.trim() || undefined,
      s2LicenseNumber: isDoctor ? s2.trim() || undefined : undefined,
      philHealthPan: isDoctor ? pan.trim() || undefined : undefined,
      specialty: specialty.trim() || undefined,
      signatureSpecimen: isDoctor ? signatureSpecimen : undefined,
      defaultSignatureMode: isDoctor ? defaultSignatureMode : undefined,
      preferencesJson: serializedPrefs,
    });

    setSavingCredentials(false);

    if (err || !updated) {
      setCredentialsError(err?.message || 'Could not save license details.');
      return;
    }

    lastSyncedPrefsJsonRef.current = serializedPrefs;
    setSelfStaff(updated);
    syncFormFromStaff(updated);
    await reloadStaff();
    notify.success('Licenses and signature saved.');
  };

  const handleSelectCustomAudio = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      notify.info('Custom sound upload is available in your web browser.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mp3,.wav,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/ogg';
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;

      const check = validateAudioFile({
        name: file.name,
        size: file.size,
        type: file.type,
      });

      if (!check.valid) {
        setAudioUploadError(check.error || 'Invalid audio file.');
        notify.error(check.error || 'Invalid audio file.');
        return;
      }

      setAudioUploadError(null);
      const reader = new FileReader();
      reader.onload = () => {
        const base64Uri = reader.result as string;
        setCustomAudioDataUri(base64Uri);
        setCustomAudioFileName(file.name);
        setSoundTheme('custom');
        playAlertTone('custom', base64Uri);
        notify.success(`Loaded custom sound: ${file.name}`);
      };
      reader.onerror = () => {
        notify.error('Failed to read audio file.');
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleUpdatePassword = async () => {
    const problems = validatePasswordPolicy(newPassword);
    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (problems.length > 0) {
      setPasswordError(problems.join(' '));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }

    setSavingPassword(true);
    setPasswordError(null);

    const failure = await changePassword(currentPassword, newPassword);
    setSavingPassword(false);

    if (failure) {
      setPasswordError(failure);
      return;
    }

    notify.success('Password updated successfully.');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const panInputSlot = (
    <Input
      containerStyle={styles.panSlotCol}
      label="PhilHealth Accreditation Number (PAN)"
      value={pan}
      onChangeText={setPan}
      placeholder="PhilHealth accreditation number"
      helperText="Filled in automatically on PhilHealth consultations."
    />
  );

  return (
    <ResponsiveLayout
      headerTitle="My Profile & Preferences"
      headerSubtitle="Update your personal details, professional licenses, display and sound settings, and password"
    >
      <ScrollView
        ref={scrollViewRef}
        style={[styles.scrollContainer, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={100}
      >
        <ProfileHeroCard
          displayName={displayName}
          roleArchetype={roleArchetype}
          permissionProfileLabel={permissionProfileLabel}
          specialty={specialty}
          facilityName={resolvedFacilityName}
          planTier={planTier}
          accountEmail={accountEmail}
          offline={offline}
          isPhysician={credentialVisibility.isPhysician}
          showSkeletons={showProfileSkeletons}
          clinicLoading={isClinicMetaLoading}
        />

        <ProfileTabBar
          tabs={visibleTabs}
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
        />

        {activeTab === 'profile' ? (
          <ProfileContactTab
            title={title}
            firstName={firstName}
            middleName={middleName}
            lastName={lastName}
            accountEmail={accountEmail}
            phone={phone}
            specialty={specialty}
            isPhysician={credentialVisibility.isPhysician}
            isDirty={isContactDirty}
            saving={savingContact}
            offline={offline}
            showSkeletons={showProfileSkeletons}
            error={contactError}
            onChangeTitle={setTitle}
            onChangeFirstName={setFirstName}
            onChangeMiddleName={setMiddleName}
            onChangeLastName={setLastName}
            onChangePhone={setPhone}
            onChangeSpecialty={setSpecialty}
            onSave={handleSaveContactProfile}
            onReset={handleResetContact}
          />
        ) : null}

        {credentialVisibility.showCredentialsTab &&
        (activeTab === 'credentials' || activeTab === 'profile') ? (
          <View
            style={activeTab === 'credentials' ? styles.activeTabPanel : styles.hiddenTabPanel}
            pointerEvents={activeTab === 'credentials' ? 'auto' : 'none'}
          >
            <ProfileCredentialsTab
              visibility={credentialVisibility}
              title={title}
              firstName={firstName}
              lastName={lastName}
              specialty={specialty}
              prc={prc}
              ptr={ptr}
              pan={pan}
              s2={s2}
              signatureSpecimen={signatureSpecimen}
              defaultSignatureMode={defaultSignatureMode}
              isDirty={isCredentialsDirty}
              saving={savingCredentials}
              offline={offline}
              showSkeletons={showProfileSkeletons}
              error={credentialsError}
              panInputSlot={panInputSlot}
              onChangePrc={setPrc}
              onChangePtr={setPtr}
              onChangePan={setPan}
              onChangeS2={setS2}
              onChangeSignature={(nextSig, nextMode) => {
                setSignatureSpecimen(nextSig);
                setDefaultSignatureMode(nextMode);
              }}
              onChangeSignatureMode={setDefaultSignatureMode}
              onSave={handleSaveCredentials}
              onReset={handleResetCredentials}
            />
          </View>
        ) : null}

        {activeTab === 'preferences' ? (
          <ProfilePreferencesTab
            density={density}
            scale={scale}
            textPreset={preset}
            personalChartLayout={personalChartLayout}
            themeMode={selectedThemeMode}
            isDark={isDark}
            userBrandColorHex={selectedUserBrandColorHex}
            clinicPrimaryColorHex={primaryColorHex}
            soundTheme={soundTheme}
            isAlertMuted={isAlertMuted}
            customAudioDataUri={customAudioDataUri}
            customAudioFileName={customAudioFileName}
            audioUploadError={audioUploadError}
            syncState={syncState}
            syncErrorMessage={syncErrorMessage}
            showSkeletons={showProfileSkeletons}
            onSelectThemeMode={(nextMode) => {
              setSelectedThemeMode(nextMode);
              setThemeMode(nextMode);
              const meta = THEME_MODE_OPTIONS.find((opt) => opt.mode === nextMode);
              notify.info(`Color theme updated to ${meta?.badgeLabel || nextMode}`);
            }}
            onSelectUserBrandColor={(nextHex, label) => {
              const normalized =
                typeof nextHex === 'string' && HEX_COLOR.test(nextHex.trim())
                  ? nextHex.trim().toUpperCase()
                  : null;
              setSelectedUserBrandColorHex(normalized);
              setUserBrandColorHex(normalized);
              if (normalized) {
                notify.info(`Personal accent color updated to ${label || normalized}`);
              } else {
                notify.info('Personal accent color reset to clinic default.');
              }
            }}
            onSelectDensity={(nextDensity, label) => {
              setDensity(nextDensity);
              notify.info(`Screen spacing updated to ${label}`);
            }}
            onSelectTextPreset={(nextPreset, label) => {
              setPreset(nextPreset);
              notify.info(`Text size updated to ${label}`);
            }}
            onStepScaleDown={stepDown}
            onStepScaleUp={stepUp}
            onSelectChartLayout={(nextLayout) => {
              setPersonalChartLayout(nextLayout);
            }}
            onToggleAlertMute={(muted) => {
              setIsAlertMuted(muted);
              if (muted) {
                notify.info('Notification sounds muted on this device.');
              } else {
                playAlertTone(soundTheme, customAudioDataUri);
                notify.info('Notification sounds turned on.');
              }
            }}
            onSelectSoundTheme={(nextTheme) => {
              setSoundTheme(nextTheme);
              if (!isAlertMuted && nextTheme !== 'silent') {
                playAlertTone(nextTheme, customAudioDataUri);
              }
            }}
            onPreviewTone={(themeId) => {
              playAlertTone(themeId, customAudioDataUri);
            }}
            onSelectCustomAudio={handleSelectCustomAudio}
            onRetrySync={() => {
              void syncPreferencesToServer(currentPreferencesPayload);
            }}
          />
        ) : null}

        {activeTab === 'security' ? (
          <ProfileSecurityTab
            currentPassword={currentPassword}
            newPassword={newPassword}
            confirmPassword={confirmPassword}
            savingPassword={savingPassword}
            passwordError={passwordError}
            offline={offline}
            serverLabel={serverLabel}
            serverUrl={serverUrl}
            facilityName={resolvedFacilityName}
            planTier={planTier}
            showSkeletons={showProfileSkeletons}
            clinicLoading={isClinicMetaLoading}
            onChangeCurrentPassword={setCurrentPassword}
            onChangeNewPassword={setNewPassword}
            onChangeConfirmPassword={setConfirmPassword}
            onUpdatePassword={handleUpdatePassword}
            onChangeServer={changeServer}
          />
        ) : null}

        <ProfileSessionFooter
          displayName={displayName}
          roleLabel={roleSummaryLabel}
          accountEmail={accountEmail}
          facilityName={resolvedFacilityName}
          serverLabel={serverLabel}
          offline={offline}
          showSkeletons={showProfileSkeletons}
          clinicLoading={isClinicMetaLoading}
          onSignOut={async () => {
            await logout();
          }}
        />
      </ScrollView>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    ...(Platform.OS === 'web' ? ({ scrollbarGutter: 'stable' } as any) : {}),
  },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    width: '100%',
    alignSelf: 'stretch',
  },
  panSlotCol: {
    flex: 1,
    minWidth: 200,
  },
  activeTabPanel: {
    width: '100%',
    alignSelf: 'stretch',
  },
  hiddenTabPanel: {
    display: 'none',
  },
});
