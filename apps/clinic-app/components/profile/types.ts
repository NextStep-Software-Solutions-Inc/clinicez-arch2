import type { IconName } from '../ui/Icon';

export type ProfileTabKey = 'profile' | 'credentials' | 'preferences' | 'security';

export interface ProfileRouteParams {
  tab?: string;
}

export interface ProfileTabDefinition {
  key: ProfileTabKey;
  label: string;
  icon: IconName;
  badge?: string;
  keywords?: readonly string[];
}

export type PreferencesSyncState = 'synced' | 'syncing' | 'error' | 'offline';

export type PersonalChartLayoutMode = 'default' | 'split' | 'modal' | 'drawer';

export type CredentialVisibilityTier = 'physician' | 'allied' | 'saved_only' | 'hidden';

export interface ExistingCredentialsInput {
  prcLicenseNumber?: string | null;
  ptrNumber?: string | null;
  philHealthPan?: string | null;
  s2LicenseNumber?: string | null;
  prc?: string | null;
  ptr?: string | null;
  pan?: string | null;
  s2?: string | null;
  signatureSpecimen?: string | null;
}

export interface ProfileCredentialVisibility {
  tier: CredentialVisibilityTier;
  showCredentialsTab: boolean;
  showTab: boolean;
  isPhysician: boolean;
  isAlliedHealth: boolean;
  showPrc: boolean;
  requirePrc: boolean;
  showPtrAndPan: boolean;
  showS2: boolean;
  showPhysicianStamp: boolean;
  hasExistingCredentials: boolean;
}

export const PROFILE_TAB_CATALOG: readonly ProfileTabDefinition[] = [
  {
    key: 'profile',
    label: 'Personal Info',
    icon: 'patient',
    keywords: ['name', 'email', 'phone', 'contact', 'specialty', 'title', 'personal info'],
  },
  {
    key: 'credentials',
    label: 'Licenses & Signature',
    icon: 'stethoscope',
    keywords: ['prc', 'ptr', 'pan', 'philhealth', 's2', 'license', 'signature', 'stamp', 'prescription'],
  },
  {
    key: 'preferences',
    label: 'Display & Sound',
    icon: 'monitor',
    keywords: [
      'dark mode',
      'light mode',
      'theme',
      'appearance',
      'color theme',
      'color',
      'accent',
      'branding',
      'palette',
      'match device',
      'text size',
      'screen spacing',
      'patient charts',
      'notification sounds',
      'audio',
      'mute',
    ],
  },
  {
    key: 'security',
    label: 'Password & Account',
    icon: 'lock',
    keywords: ['password', 'security', 'account', 'server', 'connection', 'sign out'],
  },
];

const VALID_PROFILE_TABS = new Set<ProfileTabKey>([
  'profile',
  'credentials',
  'preferences',
  'security',
]);

export function initialsOf(name?: string | null): string {
  const clean = (name ?? '').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`;
  return letters.toUpperCase() || '?';
}

/**
 * Pure role-aware resolver controlling whether the Credentials sub-tab, regulatory license fields,
 * and Official Physician Stamp & E-Signature specimen are displayed for a staff archetype.
 */
export function resolveProfileCredentialVisibility(
  roleArchetype?: string | null,
  existingCredentials?: ExistingCredentialsInput | null,
): ProfileCredentialVisibility {
  const normalized = (roleArchetype ?? '').trim().toLowerCase();

  const cleanPrc = (existingCredentials?.prcLicenseNumber ?? existingCredentials?.prc ?? '').trim();
  const cleanPtr = (existingCredentials?.ptrNumber ?? existingCredentials?.ptr ?? '').trim();
  const cleanPan = (existingCredentials?.philHealthPan ?? existingCredentials?.pan ?? '').trim();
  const cleanS2 = (existingCredentials?.s2LicenseNumber ?? existingCredentials?.s2 ?? '').trim();

  const hasExistingCredentials = Boolean(cleanPrc || cleanPtr || cleanPan || cleanS2);
  const hasSavedPtrOrPan = Boolean(cleanPtr || cleanPan);

  const isPhysician =
    normalized === 'doctor' ||
    normalized.includes('doctor') ||
    normalized.includes('physician') ||
    normalized.includes('dentist') ||
    normalized === 'md';

  if (isPhysician) {
    return {
      tier: 'physician',
      showCredentialsTab: true,
      showTab: true,
      isPhysician: true,
      isAlliedHealth: false,
      showPrc: true,
      requirePrc: true,
      showPtrAndPan: true,
      showS2: true,
      showPhysicianStamp: true,
      hasExistingCredentials,
    };
  }

  const isAlliedHealth =
    normalized === 'nurse' ||
    normalized.includes('nurse') ||
    normalized.includes('midwife') ||
    normalized.includes('pharmac') ||
    normalized.includes('medtech') ||
    normalized.includes('technologist') ||
    normalized.includes('therapist') ||
    normalized.includes('allied');

  if (isAlliedHealth) {
    return {
      tier: 'allied',
      showCredentialsTab: true,
      showTab: true,
      isPhysician: false,
      isAlliedHealth: true,
      showPrc: true,
      requirePrc: false,
      showPtrAndPan: hasSavedPtrOrPan,
      showS2: false,
      showPhysicianStamp: false,
      hasExistingCredentials,
    };
  }

  if (hasExistingCredentials) {
    return {
      tier: 'saved_only',
      showCredentialsTab: true,
      showTab: true,
      isPhysician: false,
      isAlliedHealth: false,
      showPrc: true,
      requirePrc: false,
      showPtrAndPan: true,
      showS2: Boolean(cleanS2),
      showPhysicianStamp: false,
      hasExistingCredentials: true,
    };
  }

  return {
    tier: 'hidden',
    showCredentialsTab: false,
    showTab: false,
    isPhysician: false,
    isAlliedHealth: false,
    showPrc: false,
    requirePrc: false,
    showPtrAndPan: false,
    showS2: false,
    showPhysicianStamp: false,
    hasExistingCredentials: false,
  };
}

export function getVisibleProfileTabs(
  visibility: ProfileCredentialVisibility,
): ProfileTabDefinition[] {
  return PROFILE_TAB_CATALOG.filter((tab) => {
    if (tab.key === 'credentials') {
      return visibility.showCredentialsTab;
    }
    return true;
  }).map((tab) => {
    if (tab.key === 'credentials' && !visibility.showPhysicianStamp) {
      return {
        ...tab,
        label: 'Licenses',
      };
    }
    return tab;
  });
}

function parseTabCandidate(raw?: string | null): ProfileTabKey | null {
  const cleaned = (raw ?? '').trim().toLowerCase();
  if (!cleaned) return null;
  if (VALID_PROFILE_TABS.has(cleaned as ProfileTabKey)) {
    return cleaned as ProfileTabKey;
  }
  return null;
}

/**
 * Resolves the active Profile sub-tab from React Navigation route params with a web URLSearchParams fallback.
 */
export function resolveProfileTabIntent(
  params?: ProfileRouteParams | null,
  searchStr?: string | null,
  allowCredentialsTab: boolean = true,
): ProfileTabKey {
  let candidate = parseTabCandidate(params?.tab);

  if (!candidate && searchStr) {
    try {
      const normalizedSearch = searchStr.startsWith('?') ? searchStr : `?${searchStr}`;
      const queryTab = new URLSearchParams(normalizedSearch).get('tab');
      candidate = parseTabCandidate(queryTab);
    } catch {
      // Ignore malformed query strings
    }
  }

  if (!candidate) {
    return 'profile';
  }

  if (candidate === 'credentials' && !allowCredentialsTab) {
    return 'profile';
  }

  return candidate;
}
