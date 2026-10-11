export type SettingsTabKey =
  | 'general'
  | 'readiness'
  | 'staff'
  | 'rbac'
  | 'services'
  | 'fields'
  | 'philhealth'
  | 'license'
  | 'schedules';

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
