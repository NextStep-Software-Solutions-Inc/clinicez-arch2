import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import ThemedText from '@ui/ThemedText';
import {
  clinicService,
  PatientQueueItem,
  TriageVitals,
  Icd10Code,
} from '../../services/clinicService';

interface LocalPrescription {
  id: string;
  genericName: string;
  dosage: string;
  form: string;
  sig: string;
  quantity: number;
  durationDays?: number;
  isDangerousDrug: boolean;
}

interface LocalDiagnosis {
  icd10Code: string;
  description: string;
  isPrimary: boolean;
}

const COMMON_ICD10: Icd10Code[] = [
  { code: 'I10', description: 'Essential (primary) hypertension, Stage 1', category: 'Circulatory' },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', category: 'Endocrine' },
  { code: 'J00', description: 'Acute nasopharyngitis [common cold]', category: 'Respiratory' },
  { code: 'J45.909', description: 'Unspecified asthma, uncomplicated', category: 'Respiratory' },
  { code: 'K21.9', description: 'Gastro-esophageal reflux disease without esophagitis', category: 'Digestive' },
  { code: 'M54.5', description: 'Low back pain, unspecified', category: 'Musculoskeletal' },
  { code: 'A09', description: 'Infectious gastroenteritis and colitis, unspecified', category: 'Infectious' },
];

const COMMON_LAB_TESTS = [
  'Complete Blood Count (CBC) with Platelet',
  'Fasting Blood Sugar (FBS)',
  'Lipid Profile (Chol, Trig, HDL, LDL)',
  'Routine Urinalysis',
  'Serum Creatinine & eGFR',
  '12-Lead ECG with Interpretation',
  'Chest X-Ray PA View',
  'Random Blood Sugar (RBS) Rapid Test',
];

const COMMON_PROCEDURES = [
  { code: 'PROC-NEB', name: 'Nebulization Therapy', category: 'Procedure', fee: 250 },
  { code: 'PROC-WOUND', name: 'Wound Dressing & Debridement', category: 'Procedure', fee: 350 },
  { code: 'PROC-ECG', name: '12-Lead Electrocardiogram', category: 'Diagnostic', fee: 450 },
  { code: 'PROC-VAX', name: 'Vaccine Administration', category: 'NursingService', fee: 250 },
];

const SAMPLE_PATIENTS: PatientQueueItem[] = [
  {
    id: 'q-001',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    queueNumber: 'Q-001',
    sequenceNumber: 1,
    queueDate: new Date().toISOString().split('T')[0],
    patientId: 'pat-101',
    patientName: 'Maria Santos (42F)',
    doctorId: 'doc-001',
    doctorName: 'Dr. Cruz',
    priority: 'Routine',
    status: 'InConsultation',
    checkInTime: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    chiefComplaint: 'Occasional morning headaches for 2 weeks',
    hasVitals: true,
    vitalsSummary: 'BP: 138/88 • HR: 76 • BMI: 24.2',
  },
  {
    id: 'q-002',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    queueNumber: 'Q-002',
    sequenceNumber: 2,
    queueDate: new Date().toISOString().split('T')[0],
    patientId: 'pat-102',
    patientName: 'Juan Dela Cruz (55M)',
    doctorId: 'doc-001',
    doctorName: 'Dr. Cruz',
    priority: 'Urgent',
    status: 'Triaged',
    checkInTime: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    chiefComplaint: 'Acute chest discomfort, heaviness upon exertion',
    hasVitals: true,
    vitalsSummary: 'BP: 145/95 • HR: 88 • BMI: 27.8',
  },
  {
    id: 'q-003',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    queueNumber: 'Q-003',
    sequenceNumber: 3,
    queueDate: new Date().toISOString().split('T')[0],
    patientId: 'pat-103',
    patientName: 'Elena Ramos (28F)',
    doctorId: 'doc-002',
    doctorName: 'Dr. Reyes',
    priority: 'Routine',
    status: 'Waiting',
    checkInTime: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    chiefComplaint: 'Second trimester routine prenatal check',
    hasVitals: false,
    vitalsSummary: undefined,
  },
];

const SAMPLE_VITALS: Record<string, TriageVitals> = {
  'q-001': {
    id: 'vit-001',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    queueItemId: 'q-001',
    patientId: 'pat-101',
    recordedByNurseName: 'Nurse Bea Gomez, RN',
    recordedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    systolicBp: 138,
    diastolicBp: 88,
    heartRateBpm: 76,
    temperatureCelsius: 36.6,
    respiratoryRateBreathsPerMin: 18,
    oxygenSaturationPercent: 98,
    heightCm: 160,
    weightKg: 62,
    bmi: 24.2,
    painScore: 2,
    notes: 'Patient well-hydrated, no acute distress.',
  },
  'q-002': {
    id: 'vit-002',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    queueItemId: 'q-002',
    patientId: 'pat-102',
    recordedByNurseName: 'Nurse Bea Gomez, RN',
    recordedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    systolicBp: 145,
    diastolicBp: 95,
    heartRateBpm: 88,
    temperatureCelsius: 36.8,
    respiratoryRateBreathsPerMin: 20,
    oxygenSaturationPercent: 96,
    heightCm: 172,
    weightKg: 82,
    bmi: 27.7,
    painScore: 5,
    notes: 'Substernal chest heaviness, ECG requested stat.',
  },
};

export default function ConsultationsScreen() {
  const [patients, setPatients] = useState<PatientQueueItem[]>(SAMPLE_PATIENTS);
  const [selectedPatient, setSelectedPatient] = useState<PatientQueueItem>(SAMPLE_PATIENTS[0]);
  const [vitals, setVitals] = useState<TriageVitals | null>(SAMPLE_VITALS['q-001']);

  // SOAP Inputs
  const [subjective, setSubjective] = useState(
    'Patient reports mild occasional headaches for 2 weeks, no dizziness, nausea, or blurring of vision. Currently compliant with Amlodipine 5mg once daily.'
  );
  const [objective, setObjective] = useState(
    'Alert, conscious, ambulatory, not in acute cardiorespiratory distress. S1/S2 heard, regular rate and rhythm, no murmurs. Lungs clear to auscultation, no crackles or wheezes. No peripheral bipedal edema.'
  );
  const [assessment, setAssessment] = useState('Essential (primary) hypertension, Stage 1 - controlled.');
  const [plan, setPlan] = useState(
    '1. Continue Amlodipine 5mg OD po.\n2. Request Fasting Blood Sugar, Lipid Profile, Serum Creatinine.\n3. Low sodium, DASH diet counseling provided.\n4. Follow up in 4 weeks with lab results.'
  );

  // ICD-10 Search & Selection
  const [icdQuery, setIcdQuery] = useState('');
  const [icdResults, setIcdResults] = useState<Icd10Code[]>(COMMON_ICD10);
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<LocalDiagnosis[]>([
    { icd10Code: 'I10', description: 'Essential (primary) hypertension, Stage 1', isPrimary: true },
  ]);
  const [showIcdDropdown, setShowIcdDropdown] = useState(false);

  // Prescriptions
  const [prescriptions, setPrescriptions] = useState<LocalPrescription[]>([
    {
      id: 'rx-1',
      genericName: 'Amlodipine besylate',
      dosage: '5 mg',
      form: 'Tablet',
      sig: '1 tablet once daily in the morning',
      quantity: 30,
      durationDays: 30,
      isDangerousDrug: false,
    },
  ]);

  // Diagnostic Lab Orders & In-Clinic Procedures
  const [orderedLabs, setOrderedLabs] = useState<string[]>([
    'Fasting Blood Sugar (FBS)',
    'Lipid Profile (Chol, Trig, HDL, LDL)',
  ]);
  const [orderedProcedures, setOrderedProcedures] = useState<string[]>([]);

  // New Prescription Modal / Input Form State
  const [showAddRx, setShowAddRx] = useState(false);
  const [newRxGeneric, setNewRxGeneric] = useState('');
  const [newRxDosage, setNewRxDosage] = useState('');
  const [newRxForm, setNewRxForm] = useState('Tablet');
  const [newRxSig, setNewRxSig] = useState('');
  const [newRxQuantity, setNewRxQuantity] = useState('30');
  const [newRxDangerous, setNewRxDangerous] = useState(false);

  // Doctor Regulatory Credentials
  const [doctorPrc, setDoctorPrc] = useState('PRC-0149281');
  const [doctorPtr, setDoctorPtr] = useState('PTR-8492019');
  const [doctorS2, setDoctorS2] = useState('S2-9482014');

  // Sign & Sync Status
  const [isSigning, setIsSigning] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  // Load real queue patients if available
  const loadQueue = useCallback(async () => {
    const [queueData, queueErr] = await clinicService.getQueue();
    if (!queueErr && queueData && queueData.length > 0) {
      setPatients(queueData);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Load vitals when selected patient changes
  const handleSelectPatient = async (p: PatientQueueItem) => {
    setSelectedPatient(p);
    setIsSigned(false);
    setSignedAt(null);
    setBanner(null);

    const [triageData, triageErr] = await clinicService.getTriage(p.id);
    if (!triageErr && triageData) {
      setVitals(triageData);
    } else {
      setVitals(SAMPLE_VITALS[p.id] ?? null);
    }

    if (p.chiefComplaint) {
      setSubjective(`Patient presents with: ${p.chiefComplaint}.`);
    }
  };

  // Search ICD-10 codes
  const handleSearchIcd10 = async (q: string) => {
    setIcdQuery(q);
    if (!q.trim()) {
      setIcdResults(COMMON_ICD10);
      return;
    }
    const [data, err] = await clinicService.searchIcd10(q);
    if (!err && data && data.length > 0) {
      setIcdResults(data);
    } else {
      const filtered = COMMON_ICD10.filter(
        (i) => i.code.toLowerCase().includes(q.toLowerCase()) || i.description.toLowerCase().includes(q.toLowerCase())
      );
      setIcdResults(filtered);
    }
  };

  const handleAddDiagnosis = (code: Icd10Code) => {
    if (selectedDiagnoses.some((d) => d.icd10Code === code.code)) return;
    const isFirst = selectedDiagnoses.length === 0;
    setSelectedDiagnoses((prev) => [
      ...prev,
      { icd10Code: code.code, description: code.description, isPrimary: isFirst },
    ]);
    setShowIcdDropdown(false);
    setIcdQuery('');
  };

  const handleRemoveDiagnosis = (code: string) => {
    setSelectedDiagnoses((prev) => prev.filter((d) => d.icd10Code !== code));
  };

  const handleToggleLab = (labName: string) => {
    setOrderedLabs(prev =>
      prev.includes(labName) ? prev.filter(l => l !== labName) : [...prev, labName]
    );
  };

  const handleToggleProcedure = (procName: string) => {
    setOrderedProcedures(prev =>
      prev.includes(procName) ? prev.filter(p => p !== procName) : [...prev, procName]
    );
  };

  const handleAddPrescription = () => {
    if (!newRxGeneric.trim() || !newRxDosage.trim() || !newRxSig.trim()) {
      Alert.alert('Incomplete Prescription', 'Please provide Generic Name, Dosage, and Directions (Sig).');
      return;
    }
    const newRx: LocalPrescription = {
      id: `rx-${Date.now()}`,
      genericName: newRxGeneric.trim(),
      dosage: newRxDosage.trim(),
      form: newRxForm.trim() || 'Tablet',
      sig: newRxSig.trim(),
      quantity: parseInt(newRxQuantity, 10) || 30,
      isDangerousDrug: newRxDangerous,
    };
    setPrescriptions((prev) => [...prev, newRx]);
    setNewRxGeneric('');
    setNewRxDosage('');
    setNewRxSig('');
    setNewRxQuantity('30');
    setNewRxDangerous(false);
    setShowAddRx(false);
  };

  const handleRemovePrescription = (id: string) => {
    setPrescriptions((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSignAndSync = async () => {
    setBanner(null);

    // PDEA Dangerous Drug validation (Philippine Comprehensive Dangerous Drugs Act RA 9165)
    const hasDangerousDrug = prescriptions.some((p) => p.isDangerousDrug);
    if (hasDangerousDrug && (!doctorS2 || !doctorS2.trim())) {
      setBanner({
        text: '⚠️ Regulatory Alert: S2 License Number is strictly required to prescribe PDEA dangerous drugs.',
        isError: true,
      });
      return;
    }

    if (!doctorPrc || !doctorPrc.trim()) {
      setBanner({
        text: '⚠️ PRC License Number is mandatory to sign clinical encounters.',
        isError: true,
      });
      return;
    }

    setIsSigning(true);

    const payload = {
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
      doctorId: selectedPatient.doctorId ?? 'doc-001',
      doctorName: selectedPatient.doctorName ?? 'Dr. Cruz',
      queueItemId: selectedPatient.id,
      appointmentId: selectedPatient.appointmentId,
      subjective,
      objective,
      assessment,
      plan,
      diagnoses: selectedDiagnoses.map((d) => ({
        icd10Code: d.icd10Code,
        description: d.description,
        isPrimary: d.isPrimary,
      })),
      prescriptions: prescriptions.map((p) => ({
        genericName: p.genericName,
        dosage: p.dosage,
        form: p.form,
        sig: p.sig,
        quantity: p.quantity,
        isDangerousDrug: p.isDangerousDrug,
      })),
    };

    const [consultation] = await clinicService.createConsultation(payload);

    if (consultation?.id) {
      await clinicService.signConsultation(consultation.id, {
        prcLicenseNumber: doctorPrc,
        ptrNumber: doctorPtr,
        s2LicenseNumber: doctorS2,
      });
    }

    // Auto-create Diagnostic Lab Requisitions if labs were ordered
    if (orderedLabs.length > 0) {
      await clinicService.createLabOrder({
        patientId: selectedPatient.patientId,
        patientName: selectedPatient.patientName,
        consultationId: consultation?.id,
        orderedByDoctorId: selectedPatient.doctorId,
        orderedByDoctorName: selectedPatient.doctorName ?? 'Dr. Cruz',
        clinicalDiagnosis: assessment,
        items: orderedLabs.map(l => ({
          testName: l,
          category: l.includes('ECG') || l.includes('X-Ray') ? 'Diagnostic' : 'Clinical Laboratory',
        })),
      });
    }

    // Auto-order in-clinic procedures for the nursing station
    for (const procName of orderedProcedures) {
      const procInfo = COMMON_PROCEDURES.find(p => p.name === procName);
      await clinicService.orderProcedure({
        patientId: selectedPatient.patientId,
        patientName: selectedPatient.patientName,
        queueItemId: selectedPatient.id,
        consultationId: consultation?.id,
        procedureCode: procInfo?.code,
        procedureName: procName,
        category: procInfo?.category ?? 'Procedure',
        orderedByDoctorId: selectedPatient.doctorId,
        orderedByDoctorName: selectedPatient.doctorName ?? 'Dr. Cruz',
        clinicalNotes: `Ordered during encounter for ${assessment}`,
      });
    }

    // Auto-create draft billing invoice for Cashier Station
    const billItems = [
      { description: 'General Outpatient Medical Consultation', category: 'Consultation', unitPrice: 500, quantity: 1 }
    ];
    for (const procName of orderedProcedures) {
      const procInfo = COMMON_PROCEDURES.find(p => p.name === procName);
      if (procInfo) {
        billItems.push({
          description: procInfo.name,
          category: procInfo.category,
          unitPrice: procInfo.fee,
          quantity: 1,
        });
      }
    }
    await clinicService.createInvoice({
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
      queueItemId: selectedPatient.id,
      consultationId: consultation?.id,
      attendingDoctorId: selectedPatient.doctorId,
      attendingDoctorName: selectedPatient.doctorName,
      discountType: 'None',
      notes: 'Consultation & procedures bill forwarded to Cashier',
      lineItems: billItems,
    });

    // Complete queue item
    await clinicService.completeQueueItem(selectedPatient.id);

    setIsSigning(false);
    setIsSigned(true);
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSignedAt(nowStr);
    setBanner({
      text: `✓ Clinical Encounter sealed by Dr. Cruz (${doctorPrc}) at ${nowStr}! Lab requisitions, nursing orders, and Cashier invoice dispatched.`,
      isError: false,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Doctor EMR & Clinical Encounter</ThemedText>
        <ThemedText style={styles.title}>SOAP Consultation</ThemedText>
      </View>

      {/* Patient Queue Selector */}
      <View style={styles.selectorContainer}>
        <ThemedText style={styles.sectionHeading}>Active Patients in Queue</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patientRow}>
          {patients.map((p) => {
            const isSelected = selectedPatient.id === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => handleSelectPatient(p)}
                style={[styles.patientPill, isSelected && styles.patientPillActive]}
              >
                <ThemedText style={[styles.pillBadge, isSelected && styles.pillBadgeActive]}>
                  {p.queueNumber}
                </ThemedText>
                <ThemedText style={[styles.pillName, isSelected && styles.pillNameActive]}>
                  {p.patientName}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Selected Patient Banner */}
      <View style={styles.patientCard}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.patientName}>{selectedPatient.patientName}</ThemedText>
            <ThemedText style={styles.patientMeta}>
              Ticket #{selectedPatient.queueNumber} • Chief Complaint: {selectedPatient.chiefComplaint ?? 'General Consultation'}
            </ThemedText>
          </View>
          <View style={[styles.priorityTag, selectedPatient.priority === 'Urgent' && styles.priorityUrgent]}>
            <ThemedText style={styles.priorityTagText}>{selectedPatient.priority}</ThemedText>
          </View>
        </View>

        {/* Triage Vitals Breakdown */}
        {vitals ? (
          <View style={styles.vitalsBox}>
            <ThemedText style={styles.vitalsTitle}>
              Nurse Triage Telemetry ({vitals.recordedByNurseName ?? 'Nurse Station'})
            </ThemedText>
            <View style={styles.vitalsGrid}>
              <View style={styles.vitalItem}>
                <ThemedText style={styles.vitalLabel}>BP</ThemedText>
                <ThemedText style={styles.vitalValue}>
                  {vitals.systolicBp}/{vitals.diastolicBp}
                </ThemedText>
              </View>
              <View style={styles.vitalItem}>
                <ThemedText style={styles.vitalLabel}>HR</ThemedText>
                <ThemedText style={styles.vitalValue}>{vitals.heartRateBpm} bpm</ThemedText>
              </View>
              <View style={styles.vitalItem}>
                <ThemedText style={styles.vitalLabel}>Temp</ThemedText>
                <ThemedText style={styles.vitalValue}>{vitals.temperatureCelsius}°C</ThemedText>
              </View>
              <View style={styles.vitalItem}>
                <ThemedText style={styles.vitalLabel}>SpO2</ThemedText>
                <ThemedText style={styles.vitalValue}>{vitals.oxygenSaturationPercent}%</ThemedText>
              </View>
              <View style={styles.vitalItem}>
                <ThemedText style={styles.vitalLabel}>BMI</ThemedText>
                <ThemedText style={styles.vitalValue}>{vitals.bmi ?? '--'}</ThemedText>
              </View>
              <View style={styles.vitalItem}>
                <ThemedText style={styles.vitalLabel}>Pain</ThemedText>
                <ThemedText style={styles.vitalValue}>{vitals.painScore ?? 0}/10</ThemedText>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.vitalsPending}>
            <ThemedText style={styles.vitalsPendingMsg}>⏳ Triage vitals not yet recorded for this patient.</ThemedText>
          </View>
        )}
      </View>

      {/* Notification Banner */}
      {banner && (
        <View style={[styles.bannerCard, banner.isError && styles.bannerCardError]}>
          <ThemedText style={[styles.bannerText, banner.isError && styles.bannerTextError]}>
            {banner.text}
          </ThemedText>
        </View>
      )}

      {/* S - Subjective */}
      <View style={styles.section}>
        <ThemedText style={styles.label}>Subjective (Chief Complaint & History of Present Illness)</ThemedText>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Enter patient narrative, symptoms, onset, and duration..."
          placeholderTextColor="#9CA3AF"
          value={subjective}
          onChangeText={setSubjective}
          editable={!isSigned}
        />
      </View>

      {/* O - Objective */}
      <View style={styles.section}>
        <ThemedText style={styles.label}>Objective (Physical Findings, Auscultation, Exam)</ThemedText>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Enter physical examination and clinical observations..."
          placeholderTextColor="#9CA3AF"
          value={objective}
          onChangeText={setObjective}
          editable={!isSigned}
        />
      </View>

      {/* A - Assessment & ICD-10 Search */}
      <View style={styles.section}>
        <ThemedText style={styles.label}>Assessment (Clinical Impression & ICD-10)</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Primary Impression Narrative..."
          placeholderTextColor="#9CA3AF"
          value={assessment}
          onChangeText={setAssessment}
          editable={!isSigned}
        />

        {/* Selected Diagnoses Badges */}
        <View style={styles.diagnosesList}>
          {selectedDiagnoses.map((d) => (
            <View key={d.icd10Code} style={styles.diagBadge}>
              <ThemedText style={styles.diagCode}>{d.icd10Code}</ThemedText>
              <ThemedText style={styles.diagDesc} numberOfLines={1}>
                {d.description}
              </ThemedText>
              {d.isPrimary && <ThemedText style={styles.primaryTag}>PRIMARY</ThemedText>}
              {!isSigned && (
                <Pressable onPress={() => handleRemoveDiagnosis(d.icd10Code)} style={styles.removeTag}>
                  <ThemedText style={styles.removeTagText}>✕</ThemedText>
                </Pressable>
              )}
            </View>
          ))}
        </View>

        {/* ICD-10 Search Bar */}
        {!isSigned && (
          <View style={styles.icdSearchWrapper}>
            <TextInput
              style={styles.icdSearchInput}
              placeholder="Search ICD-10 Codes (e.g. I10, Diabetes, Cold)..."
              placeholderTextColor="#9CA3AF"
              value={icdQuery}
              onChangeText={handleSearchIcd10}
              onFocus={() => setShowIcdDropdown(true)}
            />
            {showIcdDropdown && (
              <View style={styles.icdDropdown}>
                {icdResults.map((item) => (
                  <Pressable
                    key={item.code}
                    style={styles.icdItem}
                    onPress={() => handleAddDiagnosis(item)}
                  >
                    <ThemedText style={styles.icdItemCode}>{item.code}</ThemedText>
                    <ThemedText style={styles.icdItemDesc}>{item.description}</ThemedText>
                  </Pressable>
                ))}
                <Pressable style={styles.icdCloseBtn} onPress={() => setShowIcdDropdown(false)}>
                  <ThemedText style={styles.icdCloseText}>Close Suggestions</ThemedText>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Diagnostic Lab Orders Section */}
      <View style={styles.section}>
        <ThemedText style={styles.label}>Diagnostic Laboratory Orders ({orderedLabs.length})</ThemedText>
        <ThemedText style={styles.subHint}>Select diagnostic tests to generate requisition order for laboratory fulfillment.</ThemedText>
        <View style={styles.chipsRow}>
          {COMMON_LAB_TESTS.map(lab => {
            const isSelected = orderedLabs.includes(lab);
            return (
              <Pressable
                key={lab}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => !isSigned && handleToggleLab(lab)}
                disabled={isSigned}
              >
                <ThemedText style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {isSelected ? '✓ ' : '+ '}{lab}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* In-Clinic Procedures Order Section */}
      <View style={styles.section}>
        <ThemedText style={styles.label}>In-Clinic Nursing Procedures ({orderedProcedures.length})</ThemedText>
        <ThemedText style={styles.subHint}>Orders dispatched directly to Nurse Station for immediate treatment.</ThemedText>
        <View style={styles.chipsRow}>
          {COMMON_PROCEDURES.map(proc => {
            const isSelected = orderedProcedures.includes(proc.name);
            return (
              <Pressable
                key={proc.code}
                style={[styles.chip, isSelected && styles.chipActiveProcedure]}
                onPress={() => !isSigned && handleToggleProcedure(proc.name)}
                disabled={isSigned}
              >
                <ThemedText style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {isSelected ? '⚡ ' : '+ '}{proc.name} (₱{proc.fee})
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* P - Plan & Prescriptions */}
      <View style={styles.section}>
        <ThemedText style={styles.label}>Plan (Treatment, Lifestyle Counseling & Follow-up)</ThemedText>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Enter treatment plan, requested laboratory tests, dietary advice..."
          placeholderTextColor="#9CA3AF"
          value={plan}
          onChangeText={setPlan}
          editable={!isSigned}
        />

        {/* Electronic Prescriptions Header */}
        <View style={styles.rowBetween}>
          <ThemedText style={styles.subHeading}>Electronic Prescriptions ({prescriptions.length})</ThemedText>
          {!isSigned && (
            <Pressable style={styles.addRxBtn} onPress={() => setShowAddRx(!showAddRx)}>
              <ThemedText style={styles.addRxBtnText}>+ Add Medication</ThemedText>
            </Pressable>
          )}
        </View>

        {/* Add Prescription Sub-Form */}
        {showAddRx && (
          <View style={styles.rxFormCard}>
            <ThemedText style={styles.rxFormTitle}>New Medication Order</ThemedText>
            <TextInput
              style={styles.rxInput}
              placeholder="Generic Name (e.g. Paracetamol, Amoxicillin)"
              placeholderTextColor="#9CA3AF"
              value={newRxGeneric}
              onChangeText={setNewRxGeneric}
            />
            <View style={styles.rowBetween}>
              <TextInput
                style={[styles.rxInput, { flex: 1, marginRight: 8 }]}
                placeholder="Dosage (e.g. 500mg)"
                placeholderTextColor="#9CA3AF"
                value={newRxDosage}
                onChangeText={setNewRxDosage}
              />
              <TextInput
                style={[styles.rxInput, { width: 90 }]}
                placeholder="Qty (e.g. 30)"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                value={newRxQuantity}
                onChangeText={setNewRxQuantity}
              />
            </View>
            <TextInput
              style={styles.rxInput}
              placeholder="Directions / Sig (e.g. 1 tab TID after meals for 7 days)"
              placeholderTextColor="#9CA3AF"
              value={newRxSig}
              onChangeText={setNewRxSig}
            />

            {/* PDEA S2 Toggle */}
            <Pressable
              style={[styles.dangerousToggle, newRxDangerous && styles.dangerousToggleActive]}
              onPress={() => setNewRxDangerous(!newRxDangerous)}
            >
              <ThemedText style={[styles.dangerousToggleText, newRxDangerous && styles.dangerousToggleTextActive]}>
                {newRxDangerous ? '⚠️ Dangerous Drug (PDEA S2 Regulated) - ACTIVE' : 'Mark as Dangerous Drug (Requires S2)'}
              </ThemedText>
            </Pressable>

            <View style={styles.rxFormActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowAddRx(false)}>
                <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={styles.confirmRxBtn} onPress={handleAddPrescription}>
                <ThemedText style={styles.confirmRxBtnText}>Add Prescription</ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        {/* Prescriptions List */}
        <View style={styles.rxList}>
          {prescriptions.map((rx) => (
            <View key={rx.id} style={styles.rxCard}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.rxGeneric}>
                  {rx.genericName} <ThemedText style={styles.rxDosage}>{rx.dosage}</ThemedText>
                </ThemedText>
                <ThemedText style={styles.rxSig}>Sig: {rx.sig}</ThemedText>
                <ThemedText style={styles.rxQty}>Dispense: #{rx.quantity} {rx.form}s</ThemedText>
                {rx.isDangerousDrug && (
                  <View style={styles.s2Badge}>
                    <ThemedText style={styles.s2BadgeText}>⚠️ PDEA S2 DANGEROUS DRUG</ThemedText>
                  </View>
                )}
              </View>
              {!isSigned && (
                <Pressable onPress={() => handleRemovePrescription(rx.id)} style={styles.removeTag}>
                  <ThemedText style={styles.removeTagText}>✕</ThemedText>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Doctor Legal Credentials */}
      <View style={styles.credentialsCard}>
        <ThemedText style={styles.credTitle}>Attending Physician Credentials</ThemedText>
        <View style={styles.credRow}>
          <View style={styles.credField}>
            <ThemedText style={styles.credLabel}>PRC License #</ThemedText>
            <TextInput
              style={styles.credInput}
              value={doctorPrc}
              onChangeText={setDoctorPrc}
              editable={!isSigned}
            />
          </View>
          <View style={styles.credField}>
            <ThemedText style={styles.credLabel}>PTR #</ThemedText>
            <TextInput
              style={styles.credInput}
              value={doctorPtr}
              onChangeText={setDoctorPtr}
              editable={!isSigned}
            />
          </View>
          <View style={styles.credField}>
            <ThemedText style={styles.credLabel}>PDEA S2 License #</ThemedText>
            <TextInput
              style={styles.credInput}
              value={doctorS2}
              onChangeText={setDoctorS2}
              editable={!isSigned}
            />
          </View>
        </View>
      </View>

      {/* Signing Action */}
      {isSigned ? (
        <View style={styles.signedBanner}>
          <ThemedText style={styles.signedTitle}>✓ Encounter Locked & Signed</ThemedText>
          <ThemedText style={styles.signedSub}>
            Cryptographically sealed by Dr. Cruz ({doctorPrc}) at {signedAt}.
          </ThemedText>
        </View>
      ) : (
        <Pressable
          style={[styles.saveButton, isSigning && styles.saveButtonDisabled]}
          onPress={handleSignAndSync}
          disabled={isSigning}
        >
          {isSigning ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <ThemedText style={styles.saveButtonText}>Sign & Sync Encounter</ThemedText>
          )}
        </Pressable>
      )}
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
  header: {
    gap: 4,
  },
  subtitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#4B5563',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  selectorContainer: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  subHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: -2,
    marginBottom: 4,
  },
  patientRow: {
    gap: 8,
  },
  patientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  patientPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  pillBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  pillBadgeActive: {
    color: '#E0F2FE',
  },
  pillName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  pillNameActive: {
    color: '#FFFFFF',
  },
  patientCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    gap: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1B4B',
  },
  patientMeta: {
    fontSize: 12,
    color: '#4338CA',
    marginTop: 2,
  },
  priorityTag: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priorityUrgent: {
    backgroundColor: '#FEE2E2',
  },
  priorityTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3730A3',
  },
  vitalsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  vitalsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vitalItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 60,
    alignItems: 'center',
  },
  vitalLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  vitalValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  vitalsPending: {
    padding: 8,
    alignItems: 'center',
  },
  vitalsPendingMsg: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  bannerCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  bannerCardError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  bannerText: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '600',
  },
  bannerTextError: {
    color: '#991B1B',
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  subHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  diagnosesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  diagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  diagCode: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
  },
  diagDesc: {
    fontSize: 12,
    color: '#075985',
    maxWidth: 180,
  },
  primaryTag: {
    fontSize: 9,
    fontWeight: '800',
    backgroundColor: '#0284C7',
    color: '#FFFFFF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  removeTag: {
    paddingLeft: 4,
  },
  removeTagText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  icdSearchWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  icdSearchInput: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  icdDropdown: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 180,
    padding: 4,
    gap: 2,
  },
  icdItem: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  icdItemCode: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
    width: 60,
  },
  icdItemDesc: {
    fontSize: 12,
    color: '#374151',
    flex: 1,
  },
  icdCloseBtn: {
    paddingVertical: 6,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  icdCloseText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  chipActiveProcedure: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  addRxBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addRxBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  rxFormCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  rxFormTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
  },
  rxInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
  },
  dangerousToggle: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  dangerousToggleActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
  },
  dangerousToggleText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  dangerousToggleTextActive: {
    color: '#DC2626',
    fontWeight: '700',
  },
  rxFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  cancelBtnText: {
    fontSize: 12,
    color: '#6B7280',
  },
  confirmRxBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  confirmRxBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rxList: {
    gap: 8,
  },
  rxCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rxGeneric: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  rxDosage: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0284C7',
  },
  rxSig: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 2,
  },
  rxQty: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  s2Badge: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  s2BadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  credentialsCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  credTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  credRow: {
    flexDirection: 'row',
    gap: 8,
  },
  credField: {
    flex: 1,
    gap: 4,
  },
  credLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  credInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },
  saveButton: {
    backgroundColor: '#0284C7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  signedBanner: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  signedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#15803D',
  },
  signedSub: {
    fontSize: 12,
    color: '#166534',
    textAlign: 'center',
  },
});
