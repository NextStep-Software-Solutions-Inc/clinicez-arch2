import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
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
import { isNull, count, and, eq } from 'drizzle-orm';
import ProfileCard from 'components/ProfileCard';
import { SettingsSection, SettingsRow } from '@ui/SettingsItem';
import { useContentInsets } from 'hooks/useContentInsets';
import { useAppTheme } from 'contexts/ThemeContext';
import { useAuth } from 'contexts/AuthContext';
import { useOfflineAlert } from 'contexts/OfflineAlertContext';
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
};

async function loadCounts(patientId: string): Promise<Counts> {
  if (!patientId) {
    return {
      addresses: 0,
      emergency: 0,
      providers: 0,
      allergies: 0,
      medications: 0,
      surgeries: 0,
      illnesses: 0,
      chronic: 0,
      disabilities: 0,
      immunizations: 0,
      family: 0,
      travel: 0,
      pregnancies: 0,
    };
  }

  const [
    addressCount, emergencyCount, providerCount, allergyCount, medicationCount,
    surgeryCount, illnessCount, chronicCount, disabilityCount, immunizationCount,
    familyCount, travelCount, pregnancyCount,
  ] = await Promise.all([
    db.select({ c: count() }).from(patientAddresses).where(and(eq(patientAddresses.patientId, patientId), isNull(patientAddresses.deletedAt))),
    db.select({ c: count() }).from(emergencyContacts).where(and(eq(emergencyContacts.patientId, patientId), isNull(emergencyContacts.deletedAt))),
    db.select({ c: count() }).from(patientHealthcareProviders).where(and(eq(patientHealthcareProviders.patientId, patientId), isNull(patientHealthcareProviders.deletedAt))),
    db.select({ c: count() }).from(patientAllergies).where(and(eq(patientAllergies.patientId, patientId), isNull(patientAllergies.deletedAt))),
    db.select({ c: count() }).from(patientMedications).where(and(eq(patientMedications.patientId, patientId), isNull(patientMedications.deletedAt))),
    db.select({ c: count() }).from(patientSurgicalHistory).where(and(eq(patientSurgicalHistory.patientId, patientId), isNull(patientSurgicalHistory.deletedAt))),
    db.select({ c: count() }).from(patientPastIllnesses).where(and(eq(patientPastIllnesses.patientId, patientId), isNull(patientPastIllnesses.deletedAt))),
    db.select({ c: count() }).from(patientChronicConditions).where(and(eq(patientChronicConditions.patientId, patientId), isNull(patientChronicConditions.deletedAt))),
    db.select({ c: count() }).from(patientDisabilities).where(and(eq(patientDisabilities.patientId, patientId), isNull(patientDisabilities.deletedAt))),
    db.select({ c: count() }).from(patientImmunizationsSelf).where(and(eq(patientImmunizationsSelf.patientId, patientId), isNull(patientImmunizationsSelf.deletedAt))),
    db.select({ c: count() }).from(patientFamilyHistory).where(and(eq(patientFamilyHistory.patientId, patientId), isNull(patientFamilyHistory.deletedAt))),
    db.select({ c: count() }).from(patientTravelHistory).where(and(eq(patientTravelHistory.patientId, patientId), isNull(patientTravelHistory.deletedAt))),
    db.select({ c: count() }).from(patientPregnancies).where(and(eq(patientPregnancies.patientId, patientId), isNull(patientPregnancies.deletedAt))),
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
  };
}

function plural(n: number, noun: string) {
  if (n === 0) return 'None';
  return `${n} ${noun}${n !== 1 ? 's' : ''}`;
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { internalPatientId, getToken } = useAuth();
  const { showOfflineAlert } = useOfflineAlert();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Track whether a background full-record fetch has been attempted this session
  const hasBackgroundFetchedRef = useRef(false);

  // ── helpers ──────────────────────────────────────────────────────────────

  const reloadCounts = useCallback(() => {
    if (internalPatientId) {
      loadCounts(internalPatientId).then(setCounts).catch(console.error);
    }
  }, [internalPatientId]);

  /**
   * Fetches the full patient record from the backend and hydrates local SQLite.
   * Returns true if the fetch succeeded, false otherwise.
   */
  const fetchAndHydrateFullRecord = useCallback(async (): Promise<boolean> => {
    if (!internalPatientId) return false;
    const res = await syncFullProfile(internalPatientId, getToken);
    return res.success;
  }, [internalPatientId, getToken]);

  // Keep counts in sync on navigation focus and whenever a background sync completes
  useProfileSync(reloadCounts);

  // ── initial mount: load local counts + background full-record fetch ───────

  useEffect(() => {
    reloadCounts();

    // Background full-record fetch — runs once per session when the screen
    // is first mounted. Does NOT block the UI; counts are refreshed afterward.
    if (!hasBackgroundFetchedRef.current) {
      hasBackgroundFetchedRef.current = true;
      NetInfo.fetch().then(async (state) => {
        if (state.isConnected) {
          const ok = await fetchAndHydrateFullRecord();
          if (ok) reloadCounts();
        }
      }).catch(() => { /* offline or error — silent */ });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── pull-to-refresh ────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const state = await NetInfo.fetch();
      if (!state.isConnected) {
        showOfflineAlert(
          'You\'re Offline',
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

  // ── render ────────────────────────────────────────────────────────────────

  const c = counts;
  const { colors, spacing } = useAppTheme();
  const { bottom: tabBarBottom } = useContentInsets();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { padding: spacing.lg, paddingBottom: tabBarBottom, gap: spacing.xs }]}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
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
      </SettingsSection>

      <SettingsSection title="Specialized Care">
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {},
});