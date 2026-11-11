export const SETTINGS_TAB_KEYS = [
  'readiness',
  'general',
  'branding',
  'documents',
  'clinical',
  'fields',
  'queue-tv',
  'notifications',
  'services',
  'billing-policy',
  'philhealth',
  'staff',
  'rbac',
  'license',
] as const;

export type SettingsTabKey = (typeof SETTINGS_TAB_KEYS)[number];

export type GeneralSettingsSectionKey =
  | 'general'
  | 'branding'
  | 'clinical'
  | 'queue-tv'
  | 'notifications'
  | 'billing-policy';

export const GENERAL_SETTINGS_SECTION_KEYS: readonly GeneralSettingsSectionKey[] = [
  'general',
  'branding',
  'clinical',
  'queue-tv',
  'notifications',
  'billing-policy',
];

export type SettingsNavMode = 'horizontal' | 'vertical';

export type SettingsGroupKey =
  | 'overview'
  | 'identity'
  | 'clinical'
  | 'billing'
  | 'team';

export interface SettingsSectionDefinition {
  key: SettingsTabKey;
  groupKey: SettingsGroupKey;
  groupLabel: string;
  label: string;
  description: string;
  icon: string;
  keywords: string[];
  adminOnly?: boolean;
}

export interface SettingsGroupDefinition {
  key: SettingsGroupKey;
  label: string;
  sections: SettingsSectionDefinition[];
}

export interface SettingsTabItem {
  key: SettingsTabKey;
  label: string;
  icon: string;
  badge?: string | number;
  adminOnly?: boolean;
  groupKey?: SettingsGroupKey;
  groupLabel?: string;
  description?: string;
  keywords?: string[];
}

export interface ReadinessCheckItem {
  id: string;
  category: 'license' | 'profile' | 'staff' | 'services' | 'philhealth' | 'legal';
  title: string;
  description: string;
  status: 'passed' | 'warning' | 'failed';
  required: boolean;
  actionLabel?: string;
  actionTab?: SettingsTabKey;
}

export const SETTINGS_SECTION_CATALOG: SettingsGroupDefinition[] = [
  {
    key: 'overview',
    label: 'Overview',
    sections: [
      {
        key: 'readiness',
        groupKey: 'overview',
        groupLabel: 'Overview',
        label: 'Setup Checklist',
        description: 'Clinic setup steps, patient app listing, and online booking controls.',
        icon: 'checkCircle',
        adminOnly: true,
        keywords: [
          'readiness',
          'overview',
          'checklist',
          'preflight',
          'directory',
          'publish',
          'online booking',
          'pause',
          'setup',
          'onboarding',
        ],
      },
    ],
  },
  {
    key: 'identity',
    label: 'Identity & Branding',
    sections: [
      {
        key: 'general',
        groupKey: 'identity',
        groupLabel: 'Identity & Branding',
        label: 'Clinic Info & Hours',
        description: 'Clinic name, accreditation number, hours, consultation fee, printed header, and date/time.',
        icon: 'clinic',
        keywords: [
          'general',
          'profile',
          'clinic name',
          'facility',
          'doh',
          'accreditation',
          'operating hours',
          'schedule',
          'slot',
          'consultation fee',
          'letterhead',
          'address',
          'contact',
          'timezone',
          'regional',
          'date format',
          'time format',
        ],
      },
      {
        key: 'branding',
        groupKey: 'identity',
        groupLabel: 'Identity & Branding',
        label: 'Logo & Colors',
        description: 'Upload your clinic logo and choose your accent color.',
        icon: 'palette',
        keywords: [
          'branding',
          'logo',
          'color',
          'colors',
          'brand',
          'palette',
          'theme',
          'accent',
          'crop',
          'upload',
          'hex',
          'sky blue',
          'teal',
          'visual identity',
        ],
      },
      {
        key: 'documents',
        groupKey: 'identity',
        groupLabel: 'Identity & Branding',
        label: 'Print Templates',
        description: 'Prescriptions, medical certificates, referrals, and clinic forms.',
        icon: 'file',
        keywords: [
          'documents',
          'print',
          'studio',
          'stationery',
          'prescription',
          'rx',
          'medical certificate',
          'template',
          'paper',
          'signatories',
        ],
      },
    ],
  },
  {
    key: 'clinical',
    label: 'Clinical & Front Desk',
    sections: [
      {
        key: 'clinical',
        groupKey: 'clinical',
        groupLabel: 'Clinical & Front Desk',
        label: 'Specialty & Patient Charts',
        description: 'Medical or dental setup, tooth chart, default patient chart view, and patient search.',
        icon: 'stethoscope',
        keywords: [
          'clinical',
          'specialty',
          'medical',
          'dental',
          'multi-specialty',
          'odontogram',
          'tooth',
          'teeth',
          'chart',
          'layout',
          'modal',
          'split',
          'drawer',
          'patient search',
        ],
      },
      {
        key: 'fields',
        groupKey: 'clinical',
        groupLabel: 'Clinical & Front Desk',
        label: 'Registration Questions',
        description: 'Extra questions asked when registering patients.',
        icon: 'clipboard',
        keywords: [
          'fields',
          'custom fields',
          'intake',
          'registration',
          'form',
          'placeholder',
          'demographics',
          'dynamic',
        ],
      },
      {
        key: 'queue-tv',
        groupKey: 'clinical',
        groupLabel: 'Clinical & Front Desk',
        label: 'Rooms, Queue & TV',
        description: 'Consultation rooms, queue calling, waiting room TV, and patient QR check-in.',
        icon: 'monitor',
        keywords: [
          'rooms',
          'stations',
          'queue',
          'calling',
          'tv',
          'waiting area',
          'display',
          'kiosk',
          'pin',
          'qr',
          'placard',
          'join',
          'join link',
          'passcode',
          'expiration',
          'enlistment',
          'walk-in',
        ],
      },
      {
        key: 'notifications',
        groupKey: 'clinical',
        groupLabel: 'Clinical & Front Desk',
        label: 'Alerts & Reminders',
        description: 'Urgent call alerts, queue updates, and appointment reminders.',
        icon: 'bell',
        keywords: [
          'notifications',
          'alerts',
          'reminders',
          'push',
          'appointment',
          '24h',
          '2h',
          'stat',
          'audio',
          'chime',
          'retention',
        ],
      },
    ],
  },
  {
    key: 'billing',
    label: 'Billing & Claims',
    sections: [
      {
        key: 'services',
        groupKey: 'billing',
        groupLabel: 'Billing & Claims',
        label: 'Services & Prices',
        description: 'Consultation fees, lab tests, and procedure prices.',
        icon: 'tag',
        keywords: [
          'services',
          'catalog',
          'fee',
          'fees',
          'price',
          'pricing',
          'procedures',
          'rates',
          'items',
        ],
      },
      {
        key: 'billing-policy',
        groupKey: 'billing',
        groupLabel: 'Billing & Claims',
        label: 'Billing & Daily Closing',
        description: 'Front-desk or cashier billing and automatic end-of-day closing.',
        icon: 'cash',
        keywords: [
          'billing',
          'policy',
          'cashier',
          'station',
          'counter',
          'clinic desk',
          'eod',
          'end of day',
          'reconciliation',
          'cutoff',
          'close day',
          'remittance',
          'collections',
        ],
      },
      {
        key: 'philhealth',
        groupKey: 'billing',
        groupLabel: 'Billing & Claims',
        label: 'PhilHealth & YAKAP',
        description: 'PhilHealth Konsulta / YAKAP accreditation and primary care benefits.',
        icon: 'yakap',
        keywords: [
          'philhealth',
          'yakap',
          'konsulta',
          'claims',
          'accreditation',
          'pcapi',
          'cipher',
          'credentials',
          'empanelment',
          'benefit',
        ],
      },
    ],
  },
  {
    key: 'team',
    label: 'Team & Account',
    sections: [
      {
        key: 'staff',
        groupKey: 'team',
        groupLabel: 'Team & Account',
        label: 'Staff & Schedules',
        description: 'Doctors, nurses, receptionists, cashiers, invites, and weekly shifts.',
        icon: 'staff',
        adminOnly: true,
        keywords: [
          'staff',
          'directory',
          'roster',
          'doctors',
          'nurses',
          'receptionist',
          'cashier',
          'invite',
          'email',
          'prc',
          'shifts',
          'seats',
          'team',
        ],
      },
      {
        key: 'rbac',
        groupKey: 'team',
        groupLabel: 'Team & Account',
        label: 'Roles & Permissions',
        description: 'Control what each staff role can view and manage.',
        icon: 'shield',
        adminOnly: true,
        keywords: [
          'rbac',
          'access control',
          'roles',
          'permissions',
          'security',
          'admin',
          'privileges',
          'authority',
        ],
      },
      {
        key: 'license',
        groupKey: 'team',
        groupLabel: 'Team & Account',
        label: 'Plan & License',
        description: 'Subscription plan, staff seats, and server connection.',
        icon: 'key',
        adminOnly: true,
        keywords: [
          'license',
          'activation',
          'system',
          'node',
          'edge',
          'server',
          'api',
          'url',
          'connectivity',
          'seed',
          'seeder',
          'dev',
          'developer',
          'test data',
          'offline',
        ],
      },
    ],
  },
];

export const SETTINGS_SECTIONS_FLAT: SettingsSectionDefinition[] =
  SETTINGS_SECTION_CATALOG.flatMap((group) => group.sections);

const VALID_SETTINGS_TAB_SET = new Set<string>(SETTINGS_TAB_KEYS);
const GENERAL_SECTION_SET = new Set<string>(GENERAL_SETTINGS_SECTION_KEYS);

export function isValidSettingsTabKey(value: unknown): value is SettingsTabKey {
  return typeof value === 'string' && VALID_SETTINGS_TAB_SET.has(value.trim());
}

export function isGeneralSettingsSectionKey(value: unknown): value is GeneralSettingsSectionKey {
  return typeof value === 'string' && GENERAL_SECTION_SET.has(value.trim());
}

export function matchesSettingsFilter(tab: SettingsTabItem, query?: string | null): boolean {
  const normalized = (query ?? '').trim().toLowerCase();
  if (!normalized) return true;

  const catalogDef = SETTINGS_SECTIONS_FLAT.find((s) => s.key === tab.key);
  const haystacks: string[] = [
    tab.key,
    tab.label,
    tab.groupLabel ?? catalogDef?.groupLabel ?? '',
    tab.description ?? catalogDef?.description ?? '',
    ...(tab.keywords ?? catalogDef?.keywords ?? []),
  ];

  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.every((token) =>
    haystacks.some((field) => field.toLowerCase().includes(token))
  );
}

export function filterSettingsTabs(tabs: SettingsTabItem[], query?: string | null): SettingsTabItem[] {
  const normalized = (query ?? '').trim();
  if (!normalized) return tabs;
  return tabs.filter((tab) => matchesSettingsFilter(tab, normalized));
}

export type SettingsRouteParams = {
  tab?: SettingsTabKey | string;
  openAddStaff?: boolean | string;
};

export function resolveSettingsRouteIntent(params?: SettingsRouteParams | null): {
  targetTab: SettingsTabKey | null;
  shouldOpenAddStaff: boolean;
} {
  if (!params) {
    return { targetTab: null, shouldOpenAddStaff: false };
  }
  const shouldOpenAddStaff =
    params.openAddStaff === true || params.openAddStaff === 'true';
  if (shouldOpenAddStaff) {
    return { targetTab: 'staff', shouldOpenAddStaff: true };
  }
  const candidate = typeof params.tab === 'string' ? params.tab.trim() : '';
  const targetTab: SettingsTabKey | null = isValidSettingsTabKey(candidate)
    ? candidate
    : null;
  return { targetTab, shouldOpenAddStaff: false };
}

export const SETTINGS_NAV_MODE_STORAGE_KEY = 'clinicez_settings_nav_mode';
export const SETTINGS_VERTICAL_RAIL_MIN_WIDTH = 1180;

export function resolveEffectiveSettingsNavMode(
  preferredMode: SettingsNavMode,
  viewportWidth: number
): SettingsNavMode {
  if (viewportWidth < SETTINGS_VERTICAL_RAIL_MIN_WIDTH) {
    return 'horizontal';
  }
  return preferredMode === 'horizontal' ? 'horizontal' : 'vertical';
}

export function readInitialSettingsTabFromSearch(search?: string | null): SettingsTabKey | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(search);
    const candidate = params.get('tab');
    return isValidSettingsTabKey(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function buildSyncedSettingsRouteParams(
  nextTab: SettingsTabKey
): { tab: SettingsTabKey; openAddStaff: undefined } {
  return {
    tab: nextTab,
    openAddStaff: undefined,
  };
}
