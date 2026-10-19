export type SettingsTabKey =
  | 'general'
  | 'readiness'
  | 'staff'
  | 'rbac'
  | 'services'
  | 'fields'
  | 'philhealth'
  | 'license'
  | 'audit';

export interface SettingsTabItem {
  key: SettingsTabKey;
  label: string;
  icon: string;
  badge?: string | number;
  adminOnly?: boolean;
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

export type SettingsRouteParams = {
  tab?: SettingsTabKey;
  openAddStaff?: boolean;
};

export function resolveSettingsRouteIntent(params?: SettingsRouteParams | null): {
  targetTab: SettingsTabKey | null;
  shouldOpenAddStaff: boolean;
} {
  if (!params) {
    return { targetTab: null, shouldOpenAddStaff: false };
  }
  const shouldOpenAddStaff = Boolean(params.openAddStaff);
  const targetTab: SettingsTabKey | null = shouldOpenAddStaff
    ? 'staff'
    : params.tab ?? null;
  return { targetTab, shouldOpenAddStaff };
}
