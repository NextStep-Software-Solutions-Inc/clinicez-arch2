import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import { createStaticNavigation, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator, createBottomTabScreen } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';

// Screens
import HomeScreen from './screens/Home.screen';
import ProfileScreen from './screens/profile/Profile.screen';
import SettingsScreen from './screens/settings/Settings.screen';
import FilesScreen from './screens/files/Files.screen';
import FilesUploadScreen from './screens/files/FilesUpload.screen';
import FileFolderFormScreen from './screens/files/FileFolderForm.screen';
import FileMoveScreen from './screens/files/FileMove.screen';
import FileViewerScreen from './screens/files/FileViewer.screen';
import ExternalOpenConsentScreen from './screens/files/ExternalOpenConsent.screen';
import StorageScreen from './screens/files/Storage.screen';
import ExploreClinicsScreen from './screens/ExploreClinics.screen';
import ExploreOrgsScreen from './screens/ExploreOrgs.screen';
import OrganizationDetailsScreen from './screens/OrganizationDetails.screen';
import ClinicDetailsScreen from './screens/ClinicDetails.screen';
import BookingDraftScreen from './screens/BookingDraft.screen';
import AppointmentsScreen from './screens/Appointments.screen';
import LoginScreen from './screens/Login.screen';
import SignupScreen from './screens/Signup.screen';
import VerifyScreen from './screens/Verify.screen';
import ForgotPasswordScreen from './screens/ForgotPassword.screen';
import WelcomeScreen from './screens/Welcome.screen';
import OnboardScreen from './screens/Onboard.screen';
import CreatePINScreen from './screens/CreatePIN.screen';
import NotificationScreen from './screens/Notification.screen';
import LoadingScreen from './screens/Loading.screen';

// Settings sub-screens
import SecuritySettingsScreen from './screens/settings/SecuritySettings.screen';
import ChangePINScreen from './screens/settings/ChangePIN.screen';
import AppearanceSettingsScreen from './screens/settings/AppearanceSettings.screen';
import NotificationsSettingsScreen from './screens/settings/NotificationsSettings.screen';
import AboutSettingsScreen from './screens/settings/AboutSettings.screen';
import DebugSettingsScreen from './screens/settings/DebugSettings.screen';
import ChangePasswordScreen from './screens/settings/ChangePassword.screen';

// Profile — Part A (self-entry)
import PersonalDemographicsScreen from './screens/profile/PersonalDemographics.screen';
import GovernmentIdsScreen from './screens/profile/GovernmentIds.screen';
import ContactInfoScreen from './screens/profile/ContactInfo.screen';
import AddressesScreen from './screens/profile/Addresses.screen';
import EmergencyContactsScreen from './screens/profile/EmergencyContacts.screen';
import HealthcareProvidersScreen from './screens/profile/HealthcareProviders.screen';
import AllergiesScreen from './screens/profile/Allergies.screen';
import MedicationsScreen from './screens/profile/Medications.screen';
import SurgicalHistoryScreen from './screens/profile/SurgicalHistory.screen';
import PastIllnessesScreen from './screens/profile/PastIllnesses.screen';
import ChronicConditionsScreen from './screens/profile/ChronicConditions.screen';
import DisabilitiesScreen from './screens/profile/Disabilities.screen';
import ImmunizationsSelfScreen from './screens/profile/ImmunizationsSelf.screen';
import SocialHistoryScreen from './screens/profile/SocialHistory.screen';
import FamilyHistoryScreen from './screens/profile/FamilyHistory.screen';
import OccupationScreen from './screens/profile/Occupation.screen';
import TravelHistoryScreen from './screens/profile/TravelHistory.screen';
import ObstetricProfileScreen from './screens/profile/ObstetricProfile.screen';
import MaleReproductiveScreen from './screens/profile/MaleReproductive.screen';
import DentalVisionScreen from './screens/profile/DentalVision.screen';
import MentalHealthScreen from './screens/profile/MentalHealth.screen';

// Profile — Part B (read-only, HCW-entered)
import VitalSignsScreen from './screens/profile/VitalSigns.screen';
import ConsultationsScreen from './screens/profile/Consultations.screen';
import PrescriptionsScreen from './screens/profile/Prescriptions.screen';
import LabResultsScreen from './screens/profile/LabResults.screen';
import ImagingResultsScreen from './screens/profile/ImagingResults.screen';
import VaccinationsAdministeredScreen from './screens/profile/VaccinationsAdministered.screen';
import ClinicalAssessmentsScreen from './screens/profile/ClinicalAssessments.screen';
import PhysicalExamScreen from './screens/profile/PhysicalExam.screen';
import NcdQuestionnaireScreen from './screens/profile/NcdQuestionnaire.screen';

// Navigation state hooks
import {
  useIsAppLoading,
  useIsOnboarding,
  useIsInAuthFlow,
  useIsSettingUpPIN,
  useIsMainReady,
} from 'hooks/useNavState';

import BottomTabsHeaderRight from '../components/BottomTabsHeaderRight';

export type RootStackType = typeof RootStack;

declare module '@react-navigation/core' {
  export interface RootNavigator extends RootStackType { }
}

// ── Bottom Tabs ───────────────────────────────────────────────────────────────

const FilesStack = createNativeStackNavigator({
  screenOptions: {
    headerStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    FilesBrowserScreen: createNativeStackScreen({
      screen: FilesScreen,
      options: { title: 'Files', headerLargeTitleEnabled: true },
    }),
    FilesUploadScreen: createNativeStackScreen({
      screen: FilesUploadScreen,
      options: { title: 'Add File', presentation: 'modal' },
    }),
    StorageScreen: createNativeStackScreen({
      screen: StorageScreen,
      options: { title: 'Storage', presentation: 'modal' },
    }),
    FileFolderFormScreen: createNativeStackScreen({
      screen: FileFolderFormScreen,
      options: {
        title: 'Folder',
        presentation: 'formSheet',
        sheetAllowedDetents: [0.7],
        sheetGrabberVisible: true,               // Adds drag indicator handle
        sheetCornerRadius: 20,           // Customizes top corner rounds
        headerShown: false,                   // Rounded corners
      },
    }),
    FileMoveScreen: createNativeStackScreen({
      screen: FileMoveScreen,
      options: {
        title: 'Move',
        presentation: 'formSheet',
        sheetGrabberVisible: true,
        sheetAllowedDetents: [0.5, 1.0],
      },
    }),
    FileViewerScreen: createNativeStackScreen({
      screen: FileViewerScreen,
      options: { title: 'Preview', headerLargeTitleEnabled: false },
    }),
    ExternalOpenConsentScreen: createNativeStackScreen({
      screen: ExternalOpenConsentScreen,
      options: { title: 'Open in Another App', presentation: 'modal' },
    }),
  },
});

const MainBottomTabs = createBottomTabNavigator({
  screenOptions: {
    tabBarStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    HomeScreen: createBottomTabScreen({
      screen: HomeScreen,
      options: {
        title: 'Home',
        tabBarIcon: Platform.select({
          android: { type: 'materialSymbol', name: 'home' },
          ios: { type: 'sfSymbol', name: 'house.fill' },
        }),
      },
    }),
    AppointmentsScreen: createBottomTabScreen({
      screen: AppointmentsScreen,
      options: {
        title: 'Health',
        tabBarIcon: Platform.select({
          android: { type: 'materialSymbol', name: 'health_and_safety' },
          ios: { type: 'sfSymbol', name: 'heart.fill' },
        }),
      },
    }),
    FilesScreen: createBottomTabScreen({
      screen: FilesStack,
      options: {
        title: 'Files',
        tabBarIcon: Platform.select({
          android: { type: 'materialSymbol', name: 'files' },
          ios: { type: 'sfSymbol', name: 'doc.fill' },
        }),
      },
    }),
    ProfileScreen: createBottomTabScreen({
      screen: ProfileScreen,
      options: {
        title: 'Profile',
        tabBarIcon: Platform.select({
          android: { type: 'materialSymbol', name: 'person' },
          ios: { type: 'sfSymbol', name: 'person.fill' },
        }),
      },
    }),
  },
});

// ── Onboarding Stack ──────────────────────────────────────────────────────────

const OnboardingStack = createNativeStackNavigator({
  screens: {
    Welcome: createNativeStackScreen({
      screen: WelcomeScreen,
      options: { headerShown: false },
    }),
    Onboard: createNativeStackScreen({
      screen: OnboardScreen,
      options: { headerShown: false },
    }),
  },
});

// ── Auth Stack ────────────────────────────────────────────────────────────────

const AuthStack = createNativeStackNavigator({
  screens: {
    Login: createNativeStackScreen({
      screen: LoginScreen,
      options: { title: 'Sign in', headerBackVisible: false },
    }),
    Signup: createNativeStackScreen({
      screen: SignupScreen,
      options: { title: 'Create account' },
    }),
    Verify: createNativeStackScreen({
      screen: VerifyScreen,
      options: { title: 'Verify email' },
    }),
    ForgotPassword: createNativeStackScreen({
      screen: ForgotPasswordScreen,
      options: { title: 'Forgot password' },
    }),
  },
});

// ── Setup PIN Stack ───────────────────────────────────────────────────────────

const SetupPINStack = createNativeStackNavigator({
  screens: {
    CreatePIN: createNativeStackScreen({
      screen: CreatePINScreen,
      options: {
        title: 'Create PIN',
        headerBackVisible: false,
        headerShown: false
      },
    }),
  },
});

// ── Main Stack ────────────────────────────────────────────────────────────────

const MainStack = createNativeStackNavigator({
  screenOptions: {
    headerStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    BottomTabs: createNativeStackScreen({
      screen: MainBottomTabs,
      options: ({ route }) => {
        const focusedTab = getFocusedRouteNameFromRoute(route) ?? 'HomeScreen';
        const isFilesTabFocused = focusedTab === 'FilesScreen';

        return {
          title: 'Clinic EZ',
          headerLargeTitleEnabled: true,
          headerRight: BottomTabsHeaderRight,
          headerBackVisible: false,
          headerShown: !isFilesTabFocused,
        };
      },
    }),
    SettingsScreen: createNativeStackScreen({
      screen: SettingsScreen,
      options: { title: 'Settings', headerLargeTitleEnabled: true },
    }),
    SecuritySettingsScreen: createNativeStackScreen({
      screen: SecuritySettingsScreen,
      options: { title: 'Security', headerLargeTitleEnabled: true },
    }),
    ChangePINScreen: createNativeStackScreen({
      screen: ChangePINScreen,
      options: { title: 'Change PIN' },
    }),
    ChangePasswordScreen: createNativeStackScreen({
      screen: ChangePasswordScreen,
      options: { title: 'Change Password' },
    }),
    AppearanceSettingsScreen: createNativeStackScreen({
      screen: AppearanceSettingsScreen,
      options: { title: 'Appearance', headerLargeTitleEnabled: true },
    }),
    NotificationsSettingsScreen: createNativeStackScreen({
      screen: NotificationsSettingsScreen,
      options: { title: 'Notifications', headerLargeTitleEnabled: true },
    }),
    AboutSettingsScreen: createNativeStackScreen({
      screen: AboutSettingsScreen,
      options: { title: 'About', headerLargeTitleEnabled: true },
    }),
    DebugSettingsScreen: createNativeStackScreen({
      screen: DebugSettingsScreen,
      options: { title: 'Debug', headerLargeTitleEnabled: true },
    }),
    NotificationScreen: createNativeStackScreen({
      screen: NotificationScreen,
      options: { title: 'Notifications', headerLargeTitleEnabled: true },
    }),
    ExploreClinicsScreen: createNativeStackScreen({
      screen: ExploreClinicsScreen,
      options: {
        title: 'Explore Clinics',
        headerLargeTitleEnabled: true
      },
    }),
    ExploreOrgsScreen: createNativeStackScreen({
      screen: ExploreOrgsScreen,
      options: {
        title: 'Explore Organizations',
        headerLargeTitleEnabled: true
      },
    }),
    OrganizationDetailsScreen: createNativeStackScreen({
      screen: OrganizationDetailsScreen,
      options: { title: 'Organization Details', headerLargeTitleEnabled: true },
    }),
    ClinicDetailsScreen: createNativeStackScreen({
      screen: ClinicDetailsScreen,
      options: { title: 'Clinic Details', headerLargeTitleEnabled: true },
    }),
    BookingDraftScreen: createNativeStackScreen({
      screen: BookingDraftScreen,
      options: { title: 'Booking Draft', headerLargeTitleEnabled: true },
    }),
    // ── Profile Part A ────────────────────────────────────────────────────────
    PersonalDemographicsScreen: createNativeStackScreen({
      screen: PersonalDemographicsScreen,
      options: { title: 'Personal Demographics', headerLargeTitleEnabled: true },
    }),
    GovernmentIdsScreen: createNativeStackScreen({
      screen: GovernmentIdsScreen,
      options: { title: 'Government IDs', headerLargeTitleEnabled: true },
    }),
    ContactInfoScreen: createNativeStackScreen({
      screen: ContactInfoScreen,
      options: { title: 'Contact Information', headerLargeTitleEnabled: true },
    }),
    AddressesScreen: createNativeStackScreen({
      screen: AddressesScreen,
      options: { title: 'Addresses', headerLargeTitleEnabled: true },
    }),
    EmergencyContactsScreen: createNativeStackScreen({
      screen: EmergencyContactsScreen,
      options: { title: 'Emergency Contacts', headerLargeTitleEnabled: true },
    }),
    HealthcareProvidersScreen: createNativeStackScreen({
      screen: HealthcareProvidersScreen,
      options: { title: 'Healthcare Providers', headerLargeTitleEnabled: true },
    }),
    AllergiesScreen: createNativeStackScreen({
      screen: AllergiesScreen,
      options: { title: 'Allergies', headerLargeTitleEnabled: true },
    }),
    MedicationsScreen: createNativeStackScreen({
      screen: MedicationsScreen,
      options: { title: 'Medications', headerLargeTitleEnabled: true },
    }),
    SurgicalHistoryScreen: createNativeStackScreen({
      screen: SurgicalHistoryScreen,
      options: { title: 'Surgical History', headerLargeTitleEnabled: true },
    }),
    PastIllnessesScreen: createNativeStackScreen({
      screen: PastIllnessesScreen,
      options: { title: 'Past Illnesses', headerLargeTitleEnabled: true },
    }),
    ChronicConditionsScreen: createNativeStackScreen({
      screen: ChronicConditionsScreen,
      options: { title: 'Chronic Conditions', headerLargeTitleEnabled: true },
    }),
    DisabilitiesScreen: createNativeStackScreen({
      screen: DisabilitiesScreen,
      options: { title: 'Disabilities', headerLargeTitleEnabled: true },
    }),
    ImmunizationsSelfScreen: createNativeStackScreen({
      screen: ImmunizationsSelfScreen,
      options: { title: 'Immunizations (Self-Reported)', headerLargeTitleEnabled: true },
    }),
    SocialHistoryScreen: createNativeStackScreen({
      screen: SocialHistoryScreen,
      options: { title: 'Social History', headerLargeTitleEnabled: true },
    }),
    FamilyHistoryScreen: createNativeStackScreen({
      screen: FamilyHistoryScreen,
      options: { title: 'Family History', headerLargeTitleEnabled: true },
    }),
    OccupationScreen: createNativeStackScreen({
      screen: OccupationScreen,
      options: { title: 'Occupation', headerLargeTitleEnabled: true },
    }),
    TravelHistoryScreen: createNativeStackScreen({
      screen: TravelHistoryScreen,
      options: { title: 'Travel History', headerLargeTitleEnabled: true },
    }),
    ObstetricProfileScreen: createNativeStackScreen({
      screen: ObstetricProfileScreen,
      options: { title: 'Obstetric Profile', headerLargeTitleEnabled: true },
    }),
    MaleReproductiveScreen: createNativeStackScreen({
      screen: MaleReproductiveScreen,
      options: { title: 'Male Reproductive Health', headerLargeTitleEnabled: true },
    }),
    DentalVisionScreen: createNativeStackScreen({
      screen: DentalVisionScreen,
      options: { title: 'Dental & Vision', headerLargeTitleEnabled: true },
    }),
    MentalHealthScreen: createNativeStackScreen({
      screen: MentalHealthScreen,
      options: { title: 'Mental Health', headerLargeTitleEnabled: true },
    }),
    // ── Profile Part B (read-only) ────────────────────────────────────────────
    VitalSignsScreen: createNativeStackScreen({
      screen: VitalSignsScreen,
      options: { title: 'Vital Signs', headerLargeTitleEnabled: true },
    }),
    ConsultationsScreen: createNativeStackScreen({
      screen: ConsultationsScreen,
      options: { title: 'Consultations', headerLargeTitleEnabled: true },
    }),
    PrescriptionsScreen: createNativeStackScreen({
      screen: PrescriptionsScreen,
      options: { title: 'Prescriptions', headerLargeTitleEnabled: true },
    }),
    LabResultsScreen: createNativeStackScreen({
      screen: LabResultsScreen,
      options: { title: 'Lab Results', headerLargeTitleEnabled: true },
    }),
    ImagingResultsScreen: createNativeStackScreen({
      screen: ImagingResultsScreen,
      options: { title: 'Imaging Results', headerLargeTitleEnabled: true },
    }),
    VaccinationsAdministeredScreen: createNativeStackScreen({
      screen: VaccinationsAdministeredScreen,
      options: { title: 'Vaccinations', headerLargeTitleEnabled: true },
    }),
    ClinicalAssessmentsScreen: createNativeStackScreen({
      screen: ClinicalAssessmentsScreen,
      options: { title: 'Clinical Assessments', headerLargeTitleEnabled: true },
    }),
    PhysicalExamScreen: createNativeStackScreen({
      screen: PhysicalExamScreen,
      options: { title: 'Physical Exam', headerLargeTitleEnabled: true },
    }),
    NcdQuestionnaireScreen: createNativeStackScreen({
      screen: NcdQuestionnaireScreen,
      options: { title: 'NCD Questionnaire', headerLargeTitleEnabled: true },
    }),
  },
});

// ── Root Stack ────────────────────────────────────────────────────────────────

const RootStack = createNativeStackNavigator({
  screenOptions: { headerShown: false },
  screens: {
    Loading: createNativeStackScreen({
      screen: LoadingScreen,
      if: useIsAppLoading,
      options: { animation: 'none' },
    }),
    Onboarding: createNativeStackScreen({
      screen: OnboardingStack,
      if: useIsOnboarding,
    }),
    Auth: createNativeStackScreen({
      screen: AuthStack,
      if: useIsInAuthFlow,
    }),
    SetupPIN: createNativeStackScreen({
      screen: SetupPINStack,
      if: useIsSettingUpPIN,
    }),
    Main: createNativeStackScreen({
      screen: MainStack,
      if: useIsMainReady,
    }),
  },
});

export const Navigation = createStaticNavigation(RootStack);
