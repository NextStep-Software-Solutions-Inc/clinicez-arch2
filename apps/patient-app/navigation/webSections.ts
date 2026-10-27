import type { NavigationState, ParamListBase } from '@react-navigation/native';
import type { IconName } from '@ui/Icon';

function getFocusedRouteNameFromRoute(route: {
  state?: { index?: number; routes: Array<{ name: string }> };
  params?: { screen?: string; state?: { index?: number; routes: Array<{ name: string }> } };
}): string | undefined {
  const state = route.state ?? route.params?.state;
  const params = route.params;
  if (state && Array.isArray(state.routes) && state.routes.length > 0) {
    const idx = state.index ?? state.routes.length - 1;
    return state.routes[idx]?.name;
  }
  if (params && typeof params.screen === 'string') {
    return params.screen;
  }
  return undefined;
}

/**
 * Web workstation navigation model (sidebar + compact tab bar).
 * Maps every route of the Main stack to the top-level section it belongs to so the
 * sidebar highlights the right item even on deep screens (e.g. Allergies -> Profile).
 */

export type WebSectionKey =
  | 'HomeScreen'
  | 'AppointmentsScreen'
  | 'FilesScreen'
  | 'MessagesInboxScreen'
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
  { key: 'MessagesInboxScreen', label: 'Messages', icon: 'chat', shortcut: 'M' },
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

const NESTED_TAB_PUSH_TITLES: Record<string, string> = {
  FilesUploadScreen: 'Add Health Record',
  FileViewerScreen: 'Preview',
  ExternalOpenConsentScreen: 'Open in Another App',
};

const ROOT_TAB_HEADERS: Record<string, { title: string; subtitle: string }> = {
  HomeScreen: { title: 'Clinic EZ', subtitle: 'Patient Portal' },
  AppointmentsScreen: { title: 'My Appointments', subtitle: 'Patient Portal' },
  FilesScreen: { title: 'Health Records', subtitle: 'Patient Portal' },
  MessagesInboxScreen: { title: 'Messages', subtitle: 'Patient Portal' },
  ProfileScreen: { title: 'My Profile', subtitle: 'Patient Portal' },
};

export interface WebHeaderResolution {
  isRootTab: boolean;
  isNestedTabPush: boolean;
  tabKey?: WebSectionKey;
  title?: string;
  subtitle?: string;
}

/**
 * Inspects the Main stack and nested BottomTabs state to determine whether the active
 * screen is a root bottom-tab screen, a nested pushed screen inside a tab stack
 * (e.g. FilesUploadScreen), or a pushed MainStack screen.
 */
export function resolveWebHeaderState(
  state: NavigationState<ParamListBase>,
  descriptors?: Record<string, { options: { title?: string } }>,
): WebHeaderResolution {
  const route = state.routes[state.index];
  if (!route) {
    return { isRootTab: true, isNestedTabPush: false, tabKey: 'HomeScreen', title: 'Clinic EZ', subtitle: 'Patient Portal' };
  }

  if (route.name === 'BottomTabs') {
    const rawTab = getFocusedRouteNameFromRoute(route as any) ?? 'HomeScreen';
    const tabKey: WebSectionKey = (
      ['HomeScreen', 'AppointmentsScreen', 'FilesScreen', 'ProfileScreen'] as const
    ).includes(rawTab as 'HomeScreen')
      ? (rawTab as WebSectionKey)
      : 'HomeScreen';

    const tabState = route.state as NavigationState<ParamListBase> | undefined;
    const activeTabRoute = tabState?.routes[tabState.index ?? 0];
    const nestedFromRoute = activeTabRoute ? getFocusedRouteNameFromRoute(activeTabRoute as any) : undefined;
    const nestedFromParams = (route.params as any)?.params?.screen as string | undefined;
    const nestedScreenName = nestedFromRoute ?? nestedFromParams;

    if (nestedScreenName && nestedScreenName in NESTED_TAB_PUSH_TITLES) {
      return {
        isRootTab: false,
        isNestedTabPush: true,
        tabKey,
        title: NESTED_TAB_PUSH_TITLES[nestedScreenName],
      };
    }

    const headerMeta = ROOT_TAB_HEADERS[tabKey] ?? ROOT_TAB_HEADERS.HomeScreen;
    return {
      isRootTab: true,
      isNestedTabPush: false,
      tabKey,
      title: headerMeta.title,
      subtitle: headerMeta.subtitle,
    };
  }

  const descriptorTitle = descriptors?.[route.key]?.options.title;
  return {
    isRootTab: false,
    isNestedTabPush: false,
    title: descriptorTitle ?? route.name,
  };
}

/**
 * Resolves the leaf focused screen name (e.g. `FileViewerScreen` inside `FilesScreen`,
 * or `NotificationScreen` on MainStack) for dynamic header overrides.
 */
export function resolveFocusedScreenName(state: NavigationState<ParamListBase>): string | undefined {
  const route = state.routes[state.index];
  if (!route) return undefined;

  if (route.name === 'BottomTabs') {
    const tabState = route.state as NavigationState<ParamListBase> | undefined;
    const activeTabRoute = tabState?.routes[tabState.index ?? 0];
    const nestedFromRoute = activeTabRoute ? getFocusedRouteNameFromRoute(activeTabRoute as any) : undefined;
    const nestedFromParams = (route.params as any)?.params?.screen as string | undefined;
    return nestedFromRoute ?? nestedFromParams ?? getFocusedRouteNameFromRoute(route as any);
  }

  return route.name;
}

/** Which sidebar item is active for the focused route of the Main stack. */
export function resolveActiveSection(state: NavigationState<ParamListBase>): WebSectionKey {
  const route = state.routes[state.index];
  if (!route) return 'HomeScreen';

  if (route.name === 'BottomTabs') {
    const tab = getFocusedRouteNameFromRoute(route as any) ?? 'HomeScreen';
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
  if (route.name.startsWith('Messages') || route.name === 'ConversationThreadScreen' || route.name === 'NewMessageInquiryScreen') {
    return 'MessagesInboxScreen';
  }
  if (APPOINTMENT_ROUTES.has(route.name)) return 'AppointmentsScreen';
  if (PROFILE_ROUTES.has(route.name)) return 'ProfileScreen';
  return 'HomeScreen';
}

/** True when the focused Main-stack route is a root tab screen inside BottomTabs. */
export function isTabRoute(state: NavigationState<ParamListBase>): boolean {
  const resolved = resolveWebHeaderState(state);
  return resolved.isRootTab;
}

/** Navigate to a top-level section from anywhere in the Main stack. */
export function navigateToSection(
  navigation: { navigate: (...args: any[]) => void },
  key: WebSectionKey,
) {
  switch (key) {
    case 'NotificationScreen':
    case 'SettingsScreen':
    case 'MessagesInboxScreen':
      navigation.navigate(key);
      return;
    case 'FilesScreen':
      navigation.navigate('BottomTabs', { screen: 'FilesScreen', params: { screen: 'FilesBrowserScreen' } });
      return;
    default:
      navigation.navigate('BottomTabs', { screen: key });
  }
}
