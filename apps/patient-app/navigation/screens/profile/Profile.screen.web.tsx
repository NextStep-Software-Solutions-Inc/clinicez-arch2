import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Pressable,
  TextInput,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
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
import ThemedText from '@ui/ThemedText';
import { useAuth } from 'contexts/AuthContext';
import { useOfflineAlert } from 'contexts/OfflineAlertContext';
import { getPatientFullRecord } from 'services/api/patientApi';
import { hydrateFullRecord } from '@db/hydrate';

interface ProfileCategoryItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  screen: string;
  section: 'identity' | 'medical' | 'clinical';
  countKey?: keyof Counts;
}

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

const CATEGORIES: ProfileCategoryItem[] = [
  // Section: Identity & Contacts
  {
    id: 'demographics',
    title: 'Personal Demographics',
    subtitle: 'Name, date of birth, biological sex, civil status',
    icon: '👤',
    screen: 'PersonalDemographicsScreen',
    section: 'identity',
  },
  {
    id: 'government-ids',
    title: 'Government & Insurance IDs',
    subtitle: 'PhilHealth PIN, SSS, GSIS, HMO memberships',
    icon: '🪪',
    screen: 'GovernmentIdsScreen',
    section: 'identity',
  },
  {
    id: 'contact',
    title: 'Contact Information',
    subtitle: 'Primary mobile, email, messenger addresses',
    icon: '📞',
    screen: 'ContactInfoScreen',
    section: 'identity',
  },
  {
    id: 'addresses',
    title: 'Addresses',
    subtitle: 'Permanent and secondary residential addresses',
    icon: '📍',
    screen: 'AddressesScreen',
    section: 'identity',
    countKey: 'addresses',
  },
  {
    id: 'emergency',
    title: 'Emergency Contacts',
    subtitle: 'Primary & secondary designated contacts',
    icon: '🚨',
    screen: 'EmergencyContactsScreen',
    section: 'identity',
    countKey: 'emergency',
  },
  {
    id: 'providers',
    title: 'Healthcare Providers',
    subtitle: 'Primary care physicians & assigned clinics',
    icon: '👨‍⚕️',
    screen: 'HealthcareProvidersScreen',
    section: 'identity',
    countKey: 'providers',
  },

  // Section: Medical Background
  {
    id: 'allergies',
    title: 'Allergies & Sensitivities',
    subtitle: 'Drug, food, and environmental allergies',
    icon: '⚠️',
    screen: 'AllergiesScreen',
    section: 'medical',
    countKey: 'allergies',
  },
  {
    id: 'medications',
    title: 'Current Medications',
    subtitle: 'Ongoing maintenance & self-reported medications',
    icon: '💊',
    screen: 'MedicationsScreen',
    section: 'medical',
    countKey: 'medications',
  },
  {
    id: 'surgical-history',
    title: 'Surgical History',
    subtitle: 'Prior surgeries, dates, and procedures',
    icon: '🩺',
    screen: 'SurgicalHistoryScreen',
    section: 'medical',
    countKey: 'surgeries',
  },
  {
    id: 'past-illnesses',
    title: 'Past Illnesses',
    subtitle: 'Resolved conditions, hospitalizations, childhood illnesses',
    icon: '🩹',
    screen: 'PastIllnessesScreen',
    section: 'medical',
    countKey: 'illnesses',
  },
  {
    id: 'chronic-conditions',
    title: 'Chronic Conditions',
    subtitle: 'Hypertension, Diabetes, Asthma, ongoing diagnoses',
    icon: '📊',
    screen: 'ChronicConditionsScreen',
    section: 'medical',
    countKey: 'chronic',
  },
  {
    id: 'disabilities',
    title: 'Disabilities & Special Needs',
    subtitle: 'Physical, sensory, or developmental support',
    icon: '♿',
    screen: 'DisabilitiesScreen',
    section: 'medical',
    countKey: 'disabilities',
  },
  {
    id: 'immunizations-self',
    title: 'Immunizations (Self-Reported)',
    subtitle: 'Vaccine history provided by patient',
    icon: '💉',
    screen: 'ImmunizationsSelfScreen',
    section: 'medical',
    countKey: 'immunizations',
  },
  {
    id: 'family-history',
    title: 'Family Health History',
    subtitle: 'Hereditary conditions across direct relatives',
    icon: '🧬',
    screen: 'FamilyHistoryScreen',
    section: 'medical',
    countKey: 'family',
  },
  {
    id: 'social-history',
    title: 'Social & Lifestyle History',
    subtitle: 'Smoking, alcohol, diet, physical activity',
    icon: '🥗',
    screen: 'SocialHistoryScreen',
    section: 'medical',
  },
  {
    id: 'occupation',
    title: 'Occupational Health',
    subtitle: 'Work hazards, industry, employment classification',
    icon: '💼',
    screen: 'OccupationScreen',
    section: 'medical',
  },
  {
    id: 'travel-history',
    title: 'Travel History',
    subtitle: 'Recent domestic and international trips',
    icon: '✈️',
    screen: 'TravelHistoryScreen',
    section: 'medical',
    countKey: 'travel',
  },
  {
    id: 'obstetric',
    title: 'Obstetric Profile',
    subtitle: 'Pregnancies, deliveries, maternal health history',
    icon: '🤰',
    screen: 'ObstetricProfileScreen',
    section: 'medical',
    countKey: 'pregnancies',
  },
  {
    id: 'male-reproductive',
    title: 'Male Reproductive Health',
    subtitle: 'Prostate, reproductive wellness, screenings',
    icon: '♂️',
    screen: 'MaleReproductiveScreen',
    section: 'medical',
  },
  {
    id: 'dental-vision',
    title: 'Dental & Vision Profile',
    subtitle: 'Last dental exam, dentures, glasses / contacts',
    icon: '👁️',
    screen: 'DentalVisionScreen',
    section: 'medical',
  },
  {
    id: 'mental-health',
    title: 'Mental Health History',
    subtitle: 'Therapy, screenings, emotional wellness support',
    icon: '🧠',
    screen: 'MentalHealthScreen',
    section: 'medical',
  },

  // Section: Clinical Records (Read-only verified)
  {
    id: 'vitals',
    title: 'Vital Signs',
    subtitle: 'Blood pressure, heart rate, temperature, BMI history',
    icon: '💓',
    screen: 'VitalSignsScreen',
    section: 'clinical',
    countKey: 'vitals',
  },
  {
    id: 'consultations',
    title: 'Consultations',
    subtitle: 'Clinical notes & encounter summaries from doctors',
    icon: '📋',
    screen: 'ConsultationsScreen',
    section: 'clinical',
    countKey: 'consults',
  },
  {
    id: 'prescriptions',
    title: 'Prescriptions & e-Rx',
    subtitle: 'Active digital prescriptions with UPSC QR verification',
    icon: '💊',
    screen: 'PrescriptionsScreen',
    section: 'clinical',
    countKey: 'rxs',
  },
  {
    id: 'lab-results',
    title: 'Laboratory Results',
    subtitle: 'Blood work, urinalysis, pathology findings',
    icon: '🧪',
    screen: 'LabResultsScreen',
    section: 'clinical',
    countKey: 'labs',
  },
  {
    id: 'imaging-results',
    title: 'Imaging & Radiology',
    subtitle: 'X-rays, ultrasounds, CT scans, MRIs',
    icon: '🩻',
    screen: 'ImagingResultsScreen',
    section: 'clinical',
    countKey: 'imaging',
  },
  {
    id: 'vaccinations-admin',
    title: 'Administered Vaccinations',
    subtitle: 'Clinic-administered vaccines with lot numbers & batch',
    icon: '🛡️',
    screen: 'VaccinationsAdministeredScreen',
    section: 'clinical',
    countKey: 'vaccinations',
  },
  {
    id: 'clinical-assessments',
    title: 'Clinical Assessments',
    subtitle: 'Formal diagnoses and physician evaluations',
    icon: '🔬',
    screen: 'ClinicalAssessmentsScreen',
    section: 'clinical',
    countKey: 'assessments',
  },
  {
    id: 'physical-exam',
    title: 'Physical Examination',
    subtitle: 'HEENT, cardiovascular, respiratory findings',
    icon: '🩺',
    screen: 'PhysicalExamScreen',
    section: 'clinical',
    countKey: 'physicalExams',
  },
  {
    id: 'ncd-questionnaire',
    title: 'NCD Risk Assessment',
    subtitle: 'PhilHealth non-communicable disease questionnaire',
    icon: '📝',
    screen: 'NcdQuestionnaireScreen',
    section: 'clinical',
    countKey: 'ncdQuestionnaires',
  },
];

async function loadCounts(): Promise<Counts> {
  const [
    addressCount,
    emergencyCount,
    providerCount,
    allergyCount,
    medicationCount,
    surgeryCount,
    illnessCount,
    chronicCount,
    disabilityCount,
    immunizationCount,
    familyCount,
    travelCount,
    pregnancyCount,
    vitalCount,
    consultCount,
    rxCount,
    labCount,
    imagingCount,
    vaccinationCount,
    assessmentCount,
    physicalExamCount,
    ncdQuestionnaireCount,
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
  const { colors, dark: isDark } = useTheme();
  const navigation = useNavigation<any>();
  const { internalPatientId, getToken } = useAuth();
  const { showOfflineAlert } = useOfflineAlert();
  const { width } = useWindowDimensions();

  const [counts, setCounts] = useState<Counts | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<'all' | 'identity' | 'medical' | 'clinical'>('all');
  const hasBackgroundFetchedRef = useRef(false);

  const isDesktop = width >= 1024;
  const isTablet = width >= 680 && width < 1024;

  const reloadCounts = useCallback(() => {
    loadCounts().then(setCounts).catch(console.error);
  }, []);

  const fetchAndHydrateFullRecord = useCallback(async (): Promise<boolean> => {
    if (!internalPatientId) return false;
    try {
      const record = await getPatientFullRecord(getToken, internalPatientId);
      await hydrateFullRecord(record);
      return true;
    } catch (err) {
      console.warn('[ProfileScreenWeb] Failed to fetch full record:', err);
      return false;
    }
  }, [internalPatientId, getToken]);

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

  useEffect(() => {
    const unsub = navigation.addListener('focus', reloadCounts);
    return unsub;
  }, [navigation, reloadCounts]);

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

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        {/* Profile Card Summary */}
        <ProfileCard />

        {/* Header Title & Controls */}
        <View style={styles.headerRow}>
          <View>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
              Medical Profile & Health Records
            </ThemedText>
            <ThemedText style={[styles.sectionSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Review your complete health background, verified clinical results, and personal demographics.
            </ThemedText>
          </View>

          <Pressable
            onPress={handleRefresh}
            disabled={isRefreshing}
            style={({ pressed }) => [
              styles.syncButton,
              { borderColor: isDark ? '#334155' : '#CBD5E1' },
              pressed && { opacity: 0.7 },
            ]}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <ThemedText style={styles.syncButtonText}>🔄 Sync Server</ThemedText>
            )}
          </Pressable>
        </View>

        {/* Filter Tabs & Search Bar */}
        <View style={styles.controlsRow}>
          <View style={styles.tabsRow}>
            {(['all', 'identity', 'medical', 'clinical'] as const).map((sec) => {
              const isActive = selectedSection === sec;
              const label =
                sec === 'all'
                  ? 'All Records (28)'
                  : sec === 'identity'
                    ? 'Identity & Contacts'
                    : sec === 'medical'
                      ? 'Medical Background'
                      : 'Clinical Records';

              return (
                <Pressable
                  key={sec}
                  onPress={() => setSelectedSection(sec)}
                  style={({ pressed }) => [
                    styles.tabButton,
                    isActive && styles.tabButtonActive,
                    { borderColor: isDark ? '#334155' : '#E2E8F0' },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.tabButtonText,
                      isActive ? styles.tabButtonTextActive : { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                  >
                    {label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.searchBox, { borderColor: isDark ? '#334155' : '#CBD5E1' }]}>
            <ThemedText style={{ fontSize: 16 }}>🔍</ThemedText>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search medical categories..."
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <ThemedText style={{ color: '#94A3B8', fontWeight: '700' }}>✕</ThemedText>
              </Pressable>
            )}
          </View>
        </View>

        {/* Categories Responsive Grid */}
        <View
          style={[
            styles.grid,
            isDesktop
              ? styles.grid3Col
              : isTablet
                ? styles.grid2Col
                : styles.grid1Col,
          ]}
        >
          {filteredCategories.map((cat) => {
            const countValue = cat.countKey && counts ? counts[cat.countKey] : null;

            return (
              <Pressable
                key={cat.id}
                onPress={() => navigation.navigate('Main', { screen: cat.screen })}
                style={({ pressed }) => [
                  styles.categoryCard,
                  {
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                    borderColor: isDark ? '#334155' : '#E2E8F0',
                  },
                  pressed && { opacity: 0.82, transform: [{ scale: 0.99 }] },
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardIconCircle}>
                    <ThemedText style={{ fontSize: 22 }}>{cat.icon}</ThemedText>
                  </View>
                  {countValue !== null ? (
                    <View
                      style={[
                        styles.countBadge,
                        {
                          backgroundColor:
                            countValue > 0 ? 'rgba(59, 130, 246, 0.12)' : isDark ? '#334155' : '#F1F5F9',
                        },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.countBadgeText,
                          { color: countValue > 0 ? '#3B82F6' : isDark ? '#94A3B8' : '#64748B' },
                        ]}
                      >
                        {countValue} {countValue === 1 ? 'record' : 'records'}
                      </ThemedText>
                    </View>
                  ) : (
                    <ThemedText style={styles.openArrow}>→</ThemedText>
                  )}
                </View>

                <View style={styles.cardContent}>
                  <ThemedText style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                    {cat.title}
                  </ThemedText>
                  <ThemedText
                    style={[styles.cardSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}
                    numberOfLines={2}
                  >
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
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  container: {
    maxWidth: 1280,
    width: '100%',
    marginHorizontal: 'auto',
    gap: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    fontSize: 14,
    marginTop: 4,
    maxWidth: 640,
  },
  syncButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  syncButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  tabButton: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tabButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 260,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  grid3Col: {
    // 3 cards per row: each gets ~32%
  },
  grid2Col: {
    // 2 cards per row
  },
  grid1Col: {
    // 1 card per row
  },
  categoryCard: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 280,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  openArrow: {
    fontSize: 18,
    color: '#94A3B8',
  },
  cardContent: {
    gap: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
});
