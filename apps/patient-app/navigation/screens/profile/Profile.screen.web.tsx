import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { db } from '@db/index';
import {
  patientAddresses,
  emergencyContacts,
  patientHealthcareProviders,
  patientAllergies,
  patientMedications,
  patientSurgicalHistory,
  patientPastIllnesses,
  patientChronicConditions,
  patientDisabilities,
  patientImmunizationsSelf,
  patientFamilyHistory,
  patientTravelHistory,
  patientPregnancies,
  vitalSigns,
  consultations,
  prescriptions,
  labResults,
  imagingResults,
  vaccinationsAdministered,
  clinicalAssessments,
  patientPhysicalExamProfile,
  patientNcdQuestionnaire,
} from '@db/schema/index';
import { isNull, count } from 'drizzle-orm';
import ProfileCard from 'components/ProfileCard';
import { SettingsSection, SettingsRow } from '@ui/SettingsItem';
import { useAppTheme } from 'contexts/ThemeContext';
import { useAuth } from 'contexts/AuthContext';
import { useOfflineAlert } from 'contexts/OfflineAlertContext';
import { useBreakpoint } from 'hooks/useBreakpoint';
import { syncFullProfile } from 'services/api/syncService';
import { useProfileSync } from 'hooks/useProfileSync';

type Counts = {
  addresses: number;
  emergency: number;
  providers: number;
  allergies: number;
  medications: number;
  surgeries: number;
  illnesses: number;
  chronic: number;
  disabilities: number;
  immunizations: number;
  family: number;
  travel: number;
  pregnancies: number;
  vitals: number;
  consults: number;
  rxs: number;
  labs: number;
  imaging: number;
  vaccinations: number;
  assessments: number;
  physicalExams: number;
  ncdQuestionnaires: number;
};

async function loadCounts(): Promise<Counts> {
  const [
    addressCount, emergencyCount, providerCount, allergyCount, medicationCount,
    surgeryCount, illnessCount, chronicCount, disabilityCount, immunizationCount,
    familyCount, travelCount, pregnancyCount, vitalCount, consultCount,
    rxCount, labCount, imagingCount, vaccinationCount, assessmentCount,
    physicalExamCount, ncdQuestionnaireCount,
  ] = await Promise.all([
    db.select({ c: count() }).from(patientAddresses).where(isNull(patientAddresses.deletedAt)),
    db.select({ c: count() }).from(emergencyContacts).where(isNull(emergencyContacts.deletedAt)),
    db.select({ c: count() }).from(patientHealthcareProviders).where(isNull(patientHealthcareProviders.deletedAt)),
    db.select({ c: count() }).from(patientAllergies).where(isNull(patientAllergies.deletedAt)),
    db.select({ c: count() }).from(patientMedications).where(isNull(patientMedications.deletedAt)),
    db.select({ c: count() }).from(patientSurgicalHistory).where(isNull(patientSurgicalHistory.deletedAt)),
    db.select({ c: count() }).from(patientPastIllnesses).where(isNull(patientPastIllnesses.deletedAt)),
    db.select({ c: count() }).from(patientChronicConditions).where(isNull(patientChronicConditions.deletedAt)),
    db.select({ c: count() }).from(patientDisabilities).where(isNull(patientDisabilities.deletedAt)),
    db.select({ c: count() }).from(patientImmunizationsSelf).where(isNull(patientImmunizationsSelf.deletedAt)),
    db.select({ c: count() }).from(patientFamilyHistory).where(isNull(patientFamilyHistory.deletedAt)),
    db.select({ c: count() }).from(patientTravelHistory).where(isNull(patientTravelHistory.deletedAt)),
    db.select({ c: count() }).from(patientPregnancies).where(isNull(patientPregnancies.deletedAt)),
    db.select({ c: count() }).from(vitalSigns),
    db.select({ c: count() }).from(consultations),
    db.select({ c: count() }).from(prescriptions),
    db.select({ c: count() }).from(labResults),
    db.select({ c: count() }).from(imagingResults),
    db.select({ c: count() }).from(vaccinationsAdministered),
    db.select({ c: count() }).from(clinicalAssessments),
    db.select({ c: count() }).from(patientPhysicalExamProfile),
    db.select({ c: count() }).from(patientNcdQuestionnaire),
  ]);

  return {
    addresses: addressCount[0]?.c ?? 0,
    emergency: emergencyCount[0]?.c ?? 0,
    providers: providerCount[0]?.c ?? 0,
    allergies: allergyCount[0]?.c ?? 0,
    medications: medicationCount[0]?.c ?? 0,
    surgeries: surgeryCount[0]?.c ?? 0,
    illnesses: illnessCount[0]?.c ?? 0,
    chronic: chronicCount[0]?.c ?? 0,
    disabilities: disabilityCount[0]?.c ?? 0,
    immunizations: immunizationCount[0]?.c ?? 0,
    family: familyCount[0]?.c ?? 0,
    travel: travelCount[0]?.c ?? 0,
    pregnancies: pregnancyCount[0]?.c ?? 0,
    vitals: vitalCount[0]?.c ?? 0,
    consults: consultCount[0]?.c ?? 0,
    rxs: rxCount[0]?.c ?? 0,
    labs: labCount[0]?.c ?? 0,
    imaging: imagingCount[0]?.c ?? 0,
    vaccinations: vaccinationCount[0]?.c ?? 0,
    assessments: assessmentCount[0]?.c ?? 0,
    physicalExams: physicalExamCount[0]?.c ?? 0,
    ncdQuestionnaires: ncdQuestionnaireCount[0]?.c ?? 0,
  };
}

function plural(n: number, noun: string) {
  if (n === 0) return 'None';
  return `${n} ${noun}${n !== 1 ? 's' : ''}`;
}

export default function ProfileScreenWeb() {
  const navigation = useNavigation<any>();
  const { internalPatientId, getToken } = useAuth();
  const { showOfflineAlert } = useOfflineAlert();
  const { colors, spacing, sizes } = useAppTheme();
  const { isCompact } = useBreakpoint();

  const [counts, setCounts] = useState<Counts | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasBackgroundFetchedRef = useRef(false);

  const reloadCounts = useCallback(() => {
    loadCounts().then(setCounts).catch(console.error);
  }, []);

  const fetchAndHydrateFullRecord = useCallback(async (): Promise<boolean> => {
    if (!internalPatientId) return false;
    const res = await syncFullProfile(internalPatientId, getToken);
    return res.success;
  }, [internalPatientId, getToken]);

  useProfileSync(reloadCounts);

  useEffect(() => {
    reloadCounts();
    if (!hasBackgroundFetchedRef.current) {
      hasBackgroundFetchedRef.current = true;
      NetInfo.fetch()
        .then(async (state) => {
          if (state.isConnected) {
            const ok = await fetchAndHydrateFullRecord();
            if (ok) reloadCounts();
          }
        })
        .catch(() => {});
    }
  }, [fetchAndHydrateFullRecord, reloadCounts]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const state = await NetInfo.fetch();
      if (!state.isConnected) {
        showOfflineAlert(
          "You're Offline",
          'Connect to the internet to refresh your profile from the server.',
        );
        return;
      }
      const ok = await fetchAndHydrateFullRecord();
      if (ok) reloadCounts();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchAndHydrateFullRecord, reloadCounts, showOfflineAlert]);

  const c = counts;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.scrollContent,
        {
          padding: isCompact ? spacing.lg : spacing['2xl'],
          paddingBottom: spacing['4xl'],
        },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={[styles.container, { maxWidth: sizes.contentMaxWidth }]}>
        <ProfileCard />

        <SettingsSection title="About You">
          <SettingsRow
            title="Personal Info"
            subtitle="Demographics, name, date of birth"
            icon={{ android: 'person', ios: 'person.fill' }}
            iconColor={colors.primary}
            right={{ type: 'chevron' }}
            onPress={() => navigation.navigate('Main', { screen: 'PersonalDemographicsScreen' })}
          />
          <SettingsRow
            title="Government & Insurance IDs"
            subtitle="PhilHealth, SSS, GSIS, HMO"
            icon={{ android: 'badge', ios: 'creditcard.fill' }}
            iconColor={colors.purple}
            right={{ type: 'chevron' }}
            onPress={() => navigation.navigate('Main', { screen: 'GovernmentIdsScreen' })}
          />
          <SettingsRow
            title="Contact Info"
            subtitle="Mobile, email, messenger"
            icon={{ android: 'call', ios: 'phone.fill' }}
            iconColor={colors.success}
            right={{ type: 'chevron' }}
            onPress={() => navigation.navigate('Main', { screen: 'ContactInfoScreen' })}
          />
          <SettingsRow
            title="Addresses"
            subtitle="Home, secondary"
            icon={{ android: 'location_on', ios: 'location.fill' }}
            iconColor={colors.warning}
            right={c ? { type: 'value', label: plural(c.addresses, 'address') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'AddressesScreen' })}
          />
        </SettingsSection>

        <SettingsSection title="Emergency">
          <SettingsRow
            title="Emergency Contacts"
            icon={{ android: 'emergency', ios: 'person.crop.circle.badge.exclamationmark.fill' }}
            iconColor={colors.emergency}
            right={c ? { type: 'value', label: plural(c.emergency, 'contact') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'EmergencyContactsScreen' })}
          />
        </SettingsSection>

        <SettingsSection title="Healthcare">
          <SettingsRow
            title="Healthcare Providers"
            subtitle="Doctors, specialists"
            icon={{ android: 'local_hospital', ios: 'stethoscope' }}
            iconColor={colors.info}
            right={c ? { type: 'value', label: plural(c.providers, 'provider') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'HealthcareProvidersScreen' })}
          />
        </SettingsSection>

        <SettingsSection title="Medical History">
          <SettingsRow
            title="Allergies"
            icon={{ android: 'warning', ios: 'exclamationmark.triangle.fill' }}
            iconColor={colors.urgent}
            right={c ? { type: 'value', label: plural(c.allergies, 'allergy') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'AllergiesScreen' })}
          />
          <SettingsRow
            title="Medications"
            icon={{ android: 'medication', ios: 'pills.fill' }}
            iconColor={colors.success}
            right={c ? { type: 'value', label: plural(c.medications, 'medication') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'MedicationsScreen' })}
          />
          <SettingsRow
            title="Surgical History"
            icon={{ android: 'content_cut', ios: 'scissors' }}
            iconColor={colors.purple}
            right={c ? { type: 'value', label: plural(c.surgeries, 'procedure') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'SurgicalHistoryScreen' })}
          />
          <SettingsRow
            title="Past Illnesses"
            icon={{ android: 'sick', ios: 'thermometer.medium' }}
            iconColor={colors.textSecondary}
            right={c ? { type: 'value', label: plural(c.illnesses, 'illness') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'PastIllnessesScreen' })}
          />
          <SettingsRow
            title="Chronic Conditions"
            icon={{ android: 'monitor_heart', ios: 'heart.text.clipboard.fill' }}
            iconColor={colors.emergency}
            right={c ? { type: 'value', label: plural(c.chronic, 'condition') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'ChronicConditionsScreen' })}
          />
          <SettingsRow
            title="Disabilities"
            icon={{ android: 'accessibility', ios: 'figure.roll' }}
            iconColor={colors.purple}
            right={c ? { type: 'value', label: plural(c.disabilities, 'entry') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'DisabilitiesScreen' })}
          />
          <SettingsRow
            title="Self-Reported Immunizations"
            icon={{ android: 'vaccines', ios: 'syringe.fill' }}
            iconColor={colors.primary}
            right={c ? { type: 'value', label: plural(c.immunizations, 'vaccine') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'ImmunizationsSelfScreen' })}
          />
        </SettingsSection>

        <SettingsSection title="Lifestyle">
          <SettingsRow
            title="Social History"
            subtitle="Tobacco, alcohol, exercise, diet"
            icon={{ android: 'self_improvement', ios: 'leaf.fill' }}
            iconColor={colors.success}
            right={{ type: 'chevron' }}
            onPress={() => navigation.navigate('Main', { screen: 'SocialHistoryScreen' })}
          />
          <SettingsRow
            title="Occupation"
            icon={{ android: 'work', ios: 'briefcase.fill' }}
            iconColor={colors.warning}
            right={{ type: 'chevron' }}
            onPress={() => navigation.navigate('Main', { screen: 'OccupationScreen' })}
          />
          <SettingsRow
            title="Travel History"
            icon={{ android: 'flight', ios: 'airplane' }}
            iconColor={colors.info}
            right={c ? { type: 'value', label: plural(c.travel, 'trip') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'TravelHistoryScreen' })}
          />
        </SettingsSection>

        <SettingsSection title="Family History">
          <SettingsRow
            title="Family Health History"
            icon={{ android: 'family_restroom', ios: 'person.2.fill' }}
            iconColor={colors.purple}
            right={c ? { type: 'value', label: plural(c.family, 'entry') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'FamilyHistoryScreen' })}
          />
        </SettingsSection>

        <SettingsSection title="Reproductive Health">
          <SettingsRow
            title="Obstetric Profile"
            subtitle="Menstrual history, pregnancies"
            icon={{ android: 'pregnant_woman', ios: 'waveform.path.ecg' }}
            iconColor={colors.purple}
            right={c ? { type: 'value', label: plural(c.pregnancies, 'pregnancy') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'ObstetricProfileScreen' })}
          />
          <SettingsRow
            title="Male Reproductive Health"
            icon={{ android: 'male', ios: 'person.fill' }}
            iconColor={colors.primary}
            right={{ type: 'chevron' }}
            onPress={() => navigation.navigate('Main', { screen: 'MaleReproductiveScreen' })}
          />
          <SettingsRow
            title="Dental & Vision"
            icon={{ android: 'visibility', ios: 'eye.fill' }}
            iconColor={colors.success}
            right={{ type: 'chevron' }}
            onPress={() => navigation.navigate('Main', { screen: 'DentalVisionScreen' })}
          />
          <SettingsRow
            title="Mental Health"
            icon={{ android: 'psychology', ios: 'brain.head.profile' }}
            iconColor={colors.purple}
            right={{ type: 'chevron' }}
            onPress={() => navigation.navigate('Main', { screen: 'MentalHealthScreen' })}
          />
        </SettingsSection>

        <SettingsSection
          title="Health Records"
          footer="These records are entered by your healthcare provider and cannot be edited here."
        >
          <SettingsRow
            title="Vital Signs"
            icon={{ android: 'monitor_heart', ios: 'waveform.path.ecg' }}
            iconColor={colors.emergency}
            right={c ? { type: 'value', label: plural(c.vitals, 'record') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'VitalSignsScreen' })}
          />
          <SettingsRow
            title="Consultations"
            icon={{ android: 'chat_bubble', ios: 'stethoscope' }}
            iconColor={colors.primary}
            right={c ? { type: 'value', label: plural(c.consults, 'consult') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'ConsultationsScreen' })}
          />
          <SettingsRow
            title="Prescriptions"
            icon={{ android: 'receipt_long', ios: 'doc.text.fill' }}
            iconColor={colors.purple}
            right={c ? { type: 'value', label: plural(c.rxs, 'Rx') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'PrescriptionsScreen' })}
          />
          <SettingsRow
            title="Lab Results"
            icon={{ android: 'science', ios: 'flask.fill' }}
            iconColor={colors.success}
            right={c ? { type: 'value', label: plural(c.labs, 'result') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'LabResultsScreen' })}
          />
          <SettingsRow
            title="Imaging Results"
            icon={{ android: 'image', ios: 'photo.fill' }}
            iconColor={colors.warning}
            right={c ? { type: 'value', label: plural(c.imaging, 'image') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'ImagingResultsScreen' })}
          />
          <SettingsRow
            title="Vaccinations (Provider)"
            icon={{ android: 'vaccines', ios: 'syringe.fill' }}
            iconColor={colors.info}
            right={c ? { type: 'value', label: plural(c.vaccinations, 'vaccine') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'VaccinationsAdministeredScreen' })}
          />
          <SettingsRow
            title="Clinical Assessments"
            icon={{ android: 'assignment', ios: 'list.clipboard.fill' }}
            iconColor={colors.textSecondary}
            right={c ? { type: 'value', label: plural(c.assessments, 'assessment') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'ClinicalAssessmentsScreen' })}
          />
          <SettingsRow
            title="Physical Exam"
            icon={{ android: 'monitor', ios: 'stethoscope' }}
            iconColor={colors.primary}
            right={c ? { type: 'value', label: plural(c.physicalExams, 'record') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'PhysicalExamScreen' })}
          />
          <SettingsRow
            title="NCD Questionnaire"
            icon={{ android: 'quiz', ios: 'checklist' }}
            iconColor={colors.purple}
            right={c ? { type: 'value', label: plural(c.ncdQuestionnaires, 'record') } : { type: 'loading' }}
            onPress={() => navigation.navigate('Main', { screen: 'NcdQuestionnaireScreen' })}
          />
        </SettingsSection>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    width: '100%',
    alignSelf: 'center',
  },
});
