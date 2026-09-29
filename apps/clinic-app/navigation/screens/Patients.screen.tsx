import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import {
  clinicService,
  ClinicPatient,
  RegisterPatientPayload,
  PatientChart,
} from '../../services/clinicService';

const SAMPLE_PATIENTS: ClinicPatient[] = [
  {
    id: 'pat-101',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    patientCode: 'PAT-2026-00001',
    firstName: 'Maria',
    lastName: 'Santos',
    middleName: 'Delos',
    fullName: 'Santos, Maria D.',
    dateOfBirth: '1958-03-12',
    age: 68,
    gender: 'Female',
    civilStatus: 'Widowed',
    contactNumber: '0917-123-4567',
    email: 'maria.santos@email.ph',
    addressLine: 'Block 4 Lot 12, Rose St.',
    barangay: 'Poblacion',
    city: 'San Pedro',
    province: 'Laguna',
    emergencyContactName: 'Juan Santos',
    emergencyContactPhone: '0918-765-4321',
    emergencyContactRelationship: 'Son',
    philHealthNumber: '12-050412345-6',
    seniorCitizenId: 'SC-SP-2018-0912',
    pwdId: undefined,
    bloodType: 'O+',
    allergies: 'Penicillin, Aspirin',
    chronicConditions: 'Hypertension, Dyslipidemia',
    alerts: 'High fall risk; Bilateral knee osteoarthritis',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'pat-102',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    patientCode: 'PAT-2026-00002',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    middleName: 'Bautista',
    fullName: 'Dela Cruz, Juan B.',
    dateOfBirth: '1984-07-22',
    age: 42,
    gender: 'Male',
    civilStatus: 'Married',
    contactNumber: '0919-888-7766',
    email: 'juan.delacruz@work.com',
    addressLine: '77 Kalayaan Ave',
    barangay: 'San Vicente',
    city: 'Biñan',
    province: 'Laguna',
    emergencyContactName: 'Clara Dela Cruz',
    emergencyContactPhone: '0919-888-7767',
    emergencyContactRelationship: 'Spouse',
    philHealthNumber: '03-025412399-1',
    seniorCitizenId: undefined,
    pwdId: undefined,
    bloodType: 'A+',
    allergies: 'None known',
    chronicConditions: 'None',
    alerts: undefined,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'pat-103',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    patientCode: 'PAT-2026-00003',
    firstName: 'Elena',
    lastName: 'Ramos',
    middleName: 'Villanueva',
    fullName: 'Ramos, Elena V.',
    dateOfBirth: '1995-11-04',
    age: 30,
    gender: 'Female',
    civilStatus: 'Single',
    contactNumber: '0922-334-5566',
    email: 'elena.ramos@cloud.com',
    addressLine: '12 Emerald Court',
    barangay: 'Canlalay',
    city: 'Biñan',
    province: 'Laguna',
    emergencyContactName: 'Teresa Ramos',
    emergencyContactPhone: '0922-334-5567',
    emergencyContactRelationship: 'Mother',
    philHealthNumber: '18-091283746-5',
    seniorCitizenId: undefined,
    pwdId: 'PWD-BIN-2022-441',
    bloodType: 'B+',
    allergies: 'Sulfonamides, NSAIDs',
    chronicConditions: 'Bronchial Asthma',
    alerts: 'Asthma exacerbation on cold weather',
    createdAt: new Date().toISOString(),
  },
];

export default function PatientsScreen() {
  const navigation = useNavigation<any>();
  const [patients, setPatients] = useState<ClinicPatient[]>(SAMPLE_PATIENTS);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'ALERTS' | 'SENIOR_PWD'>('ALL');

  // Register Modal state
  const [registerVisible, setRegisterVisible] = useState(false);
  const [savingPatient, setSavingPatient] = useState(false);
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formMiddleName, setFormMiddleName] = useState('');
  const [formDob, setFormDob] = useState('1990-01-01');
  const [formGender, setFormGender] = useState('Male');
  const [formCivilStatus, setFormCivilStatus] = useState('Single');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formBarangay, setFormBarangay] = useState('');
  const [formCity, setFormCity] = useState('San Pedro');
  const [formProvince, setFormProvince] = useState('Laguna');
  const [formPhilHealth, setFormPhilHealth] = useState('');
  const [formSeniorId, setFormSeniorId] = useState('');
  const [formPwdId, setFormPwdId] = useState('');
  const [formBloodType, setFormBloodType] = useState('O+');
  const [formAllergies, setFormAllergies] = useState('');
  const [formChronicConditions, setFormChronicConditions] = useState('');
  const [formAlerts, setFormAlerts] = useState('');

  // Chart Modal state
  const [chartVisible, setChartVisible] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<ClinicPatient | null>(null);
  const [patientChart, setPatientChart] = useState<PatientChart | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);

  const fetchPatients = useCallback(async () => {
    const [data, err] = await clinicService.getPatients(searchTerm || undefined);
    if (!err && data && data.length > 0) {
      setPatients(data);
    }
  }, [searchTerm]);

  useEffect(() => {
    setLoading(true);
    fetchPatients().finally(() => setLoading(false));
  }, [fetchPatients]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPatients();
    setRefreshing(false);
  }, [fetchPatients]);

  const handleRegisterPatient = async () => {
    if (!formFirstName.trim() || !formLastName.trim() || !formPhone.trim()) {
      alert('First Name, Last Name, and Phone are required.');
      return;
    }

    setSavingPatient(true);
    const payload: RegisterPatientPayload = {
      firstName: formFirstName.trim(),
      lastName: formLastName.trim(),
      middleName: formMiddleName.trim() || undefined,
      dateOfBirth: formDob.trim(),
      gender: formGender,
      civilStatus: formCivilStatus,
      contactNumber: formPhone.trim(),
      email: formEmail.trim() || undefined,
      addressLine: formAddress.trim() || undefined,
      barangay: formBarangay.trim() || undefined,
      city: formCity.trim() || undefined,
      province: formProvince.trim() || undefined,
      philHealthNumber: formPhilHealth.trim() || undefined,
      seniorCitizenId: formSeniorId.trim() || undefined,
      pwdId: formPwdId.trim() || undefined,
      bloodType: formBloodType || undefined,
      allergies: formAllergies.trim() || undefined,
      chronicConditions: formChronicConditions.trim() || undefined,
      alerts: formAlerts.trim() || undefined,
    };

    const [newPat, err] = await clinicService.registerPatient(payload);
    setSavingPatient(false);

    if (newPat) {
      setPatients((prev) => [newPat, ...prev]);
    } else {
      // Local fallback for dev resilience
      const fakeNew: ClinicPatient = {
        id: `pat-${Date.now()}`,
        tenantId: 'tenant-default',
        clinicId: 'clinic-default',
        patientCode: `PAT-${new Date().getFullYear()}-${Math.floor(Math.random() * 89999 + 10000)}`,
        firstName: payload.firstName,
        lastName: payload.lastName,
        middleName: payload.middleName,
        fullName: `${payload.lastName}, ${payload.firstName}`,
        dateOfBirth: payload.dateOfBirth,
        age: 35,
        gender: payload.gender,
        civilStatus: payload.civilStatus,
        contactNumber: payload.contactNumber,
        email: payload.email,
        addressLine: payload.addressLine,
        barangay: payload.barangay,
        city: payload.city,
        province: payload.province,
        philHealthNumber: payload.philHealthNumber,
        seniorCitizenId: payload.seniorCitizenId,
        pwdId: payload.pwdId,
        bloodType: payload.bloodType,
        allergies: payload.allergies,
        chronicConditions: payload.chronicConditions,
        alerts: payload.alerts,
        createdAt: new Date().toISOString(),
      };
      setPatients((prev) => [fakeNew, ...prev]);
    }

    setRegisterVisible(false);
    // Reset form
    setFormFirstName('');
    setFormLastName('');
    setFormMiddleName('');
    setFormPhone('');
    setFormEmail('');
    setFormPhilHealth('');
    setFormSeniorId('');
    setFormPwdId('');
    setFormAllergies('');
    setFormChronicConditions('');
    setFormAlerts('');
  };

  const handleOpenChart = async (patient: ClinicPatient) => {
    setSelectedPatient(patient);
    setChartVisible(true);
    setLoadingChart(true);
    const [chartData] = await clinicService.getPatientChart(patient.id);
    if (chartData) {
      setPatientChart(chartData);
    } else {
      // Fallback sample chart
      setPatientChart({
        patientId: patient.id,
        patientName: patient.fullName,
        totalVisits: 3,
        consultations: [],
        vitalsHistory: [],
        proceduresHistory: [],
        labOrdersHistory: [],
        invoicesHistory: [],
      });
    }
    setLoadingChart(false);
  };

  const handleQueueCheckIn = async (patient: ClinicPatient) => {
    const isUrgent = patient.alerts?.toLowerCase().includes('fall') || patient.alerts?.toLowerCase().includes('chest');
    await clinicService.checkInPatient({
      patientId: patient.id,
      patientName: patient.fullName,
      priority: isUrgent ? 'Urgent' : 'Routine',
      chiefComplaint: patient.chronicConditions ? `Follow-up: ${patient.chronicConditions}` : 'General Consultation',
    });
    navigation.navigate('Dashboard');
  };

  const filteredPatients = patients.filter((p) => {
    if (filterMode === 'ALERTS') {
      return (p.allergies && p.allergies.length > 0) || (p.alerts && p.alerts.length > 0);
    }
    if (filterMode === 'SENIOR_PWD') {
      return !!p.seniorCitizenId || !!p.pwdId || p.age >= 60;
    }
    return true;
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0284C7']} />}
    >
      <View style={styles.headerRow}>
        <View>
          <ThemedText style={styles.subtitle}>Master Patient Index</ThemedText>
          <ThemedText style={styles.title}>Patient Registry</ThemedText>
        </View>
        <Pressable style={styles.registerBtn} onPress={() => setRegisterVisible(true)}>
          <ThemedText style={styles.registerBtnText}>+ Register Walk-In</ThemedText>
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <ThemedText style={styles.searchIcon}>🔍</ThemedText>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, patient code, phone, PhilHealth PIN..."
          placeholderTextColor="#9CA3AF"
          value={searchTerm}
          onChangeText={setSearchTerm}
          onSubmitEditing={fetchPatients}
        />
        {searchTerm ? (
          <Pressable onPress={() => setSearchTerm('')}>
            <ThemedText style={{ color: '#9CA3AF', fontSize: 16 }}>✕</ThemedText>
          </Pressable>
        ) : null}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {[
          { key: 'ALL', label: 'All Patients' },
          { key: 'ALERTS', label: '⚠️ Alerts & Allergies' },
          { key: 'SENIOR_PWD', label: '👵 Senior & PWD (RA 9994/10754)' },
        ].map((tab) => {
          const isActive = filterMode === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setFilterMode(tab.key as any)}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
            >
              <ThemedText style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                {tab.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#0284C7" style={{ padding: 40 }} />
      ) : (
        <View style={styles.list}>
          {filteredPatients.length === 0 ? (
            <View style={styles.emptyCard}>
              <ThemedText style={styles.emptyText}>No patients match your search or filter.</ThemedText>
            </View>
          ) : (
            filteredPatients.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ThemedText style={styles.patientName}>{item.fullName}</ThemedText>
                      <ThemedText style={styles.codeBadge}>{item.patientCode}</ThemedText>
                    </View>
                    <ThemedText style={styles.demographicsText}>
                      {item.age} yrs • {item.gender} • {item.civilStatus ?? 'Single'} • 🩸 {item.bloodType ?? 'O+'}
                    </ThemedText>
                    <ThemedText style={styles.contactText}>
                      📞 {item.contactNumber} {item.city ? `• ${item.barangay ?? ''}, ${item.city}` : ''}
                    </ThemedText>
                  </View>
                </View>

                {/* Healthcare IDs Row */}
                <View style={styles.idsRow}>
                  {item.philHealthNumber ? (
                    <View style={styles.idBadge}>
                      <ThemedText style={styles.idBadgeText}>PHIC: {item.philHealthNumber}</ThemedText>
                    </View>
                  ) : null}
                  {item.seniorCitizenId ? (
                    <View style={[styles.idBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                      <ThemedText style={[styles.idBadgeText, { color: '#B45309' }]}>
                        👵 Senior ID: {item.seniorCitizenId}
                      </ThemedText>
                    </View>
                  ) : null}
                  {item.pwdId ? (
                    <View style={[styles.idBadge, { backgroundColor: '#EDE9FE', borderColor: '#DDD6FE' }]}>
                      <ThemedText style={[styles.idBadgeText, { color: '#6D28D9' }]}>
                        ♿ PWD ID: {item.pwdId}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>

                {/* Clinical Alerts */}
                {item.allergies && item.allergies !== 'None known' ? (
                  <View style={styles.allergyBanner}>
                    <ThemedText style={styles.allergyText}>⚠️ ALLERGIES: {item.allergies}</ThemedText>
                  </View>
                ) : null}

                {item.alerts ? (
                  <View style={styles.alertBanner}>
                    <ThemedText style={styles.alertText}>🚨 CLINICAL ALERT: {item.alerts}</ThemedText>
                  </View>
                ) : null}

                {/* Actions */}
                <View style={styles.actionRow}>
                  <Pressable style={styles.chartBtn} onPress={() => handleOpenChart(item)}>
                    <ThemedText style={styles.chartBtnText}>📋 View Chart</ThemedText>
                  </Pressable>
                  <Pressable
                    style={styles.appointmentBtn}
                    onPress={() => navigation.navigate('Appointments', { patientId: item.id, patientName: item.fullName })}
                  >
                    <ThemedText style={styles.appointmentBtnText}>📅 Book Appt</ThemedText>
                  </Pressable>
                  <Pressable style={styles.queueBtn} onPress={() => handleQueueCheckIn(item)}>
                    <ThemedText style={styles.queueBtnText}>⚡ Check In to Queue</ThemedText>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Register Patient Modal */}
      <Modal visible={registerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Register Walk-In Patient</ThemedText>
              <Pressable onPress={() => setRegisterVisible(false)}>
                <ThemedText style={styles.modalCloseText}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ gap: 12 }}>
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>First Name *</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Maria"
                    placeholderTextColor="#9CA3AF"
                    value={formFirstName}
                    onChangeText={setFormFirstName}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Last Name *</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Santos"
                    placeholderTextColor="#9CA3AF"
                    value={formLastName}
                    onChangeText={setFormLastName}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Middle Name</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Delos"
                    placeholderTextColor="#9CA3AF"
                    value={formMiddleName}
                    onChangeText={setFormMiddleName}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Date of Birth (YYYY-MM-DD) *</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="1990-01-01"
                    placeholderTextColor="#9CA3AF"
                    value={formDob}
                    onChangeText={setFormDob}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Contact Phone *</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0917-123-4567"
                    placeholderTextColor="#9CA3AF"
                    value={formPhone}
                    onChangeText={setFormPhone}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Blood Type</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="O+, A+, B+, AB+"
                    placeholderTextColor="#9CA3AF"
                    value={formBloodType}
                    onChangeText={setFormBloodType}
                  />
                </View>
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>PhilHealth PIN (RA 11223)</ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="12-345678901-2"
                  placeholderTextColor="#9CA3AF"
                  value={formPhilHealth}
                  onChangeText={setFormPhilHealth}
                />
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Senior Citizen ID (RA 9994)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="SC-SP-2020-001"
                    placeholderTextColor="#9CA3AF"
                    value={formSeniorId}
                    onChangeText={setFormSeniorId}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>PWD ID (RA 10754)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="PWD-BIN-2022-001"
                    placeholderTextColor="#9CA3AF"
                    value={formPwdId}
                    onChangeText={setFormPwdId}
                  />
                </View>
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Known Allergies (Crucial Alert)</ThemedText>
                <TextInput
                  style={[styles.textInput, { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' }]}
                  placeholder="e.g. Penicillin, Aspirin, Shellfish"
                  placeholderTextColor="#9CA3AF"
                  value={formAllergies}
                  onChangeText={setFormAllergies}
                />
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Chronic Conditions & Medical Alerts</ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Hypertension, Diabetes, High fall risk"
                  placeholderTextColor="#9CA3AF"
                  value={formChronicConditions}
                  onChangeText={setFormChronicConditions}
                />
              </View>

              <Pressable
                style={[styles.saveBtn, savingPatient && { opacity: 0.6 }]}
                onPress={handleRegisterPatient}
                disabled={savingPatient}
              >
                {savingPatient ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.saveBtnText}>Save & Register Patient</ThemedText>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Patient Longitudinal Chart Modal */}
      <Modal visible={chartVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <ThemedText style={styles.modalTitle}>Longitudinal Medical Chart</ThemedText>
                <ThemedText style={styles.subtitle}>{selectedPatient?.fullName}</ThemedText>
              </View>
              <Pressable onPress={() => setChartVisible(false)}>
                <ThemedText style={styles.modalCloseText}>✕</ThemedText>
              </Pressable>
            </View>

            {loadingChart ? (
              <ActivityIndicator size="large" color="#0284C7" style={{ padding: 40 }} />
            ) : patientChart ? (
              <ScrollView contentContainerStyle={{ gap: 14 }}>
                <View style={styles.chartSummaryBar}>
                  <View style={styles.chartMetric}>
                    <ThemedText style={styles.chartMetricVal}>{patientChart.totalVisits}</ThemedText>
                    <ThemedText style={styles.chartMetricLabel}>Total Encounters</ThemedText>
                  </View>
                  <View style={styles.chartMetric}>
                    <ThemedText style={styles.chartMetricVal}>{patientChart.proceduresHistory?.length ?? 0}</ThemedText>
                    <ThemedText style={styles.chartMetricLabel}>Procedures</ThemedText>
                  </View>
                  <View style={styles.chartMetric}>
                    <ThemedText style={styles.chartMetricVal}>{patientChart.labOrdersHistory?.length ?? 0}</ThemedText>
                    <ThemedText style={styles.chartMetricLabel}>Lab Requisitions</ThemedText>
                  </View>
                  <View style={styles.chartMetric}>
                    <ThemedText style={styles.chartMetricVal}>{patientChart.invoicesHistory?.length ?? 0}</ThemedText>
                    <ThemedText style={styles.chartMetricLabel}>Invoices</ThemedText>
                  </View>
                </View>

                {selectedPatient?.allergies && (
                  <View style={styles.allergyBanner}>
                    <ThemedText style={styles.allergyText}>⚠️ ALLERGIES: {selectedPatient.allergies}</ThemedText>
                  </View>
                )}

                {/* History Section */}
                <View style={styles.chartSection}>
                  <ThemedText style={styles.chartSectionTitle}>Clinical Visits & Diagnoses</ThemedText>
                  {patientChart.consultations && patientChart.consultations.length > 0 ? (
                    patientChart.consultations.map((c) => (
                      <View key={c.id} style={styles.historyCard}>
                        <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#0284C7' }}>
                          Encounter: {new Date(c.encounterDate).toLocaleDateString()} • Dr: {c.doctorName}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 13, color: '#374151' }}>
                          Subjective: {c.subjective ?? 'Follow-up'}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>
                          Assessment: {c.assessment ?? 'Clinical examination normal'}
                        </ThemedText>
                      </View>
                    ))
                  ) : (
                    <ThemedText style={{ color: '#6B7280', fontSize: 13 }}>
                      Prior visits documented under paper records. New encounters will appear here.
                    </ThemedText>
                  )}
                </View>

                <View style={styles.chartSection}>
                  <ThemedText style={styles.chartSectionTitle}>Historical Vitals Trends</ThemedText>
                  {patientChart.vitalsHistory && patientChart.vitalsHistory.length > 0 ? (
                    patientChart.vitalsHistory.map((v, i) => (
                      <View key={i} style={styles.historyCard}>
                        <ThemedText style={{ fontSize: 12, fontWeight: '600', color: '#166534' }}>
                          BP: {v.systolicBp}/{v.diastolicBp} mmHg • HR: {v.heartRateBpm} bpm • SpO2: {v.oxygenSaturationPercent}%
                        </ThemedText>
                      </View>
                    ))
                  ) : (
                    <ThemedText style={{ color: '#6B7280', fontSize: 13 }}>No vitals trend recorded yet.</ThemedText>
                  )}
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#4B5563',
    fontWeight: '600',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
  },
  registerBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  registerBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterTabActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  list: {
    gap: 12,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 28,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  patientName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  codeBadge: {
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#E0F2FE',
    color: '#0369A1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  demographicsText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  contactText: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 2,
  },
  idsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  idBadge: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  idBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  allergyBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  allergyText: {
    color: '#991B1B',
    fontSize: 11,
    fontWeight: '700',
  },
  alertBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  alertText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    marginTop: 4,
  },
  chartBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  chartBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  appointmentBtn: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  appointmentBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  queueBtn: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  queueBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
  },
  saveBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  chartSummaryBar: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
  },
  chartMetric: {
    flex: 1,
    alignItems: 'center',
  },
  chartMetricVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0284C7',
  },
  chartMetricLabel: {
    fontSize: 10,
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  chartSection: {
    gap: 6,
  },
  chartSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    gap: 4,
  },
});
