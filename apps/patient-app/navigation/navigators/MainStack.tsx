import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';
import { radiusScale } from '@clinicez/design-tokens';

import MainBottomTabs from './MainBottomTabs';

import SettingsScreen from '../screens/settings/Settings.screen';
import SecuritySettingsScreen from '../screens/settings/SecuritySettings.screen';
import ChangePINScreen from '../screens/settings/ChangePIN.screen';
import AppearanceSettingsScreen from '../screens/settings/AppearanceSettings.screen';
import NotificationsSettingsScreen from '../screens/settings/NotificationsSettings.screen';
import AboutSettingsScreen from '../screens/settings/AboutSettings.screen';
import DebugSettingsScreen from '../screens/settings/DebugSettings.screen';
import ChangePasswordScreen from '../screens/settings/ChangePassword.screen';
import NotificationScreen from '../screens/Notification.screen';
import NotificationDetailScreen from '../screens/NotificationDetail.screen';

import ExploreClinicsScreen from '../screens/ExploreClinics.screen';
import ExploreOrgsScreen from '../screens/ExploreOrgs.screen';
import OrganizationDetailsScreen from '../screens/OrganizationDetails.screen';
import ClinicDetailsScreen from '../screens/ClinicDetails.screen';
import YakapDetailsScreen from '../screens/YakapDetails.screen';
import BookingDraftScreen from '../screens/BookingDraft.screen';
import AppointmentDetailScreen from '../screens/appointments/AppointmentDetail.screen';
import ProviderProfileScreen from '../screens/appointments/ProviderProfile.screen';
import RescheduleScreen from '../screens/appointments/Reschedule.screen';
import AttachFilesScreen from '../screens/appointments/AttachFiles.screen';

// Profile Part A
import PersonalDemographicsScreen from '../screens/profile/PersonalDemographics.screen';
import GovernmentIdsScreen from '../screens/profile/GovernmentIds.screen';
import ContactInfoScreen from '../screens/profile/ContactInfo.screen';
import AddressesScreen from '../screens/profile/Addresses.screen';
import EmergencyContactsScreen from '../screens/profile/EmergencyContacts.screen';
import HealthcareProvidersScreen from '../screens/profile/HealthcareProviders.screen';
import AllergiesScreen from '../screens/profile/Allergies.screen';
import MedicationsScreen from '../screens/profile/Medications.screen';
import SurgicalHistoryScreen from '../screens/profile/SurgicalHistory.screen';
import PastIllnessesScreen from '../screens/profile/PastIllnesses.screen';
import ChronicConditionsScreen from '../screens/profile/ChronicConditions.screen';
import DisabilitiesScreen from '../screens/profile/Disabilities.screen';
import ImmunizationsSelfScreen from '../screens/profile/ImmunizationsSelf.screen';
import SocialHistoryScreen from '../screens/profile/SocialHistory.screen';
import FamilyHistoryScreen from '../screens/profile/FamilyHistory.screen';
import OccupationScreen from '../screens/profile/Occupation.screen';
import TravelHistoryScreen from '../screens/profile/TravelHistory.screen';
import ObstetricProfileScreen from '../screens/profile/ObstetricProfile.screen';
import MaleReproductiveScreen from '../screens/profile/MaleReproductive.screen';
import DentalVisionScreen from '../screens/profile/DentalVision.screen';
import MentalHealthScreen from '../screens/profile/MentalHealth.screen';

// Profile Part B
import VitalSignsScreen from '../screens/profile/VitalSigns.screen';
import ConsultationsScreen from '../screens/profile/Consultations.screen';
import PrescriptionsScreen from '../screens/profile/Prescriptions.screen';
import LabResultsScreen from '../screens/profile/LabResults.screen';
import ImagingResultsScreen from '../screens/profile/ImagingResults.screen';
import VaccinationsAdministeredScreen from '../screens/profile/VaccinationsAdministered.screen';
import ClinicalAssessmentsScreen from '../screens/profile/ClinicalAssessments.screen';
import PhysicalExamScreen from '../screens/profile/PhysicalExam.screen';
import NcdQuestionnaireScreen from '../screens/profile/NcdQuestionnaire.screen';

// Sharing
import ShareRecordsScreen from '../screens/sharing/ShareRecords.screen';
import AccessGrantsScreen from '../screens/sharing/AccessGrants.screen';
import AccessLogScreen from '../screens/sharing/AccessLog.screen';
import ShareCodeScreen from '../screens/sharing/ShareCode.screen';
import MyDevicesScreen from '../screens/settings/MyDevices.screen';

// Document inbox
import DocumentsScreen from '../screens/documents/Documents.screen';
import LabRequestDetailScreen from '../screens/documents/LabRequestDetail.screen';
import UploadLabResultScreen from '../screens/documents/UploadLabResult.screen';
import PrescriptionDetailScreen from '../screens/documents/PrescriptionDetail.screen';
import ExternalDispenseScreen from '../screens/documents/ExternalDispense.screen';
import LabResultDetailScreen from '../screens/documents/LabResultDetail.screen';
import MedicalCertificateDetailScreen from '../screens/documents/MedicalCertificateDetail.screen';

// Communications & Teleconsultation
import MessagesInboxScreen from '../screens/messages/MessagesInbox.screen';
import ConversationThreadScreen from '../screens/messages/ConversationThread.screen';
import NewMessageInquiryScreen from '../screens/messages/NewMessageInquiry.screen';
import TeleconsultWaitingRoomScreen from '../screens/teleconsult/TeleconsultWaitingRoom.screen';
import TeleconsultCallScreen from '../screens/teleconsult/TeleconsultCall.screen';
import PrivacySettingsScreen from '../screens/settings/PrivacySettings.screen';

const MainStack = createNativeStackNavigator({
  screenOptions: {
    headerStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    BottomTabs: createNativeStackScreen({
      screen: MainBottomTabs,
      options: {
        headerShown: false,
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
    NotificationDetailScreen: createNativeStackScreen({
      screen: NotificationDetailScreen,
      options: {
        title: '',
        presentation: 'formSheet',
        sheetAllowedDetents: [0.55, 0.85],
        sheetGrabberVisible: true,
        sheetCornerRadius: radiusScale.xl,
        headerShown: true,
      },
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
      options: { title: 'Organization Details', headerLargeTitleEnabled: false },
    }),
    ClinicDetailsScreen: createNativeStackScreen({
      screen: ClinicDetailsScreen,
      options: { title: 'Clinic Details', headerLargeTitleEnabled: false },
    }),
    YakapDetailsScreen: createNativeStackScreen({
      screen: YakapDetailsScreen,
      options: { title: 'PhilHealth YAKAP Guide', headerLargeTitleEnabled: true },
    }),
    BookingDraftScreen: createNativeStackScreen({
      screen: BookingDraftScreen,
      options: {
        title: 'Book Appointment',
        presentation: 'formSheet',
        sheetAllowedDetents: [0.92],
        sheetGrabberVisible: true,
        sheetCornerRadius: radiusScale.xl,
        headerShown: true,
      },
    }),
    AppointmentDetailScreen: createNativeStackScreen({
      screen: AppointmentDetailScreen,
      options: { title: 'Appointment Details', headerBackTitle: '' },
    }),
    ProviderProfileScreen: createNativeStackScreen({
      screen: ProviderProfileScreen,
      options: {
        title: 'Provider Profile',
        presentation: 'modal',
        headerBackTitle: '',
      },
    }),
    RescheduleScreen: createNativeStackScreen({
      screen: RescheduleScreen,
      options: {
        title: 'Reschedule',
        presentation: 'formSheet',
        sheetAllowedDetents: [0.88],
        sheetGrabberVisible: true,
        sheetCornerRadius: radiusScale.xl,
        headerShown: true,
      },
    }),
    AttachFilesScreen: createNativeStackScreen({
      screen: AttachFilesScreen,
      options: {
        title: 'Attach Files',
        presentation: 'formSheet',
        sheetAllowedDetents: [0.75, 1.0],
        sheetGrabberVisible: true,
        sheetCornerRadius: radiusScale.xl,
        headerShown: true,
      },
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
    // ── Sharing ───────────────────────────────────────────────────────────────
    ShareRecordsScreen: createNativeStackScreen({
      screen: ShareRecordsScreen,
      options: { title: 'Share my records', headerLargeTitleEnabled: true },
    }),
    ShareCodeScreen: createNativeStackScreen({
      screen: ShareCodeScreen,
      options: { title: 'Share with a code' },
    }),
    AccessGrantsScreen: createNativeStackScreen({
      screen: AccessGrantsScreen,
      options: { title: 'Who has access', headerLargeTitleEnabled: true },
    }),
    AccessLogScreen: createNativeStackScreen({
      screen: AccessLogScreen,
      options: { title: 'Access activity' },
    }),
    // ── Devices ───────────────────────────────────────────────────────────────
    MyDevicesScreen: createNativeStackScreen({
      screen: MyDevicesScreen,
      options: { title: 'My devices' },
    }),
    // ── Document inbox ────────────────────────────────────────────────────────
    DocumentsScreen: createNativeStackScreen({
      screen: DocumentsScreen,
      options: { title: 'Documents', headerLargeTitleEnabled: true },
    }),
    LabRequestDetailScreen: createNativeStackScreen({
      screen: LabRequestDetailScreen,
      options: { title: 'Lab request' },
    }),
    UploadLabResultScreen: createNativeStackScreen({
      screen: UploadLabResultScreen,
      options: { title: 'Upload result' },
    }),
    PrescriptionDetailScreen: createNativeStackScreen({
      screen: PrescriptionDetailScreen,
      options: { title: 'Prescription' },
    }),
    ExternalDispenseScreen: createNativeStackScreen({
      screen: ExternalDispenseScreen,
      options: { title: 'Dispensed elsewhere' },
    }),
    LabResultDetailScreen: createNativeStackScreen({
      screen: LabResultDetailScreen,
      options: { title: 'Lab result' },
    }),
    MedicalCertificateDetailScreen: createNativeStackScreen({
      screen: MedicalCertificateDetailScreen,
      options: { title: 'Medical certificate' },
    }),
    // ── Communications & Teleconsultation ────────────────────────────────────
    MessagesInboxScreen: createNativeStackScreen({
      screen: MessagesInboxScreen,
      options: { title: 'Messages', headerLargeTitleEnabled: true },
    }),
    ConversationThreadScreen: createNativeStackScreen({
      screen: ConversationThreadScreen,
      options: { title: 'Conversation', headerShown: false },
    }),
    NewMessageInquiryScreen: createNativeStackScreen({
      screen: NewMessageInquiryScreen,
      options: { title: 'New Message', headerLargeTitleEnabled: true },
    }),
    TeleconsultWaitingRoomScreen: createNativeStackScreen({
      screen: TeleconsultWaitingRoomScreen,
      options: { title: 'Waiting Room', headerShown: false },
    }),
    TeleconsultCallScreen: createNativeStackScreen({
      screen: TeleconsultCallScreen,
      options: { title: 'Teleconsultation', headerShown: false },
    }),
    PrivacySettingsScreen: createNativeStackScreen({
      screen: PrivacySettingsScreen,
      options: { title: 'Privacy & Communications', headerLargeTitleEnabled: true },
    }),
  },
});

export default MainStack;
