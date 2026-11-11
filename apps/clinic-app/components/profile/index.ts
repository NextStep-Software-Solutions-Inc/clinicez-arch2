export {
  type ProfileTabKey,
  type ProfileRouteParams,
  type ProfileTabDefinition,
  type PreferencesSyncState,
  type PersonalChartLayoutMode,
  type CredentialVisibilityTier,
  type ExistingCredentialsInput,
  type ProfileCredentialVisibility,
  PROFILE_TAB_CATALOG,
  initialsOf,
  resolveProfileCredentialVisibility,
  getVisibleProfileTabs,
  resolveProfileTabIntent,
} from './types';

export { default as ProfileHeroCard, type ProfileHeroCardProps } from './ProfileHeroCard';
export { default as ProfileTabBar, type ProfileTabBarProps } from './ProfileTabBar';
export { default as ProfileContactTab, type ProfileContactTabProps } from './ProfileContactTab';
export { default as ProfileCredentialsTab, type ProfileCredentialsTabProps } from './ProfileCredentialsTab';
export {
  default as PhysicianStampSpecimenCard,
  type PhysicianStampSpecimenCardProps,
} from './PhysicianStampSpecimenCard';
export { default as ProfilePreferencesTab, type ProfilePreferencesTabProps } from './ProfilePreferencesTab';
export {
  default as DisplayErgonomicsCard,
  SyncStatusBadge,
  DENSITY_ICON_MAP,
  validatePersonalAccentHex,
  type DisplayErgonomicsCardProps,
  type PersonalAccentValidationResult,
} from './DisplayErgonomicsCard';
export { default as AlertChimesCard, type AlertChimesCardProps } from './AlertChimesCard';
export { default as ProfileSecurityTab, type ProfileSecurityTabProps } from './ProfileSecurityTab';
export { default as ProfileSessionFooter, type ProfileSessionFooterProps } from './ProfileSessionFooter';
