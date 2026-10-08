import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
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
  patients,
} from '@db/schema/index';
import { isNull, count, eq } from 'drizzle-orm';
import ThemedText from '@ui/ThemedText';
import { AppIcon, type IconName } from '@ui/Icon';
import { Avatar, ProgressBar } from '@ui/Primitives';
import Badge from '@ui/Badge';
import { useAppTheme } from 'contexts/ThemeContext';
import { useBreakpoint } from 'hooks/useBreakpoint';
import { useAuth } from 'contexts/AuthContext';
import { useUser } from '@clerk/expo';
import { useOfflineAlert } from 'contexts/OfflineAlertContext';
import { getPatientFullRecord } from 'services/api/patientApi';
import { hydrateFullRecord } from '@db/hydrate';
import { syncPendingProfileWrites } from 'services/api/syncService';

export type ProfileSectionGroup = 'personal' | 'medical' | 'clinical' | 'settings';

export interface ProfileCategoryItem {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  screen: string;
  section: ProfileSectionGroup;
  countKey?: keyof Counts;
}

export type Counts = {
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

const CATEGORIES: ProfileCategoryItem[] = [
  // ── Personal & Contacts ──────────────────────────────────────────
  {
    id: 'demographics',
    title: 'Personal Demographics',
    subtitle: 'Name, date of birth, biological sex, civil status',
    icon: 'user',
    screen: 'PersonalDemographicsScreen',
    section: 'personal',
  },
  {
    id: 'government-ids',
    title: 'Government & Insurance IDs',
    subtitle: 'PhilHealth PIN, SSS, GSIS, HMO memberships',
    icon: 'badge',
    screen: 'GovernmentIdsScreen',
    section: 'personal',
  },
  {
    id: 'contact',
    title: 'Contact Information',
    subtitle: 'Primary mobile, email, messenger addresses',
    icon: 'phone',
    screen: 'ContactInfoScreen',
    section: 'personal',
  },
  {
    id: 'addresses',
    title: 'Addresses',
    subtitle: 'Permanent and secondary residential addresses',
    icon: 'location',
    screen: 'AddressesScreen',
    section: 'personal',
    countKey: 'addresses',
  },
  {
    id: 'emergency',
    title: 'Emergency Contacts',
    subtitle: 'Primary & secondary designated contacts',
    icon: 'emergencyContact',
    screen: 'EmergencyContactsScreen',
    section: 'personal',
    countKey: 'emergency',
  },
  {
    id: 'providers',
    title: 'Healthcare Providers',
    subtitle: 'Primary care physicians & assigned clinics',
    icon: 'stethoscope',
    screen: 'HealthcareProvidersScreen',
    section: 'personal',
    countKey: 'providers',
  },

  // ── Medical Background & Lifestyle ──────────────────────────────
  {
    id: 'allergies',
    title: 'Allergies & Sensitivities',
    subtitle: 'Drug, food, and environmental allergies',
    icon: 'warning',
    screen: 'AllergiesScreen',
    section: 'medical',
    countKey: 'allergies',
  },
  {
    id: 'medications',
    title: 'Current Medications',
    subtitle: 'Ongoing maintenance & self-reported medications',
    icon: 'pill',
    screen: 'MedicationsScreen',
    section: 'medical',
    countKey: 'medications',
  },
  {
    id: 'surgical-history',
    title: 'Surgical History',
    subtitle: 'Prior surgeries, dates, and procedures',
    icon: 'scissors',
    screen: 'SurgicalHistoryScreen',
    section: 'medical',
    countKey: 'surgeries',
  },
  {
    id: 'past-illnesses',
    title: 'Past Illnesses',
    subtitle: 'Resolved conditions, hospitalizations, childhood illnesses',
    icon: 'activity',
    screen: 'PastIllnessesScreen',
    section: 'medical',
    countKey: 'illnesses',
  },
  {
    id: 'chronic-conditions',
    title: 'Chronic Conditions',
    subtitle: 'Hypertension, Diabetes, Asthma, ongoing diagnoses',
    icon: 'heartPulse',
    screen: 'ChronicConditionsScreen',
    section: 'medical',
    countKey: 'chronic',
  },
  {
    id: 'disabilities',
    title: 'Disabilities & Special Needs',
    subtitle: 'Physical, sensory, or developmental support',
    icon: 'accessibility',
    screen: 'DisabilitiesScreen',
    section: 'medical',
    countKey: 'disabilities',
  },
  {
    id: 'immunizations-self',
    title: 'Immunizations (Self-Reported)',
    subtitle: 'Vaccine history provided by patient',
    icon: 'syringe',
    screen: 'ImmunizationsSelfScreen',
    section: 'medical',
    countKey: 'immunizations',
  },
  {
    id: 'family-history',
    title: 'Family Health History',
    subtitle: 'Hereditary conditions across direct relatives',
    icon: 'family',
    screen: 'FamilyHistoryScreen',
    section: 'medical',
    countKey: 'family',
  },
  {
    id: 'social-history',
    title: 'Social & Lifestyle History',
    subtitle: 'Smoking, alcohol, diet, physical activity',
    icon: 'wellness',
    screen: 'SocialHistoryScreen',
    section: 'medical',
  },
  {
    id: 'occupation',
    title: 'Occupational Health',
    subtitle: 'Work hazards, industry, employment classification',
    icon: 'briefcase',
    screen: 'OccupationScreen',
    section: 'medical',
  },
  {
    id: 'travel-history',
    title: 'Travel History',
    subtitle: 'Recent domestic and international trips',
    icon: 'flight',
    screen: 'TravelHistoryScreen',
    section: 'medical',
    countKey: 'travel',
  },
  {
    id: 'obstetric',
    title: 'Obstetric Profile',
    subtitle: 'Pregnancies, deliveries, maternal health history',
    icon: 'heartPulse',
    screen: 'ObstetricProfileScreen',
    section: 'medical',
    countKey: 'pregnancies',
  },
  {
    id: 'male-reproductive',
    title: 'Male Reproductive Health',
    subtitle: 'Prostate, reproductive wellness, screenings',
    icon: 'user',
    screen: 'MaleReproductiveScreen',
    section: 'medical',
  },
  {
    id: 'dental-vision',
    title: 'Dental & Vision Profile',
    subtitle: 'Last dental exam, dentures, glasses / contacts',
    icon: 'vision',
    screen: 'DentalVisionScreen',
    section: 'medical',
  },
  {
    id: 'mental-health',
    title: 'Mental Health History',
    subtitle: 'Therapy, screenings, emotional wellness support',
    icon: 'brain',
    screen: 'MentalHealthScreen',
    section: 'medical',
  },

  // ── Clinical Records ─────────────────────────────────────────────
  {
    id: 'vitals',
    title: 'Vital Signs',
    subtitle: 'Blood pressure, heart rate, temperature, BMI history',
    icon: 'heartPulse',
    screen: 'VitalSignsScreen',
    section: 'clinical',
    countKey: 'vitals',
  },
  {
    id: 'consultations',
    title: 'Consultations',
    subtitle: 'Clinical notes & encounter summaries from doctors',
    icon: 'chat',
    screen: 'ConsultationsScreen',
    section: 'clinical',
    countKey: 'consults',
  },
  {
    id: 'prescriptions',
    title: 'Prescriptions & e-Rx',
    subtitle: 'Active digital prescriptions with UPSC QR verification',
    icon: 'pill',
    screen: 'PrescriptionsScreen',
    section: 'clinical',
    countKey: 'rxs',
  },
  {
    id: 'lab-results',
    title: 'Laboratory Results',
    subtitle: 'Blood work, urinalysis, pathology findings',
    icon: 'lab',
    screen: 'LabResultsScreen',
    section: 'clinical',
    countKey: 'labs',
  },
  {
    id: 'imaging-results',
    title: 'Imaging & Radiology',
    subtitle: 'X-rays, ultrasounds, CT scans, MRIs',
    icon: 'image',
    screen: 'ImagingResultsScreen',
    section: 'clinical',
    countKey: 'imaging',
  },
  {
    id: 'vaccinations-admin',
    title: 'Administered Vaccinations',
    subtitle: 'Clinic-administered vaccines with lot numbers & batch',
    icon: 'shield',
    screen: 'VaccinationsAdministeredScreen',
    section: 'clinical',
    countKey: 'vaccinations',
  },
  {
    id: 'clinical-assessments',
    title: 'Clinical Assessments',
    subtitle: 'Formal diagnoses and physician evaluations',
    icon: 'clipboard',
    screen: 'ClinicalAssessmentsScreen',
    section: 'clinical',
    countKey: 'assessments',
  },
  {
    id: 'physical-exam',
    title: 'Physical Examination',
    subtitle: 'HEENT, cardiovascular, respiratory findings',
    icon: 'monitor',
    screen: 'PhysicalExamScreen',
    section: 'clinical',
    countKey: 'physicalExams',
  },
  {
    id: 'ncd-questionnaire',
    title: 'NCD Risk Assessment',
    subtitle: 'PhilHealth non-communicable disease questionnaire',
    icon: 'checklist',
    screen: 'NcdQuestionnaireScreen',
    section: 'clinical',
    countKey: 'ncdQuestionnaires',
  },

  // ── Settings Shortcuts ───────────────────────────────────────────
  {
    id: 'settings-appearance',
    title: 'Appearance',
    subtitle: 'Light, dark, or system matching theme',
    icon: 'eye',
    screen: 'AppearanceSettingsScreen',
    section: 'settings',
  },
  {
    id: 'settings-security',
    title: 'Security & App Lock',
    subtitle: 'PIN management and session locking',
    icon: 'lock',
    screen: 'SecuritySettingsScreen',
    section: 'settings',
  },
  {
    id: 'settings-notifications',
    title: 'Notification Preferences',
    subtitle: 'Appointment reminders, clinical updates',
    icon: 'notifications',
    screen: 'NotificationsSettingsScreen',
    section: 'settings',
  },
  {
    id: 'settings-about',
    title: 'About ClinicEz',
    subtitle: 'App version, licensing, legal information',
    icon: 'info',
    screen: 'AboutSettingsScreen',
    section: 'settings',
  },
];

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

export default function ProfileScreenWeb() {
  const { colors, radii, spacing, sizes, shadows } = useAppTheme();
  const { isWorkstation, isWide } = useBreakpoint();
  const navigation = useNavigation<any>();
  const { internalPatientId, getToken } = useAuth();
  const { user } = useUser();
  const { showOfflineAlert } = useOfflineAlert();

  const [counts, setCounts] = useState<Counts | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<'all' | ProfileSectionGroup>('all');
  const [patientRecord, setPatientRecord] = useState<{ firstName?: string | null; lastName?: string | null } | null>(null);
  const hasBackgroundFetchedRef = useRef(false);

  const loadPatientRecord = useCallback(async () => {
    if (!internalPatientId) return;
    try {
      const p = await db.query.patients.findFirst({
        where: eq(patients.id, internalPatientId),
      });
      if (p) {
        setPatientRecord({ firstName: p.firstName, lastName: p.lastName });
      }
    } catch (err) {
      console.warn('[ProfileScreenWeb] Failed to load patient record:', err);
    }
  }, [internalPatientId]);

  const localDbName = [patientRecord?.firstName, patientRecord?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() || null;

  const clerkName = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();

  const displayName =
    clerkName ||
    localDbName ||
    user?.primaryEmailAddress?.emailAddress ||
    'Patient';

  const reloadCounts = useCallback(() => {
    loadCounts().then(setCounts).catch(console.error);
  }, []);

  const fetchAndHydrateFullRecord = useCallback(async (): Promise<boolean> => {
    if (!internalPatientId) return false;
    try {
      await syncPendingProfileWrites(internalPatientId, getToken).catch((err) => {
        console.warn('[ProfileScreenWeb] Sync pending writes before hydration failed:', err);
      });
      const record = await getPatientFullRecord(getToken, internalPatientId);
      await hydrateFullRecord(record);
      await loadPatientRecord();
      return true;
    } catch (err) {
      console.warn('[ProfileScreenWeb] Failed to fetch full record:', err);
      return false;
    }
  }, [internalPatientId, getToken, loadPatientRecord]);

  useEffect(() => {
    reloadCounts();
    loadPatientRecord();
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
  }, [fetchAndHydrateFullRecord, reloadCounts, loadPatientRecord]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      reloadCounts();
      loadPatientRecord();
    });
    return unsub;
  }, [navigation, reloadCounts, loadPatientRecord]);

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

  // Profile completeness score (0..1)
  const completeness = useMemo(() => {
    if (!counts) return 0.35;
    const personalKeys: (keyof Counts)[] = [
      'addresses',
      'emergency',
      'providers',
      'allergies',
      'medications',
      'chronic',
      'immunizations',
    ];
    let filled = 1; // 1 for account/name
    personalKeys.forEach((k) => {
      if (counts[k] > 0) filled += 1;
    });
    return Math.min(1, Math.max(0.2, filled / (personalKeys.length + 1)));
  }, [counts]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return CATEGORIES.filter((cat) => {
      const matchesSection = selectedSection === 'all' || cat.section === selectedSection;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        cat.title.toLowerCase().includes(query) ||
        cat.subtitle.toLowerCase().includes(query);
      return matchesSection && matchesSearch;
    });
  }, [selectedSection, searchQuery]);

  // Responsive card column basis: 3 col on >= 1280, 2 col on >= 768, 1 col compact
  const cardWidthStyle = isWide
    ? { width: '31.8%' as const }
    : isWorkstation
      ? { width: '48.5%' as const }
      : { width: '100%' as const };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingVertical: spacing['2xl'],
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing['4xl'],
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.container, { maxWidth: sizes.contentMaxWidth, gap: spacing['2xl'] }]}>
        {/* Header Overview Card */}
        <View
          style={[
            styles.headerCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radii.xl,
              padding: spacing['2xl'],
            },
            shadows.sm,
          ]}
        >
          <View style={[styles.headerCardTop, { gap: spacing.lg }]}>
            <Avatar name={displayName} size="lg" />

            <View style={styles.headerInfo}>
              <View style={[styles.nameRow, { gap: spacing.md }]}>
                <ThemedText variant="h1" numberOfLines={1}>
                  {displayName}
                </ThemedText>
                <Badge
                  tone="primary"
                  label={`ID: ${internalPatientId ? internalPatientId.slice(0, 8) + '...' : 'Verified'}`}
                  size="sm"
                />
              </View>

              <ThemedText variant="small" color="textMuted">
                Patient Account • Clinical Record & Medical Health Overview
              </ThemedText>
            </View>

            <Pressable
              onPress={handleRefresh}
              disabled={isRefreshing}
              style={({ pressed, hovered }: any) => [
                styles.syncBtn,
                {
                  borderColor: hovered ? colors.primaryBorder : colors.border,
                  backgroundColor: pressed || hovered ? colors.surfaceMuted : colors.surfaceSubtle,
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  gap: spacing.sm,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sync profile from server"
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <AppIcon name="sync" size={sizes.iconSm} color="primary" />
                  <ThemedText variant="smallBold" color="primary">
                    Sync Server
                  </ThemedText>
                </>
              )}
            </Pressable>
          </View>

          {/* Completeness bar */}
          <View style={[styles.completenessSection, { marginTop: spacing.xl, gap: spacing.xs }]}>
            <View style={styles.completenessRow}>
              <ThemedText variant="smallBold">Profile Completeness</ThemedText>
              <ThemedText variant="smallBold" color="primary">
                {Math.round(completeness * 100)}%
              </ThemedText>
            </View>
            <ProgressBar value={completeness} tone="primary" />
          </View>
        </View>

        {/* Filter Controls & Search */}
        <View style={[styles.controlsRow, { gap: spacing.md }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.tabsScrollContent, { gap: spacing.sm }]}
            style={styles.tabsScrollView}
          >
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'personal', label: 'Personal' },
                { id: 'medical', label: 'Medical History' },
                { id: 'clinical', label: 'Clinical Records' },
                { id: 'settings', label: 'Settings' },
              ] as const
            ).map((tab) => {
              const isActive = selectedSection === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setSelectedSection(tab.id)}
                  style={({ pressed, hovered }: any) => [
                    styles.tabButton,
                    {
                      borderRadius: radii.full,
                      borderColor: isActive
                        ? colors.primary
                        : hovered
                          ? colors.borderDark
                          : colors.border,
                      backgroundColor: isActive
                        ? colors.primary
                        : pressed || hovered
                          ? colors.surfaceMuted
                          : colors.card,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.sm,
                    },
                  ]}
                  accessibilityRole="button"
                >
                  <ThemedText
                    variant="smallBold"
                    style={{ color: isActive ? colors.onPrimary : colors.textSecondary }}
                  >
                    {tab.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          <View
            style={[
              styles.searchBox,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                borderRadius: radii.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                gap: spacing.sm,
              },
            ]}
          >
            <AppIcon name="search" size={sizes.iconSm} color="textMuted" />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search profile sections..."
              placeholderTextColor={colors.textMuted}
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => setSearchQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <AppIcon name="close" size={sizes.iconSm} color="textMuted" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Section Cards Responsive Grid */}
        <View style={[styles.grid, { gap: spacing.lg }]}>
          {filteredCategories.map((cat) => {
            const countValue = cat.countKey && counts ? counts[cat.countKey] : null;

            return (
              <Pressable
                key={cat.id}
                onPress={() => navigation.navigate('Main', { screen: cat.screen })}
                style={({ pressed, hovered }: any) => [
                  styles.categoryCard,
                  cardWidthStyle,
                  {
                    backgroundColor: colors.card,
                    borderColor: hovered ? colors.primaryBorder : colors.border,
                    borderRadius: radii.lg,
                    padding: spacing.xl,
                    gap: spacing.md,
                  },
                  shadows.sm,
                  (pressed || hovered) && {
                    backgroundColor: hovered ? colors.surfaceMuted : colors.card,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${cat.title}: ${cat.subtitle}`}
              >
                <View style={styles.cardTop}>
                  <View
                    style={[
                      styles.cardIconCircle,
                      {
                        width: sizes.controlLg,
                        height: sizes.controlLg,
                        borderRadius: radii.md,
                        backgroundColor: colors.primaryLight,
                      },
                    ]}
                  >
                    <AppIcon name={cat.icon} size={sizes.iconMd} color="primary" />
                  </View>

                  {countValue !== null ? (
                    <Badge
                      tone={countValue > 0 ? 'primary' : 'neutral'}
                      label={`${countValue} ${countValue === 1 ? 'record' : 'records'}`}
                      size="sm"
                    />
                  ) : (
                    <AppIcon name="forward" size={sizes.iconSm} color="textLight" />
                  )}
                </View>

                <View style={[styles.cardContent, { gap: spacing.xs }]}>
                  <ThemedText variant="bodyBold" numberOfLines={1}>
                    {cat.title}
                  </ThemedText>
                  <ThemedText variant="small" color="textMuted" numberOfLines={2}>
                    {cat.subtitle}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
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
  headerCard: {
    borderWidth: 1,
  },
  headerCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  headerInfo: {
    flex: 1,
    minWidth: 240,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  completenessSection: {
    width: '100%',
  },
  completenessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tabsScrollView: {
    flexGrow: 0,
    maxWidth: '100%',
  },
  tabsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  tabButton: {
    borderWidth: 1,
    flexShrink: 0,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minWidth: 260,
    flex: 1,
    maxWidth: 360,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    borderWidth: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  categoryCard: {
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 280,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardIconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
  },
});
