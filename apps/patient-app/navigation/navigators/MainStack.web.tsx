import type { ComponentType } from 'react';
import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';

import MainBottomTabs from './MainBottomTabs';
import WebAppFrame from '../../components/layout/WebAppFrame.web';

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
import VitalSignsScreen from '../screens/profile/VitalSigns.screen';
import ConsultationsScreen from '../screens/profile/Consultations.screen';
import PrescriptionsScreen from '../screens/profile/Prescriptions.screen';
import LabResultsScreen from '../screens/profile/LabResults.screen';
import ImagingResultsScreen from '../screens/profile/ImagingResults.screen';
import VaccinationsAdministeredScreen from '../screens/profile/VaccinationsAdministered.screen';
import ClinicalAssessmentsScreen from '../screens/profile/ClinicalAssessments.screen';
import PhysicalExamScreen from '../screens/profile/PhysicalExam.screen';
import NcdQuestionnaireScreen from '../screens/profile/NcdQuestionnaire.screen';
import ShareRecordsScreen from '../screens/sharing/ShareRecords.screen';
import AccessGrantsScreen from '../screens/sharing/AccessGrants.screen';
import AccessLogScreen from '../screens/sharing/AccessLog.screen';
import ShareCodeScreen from '../screens/sharing/ShareCode.screen';
import MyDevicesScreen from '../screens/settings/MyDevices.screen';
import DocumentsScreen from '../screens/documents/Documents.screen';
import LabRequestDetailScreen from '../screens/documents/LabRequestDetail.screen';
import UploadLabResultScreen from '../screens/documents/UploadLabResult.screen';
import PrescriptionDetailScreen from '../screens/documents/PrescriptionDetail.screen';
import ExternalDispenseScreen from '../screens/documents/ExternalDispense.screen';
import LabResultDetailScreen from '../screens/documents/LabResultDetail.screen';
import MedicalCertificateDetailScreen from '../screens/documents/MedicalCertificateDetail.screen';
import MessagesInboxScreen from '../screens/messages/MessagesInbox.screen';
import ConversationThreadScreen from '../screens/messages/ConversationThread.screen';
import NewMessageInquiryScreen from '../screens/messages/NewMessageInquiry.screen';
import TeleconsultWaitingRoomScreen from '../screens/teleconsult/TeleconsultWaitingRoom.screen';
import TeleconsultCallScreen from '../screens/teleconsult/TeleconsultCall.screen';
import PrivacySettingsScreen from '../screens/settings/PrivacySettings.screen';

/**
 * Web Main stack.
 *
 * - Every route is a regular page inside <WebAppFrame> (sidebar + header + centered content);
 *   native-only presentations (formSheet / modal / large titles / liquid glass) are not used.
 * - Headers are rendered by the frame from `options.title`, so screens need no changes.
 * - Route names and URLs (see navigation/linking.ts) are identical to the native MainStack.
 */
const SCREENS: [name: string, component: ComponentType<any>, title: string][] = [
  ['SettingsScreen', SettingsScreen, 'Settings'],
  ['SecuritySettingsScreen', SecuritySettingsScreen, 'Security'],
  ['ChangePINScreen', ChangePINScreen, 'Change PIN'],
  ['ChangePasswordScreen', ChangePasswordScreen, 'Change Password'],
  ['AppearanceSettingsScreen', AppearanceSettingsScreen, 'Appearance'],
  ['NotificationsSettingsScreen', NotificationsSettingsScreen, 'Notifications'],
  ['AboutSettingsScreen', AboutSettingsScreen, 'About'],
  ['DebugSettingsScreen', DebugSettingsScreen, 'Debug'],
  ['NotificationScreen', NotificationScreen, 'Notifications'],
  ['NotificationDetailScreen', NotificationDetailScreen, 'Notification'],
  ['ExploreClinicsScreen', ExploreClinicsScreen, 'Explore Clinics'],
  ['ExploreOrgsScreen', ExploreOrgsScreen, 'Explore Organizations'],
  ['OrganizationDetailsScreen', OrganizationDetailsScreen, 'Organization Details'],
  ['ClinicDetailsScreen', ClinicDetailsScreen, 'Clinic Details'],
  ['YakapDetailsScreen', YakapDetailsScreen, 'PhilHealth YAKAP Guide'],
  ['BookingDraftScreen', BookingDraftScreen, 'Book Appointment'],
  ['AppointmentDetailScreen', AppointmentDetailScreen, 'Appointment Details'],
  ['ProviderProfileScreen', ProviderProfileScreen, 'Provider Profile'],
  ['RescheduleScreen', RescheduleScreen, 'Reschedule'],
  ['AttachFilesScreen', AttachFilesScreen, 'Attach Files'],
  ['PersonalDemographicsScreen', PersonalDemographicsScreen, 'Personal Demographics'],
  ['GovernmentIdsScreen', GovernmentIdsScreen, 'Government IDs'],
  ['ContactInfoScreen', ContactInfoScreen, 'Contact Information'],
  ['AddressesScreen', AddressesScreen, 'Addresses'],
  ['EmergencyContactsScreen', EmergencyContactsScreen, 'Emergency Contacts'],
  ['HealthcareProvidersScreen', HealthcareProvidersScreen, 'Healthcare Providers'],
  ['AllergiesScreen', AllergiesScreen, 'Allergies'],
  ['MedicationsScreen', MedicationsScreen, 'Medications'],
  ['SurgicalHistoryScreen', SurgicalHistoryScreen, 'Surgical History'],
  ['PastIllnessesScreen', PastIllnessesScreen, 'Past Illnesses'],
  ['ChronicConditionsScreen', ChronicConditionsScreen, 'Chronic Conditions'],
  ['DisabilitiesScreen', DisabilitiesScreen, 'Disabilities'],
  ['ImmunizationsSelfScreen', ImmunizationsSelfScreen, 'Immunizations (Self-Reported)'],
  ['SocialHistoryScreen', SocialHistoryScreen, 'Social History'],
  ['FamilyHistoryScreen', FamilyHistoryScreen, 'Family History'],
  ['OccupationScreen', OccupationScreen, 'Occupation'],
  ['TravelHistoryScreen', TravelHistoryScreen, 'Travel History'],
  ['ObstetricProfileScreen', ObstetricProfileScreen, 'Obstetric Profile'],
  ['MaleReproductiveScreen', MaleReproductiveScreen, 'Male Reproductive Health'],
  ['DentalVisionScreen', DentalVisionScreen, 'Dental & Vision'],
  ['MentalHealthScreen', MentalHealthScreen, 'Mental Health'],
  ['VitalSignsScreen', VitalSignsScreen, 'Vital Signs'],
  ['ConsultationsScreen', ConsultationsScreen, 'Consultations'],
  ['PrescriptionsScreen', PrescriptionsScreen, 'Prescriptions'],
  ['LabResultsScreen', LabResultsScreen, 'Lab Results'],
  ['ImagingResultsScreen', ImagingResultsScreen, 'Imaging Results'],
  ['VaccinationsAdministeredScreen', VaccinationsAdministeredScreen, 'Vaccinations'],
  ['ClinicalAssessmentsScreen', ClinicalAssessmentsScreen, 'Clinical Assessments'],
  ['PhysicalExamScreen', PhysicalExamScreen, 'Physical Exam'],
  ['NcdQuestionnaireScreen', NcdQuestionnaireScreen, 'NCD Questionnaire'],
  ['ShareRecordsScreen', ShareRecordsScreen, 'Share my records'],
  ['ShareCodeScreen', ShareCodeScreen, 'Share with a code'],
  ['AccessGrantsScreen', AccessGrantsScreen, 'Who has access'],
  ['AccessLogScreen', AccessLogScreen, 'Access activity'],
  ['MyDevicesScreen', MyDevicesScreen, 'My devices'],
  ['DocumentsScreen', DocumentsScreen, 'Documents'],
  ['LabRequestDetailScreen', LabRequestDetailScreen, 'Lab request'],
  ['UploadLabResultScreen', UploadLabResultScreen, 'Upload result'],
  ['PrescriptionDetailScreen', PrescriptionDetailScreen, 'Prescription'],
  ['ExternalDispenseScreen', ExternalDispenseScreen, 'Dispensed elsewhere'],
  ['LabResultDetailScreen', LabResultDetailScreen, 'Lab result'],
  ['MedicalCertificateDetailScreen', MedicalCertificateDetailScreen, 'Medical certificate'],
  ['MessagesInboxScreen', MessagesInboxScreen, 'Messages'],
  ['ConversationThreadScreen', ConversationThreadScreen, 'Conversation'],
  ['NewMessageInquiryScreen', NewMessageInquiryScreen, 'New Message'],
  ['TeleconsultWaitingRoomScreen', TeleconsultWaitingRoomScreen, 'Waiting Room'],
  ['TeleconsultCallScreen', TeleconsultCallScreen, 'Teleconsultation'],
  ['PrivacySettingsScreen', PrivacySettingsScreen, 'Privacy & Communications'],
];

const screens: Record<string, any> = {
  BottomTabs: createNativeStackScreen({
    screen: MainBottomTabs,
    options: { headerShown: false },
  }),
  MainBottomTabs: createNativeStackScreen({
    screen: MainBottomTabs,
    options: { headerShown: false },
  }),
};

for (const [name, component, title] of SCREENS) {
  screens[name] = createNativeStackScreen({ screen: component, options: { title } });
}

const MainStackWeb = createNativeStackNavigator({
  screenOptions: {
    headerShown: false,
    animation: 'none',
    contentStyle: { backgroundColor: 'transparent' },
  },
  layout: (props) => <WebAppFrame {...(props as any)} />,
  screens,
}) as unknown as typeof import('./MainStack').default;

export default MainStackWeb;
