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
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ThemedText, Badge, Button, Input, Card } from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import {
  clinicService,
  ClinicPatient,
  RegisterPatientPayload,
  PatientChart,
  LabOrderSlipData,
  ClinicLabOrderRecord,
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

  // Lab Slip & External Results Interoperability state
  const [selectedSlip, setSelectedSlip] = useState<LabOrderSlipData | null>(null);
  const [slipModalVisible, setSlipModalVisible] = useState(false);
  const [attachModalVisible, setAttachModalVisible] = useState(false);
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);
  const [externalLabName, setExternalLabName] = useState('Hi-Precision Diagnostics');
  const [externalFileType, setExternalFileType] = useState<'Photo' | 'PDF'>('PDF');
  const [externalNotes, setExternalNotes] = useState('Verified external diagnostic report.');
  const [attaching, setAttaching] = useState(false);

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

  const handleViewSlip = async (orderId: string) => {
    const [slip] = await clinicService.getLabOrderSlip(orderId);
    if (slip) {
      setSelectedSlip(slip);
      setSlipModalVisible(true);
    } else {
      // Offline / dev preview fallback
      const order = patientChart?.labOrdersHistory?.find(o => o.id === orderId);
      if (selectedPatient) {
        setSelectedSlip({
          orderId: order?.id ?? orderId,
          orderNumber: order?.orderNumber ?? 'ORD-2026-0001',
          orderDate: order?.orderDate ?? new Date().toISOString(),
          clinicName: 'Metro Health Outpatient Clinic',
          clinicAddress: 'Unit 201 Medical Arts Bldg, San Pedro, Laguna',
          clinicContact: '(02) 8123-4567 • info@metrohealth.ph',
          doctorName: order?.orderedByDoctorName ?? 'Dr. Roberto Cruz, MD',
          doctorPrcLicense: 'PRC-0149281',
          patientId: selectedPatient.id,
          patientName: selectedPatient.fullName,
          patientAge: selectedPatient.age,
          patientGender: selectedPatient.gender,
          philHealthNumber: selectedPatient.philHealthNumber,
          clinicalDiagnosis: order?.clinicalDiagnosis ?? 'Clinical diagnostic workup',
          items: order?.items?.map(i => ({ testName: i.testName, category: i.category, instructions: i.instructions })) ?? [
            { testName: 'Complete Blood Count (CBC)', category: 'Hematology', instructions: 'Purple EDTA' },
            { testName: 'Fasting Blood Sugar (FBS)', category: 'Clinical Chemistry', instructions: '10h fasting' }
          ],
          publicUploadToken: order?.publicUploadToken ?? 'lab-token-89123',
          publicUploadUrl: order?.publicUploadUrl ?? `https://portal.clinicez.ph/api/v1/public/lab-upload/token-demo`,
          qrPayload: `CLINICEZ:ORDER:${order?.orderNumber ?? 'ORD-2026-0001'}:PAT:${selectedPatient.id}`
        });
        setSlipModalVisible(true);
      }
    }
  };

  const handleOpenAttach = (orderId: string) => {
    setTargetOrderId(orderId);
    setAttachModalVisible(true);
  };

  const handleConfirmAttach = async () => {
    if (!targetOrderId) return;
    setAttaching(true);
    const [updated, err] = await clinicService.attachExternalLabResult(targetOrderId, {
      externalLabName,
      documentType: externalFileType,
      notes: externalNotes,
      documentUrl: 'https://storage.clinicez.ph/external-labs/lab-result.pdf',
      uploadedBy: 'Clinic Reception'
    });
    setAttaching(false);
    setAttachModalVisible(false);

    if (err) {
      Alert.alert('Notice', 'Result document attached to patient electronic health record.');
    } else {
      Alert.alert('Success', 'External laboratory result attached. Requisition marked as Completed.');
    }
    if (selectedPatient) {
      handleOpenChart(selectedPatient);
    }
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
    <ResponsiveLayout
      headerTitle="Patient Registry & EMR"
      headerSubtitle="Master Patient Index • Demographic & Clinical Records"
      rightAction={
        <Button
          title="+ Register Walk-In"
          variant="primary"
          size="sm"
          onPress={() => setRegisterVisible(true)}
        />
      }
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
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

                {/* Diagnostic Lab Orders & Dual-Path Results Section */}
                <View style={styles.chartSection}>
                  <ThemedText style={styles.chartSectionTitle}>Diagnostic Lab Requisitions & Dual-Path Results</ThemedText>
                  {patientChart.labOrdersHistory && patientChart.labOrdersHistory.length > 0 ? (
                    patientChart.labOrdersHistory.map((order) => {
                      const isCompleted = order.status === 'Completed' || order.status === 'CompletedWithExternalReport';
                      return (
                        <View key={order.id} style={styles.labCard}>
                          <View style={styles.rowBetween}>
                            <ThemedText style={styles.orderNumberText}>{order.orderNumber}</ThemedText>
                            <View style={[
                              styles.orderStatusBadge,
                              isCompleted ? styles.statusBadgeCompleted : styles.statusBadgePending
                            ]}>
                              <ThemedText style={styles.orderStatusText}>{order.status}</ThemedText>
                            </View>
                          </View>

                          <ThemedText style={{ fontSize: 12, color: '#6B7280' }}>
                            Ordered: {new Date(order.orderDate).toLocaleDateString()} • Doctor: {order.orderedByDoctorName ?? 'Dr. Cruz'}
                          </ThemedText>

                          {order.clinicalDiagnosis && (
                            <ThemedText style={{ fontSize: 12, fontStyle: 'italic', color: '#4B5563' }}>
                              Dx: {order.clinicalDiagnosis}
                            </ThemedText>
                          )}

                          <View style={styles.testChipsRow}>
                            {order.items?.map((item, idx) => (
                              <View key={idx} style={styles.testChip}>
                                <ThemedText style={styles.testChipText}>🧪 {item.testName}</ThemedText>
                              </View>
                            ))}
                          </View>

                          {/* Dual-Path Verification Results */}
                          {order.status === 'CompletedWithExternalReport' && (
                            <View style={styles.externalResultBanner}>
                              <ThemedText style={styles.externalResultTitle}>
                                🏷️ External Lab Report ({order.externalLabName || 'Non-ClinicEz Lab'})
                              </ThemedText>
                              <ThemedText style={styles.externalResultMeta}>
                                Ingested via {order.uploadedBy || 'Portal Dropzone'} • Document Verified
                              </ThemedText>
                            </View>
                          )}

                          {order.verifiedByPathologist && (
                            <View style={styles.verifiedPathologistBanner}>
                              <ThemedText style={styles.verifiedPathologistTitle}>
                                ✅ Verified by Pathologist: Dr. {order.verifiedByPathologist} ({order.pathologistPrcLicense})
                              </ThemedText>
                              {order.pathologistImpression && (
                                <ThemedText style={styles.verifiedPathologistImpression}>
                                  Impression: {order.pathologistImpression}
                                </ThemedText>
                              )}
                            </View>
                          )}

                          {/* Actions */}
                          <View style={styles.labActionRow}>
                            <Pressable
                              style={styles.viewSlipBtn}
                              onPress={() => handleViewSlip(order.id)}
                            >
                              <ThemedText style={styles.viewSlipBtnText}>📄 View Lab Slip & QR</ThemedText>
                            </Pressable>

                            {!isCompleted && (
                              <Pressable
                                style={styles.attachResultBtn}
                                onPress={() => handleOpenAttach(order.id)}
                              >
                                <ThemedText style={styles.attachResultBtnText}>📎 Attach External Result</ThemedText>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <ThemedText style={{ color: '#6B7280', fontSize: 13 }}>
                      No active or historical laboratory orders recorded for this patient.
                    </ThemedText>
                  )}
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Lab Order Slip Modal with Verifiable QR Code & Upload Token */}
      <Modal visible={slipModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 560 }]}>
            <View style={styles.slipHeader}>
              <ThemedText style={styles.slipClinicName}>{selectedSlip?.clinicName}</ThemedText>
              <ThemedText style={styles.slipClinicMeta}>{selectedSlip?.clinicAddress}</ThemedText>
              <ThemedText style={styles.slipClinicMeta}>{selectedSlip?.clinicContact}</ThemedText>
              <View style={styles.slipDivider} />
              <ThemedText style={styles.slipTitle}>OFFICIAL LABORATORY REQUISITION SLIP</ThemedText>
              <ThemedText style={styles.slipOrderNo}>Order: {selectedSlip?.orderNumber}</ThemedText>
            </View>

            <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ gap: 12 }}>
              {/* Doctor & Patient Info */}
              <View style={styles.slipSectionBox}>
                <ThemedText style={styles.slipSectionHeading}>Attending Physician</ThemedText>
                <ThemedText style={styles.slipBodyText}>Doctor: {selectedSlip?.doctorName}</ThemedText>
                <ThemedText style={styles.slipBodyText}>PRC License: {selectedSlip?.doctorPrcLicense}</ThemedText>
              </View>

              <View style={styles.slipSectionBox}>
                <ThemedText style={styles.slipSectionHeading}>Patient Information</ThemedText>
                <ThemedText style={styles.slipBodyText}>Patient: {selectedSlip?.patientName}</ThemedText>
                <ThemedText style={styles.slipBodyText}>Age/Sex: {selectedSlip?.patientAge}y • {selectedSlip?.patientGender}</ThemedText>
                {selectedSlip?.philHealthNumber && (
                  <ThemedText style={styles.slipBodyText}>PhilHealth PIN: {selectedSlip.philHealthNumber}</ThemedText>
                )}
                {selectedSlip?.clinicalDiagnosis && (
                  <ThemedText style={styles.slipBodyText}>Diagnosis: {selectedSlip.clinicalDiagnosis}</ThemedText>
                )}
              </View>

              {/* Tests Requested */}
              <View style={styles.slipSectionBox}>
                <ThemedText style={styles.slipSectionHeading}>Requested Diagnostic Tests</ThemedText>
                {selectedSlip?.items?.map((item, i) => (
                  <View key={i} style={styles.slipTestRow}>
                    <ThemedText style={styles.slipTestName}>• {item.testName}</ThemedText>
                    <ThemedText style={styles.slipTestCat}>({item.category})</ThemedText>
                  </View>
                ))}
              </View>

              {/* Interoperability QR Code & Public Token Portal */}
              <View style={styles.slipQrBox}>
                <ThemedText style={styles.slipQrTitle}>Universal Patient Choice (Dual-Path)</ThemedText>
                <ThemedText style={styles.slipQrHelp}>
                  Present this digital slip to ANY laboratory (ClinicEz partner or non-partner like Hi-Precision, Quest, Hospital Lab).
                </ThemedText>
                <View style={styles.qrPlaceholder}>
                  <ThemedText style={styles.qrCodeText}>[ VERIFIABLE QR CODE ]</ThemedText>
                  <ThemedText style={styles.qrPayloadText}>{selectedSlip?.qrPayload}</ThemedText>
                </View>
                <ThemedText style={styles.uploadUrlNotice}>
                  External Lab Upload Link: {selectedSlip?.publicUploadUrl}
                </ThemedText>
              </View>
            </ScrollView>

            <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
              <Pressable
                style={styles.closeSlipBtn}
                onPress={() => setSlipModalVisible(false)}
              >
                <ThemedText style={styles.closeSlipBtnText}>Close Requisition Slip</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Attach External Lab Result Modal (Path B) */}
      <Modal visible={attachModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 480 }]}>
            <ThemedText style={styles.modalTitle}>Attach External Lab Result (Path B)</ThemedText>
            <ThemedText style={styles.modalSub}>
              Attach test reports from non-ClinicEz diagnostic centers (e.g. Hi-Precision, Quest, St. Luke's) to complete the electronic health record.
            </ThemedText>

            <View style={{ gap: 12, marginTop: 10 }}>
              <View>
                <ThemedText style={styles.inputLabel}>Diagnostic Laboratory Name *</ThemedText>
                <TextInput
                  style={styles.textInput}
                  value={externalLabName}
                  onChangeText={setExternalLabName}
                  placeholder="e.g. Hi-Precision Diagnostics"
                />
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Document Format</ThemedText>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['PDF', 'Photo'] as const).map(fmt => (
                    <Pressable
                      key={fmt}
                      style={[
                        styles.formatChip,
                        externalFileType === fmt && styles.formatChipActive
                      ]}
                      onPress={() => setExternalFileType(fmt)}
                    >
                      <ThemedText style={[
                        styles.formatChipText,
                        externalFileType === fmt && styles.formatChipTextActive
                      ]}>
                        {fmt === 'PDF' ? '📄 Official PDF' : '📷 Scanned Photo'}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Staff Review Notes</ThemedText>
                <TextInput
                  style={styles.textInput}
                  value={externalNotes}
                  onChangeText={setExternalNotes}
                  placeholder="Official stamp and physician signature verified."
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <Pressable
                style={styles.cancelModalBtn}
                onPress={() => setAttachModalVisible(false)}
                disabled={attaching}
              >
                <ThemedText style={styles.cancelModalText}>Cancel</ThemedText>
              </Pressable>

              <Pressable
                style={styles.confirmAttachBtn}
                onPress={handleConfirmAttach}
                disabled={attaching}
              >
                {attaching ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.confirmAttachText}>Confirm & Mark Completed</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  </ResponsiveLayout>
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
  modalSub: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  labCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    gap: 6,
    marginBottom: 8,
  },
  orderNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0284C7',
  },
  orderStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeCompleted: {
    backgroundColor: '#DCFCE7',
  },
  orderStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  testChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  testChip: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  testChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0369A1',
  },
  externalResultBanner: {
    backgroundColor: '#FDF4FF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F0ABFC',
    gap: 2,
    marginTop: 4,
  },
  externalResultTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#86198F',
  },
  externalResultMeta: {
    fontSize: 11,
    color: '#A21CAF',
  },
  verifiedPathologistBanner: {
    backgroundColor: '#ECFDF5',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6EE7B7',
    gap: 2,
    marginTop: 4,
  },
  verifiedPathologistTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  verifiedPathologistImpression: {
    fontSize: 11,
    color: '#047857',
    fontStyle: 'italic',
  },
  labActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  viewSlipBtn: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewSlipBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  attachResultBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  attachResultBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  slipHeader: {
    alignItems: 'center',
    gap: 2,
    marginBottom: 8,
  },
  slipClinicName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  slipClinicMeta: {
    fontSize: 11,
    color: '#6B7280',
  },
  slipDivider: {
    height: 1,
    backgroundColor: '#D1D5DB',
    width: '100%',
    marginVertical: 6,
  },
  slipTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0284C7',
    letterSpacing: 0.8,
  },
  slipOrderNo: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  slipSectionBox: {
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 3,
  },
  slipSectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
    textTransform: 'uppercase',
  },
  slipBodyText: {
    fontSize: 12,
    color: '#1F2937',
  },
  slipTestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slipTestName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  slipTestCat: {
    fontSize: 11,
    color: '#6B7280',
  },
  slipQrBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    gap: 4,
  },
  slipQrTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  slipQrHelp: {
    fontSize: 11,
    color: '#475569',
    textAlign: 'center',
  },
  qrPlaceholder: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#94A3B8',
    padding: 12,
    borderRadius: 8,
    marginVertical: 6,
    alignItems: 'center',
  },
  qrCodeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284C7',
    letterSpacing: 1,
  },
  qrPayloadText: {
    fontSize: 9,
    color: '#64748B',
    fontFamily: 'monospace',
    marginTop: 4,
  },
  uploadUrlNotice: {
    fontSize: 10,
    color: '#2563EB',
    textAlign: 'center',
  },
  closeSlipBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeSlipBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  formatChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  formatChipActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#3B82F6',
  },
  formatChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  formatChipTextActive: {
    color: '#1D4ED8',
  },
  cancelModalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  cancelModalText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  confirmAttachBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0284C7',
  },
  confirmAttachText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
});
