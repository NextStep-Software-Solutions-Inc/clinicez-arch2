import type { LinkingOptions } from '@react-navigation/native';
import type { RootParamList } from './Navigation';

export const linking: LinkingOptions<RootParamList> = {
  prefixes: ['/'],
  config: {
    screens: {
      Loading: 'loading',
      Onboarding: {
        screens: {
          Welcome: 'welcome',
          Onboard: 'onboard',
        },
      },
      Auth: {
        screens: {
          Login: 'login',
          Signup: 'register',
          Verify: 'verify',
          ForgotPassword: 'forgot-password',
        },
      },
      SetupPIN: {
        screens: {
          CreatePIN: 'setup-pin',
        },
      },
      Main: {
        screens: {
          BottomTabs: {
            screens: {
              HomeScreen: 'home',
              AppointmentsScreen: 'appointments',
              FilesScreen: {
                screens: {
                  FilesBrowserScreen: 'files',
                  FilesUploadScreen: 'files/upload',
                  StorageScreen: 'files/storage',
                  FileFolderFormScreen: 'files/folder',
                  FileMoveScreen: 'files/move',
                  FileViewerScreen: 'files/view/:fileId',
                  ExternalOpenConsentScreen: 'files/consent',
                  FRKSetupScreen: 'files/frk-setup',
                  FRKEntryScreen: 'files/frk-entry',
                },
              },
              ProfileScreen: 'profile',
            },
          },
          NotificationScreen: 'notifications',
          NotificationDetailScreen: 'notifications/:id',
          SettingsScreen: 'settings',
          SecuritySettingsScreen: 'settings/security',
          ChangePINScreen: 'settings/pin',
          ChangePasswordScreen: 'settings/password',
          AppearanceSettingsScreen: 'settings/appearance',
          NotificationsSettingsScreen: 'settings/notifications',
          AboutSettingsScreen: 'settings/about',
          DebugSettingsScreen: 'settings/debug',
          ExploreClinicsScreen: 'explore/clinics',
          ExploreOrgsScreen: 'explore/orgs',
          OrganizationDetailsScreen: 'explore/orgs/:id',
          ClinicDetailsScreen: 'explore/clinics/:id',
          BookingDraftScreen: 'booking/draft',
          AppointmentDetailScreen: 'appointments/:id',
          ProviderProfileScreen: 'providers/:id',
          RescheduleScreen: 'appointments/:id/reschedule',
          AttachFilesScreen: 'appointments/:id/attach-files',

          // Profile 22+ categories
          PersonalDemographicsScreen: 'profile/demographics',
          GovernmentIdsScreen: 'profile/government-ids',
          ContactInfoScreen: 'profile/contact',
          AddressesScreen: 'profile/addresses',
          EmergencyContactsScreen: 'profile/emergency-contacts',
          HealthcareProvidersScreen: 'profile/healthcare-providers',
          AllergiesScreen: 'profile/allergies',
          MedicationsScreen: 'profile/medications',
          SurgicalHistoryScreen: 'profile/surgical-history',
          PastIllnessesScreen: 'profile/past-illnesses',
          ChronicConditionsScreen: 'profile/chronic-conditions',
          DisabilitiesScreen: 'profile/disabilities',
          ImmunizationsSelfScreen: 'profile/immunizations-self',
          SocialHistoryScreen: 'profile/social-history',
          FamilyHistoryScreen: 'profile/family-history',
          OccupationScreen: 'profile/occupation',
          TravelHistoryScreen: 'profile/travel-history',
          ObstetricProfileScreen: 'profile/obstetric',
          MaleReproductiveScreen: 'profile/male-reproductive',
          DentalVisionScreen: 'profile/dental-vision',
          MentalHealthScreen: 'profile/mental-health',

          // Clinical records
          VitalSignsScreen: 'profile/vital-signs',
          ConsultationsScreen: 'profile/consultations',
          PrescriptionsScreen: 'profile/prescriptions',
          LabResultsScreen: 'profile/lab-results',
          ImagingResultsScreen: 'profile/imaging-results',
          VaccinationsAdministeredScreen: 'profile/vaccinations-administered',
          ClinicalAssessmentsScreen: 'profile/clinical-assessments',
          PhysicalExamScreen: 'profile/physical-exam',
          NcdQuestionnaireScreen: 'profile/ncd-questionnaire',
        },
      },
    },
  },
};
