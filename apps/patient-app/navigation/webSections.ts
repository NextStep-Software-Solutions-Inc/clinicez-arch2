import { getFocusedRouteNameFromRoute, type NavigationState, type ParamListBase } from '@react-navigation/native';
import type { IconName } from '@ui/Icon';

/**
 * Web workstation navigation model (sidebar + compact tab bar).
 * Maps every route of the Main stack to the top-level section it belongs to so the
 * sidebar highlights the right item even on deep screens (e.g. Allergies -> Profile).
 */

export type WebSectionKey =
  | 'HomeScreen'
  | 'AppointmentsScreen'
  | 'FilesScreen'
  | 'ProfileScreen'
  | 'NotificationScreen'
  | 'SettingsScreen';

export interface WebNavItem {
  key: WebSectionKey;
  label: string;
  icon: IconName;
  /** Shortcut hint shown on the sidebar (g + key). */
  shortcut?: string;
}

export const WEB_PRIMARY_NAV: WebNavItem[] = [
  { key: 'HomeScreen', label: 'Home', icon: 'home', shortcut: 'H' },
  { key: 'AppointmentsScreen', label: 'Appointments', icon: 'appointments', shortcut: 'A' },
  { key: 'FilesScreen', label: 'Records', icon: 'files', shortcut: 'F' },
  { key: 'ProfileScreen', label: 'My Profile', icon: 'profile', shortcut: 'P' },
];

export const WEB_SECONDARY_NAV: WebNavItem[] = [
  { key: 'NotificationScreen', label: 'Notifications', icon: 'notifications', shortcut: 'N' },
  { key: 'SettingsScreen', label: 'Settings', icon: 'settings', shortcut: 'S' },
];

const APPOINTMENT_ROUTES = new Set([
  'ExploreClinicsScreen',
  'ExploreOrgsScreen',
  'OrganizationDetailsScreen',
  'ClinicDetailsScreen',
  'BookingDraftScreen',
  'AppointmentDetailScreen',
  'ProviderProfileScreen',
  'RescheduleScreen',
  'AttachFilesScreen',
]);

const PROFILE_ROUTES = new Set([
  'PersonalDemographicsScreen', 'GovernmentIdsScreen', 'ContactInfoScreen', 'AddressesScreen',
  'EmergencyContactsScreen', 'HealthcareProvidersScreen', 'AllergiesScreen', 'MedicationsScreen',
  'SurgicalHistoryScreen', 'PastIllnessesScreen', 'ChronicConditionsScreen', 'DisabilitiesScreen',
  'ImmunizationsSelfScreen', 'SocialHistoryScreen', 'FamilyHistoryScreen', 'OccupationScreen',
  'TravelHistoryScreen', 'ObstetricProfileScreen', 'MaleReproductiveScreen', 'DentalVisionScreen',
  'MentalHealthScreen', 'VitalSignsScreen', 'ConsultationsScreen', 'PrescriptionsScreen',
  'LabResultsScreen', 'ImagingResultsScreen', 'VaccinationsAdministeredScreen',
  'ClinicalAssessmentsScreen', 'PhysicalExamScreen', 'NcdQuestionnaireScreen',
]);

/** Which sidebar item is active for the focused route of the Main stack. */
export function resolveActiveSection(state: NavigationState<ParamListBase>): WebSectionKey {
  const route = state.routes[state.index];
  if (!route) return 'HomeScreen';

  if (route.name === 'BottomTabs') {
    const tab = getFocusedRouteNameFromRoute(route) ?? 'HomeScreen';
    return (['HomeScreen', 'AppointmentsScreen', 'FilesScreen', 'ProfileScreen'] as const).includes(
      tab as 'HomeScreen',
    )
      ? (tab as WebSectionKey)
      : 'HomeScreen';
  }
  if (route.name.startsWith('Notification')) return 'NotificationScreen';
  if (route.name.endsWith('SettingsScreen') || route.name === 'ChangePINScreen' || route.name === 'ChangePasswordScreen') {
    return 'SettingsScreen';
  }
  if (APPOINTMENT_ROUTES.has(route.name)) return 'AppointmentsScreen';
  if (PROFILE_ROUTES.has(route.name)) return 'ProfileScreen';
  return 'HomeScreen';
}

/** True when the focused Main-stack route is the tab container (tab pages render their own header). */
export function isTabRoute(state: NavigationState<ParamListBase>): boolean {
  return state.routes[state.index]?.name === 'BottomTabs';
}

/** Navigate to a top-level section from anywhere in the Main stack. */
export function navigateToSection(
  navigation: { navigate: (...args: any[]) => void },
  key: WebSectionKey,
) {
  switch (key) {
    case 'NotificationScreen':
    case 'SettingsScreen':
      navigation.navigate(key);
      return;
    case 'FilesScreen':
      navigation.navigate('BottomTabs', { screen: 'FilesScreen', params: { screen: 'FilesBrowserScreen' } });
      return;
    default:
      navigation.navigate('BottomTabs', { screen: key });
  }
}
