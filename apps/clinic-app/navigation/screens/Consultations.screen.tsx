import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Modal,
  Linking,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ThemedText, Badge, Button, Input, Card } from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import PrescriptionSlipModal from '../../components/PrescriptionSlipModal';
import RecordExternalDispenseModal from '../../components/RecordExternalDispenseModal';
import {
  clinicService,
  PatientQueueItem,
  TriageVitals,
  Icd10Code,
  MedicalCertificateRecord,
  ReferralLetterRecord,
  PrescriptionSlipData,
  ClinicLabOrderRecord,
  CdsAlert,
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

const SAMPLE_LAB_RESULTS: Record<string, ClinicLabOrderRecord[]> = {
  'pat-101': [
    {
      id: 'lab-ord-101',
      tenantId: 'tenant-default',
      clinicId: 'clinic-default',
      orderNumber: 'ACC-2026-0041',
      patientId: 'pat-101',
      patientName: 'Maria Santos',
      orderDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      status: 'ResultsReceived',
      clinicalDiagnosis: 'Essential Hypertension',
      externalLabName: 'ClinicEz Central Diagnostic Laboratory',
      pathologistImpression: 'Fasting blood glucose and lipid panel within acceptable targets. Normal renal clearance.',
      verifiedByPathologist: 'Dr. Roberto Gomez, MD, FPSP',
      pathologistPrcLicense: 'PRC-0089123',
      reportReleasedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
      observationsJson: JSON.stringify([
        { analyteCode: 'FBS', analyteName: 'Fasting Blood Sugar', value: '94.0', unit: 'mg/dL', referenceInterval: '70.0 - 99.0', flag: 'Normal' },
        { analyteCode: 'CREA', analyteName: 'Serum Creatinine', value: '0.85', unit: 'mg/dL', referenceInterval: '0.6 - 1.1', flag: 'Normal' },
        { analyteCode: 'EGFR', analyteName: 'eGFR (CKD-EPI)', value: '88.5', unit: 'mL/min/1.73m2', referenceInterval: '> 60.0', flag: 'Normal' },
        { analyteCode: 'CHOL', analyteName: 'Total Cholesterol', value: '185', unit: 'mg/dL', referenceInterval: '< 200', flag: 'Normal' },
        { analyteCode: 'TRIG', analyteName: 'Triglycerides', value: '130', unit: 'mg/dL', referenceInterval: '< 150', flag: 'Normal' },
      ]),
      items: [
        { id: 'item-1', testName: 'Fasting Blood Sugar (FBS)', category: 'Clinical Chemistry', status: 'ResultsReceived' },
        { id: 'item-2', testName: 'Lipid Profile', category: 'Clinical Chemistry', status: 'ResultsReceived' },
      ],
      hasCriticalPanicAlert: false,
    }
  ],
  'pat-102': [
    {
      id: 'lab-ord-102',
      tenantId: 'tenant-default',
      clinicId: 'clinic-default',
      orderNumber: 'ACC-2026-0042',
      patientId: 'pat-102',
      patientName: 'Juan Dela Cruz',
      orderDate: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      status: 'ResultsReceived',
      clinicalDiagnosis: 'Chest discomfort & Type 2 Diabetes',
      externalLabName: 'ClinicEz Central Diagnostic Laboratory',
      pathologistImpression: 'Renal panel demonstrates moderate renal impairment (eGFR 38.0 mL/min). Recommend dose adjustment for renally eliminated medications.',
      verifiedByPathologist: 'Dr. Roberto Gomez, MD, FPSP',
      pathologistPrcLicense: 'PRC-0089123',
      reportReleasedAt: new Date(Date.now() - 44 * 60 * 60 * 1000).toISOString(),
      observationsJson: JSON.stringify([
        { analyteCode: 'FBS', analyteName: 'Fasting Blood Sugar', value: '142.0', unit: 'mg/dL', referenceInterval: '70.0 - 99.0', flag: 'High' },
        { analyteCode: 'CREA', analyteName: 'Serum Creatinine', value: '1.85', unit: 'mg/dL', referenceInterval: '0.7 - 1.3', flag: 'High' },
        { analyteCode: 'EGFR', analyteName: 'eGFR (CKD-EPI)', value: '38.0', unit: 'mL/min/1.73m2', referenceInterval: '> 60.0', flag: 'Low' },
      ]),
      items: [
        { id: 'item-3', testName: 'Serum Creatinine & eGFR', category: 'Clinical Chemistry', status: 'ResultsReceived' },
      ],
      hasCriticalPanicAlert: false,
    }
  ],
  'pat-103': [
    {
      id: 'lab-ord-103',
      tenantId: 'tenant-default',
      clinicId: 'clinic-default',
      orderNumber: 'ACC-2026-0043',
      patientId: 'pat-103',
      patientName: 'Elena Ramos',
      orderDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: 'ResultsReceived',
      clinicalDiagnosis: 'Routine Prenatal Screening & Weakness',
      externalLabName: 'ClinicEz Central Diagnostic Laboratory',
      pathologistImpression: 'STAT PANIC RESULT: Severe hyperkalemia (Potassium 6.8 mmol/L). Immediate telephone notification executed to clinic.',
      verifiedByPathologist: 'Dr. Roberto Gomez, MD, FPSP',
      pathologistPrcLicense: 'PRC-0089123',
      reportReleasedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      hasCriticalPanicAlert: true,
      panicAlertTriggeredAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
      criticalFindingsJson: JSON.stringify([
        {
          analyteCode: 'K',
          analyteName: 'Serum Potassium',
          observedValue: '6.8',
          unit: 'mmol/L',
          referenceInterval: '3.5 - 5.1',
          alertDescription: 'Severe Hyperkalemia exceeding 6.2 mmol/L panic limit. Cardiac dysrhythmia risk.'
        }
      ]),
      observationsJson: JSON.stringify([
        { analyteCode: 'K', analyteName: 'Serum Potassium', value: '6.8', unit: 'mmol/L', referenceInterval: '3.5 - 5.1', flag: 'Critical' },
        { analyteCode: 'NA', analyteName: 'Serum Sodium', value: '138', unit: 'mmol/L', referenceInterval: '135 - 145', flag: 'Normal' },
      ]),
      items: [
        { id: 'item-4', testName: 'Serum Electrolytes (Na, K, Cl)', category: 'Clinical Chemistry', status: 'ResultsReceived' },
      ],
    }
  ]
};

const PATIENT_ALLERGIES_MAP: Record<string, string> = {
  'pat-101': 'Penicillin, Aspirin',
  'pat-102': 'None known',
  'pat-103': 'Penicillin',
};

export default function ConsultationsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
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

  // Clinical Document Issuance States
  const [medCertModalVisible, setMedCertModalVisible] = useState(false);
  const [issuingMedCert, setIssuingMedCert] = useState(false);
  const [medCertFitness, setMedCertFitness] = useState('FitToWork');
  const [medCertRestDays, setMedCertRestDays] = useState('3');
  const [medCertPurpose, setMedCertPurpose] = useState('Employment / Sick Leave');
  const [medCertRemarks, setMedCertRemarks] = useState('Advised adequate hydration and rest.');
  const [issuedMedCert, setIssuedMedCert] = useState<MedicalCertificateRecord | null>(null);

  const [referralModalVisible, setReferralModalVisible] = useState(false);
  const [issuingReferral, setIssuingReferral] = useState(false);
  const [refFacility, setRefFacility] = useState('Provincial General Hospital');
  const [refDepartment, setRefDepartment] = useState('Cardiology');
  const [refUrgency, setRefUrgency] = useState('Routine');
  const [refReason, setRefReason] = useState('Evaluation & specialized diagnostic management');
  const [refSummary, setRefSummary] = useState('');
  const [issuedReferral, setIssuedReferral] = useState<ReferralLetterRecord | null>(null);

  const [previewDocModal, setPreviewDocModal] = useState(false);
  const [previewType, setPreviewType] = useState<'MEDCERT' | 'REFERRAL'>('MEDCERT');

  // Sign & Sync Status
  const [isSigning, setIsSigning] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  // E-Prescription Slip & Dual-Path Interoperability States
  const [signedConsultationId, setSignedConsultationId] = useState<string | null>(null);
  const [prescriptionSlip, setPrescriptionSlip] = useState<PrescriptionSlipData | null>(null);
  const [prescriptionSlipModalVisible, setPrescriptionSlipModalVisible] = useState(false);

  // Lab Results & STAT Panic Alerts
  const [labOrders, setLabOrders] = useState<ClinicLabOrderRecord[]>(SAMPLE_LAB_RESULTS['pat-101'] ?? []);
  const [panicModalVisible, setPanicModalVisible] = useState(false);
  const [selectedPanicOrder, setSelectedPanicOrder] = useState<ClinicLabOrderRecord | null>(null);
  const [panicAckNotes, setPanicAckNotes] = useState('Attending physician notified via clinic alert. Initiated patient telemetry and stabilization protocol.');
  const [isAcknowledgingPanic, setIsAcknowledgingPanic] = useState(false);
  const [expandedLabOrderId, setExpandedLabOrderId] = useState<string | null>(null);

  // Clinical Decision Support (CDS) Safety Engine States
  const [cdsAlerts, setCdsAlerts] = useState<CdsAlert[]>([]);
  const [evaluatingCds, setEvaluatingCds] = useState(false);
  const [cdsOverrideReason, setCdsOverrideReason] = useState('');
  const [showOverrideInput, setShowOverrideInput] = useState(false);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [externalDispenseModalVisible, setExternalDispenseModalVisible] = useState(false);
  const [loadingSlip, setLoadingSlip] = useState(false);

  // Computed Interop & CDS helpers
  const activePanicAlert = labOrders.find(o => o.hasCriticalPanicAlert && !(o.isPanicAcknowledged ?? Boolean(o.panicAcknowledgedAt))) || labOrders.find(o => o.hasCriticalPanicAlert);
  const patientLabResults = labOrders;
  const hasCriticalCdsAlert = cdsAlerts.some(a => a.severity === 'Critical');
  const attendingDoctorName = selectedPatient?.doctorName || 'Dr. Cruz, MD';

  const handleOpenPrescriptionSlip = async () => {
    if (signedConsultationId) {
      setLoadingSlip(true);
      const [slip] = await clinicService.getPrescriptionSlip(signedConsultationId);
      setLoadingSlip(false);
      if (slip) {
        setPrescriptionSlip(slip);
        setPrescriptionSlipModalVisible(true);
        return;
      }
    }

    // Dynamic fallback / draft preview
    const draftSlip: PrescriptionSlipData = {
      consultationId: signedConsultationId || 'draft-encounter',
      prescriptionNumber: prescriptionSlip?.prescriptionNumber || `RX-${new Date().getFullYear()}-00912`,
      issuedAt: new Date().toISOString(),
      clinicName: 'Metro Health Outpatient Clinic',
      clinicAddress: 'Unit 201 Medical Arts Bldg, San Pedro, Laguna',
      clinicContact: '(02) 8123-4567 • rx@metrohealth.ph',
      doctorName: selectedPatient.doctorName || 'Dr. Roberto Cruz, MD',
      doctorPrcLicense: doctorPrc || 'PRC-0149281',
      doctorPtr: doctorPtr || 'PTR-892104',
      doctorS2License: doctorS2 || 'S2-9482014',
      doctorSpecialization: 'General Outpatient Medicine',
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
      patientAge: 42,
      patientGender: 'Male',
      philHealthNumber: '12-092819281-9',
      patientAllergies: selectedPatient.vitalsSummary?.includes('Penicillin') ? 'Penicillin' : undefined,
      clinicalDiagnosis: assessment || 'Acute Bronchitis & Hypertension Stage 1',
      specialInstructions: plan || 'Take medications with meals. Complete full antibiotic course.',
      items: prescriptions.map((p, idx) => ({
        itemId: p.id || `item-${idx}`,
        genericName: p.genericName,
        brandName: undefined,
        dosage: p.dosage,
        form: p.form,
        sig: p.sig,
        quantity: p.quantity,
        durationDays: 7,
        refills: 0,
        isDangerousDrug: p.isDangerousDrug,
      })),
      publicVerificationToken: prescriptionSlip?.publicVerificationToken || 'rx-tok-98124a9c',
      publicVerificationUrl: prescriptionSlip?.publicVerificationUrl || 'https://portal.clinicez.ph/api/v1/public/rx-verify/rx-tok-98124a9c',
      qrPayload: prescriptionSlip?.qrPayload || `CLINICEZ:RX:RX-${new Date().getFullYear()}-00912:rx-tok-98124a9c`,
      dispenseStatus: prescriptionSlip?.dispenseStatus || (isSigned ? 'Pending' : 'Draft'),
      dispensedPharmacyName: prescriptionSlip?.dispensedPharmacyName,
      dispensedPharmacistName: prescriptionSlip?.dispensedPharmacistName,
      dispensedPharmacistPrc: prescriptionSlip?.dispensedPharmacistPrc,
      dispensedReceiptNumber: prescriptionSlip?.dispensedReceiptNumber,
      dispensedAt: prescriptionSlip?.dispensedAt,
      dispenseNotes: prescriptionSlip?.dispenseNotes,
    };
    setPrescriptionSlip(draftSlip);
    setPrescriptionSlipModalVisible(true);
  };

  const handleIssueMedCert = async () => {
    if (!selectedPatient) return;
    setIssuingMedCert(true);
    const [cert] = await clinicService.issueMedicalCertificate({
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
      doctorId: 'doc-001',
      doctorName: 'Dr. Cruz, MD',
      prcLicenseNumber: doctorPrc,
      ptrNumber: doctorPtr,
      diagnosis: assessment || 'Acute illness under medical evaluation',
      clinicalFindings: objective || 'Physical examination within normal limits',
      fitnessStatus: medCertFitness,
      recommendedRestDays: parseInt(medCertRestDays) || undefined,
      purpose: medCertPurpose,
      remarks: medCertRemarks,
    });
    setIssuingMedCert(false);

    if (cert) {
      setIssuedMedCert(cert);
    } else {
      setIssuedMedCert({
        id: `mc-${Date.now()}`,
        tenantId: 'tenant-default',
        clinicId: 'clinic-default',
        certificateNumber: `MC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-0001`,
        patientId: selectedPatient.patientId,
        patientName: selectedPatient.patientName,
        doctorId: 'doc-001',
        doctorName: 'Dr. Cruz, MD',
        prcLicenseNumber: doctorPrc,
        ptrNumber: doctorPtr,
        issueDate: new Date().toISOString().slice(0, 10),
        diagnosis: assessment || 'Acute illness under medical evaluation',
        clinicalFindings: objective,
        fitnessStatus: medCertFitness,
        recommendedRestDays: parseInt(medCertRestDays) || 3,
        purpose: medCertPurpose,
        remarks: medCertRemarks,
        isSigned: true,
        createdAt: new Date().toISOString(),
      });
    }
    setMedCertModalVisible(false);
    setPreviewType('MEDCERT');
    setPreviewDocModal(true);
  };

  const handleIssueReferral = async () => {
    if (!selectedPatient) return;
    setIssuingReferral(true);
    const [ref] = await clinicService.issueReferralLetter({
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
      referringDoctorId: 'doc-001',
      referringDoctorName: 'Dr. Cruz, MD',
      referredToFacility: refFacility,
      referredDepartment: refDepartment,
      urgency: refUrgency,
      reasonForReferral: refReason,
      provisionalDiagnosis: assessment || 'Clinical condition requiring specialist review',
      clinicalSummary: refSummary || subjective || 'Patient referred for diagnostic workup.',
    });
    setIssuingReferral(false);

    if (ref) {
      setIssuedReferral(ref);
    } else {
      setIssuedReferral({
        id: `ref-${Date.now()}`,
        tenantId: 'tenant-default',
        clinicId: 'clinic-default',
        referralNumber: `REF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-0001`,
        patientId: selectedPatient.patientId,
        patientName: selectedPatient.patientName,
        referringDoctorId: 'doc-001',
        referringDoctorName: 'Dr. Cruz, MD',
        referredToFacility: refFacility,
        referredDepartment: refDepartment,
        referralDate: new Date().toISOString().slice(0, 10),
        urgency: refUrgency,
        reasonForReferral: refReason,
        provisionalDiagnosis: assessment || 'Clinical condition requiring specialist review',
        clinicalSummary: refSummary || subjective,
        isSigned: true,
        createdAt: new Date().toISOString(),
      });
    }
    setReferralModalVisible(false);
    setPreviewType('REFERRAL');
    setPreviewDocModal(true);
  };

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

  // Load vitals & lab results when selected patient changes
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

    // Ingest patient lab orders & diagnostic reports
    const [labData] = await clinicService.getLabOrders(p.patientId);
    let ordersList = SAMPLE_LAB_RESULTS[p.patientId] ?? [];
    if (labData && labData.length > 0) {
      ordersList = labData;
    }
    setLabOrders(ordersList);

    // Run CDS evaluation
    runCdsScreening(prescriptions, p.patientId, ordersList);
  };

  const runCdsScreening = async (
    currentPrescriptions: LocalPrescription[],
    overridePatientId?: string,
    overrideOrders?: ClinicLabOrderRecord[]
  ) => {
    const patId = overridePatientId ?? selectedPatient?.patientId;
    const orders = overrideOrders ?? labOrders;
    const allergies = PATIENT_ALLERGIES_MAP[patId] ?? 'None';

    // Extract latest renal & electrolyte lab values from recent orders if available
    let latestCreatinine: number | undefined;
    let latestEgfr: number | undefined;
    let latestPotassium: number | undefined;

    for (const ord of orders) {
      if (ord.observationsJson) {
        try {
          const obs = JSON.parse(ord.observationsJson);
          for (const item of obs) {
            const val = parseFloat(item.value);
            if (!isNaN(val)) {
              if (item.analyteCode === 'CREA' && !latestCreatinine) latestCreatinine = val;
              if (item.analyteCode === 'EGFR' && !latestEgfr) latestEgfr = val;
              if (item.analyteCode === 'K' && !latestPotassium) latestPotassium = val;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    setEvaluatingCds(true);
    try {
      const [res, err] = await clinicService.evaluateCds({
        patientId: patId,
        patientAllergies: allergies,
        prescriptions: currentPrescriptions.map(p => ({ genericName: p.genericName, dosage: p.dosage })),
        serumCreatinineMgDl: latestCreatinine,
        egfrMlMin: latestEgfr,
        serumPotassiumMmolL: latestPotassium,
      });

      if (!err && res && res.alerts) {
        setCdsAlerts(res.alerts);
        if (res.hasCriticalAlerts) {
          setShowOverrideInput(true);
        } else {
          setShowOverrideInput(false);
          setOverrideConfirmed(false);
        }
        return;
      }
    } catch {
      // Fallback local screening
    } finally {
      setEvaluatingCds(false);
    }

    // Local client-side fallback CDS rules
    const localAlerts: CdsAlert[] = [];
    const allNames = currentPrescriptions.map(p => p.genericName.toLowerCase());

    // Allergy checks
    if (allergies.toLowerCase().includes('penicillin')) {
      for (const rx of currentPrescriptions) {
        const name = rx.genericName.toLowerCase();
        if (name.includes('amox') || name.includes('ampicillin') || name.includes('penicillin') || name.includes('augmentin')) {
          localAlerts.push({
            alertId: `loc-allergy-${rx.id}`,
            type: 'DrugAllergy',
            severity: 'Critical',
            title: `🚨 CONTRAINDICATION: Patient has documented Penicillin allergy`,
            clinicalMechanism: `${rx.genericName} is a beta-lactam penicillin. High risk of anaphylaxis and severe cutaneous reaction.`,
            recommendation: 'Do not prescribe. Substitute Macrolide or alternative class.',
            offendingDrug: rx.genericName,
            requiresOverrideReason: true,
          });
        } else if (name.includes('ceph') || name.includes('cefu') || name.includes('ceft') || name.includes('cefi')) {
          localAlerts.push({
            alertId: `loc-cross-${rx.id}`,
            type: 'DrugAllergy',
            severity: 'Major',
            title: `⚠️ CROSS-REACTIVITY WARNING: Cephalosporin in Penicillin-allergic patient`,
            clinicalMechanism: `${rx.genericName} shares structural beta-lactam motifs with penicillin (~2-5% cross-reactivity).`,
            recommendation: 'Verify reaction history. Avoid if previous reaction was angioedema or anaphylaxis.',
            offendingDrug: rx.genericName,
            requiresOverrideReason: true,
          });
        }
      }
    }

    // Aspirin & NSAID
    if (allergies.toLowerCase().includes('aspirin') || allergies.toLowerCase().includes('nsaid')) {
      for (const rx of currentPrescriptions) {
        const name = rx.genericName.toLowerCase();
        if (name.includes('ibuprofen') || name.includes('mefenamic') || name.includes('aspirin') || name.includes('naproxen') || name.includes('ketorolac')) {
          localAlerts.push({
            alertId: `loc-nsaid-allergy-${rx.id}`,
            type: 'DrugAllergy',
            severity: 'Critical',
            title: `🚨 CONTRAINDICATION: NSAID prescribed to Aspirin/NSAID-sensitive patient`,
            clinicalMechanism: `${rx.genericName} inhibits COX-1, triggering severe bronchospasm or urticaria in aspirin-exacerbated respiratory disease.`,
            recommendation: 'Do not prescribe NSAIDs. Use Paracetamol for mild analgesia.',
            offendingDrug: rx.genericName,
            requiresOverrideReason: true,
          });
        }
      }
    }

    // Warfarin + NSAID
    if (allNames.some(n => n.includes('warfarin')) && allNames.some(n => n.includes('mefenamic') || n.includes('ibuprofen') || n.includes('aspirin') || n.includes('ketorolac'))) {
      localAlerts.push({
        alertId: 'loc-warf-nsaid',
        type: 'DrugDrugInteraction',
        severity: 'Critical',
        title: '🚨 SEVERE BLEEDING RISK: Warfarin + NSAID',
        clinicalMechanism: 'Synergistic GI mucosal ulceration and platelet inhibition markedly increases major internal hemorrhage risk.',
        recommendation: 'Avoid combination. Consider Paracetamol for analgesia with INR monitoring.',
        offendingDrug: 'NSAID',
        interactingDrug: 'Warfarin',
        requiresOverrideReason: true,
      });
    }

    // ACEi/ARB + Spironolactone / Potassium
    if (allNames.some(n => n.includes('losartan') || n.includes('enalapril')) && allNames.some(n => n.includes('spironolactone') || n.includes('potassium'))) {
      localAlerts.push({
        alertId: 'loc-ace-k',
        type: 'DrugDrugInteraction',
        severity: 'Major',
        title: '⚠️ HYPERKALEMIA RISK: ACEi/ARB + Potassium-Sparing Agent',
        clinicalMechanism: 'Combined aldosterone suppression impairs renal potassium excretion, risking severe hyperkalemia.',
        recommendation: 'Monitor serum potassium and renal panel within 1-2 weeks of initiation.',
        offendingDrug: 'Spironolactone',
        interactingDrug: 'ACEi/ARB',
        requiresOverrideReason: false,
      });
    }

    // Renal check for Metformin
    if (allNames.some(n => n.includes('metformin'))) {
      if (latestEgfr && latestEgfr < 30) {
        localAlerts.push({
          alertId: 'loc-met-30',
          type: 'RenalDoseAdjustment',
          severity: 'Critical',
          title: `🚨 RENAL CONTRAINDICATION: Metformin in Severe CKD (eGFR ${latestEgfr.toFixed(1)} mL/min)`,
          clinicalMechanism: 'Drug accumulation in severe renal impairment triggers potentially fatal lactic acidosis.',
          recommendation: 'Discontinue Metformin. Switch to Linagliptin or Insulin.',
          offendingDrug: 'Metformin',
          requiresOverrideReason: true,
        });
      } else if (latestEgfr && latestEgfr < 45) {
        localAlerts.push({
          alertId: 'loc-met-45',
          type: 'RenalDoseAdjustment',
          severity: 'Major',
          title: `⚠️ RENAL DOSE ADJUSTMENT: Metformin in Moderate CKD (eGFR ${latestEgfr.toFixed(1)} mL/min)`,
          clinicalMechanism: 'Decreased clearance increases toxicity. Maximum safe dose is 1,000 mg/day.',
          recommendation: 'Limit dose to 500mg BID and monitor renal profile every 3 months.',
          offendingDrug: 'Metformin',
          requiresOverrideReason: false,
        });
      }
    }

    setCdsAlerts(localAlerts);
    if (localAlerts.some(a => a.requiresOverrideReason)) {
      setShowOverrideInput(true);
    } else {
      setShowOverrideInput(false);
      setOverrideConfirmed(false);
    }
  };

  const handleAcknowledgePanic = async () => {
    if (!selectedPanicOrder) return;
    setIsAcknowledgingPanic(true);
    try {
      const [res, err] = await clinicService.acknowledgePanicAlert(
        selectedPanicOrder.id,
        doctorPrc || 'Attending Physician',
        panicAckNotes
      );
      if (!err && res) {
        setLabOrders(prev => prev.map(o => o.id === selectedPanicOrder.id ? res : o));
      } else {
        // Local update
        setLabOrders(prev => prev.map(o => o.id === selectedPanicOrder.id ? {
          ...o,
          panicAcknowledgedAt: new Date().toISOString(),
          panicAcknowledgedBy: doctorPrc || 'Dr. Cruz, MD'
        } : o));
      }
      setPanicModalVisible(false);
      Alert.alert('STAT Panic Alert Acknowledged', 'Emergency telephone notification and clinical action logged in patient record.');
    } catch {
      Alert.alert('Error', 'Failed to acknowledge panic alert.');
    } finally {
      setIsAcknowledgingPanic(false);
    }
  };

  const handleOpenLabPdf = (orderOrId: ClinicLabOrderRecord | string) => {
    const orderId = typeof orderOrId === 'string' ? orderOrId : orderOrId.id;
    const found = typeof orderOrId === 'string' ? labOrders.find(o => o.id === orderOrId) : orderOrId;
    const url = clinicService.getLabReportPdfUrl(orderId);
    Linking.openURL(url).catch(() => {
      Alert.alert(
        'Diagnostic PDF Report',
        `Accession #${found?.orderNumber ?? orderId.slice(0, 8)}\nVerified by: ${found?.verifiedByPathologist ?? 'Pathologist'}\nPathologist Impression:\n${found?.pathologistImpression ?? 'Normal intervals.'}`
      );
    });
  };

  useEffect(() => {
    const params = route.params as { queueId?: string; patientId?: string } | undefined;
    if (params?.queueId) {
      const p = patients.find((x) => x.id === params.queueId);
      if (p) handleSelectPatient(p);
    } else if (params?.patientId) {
      const p = patients.find((x) => x.patientId === params.patientId);
      if (p) handleSelectPatient(p);
    }
  }, [route.params, patients]);

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
    const updated = [...prescriptions, newRx];
    setPrescriptions(updated);
    runCdsScreening(updated);
    setNewRxGeneric('');
    setNewRxDosage('');
    setNewRxSig('');
    setNewRxQuantity('30');
    setNewRxDangerous(false);
    setShowAddRx(false);
  };

  const handleRemovePrescription = (id: string) => {
    const updated = prescriptions.filter((p) => p.id !== id);
    setPrescriptions(updated);
    runCdsScreening(updated);
  };

  const handleSignAndSync = async () => {
    setBanner(null);

    // Clinical Decision Support (CDS) Critical Override Gate
    const criticalAlerts = cdsAlerts.filter(a => a.requiresOverrideReason);
    if (criticalAlerts.length > 0 && (!cdsOverrideReason.trim() || !overrideConfirmed)) {
      setBanner({
        text: `🚨 CDS Safety Gate: ${criticalAlerts.length} critical drug allergy / severe interaction alert(s) require clinical override justification before signing encounter.`,
        isError: true,
      });
      setShowOverrideInput(true);
      return;
    }

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
      setSignedConsultationId(consultation.id);
      await clinicService.signConsultation(consultation.id, {
        prcLicenseNumber: doctorPrc,
        ptrNumber: doctorPtr,
        s2LicenseNumber: doctorS2,
      });

      if (prescriptions.length > 0) {
        const [slip] = await clinicService.getPrescriptionSlip(consultation.id);
        if (slip) {
          setPrescriptionSlip(slip);
        }
      }
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
    <ResponsiveLayout
      headerTitle="Doctor Clinical Encounter"
      headerSubtitle="SOAP Encounter Notes • Rx, Lab Requisitions & Medical Documents"
    >
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

      {/* STAT Critical / Panic Lab Result Banner */}
      {activePanicAlert && (() => {
        const isAck = activePanicAlert.isPanicAcknowledged ?? Boolean(activePanicAlert.panicAcknowledgedAt);
        const testName = activePanicAlert.testName || activePanicAlert.items?.[0]?.testName || 'Diagnostic Panel';
        const specimenType = activePanicAlert.specimenType || 'Venous Blood';
        const findings = activePanicAlert.criticalFindings || activePanicAlert.criticalFindingsJson;
        return (
          <View style={[styles.panicBanner, isAck && styles.panicBannerAcknowledged]}>
            <View style={styles.panicHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <ThemedText style={{ fontSize: 20 }}>🚨</ThemedText>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.panicTitle}>
                    {isAck ? 'STAT CRITICAL VALUE (ACKNOWLEDGED)' : 'STAT CRITICAL / PANIC LAB VALUE ALERT'}
                  </ThemedText>
                  <ThemedText style={styles.panicSubtitle}>
                    Order #{activePanicAlert.id.slice(-6).toUpperCase()} • {testName} • Specimen: {specimenType}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.panicBadgeContainer}>
                <ThemedText style={styles.panicBadgeText}>
                  {isAck ? 'READBACK COMPLETED' : 'TELEPHONE READBACK REQUIRED'}
                </ThemedText>
              </View>
            </View>

            <View style={styles.panicDetailsCard}>
              <ThemedText style={styles.panicFindings}>
                {findings || 'Critical threshold exceeded. Immediate clinical intervention advised.'}
              </ThemedText>
              {isAck ? (
                <ThemedText style={styles.panicAckInfo}>
                  ✓ Acknowledged by Dr. {activePanicAlert.panicAcknowledgedBy ?? attendingDoctorName} on{' '}
                  {new Date(activePanicAlert.panicAcknowledgedAt || Date.now()).toLocaleTimeString()}
                </ThemedText>
              ) : (
                <ThemedText style={styles.panicUrgentPrompt}>
                  DOH / PRC Medical Technologist reported critical value requiring immediate physician verbal readback.
                </ThemedText>
              )}
            </View>

            <View style={styles.panicActionsRow}>
              {!isAck && (
                <Pressable
                  style={styles.panicAckButton}
                  onPress={() => {
                    setSelectedPanicOrder(activePanicAlert);
                    setPanicModalVisible(true);
                  }}
                >
                  <ThemedText style={styles.panicAckButtonText}>📞 Complete Statutory Readback</ThemedText>
                </Pressable>
              )}
              <Pressable
                style={styles.panicPdfButton}
                onPress={() => handleOpenLabPdf(activePanicAlert.id)}
              >
                <ThemedText style={styles.panicPdfButtonText}>📄 View Diagnostic PDF</ThemedText>
              </Pressable>
            </View>
          </View>
        );
      })()}

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

      {/* Diagnostic Lab Results & Pathologist Reports */}
      {patientLabResults.length > 0 && (
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <ThemedText style={styles.sectionHeaderTitle}>Laboratory Reports & Diagnostics ({patientLabResults.length})</ThemedText>
              <ThemedText style={styles.subHint}>Official verified lab findings from Laboratory Information System (LIS)</ThemedText>
            </View>
            <ThemedText style={{ fontSize: 11, color: '#0284C7', fontWeight: '700' }}>⚡ DOH Interop Active</ThemedText>
          </View>

          <View style={{ gap: 10, marginTop: 8 }}>
            {patientLabResults.map((order) => {
              const isFinal = order.status === 'Completed';
              const isAck = order.isPanicAcknowledged ?? Boolean(order.panicAcknowledgedAt);
              const testName = order.testName || order.items?.[0]?.testName || 'Laboratory Panel';
              const specimenType = order.specimenType || 'Venous Blood';
              const orderedDate = order.orderedAt || order.orderDate;
              const findings = order.criticalFindings || order.criticalFindingsJson;

              return (
                <View key={order.id} style={[styles.labResultCard, order.hasCriticalPanicAlert && styles.labResultCardPanic]}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <ThemedText style={styles.labResultName}>{testName}</ThemedText>
                        <View style={[styles.labStatusBadge, isFinal ? styles.labStatusFinal : styles.labStatusPending]}>
                          <ThemedText style={[styles.labStatusText, isFinal ? styles.labStatusFinalText : styles.labStatusPendingText]}>
                            {isFinal ? 'FINAL / VERIFIED' : order.status.toUpperCase()}
                          </ThemedText>
                        </View>
                        {order.hasCriticalPanicAlert && (
                          <View style={styles.panicPill}>
                            <ThemedText style={styles.panicPillText}>CRITICAL PANIC</ThemedText>
                          </View>
                        )}
                      </View>
                      <ThemedText style={styles.labResultMeta}>
                        Specimen: {specimenType} • Ordered: {new Date(orderedDate).toLocaleDateString()}
                      </ThemedText>
                    </View>

                    <Pressable
                      style={styles.labPdfBtn}
                      onPress={() => handleOpenLabPdf(order.id)}
                    >
                      <ThemedText style={styles.labPdfBtnText}>📄 PDF Report</ThemedText>
                    </Pressable>
                  </View>

                  {findings && (
                    <View style={styles.labFindingsBox}>
                      <ThemedText style={styles.labFindingsText}>
                        <ThemedText style={{ fontWeight: '700' }}>Findings: </ThemedText>
                        {findings}
                      </ThemedText>
                    </View>
                  )}

                  {order.hasCriticalPanicAlert && !isAck && (
                    <View style={styles.unackNoticeRow}>
                      <ThemedText style={styles.unackNoticeText}>
                        ⚠️ Urgent: Statutory telephone readback has not yet been logged.
                      </ThemedText>
                      <Pressable
                        onPress={() => {
                          setSelectedPanicOrder(order);
                          setPanicModalVisible(true);
                        }}
                      >
                        <ThemedText style={styles.unackActionLink}>Acknowledge Now →</ThemedText>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}

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
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {prescriptions.length > 0 && (
              <Pressable
                style={[styles.addRxBtn, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}
                onPress={handleOpenPrescriptionSlip}
                disabled={loadingSlip}
              >
                <ThemedText style={[styles.addRxBtnText, { color: '#0284C7' }]}>
                  {loadingSlip ? 'Loading...' : isSigned ? '📄 View E-Rx Slip' : '👁️ Preview Slip'}
                </ThemedText>
              </Pressable>
            )}
            {!isSigned && (
              <Pressable style={styles.addRxBtn} onPress={() => setShowAddRx(!showAddRx)}>
                <ThemedText style={styles.addRxBtnText}>+ Add Medication</ThemedText>
              </Pressable>
            )}
          </View>
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

        {/* Clinical Decision Support (CDS) Safety Engine */}
        {prescriptions.length > 0 && (
          <View style={styles.cdsContainer}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ThemedText style={{ fontSize: 16 }}>🛡️</ThemedText>
                <ThemedText style={styles.cdsTitle}>Clinical Decision Support (CDS) Safety</ThemedText>
              </View>
              {evaluatingCds ? (
                <ActivityIndicator size="small" color="#0284C7" />
              ) : (
                <Pressable onPress={() => runCdsScreening(prescriptions)}>
                  <ThemedText style={{ fontSize: 11, color: '#0284C7', fontWeight: '600' }}>Re-screen</ThemedText>
                </Pressable>
              )}
            </View>

            {cdsAlerts.length === 0 && !evaluatingCds ? (
              <View style={styles.cdsPassedBox}>
                <ThemedText style={styles.cdsPassedText}>
                  ✓ All CDS Checks Passed: No drug-allergy conflicts, harmful drug-drug interactions, or organ dosing warnings detected.
                </ThemedText>
              </View>
            ) : (
              <View style={{ gap: 8, marginTop: 4 }}>
                {cdsAlerts.map((alert) => {
                  const isCrit = alert.severity === 'Critical';
                  const isMajor = alert.severity === 'Major';
                  const alertKey = alert.ruleId || alert.alertId || `cds-${Math.random()}`;
                  const category = alert.category || alert.type;
                  const message = alert.message || alert.title;
                  const recommendation = alert.clinicalRecommendation || alert.recommendation;

                  return (
                    <View
                      key={alertKey}
                      style={[
                        styles.cdsAlertCard,
                        isCrit ? styles.cdsAlertCardCritical : isMajor ? styles.cdsAlertCardMajor : styles.cdsAlertCardModerate,
                      ]}
                    >
                      <View style={styles.rowBetween}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                          <View
                            style={[
                              styles.cdsSeverityBadge,
                              isCrit ? styles.cdsSeverityCritical : isMajor ? styles.cdsSeverityMajor : styles.cdsSeverityModerate,
                            ]}
                          >
                            <ThemedText style={styles.cdsSeverityBadgeText}>
                              {alert.severity.toUpperCase()}
                            </ThemedText>
                          </View>
                          <ThemedText style={styles.cdsCategoryText}>{category}</ThemedText>
                        </View>
                        <ThemedText style={styles.cdsDrugText}>{alert.offendingDrug}</ThemedText>
                      </View>

                      <ThemedText style={styles.cdsAlertMessage}>{message}</ThemedText>
                      {recommendation && (
                        <ThemedText style={styles.cdsAlertRecommendation}>
                          💡 Recommendation: {recommendation}
                        </ThemedText>
                      )}
                    </View>
                  );
                })}

                {/* Critical Override Block */}
                {hasCriticalCdsAlert && (
                  <View style={styles.cdsOverrideBox}>
                    <ThemedText style={styles.cdsOverrideHeading}>
                      ⚠️ Clinical Override Required to Prescribe
                    </ThemedText>
                    <ThemedText style={styles.cdsOverrideSub}>
                      A severe contraindication was flagged. In accordance with clinical governance, please specify justification:
                    </ThemedText>

                    <TextInput
                      style={styles.cdsOverrideInput}
                      placeholder="Enter clinical rationale (e.g. Desensitization protocol, alternative unavailable, monitored in ICU)..."
                      placeholderTextColor="#9CA3AF"
                      value={cdsOverrideReason}
                      onChangeText={setCdsOverrideReason}
                      multiline
                      editable={!isSigned}
                    />

                    <Pressable
                      style={styles.overrideCheckRow}
                      onPress={() => !isSigned && setOverrideConfirmed(!overrideConfirmed)}
                    >
                      <View style={[styles.overrideCheckbox, overrideConfirmed && styles.overrideCheckboxActive]}>
                        {overrideConfirmed && <ThemedText style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>✓</ThemedText>}
                      </View>
                      <ThemedText style={styles.overrideCheckLabel}>
                        I certify that clinical benefit outweighs the severe risk and have counseled the patient.
                      </ThemedText>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
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

      {/* Clinical Documents & Certificates Issuance */}
      <View style={styles.card}>
        <ThemedText style={styles.sectionHeaderTitle}>Official Clinical Document Issuance</ThemedText>
        <ThemedText style={{ fontSize: 12, color: '#6B7280' }}>
          Issue certified medical certificates and specialist referral letters with your PRC & PTR credentials.
        </ThemedText>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Pressable
            style={[styles.docActionBtn, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
            onPress={() => setMedCertModalVisible(true)}
          >
            <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#166534' }}>
              📜 Issue Medical Certificate
            </ThemedText>
          </Pressable>

          <Pressable
            style={[styles.docActionBtn, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}
            onPress={() => setReferralModalVisible(true)}
          >
            <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#0369A1' }}>
              🏥 Issue Referral Letter
            </ThemedText>
          </Pressable>
        </View>

        {/* Issued Badges */}
        {issuedMedCert && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F0FDF4', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#86EFAC' }}>
            <View>
              <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#166534' }}>
                ✓ Med Cert: {issuedMedCert.certificateNumber}
              </ThemedText>
              <ThemedText style={{ fontSize: 11, color: '#4B5563' }}>
                Status: {issuedMedCert.fitnessStatus} ({issuedMedCert.recommendedRestDays ?? 0} days rest)
              </ThemedText>
            </View>
            <Pressable
              style={{ backgroundColor: '#15803D', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
              onPress={() => { setPreviewType('MEDCERT'); setPreviewDocModal(true); }}
            >
              <ThemedText style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>View Print</ThemedText>
            </Pressable>
          </View>
        )}

        {issuedReferral && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F0F9FF', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#7DD3FC' }}>
            <View>
              <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#0369A1' }}>
                ✓ Referral: {issuedReferral.referralNumber}
              </ThemedText>
              <ThemedText style={{ fontSize: 11, color: '#4B5563' }}>
                To: {issuedReferral.referredToFacility} ({issuedReferral.referredDepartment}) • {issuedReferral.urgency}
              </ThemedText>
            </View>
            <Pressable
              style={{ backgroundColor: '#0284C7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
              onPress={() => { setPreviewType('REFERRAL'); setPreviewDocModal(true); }}
            >
              <ThemedText style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>View Print</ThemedText>
            </Pressable>
          </View>
        )}
      </View>

      {/* Signing Action */}
      {isSigned ? (
        <View style={styles.signedBanner}>
          <ThemedText style={styles.signedTitle}>✓ Encounter Locked & Signed</ThemedText>
          <ThemedText style={styles.signedSub}>
            Cryptographically sealed by Dr. Cruz ({doctorPrc}) at {signedAt}.
          </ThemedText>
          <ThemedText style={[styles.signedSub, { color: '#0369A1', fontWeight: '600', marginTop: 4 }]}>
            📡 Prescriptions broadcasted to ClinicEz Partner Pharmacy via AMQPS (Port 5671) over RabbitMQ.
          </ThemedText>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {prescriptions.length > 0 && (
              <>
                <Pressable
                  style={{
                    backgroundColor: '#0284C7',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 8,
                    flex: 1,
                    minWidth: 160,
                    alignItems: 'center',
                  }}
                  onPress={handleOpenPrescriptionSlip}
                >
                  <ThemedText style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                    📄 View E-Prescription Slip
                  </ThemedText>
                </Pressable>

                <Pressable
                  style={{
                    backgroundColor: '#0D9488',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 8,
                    flex: 1,
                    minWidth: 160,
                    alignItems: 'center',
                  }}
                  onPress={() => setExternalDispenseModalVisible(true)}
                >
                  <ThemedText style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                    🏥 Log External Dispense (Path B)
                  </ThemedText>
                </Pressable>
              </>
            )}

            <Pressable
              style={{
                backgroundColor: '#15803D',
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 8,
                flex: 1,
                minWidth: 160,
                alignItems: 'center',
              }}
              onPress={() =>
                navigation.navigate('Billing', {
                  patientId: selectedPatient.patientId,
                  patientName: selectedPatient.patientName,
                })
              }
            >
              <ThemedText style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                💵 Forward to Cashier Station →
              </ThemedText>
            </Pressable>
          </View>
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

      {/* Medical Certificate Modal */}
      <Modal visible={medCertModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Issue Medical Certificate</ThemedText>
              <Pressable onPress={() => setMedCertModalVisible(false)}>
                <ThemedText style={styles.modalCloseText}>✕</ThemedText>
              </Pressable>
            </View>

            <View style={{ gap: 10 }}>
              <ThemedText style={{ fontSize: 12, color: '#4B5563' }}>
                Patient: <ThemedText style={{ fontWeight: '700' }}>{selectedPatient?.patientName}</ThemedText>
              </ThemedText>

              <View>
                <ThemedText style={styles.modalLabel}>Fitness Assessment</ThemedText>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {['FitToWork', 'UnfitToWork', 'FitToSchool', 'LightDuty'].map((fit) => (
                    <Pressable
                      key={fit}
                      style={[
                        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
                        medCertFitness === fit && { backgroundColor: '#0284C7', borderColor: '#0284C7' },
                      ]}
                      onPress={() => setMedCertFitness(fit)}
                    >
                      <ThemedText style={[{ fontSize: 12, color: '#374151' }, medCertFitness === fit && { color: '#FFFFFF', fontWeight: '700' }]}>
                        {fit}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <ThemedText style={styles.modalLabel}>Recommended Rest Days</ThemedText>
                <TextInput
                  style={styles.modalInput}
                  placeholder="3"
                  value={medCertRestDays}
                  onChangeText={setMedCertRestDays}
                  keyboardType="numeric"
                />
              </View>

              <View>
                <ThemedText style={styles.modalLabel}>Certificate Purpose</ThemedText>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Employment / Sick Leave"
                  value={medCertPurpose}
                  onChangeText={setMedCertPurpose}
                />
              </View>

              <View>
                <ThemedText style={styles.modalLabel}>Physician Remarks / Advice</ThemedText>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Advised hydration and follow-up if fever persists."
                  value={medCertRemarks}
                  onChangeText={setMedCertRemarks}
                />
              </View>

              <Pressable
                style={[styles.modalSubmitBtn, issuingMedCert && { opacity: 0.6 }]}
                onPress={handleIssueMedCert}
                disabled={issuingMedCert}
              >
                {issuingMedCert ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.modalSubmitText}>Lock & Issue Certificate</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Referral Letter Modal */}
      <Modal visible={referralModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Issue Clinical Referral Letter</ThemedText>
              <Pressable onPress={() => setReferralModalVisible(false)}>
                <ThemedText style={styles.modalCloseText}>✕</ThemedText>
              </Pressable>
            </View>

            <View style={{ gap: 10 }}>
              <View>
                <ThemedText style={styles.modalLabel}>Receiving Facility *</ThemedText>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Provincial General Hospital"
                  value={refFacility}
                  onChangeText={setRefFacility}
                />
              </View>

              <View>
                <ThemedText style={styles.modalLabel}>Department / Specialty *</ThemedText>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Cardiology, Surgery, Pulmonary, ER"
                  value={refDepartment}
                  onChangeText={setRefDepartment}
                />
              </View>

              <View>
                <ThemedText style={styles.modalLabel}>Urgency</ThemedText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['Routine', 'Urgent', 'Emergency'].map((urg) => (
                    <Pressable
                      key={urg}
                      style={[
                        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
                        refUrgency === urg && { backgroundColor: urg === 'Emergency' ? '#DC2626' : urg === 'Urgent' ? '#D97706' : '#0284C7', borderColor: 'transparent' },
                      ]}
                      onPress={() => setRefUrgency(urg)}
                    >
                      <ThemedText style={[{ fontSize: 12, color: '#374151' }, refUrgency === urg && { color: '#FFFFFF', fontWeight: '700' }]}>
                        {urg}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <ThemedText style={styles.modalLabel}>Reason for Referral</ThemedText>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Expert cardiology workup for chest pain"
                  value={refReason}
                  onChangeText={setRefReason}
                />
              </View>

              <View>
                <ThemedText style={styles.modalLabel}>Clinical Summary</ThemedText>
                <TextInput
                  style={[styles.modalInput, { minHeight: 50 }]}
                  placeholder="Summary of examination, diagnostics, and initial medications..."
                  value={refSummary}
                  onChangeText={setRefSummary}
                  multiline
                />
              </View>

              <Pressable
                style={[styles.modalSubmitBtn, issuingReferral && { opacity: 0.6 }]}
                onPress={handleIssueReferral}
                disabled={issuingReferral}
              >
                {issuingReferral ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.modalSubmitText}>Issue & Seal Referral Letter</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Formatted Document Print Preview Modal */}
      <Modal visible={previewDocModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#1F2937' }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>
                {previewType === 'MEDCERT' ? 'Official Medical Certificate' : 'Clinical Referral Letter'}
              </ThemedText>
              <Pressable onPress={() => setPreviewDocModal(false)}>
                <ThemedText style={styles.modalCloseText}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 450 }} contentContainerStyle={{ gap: 12, padding: 8 }}>
              {/* Official Header */}
              <View style={{ alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#1F2937', paddingBottom: 10 }}>
                <ThemedText style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
                  ST. JUDE FAMILY CLINIC & PRIMARY CARE
                </ThemedText>
                <ThemedText style={{ fontSize: 11, color: '#4B5563' }}>
                  124 Rizal Avenue, San Pedro, Laguna • PHIC-KONSULTA-09214
                </ThemedText>
                <ThemedText style={{ fontSize: 13, fontWeight: '800', color: '#0369A1', marginTop: 6, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                  {previewType === 'MEDCERT' ? 'MEDICAL CERTIFICATE' : 'REFERRAL LETTER'}
                </ThemedText>
                <ThemedText style={{ fontSize: 11, color: '#6B7280' }}>
                  Document #: {previewType === 'MEDCERT' ? issuedMedCert?.certificateNumber : issuedReferral?.referralNumber}
                </ThemedText>
              </View>

              {previewType === 'MEDCERT' && issuedMedCert ? (
                <View style={{ gap: 8 }}>
                  <ThemedText style={{ fontSize: 13, color: '#1F2937' }}>
                    TO WHOM IT MAY CONCERN:
                  </ThemedText>
                  <ThemedText style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>
                    This certifies that <ThemedText style={{ fontWeight: '700' }}>{issuedMedCert.patientName}</ThemedText> was clinically evaluated on {issuedMedCert.issueDate} with the following diagnosis:
                  </ThemedText>
                  <View style={{ backgroundColor: '#F9FAFB', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                      Diagnosis: {issuedMedCert.diagnosis}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 12, color: '#4B5563', marginTop: 2 }}>
                      Findings: {issuedMedCert.clinicalFindings ?? 'Consistent with physical exam.'}
                    </ThemedText>
                  </View>
                  <ThemedText style={{ fontSize: 13, color: '#374151' }}>
                    Fitness Status: <ThemedText style={{ fontWeight: '700', color: '#15803D' }}>{issuedMedCert.fitnessStatus}</ThemedText>
                  </ThemedText>
                  <ThemedText style={{ fontSize: 13, color: '#374151' }}>
                    Recommended Rest: <ThemedText style={{ fontWeight: '700' }}>{issuedMedCert.recommendedRestDays ?? 0} days</ThemedText>
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic' }}>
                    Remarks: {issuedMedCert.remarks ?? 'None'} • Purpose: {issuedMedCert.purpose}
                  </ThemedText>
                </View>
              ) : null}

              {previewType === 'REFERRAL' && issuedReferral ? (
                <View style={{ gap: 8 }}>
                  <ThemedText style={{ fontSize: 13, color: '#374151' }}>
                    To: <ThemedText style={{ fontWeight: '700' }}>{issuedReferral.referredToFacility}</ThemedText> ({issuedReferral.referredDepartment})
                  </ThemedText>
                  <ThemedText style={{ fontSize: 13, color: '#374151' }}>
                    Patient: <ThemedText style={{ fontWeight: '700' }}>{issuedReferral.patientName}</ThemedText> • Urgency: <ThemedText style={{ fontWeight: '700', color: '#DC2626' }}>{issuedReferral.urgency}</ThemedText>
                  </ThemedText>
                  <View style={{ backgroundColor: '#F9FAFB', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                      Reason: {issuedReferral.reasonForReferral}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 12, color: '#4B5563', marginTop: 4 }}>
                      Clinical Summary: {issuedReferral.clinicalSummary}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 12, color: '#1F2937', marginTop: 4 }}>
                      Impression: {issuedReferral.provisionalDiagnosis}
                    </ThemedText>
                  </View>
                </View>
              ) : null}

              {/* Physician Signature Stamp */}
              <View style={{ marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E5E7EB', alignItems: 'flex-end' }}>
                <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                  {previewType === 'MEDCERT' ? issuedMedCert?.doctorName : issuedReferral?.referringDoctorName}
                </ThemedText>
                <ThemedText style={{ fontSize: 11, color: '#4B5563' }}>
                  PRC Lic. No.: {previewType === 'MEDCERT' ? issuedMedCert?.prcLicenseNumber : doctorPrc}
                </ThemedText>
                <ThemedText style={{ fontSize: 11, color: '#4B5563' }}>
                  PTR No.: {doctorPtr} • PDEA S2: {doctorS2}
                </ThemedText>
                <ThemedText style={{ fontSize: 10, color: '#16A34A', fontWeight: '700', marginTop: 2 }}>
                  ✓ Digitally Certified & Sealed
                </ThemedText>
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              {previewType === 'MEDCERT' && issuedMedCert && (
                <Pressable
                  style={{ flex: 1, backgroundColor: '#15803D', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                  onPress={async () => {
                    const url = clinicService.getMedicalCertificatePdfUrl(issuedMedCert.id);
                    try {
                      await Linking.openURL(url);
                    } catch {
                      Alert.alert('Download Error', 'Could not open medical certificate PDF. Please check connection and try again.');
                    }
                  }}
                >
                  <ThemedText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>📄 Download Official PDF</ThemedText>
                </Pressable>
              )}
              {previewType === 'REFERRAL' && issuedReferral && (
                <Pressable
                  style={{ flex: 1, backgroundColor: '#15803D', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                  onPress={async () => {
                    const url = clinicService.getReferralLetterPdfUrl(issuedReferral.id);
                    try {
                      await Linking.openURL(url);
                    } catch {
                      Alert.alert('Download Error', 'Could not open referral letter PDF. Please check connection and try again.');
                    }
                  }}
                >
                  <ThemedText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>📄 Download Official PDF</ThemedText>
                </Pressable>
              )}
              <Pressable
                style={{ flex: 1, backgroundColor: '#0284C7', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                onPress={() => setPreviewDocModal(false)}
              >
                <ThemedText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Done / Close Preview</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Electronic Prescription Slip Modal (Dual-Path) */}
      <PrescriptionSlipModal
        visible={prescriptionSlipModalVisible}
        onClose={() => setPrescriptionSlipModalVisible(false)}
        slip={prescriptionSlip}
        onOpenExternalDispense={() => {
          setPrescriptionSlipModalVisible(false);
          setExternalDispenseModalVisible(true);
        }}
      />

      {/* Record External Dispense Modal (Path B) */}
      <RecordExternalDispenseModal
        visible={externalDispenseModalVisible}
        onClose={() => setExternalDispenseModalVisible(false)}
        consultationId={signedConsultationId || 'draft-encounter'}
        prescriptionNumber={prescriptionSlip?.prescriptionNumber}
        onSuccess={(updated) => {
          setPrescriptionSlip(updated);
          setBanner({
            text: `✓ External dispensing by ${updated.dispensedPharmacyName} recorded successfully!`,
            isError: false,
          });
        }}
      />

      {/* Statutory Telephone Readback Acknowledgment Modal */}
      <Modal visible={panicModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 520 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ThemedText style={{ fontSize: 18 }}>🚨</ThemedText>
                <ThemedText style={styles.modalTitle}>Critical Value Readback Acknowledgment</ThemedText>
              </View>
              <Pressable onPress={() => setPanicModalVisible(false)}>
                <ThemedText style={styles.modalCloseText}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 12 }}>
              <View style={styles.panicModalInfoBox}>
                <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#991B1B' }}>
                  Statutory DOH / Clinical Laboratory Safety Standard
                </ThemedText>
                <ThemedText style={{ fontSize: 12, color: '#7F1D1D', marginTop: 2 }}>
                  Immediate physician verbal readback confirms receipt of life-threatening diagnostic findings.
                </ThemedText>
              </View>

              {selectedPanicOrder && (() => {
                const testName = selectedPanicOrder.testName || selectedPanicOrder.items?.[0]?.testName || 'Diagnostic Panel';
                const specimenType = selectedPanicOrder.specimenType || 'Venous Blood';
                const findings = selectedPanicOrder.criticalFindings || selectedPanicOrder.criticalFindingsJson;
                return (
                  <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, gap: 4 }}>
                    <ThemedText style={{ fontSize: 12, color: '#64748B' }}>
                      Patient: <ThemedText style={{ fontWeight: '700', color: '#1E293B' }}>{selectedPatient?.patientName}</ThemedText> (ID: {selectedPatient?.patientId})
                    </ThemedText>
                    <ThemedText style={{ fontSize: 12, color: '#64748B' }}>
                      Test: <ThemedText style={{ fontWeight: '700', color: '#1E293B' }}>{testName}</ThemedText> • Specimen: {specimenType}
                    </ThemedText>
                    <View style={{ backgroundColor: '#FEE2E2', padding: 8, borderRadius: 6, marginTop: 4 }}>
                      <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#B91C1C' }}>
                        {findings || 'CRITICAL THRESHOLD VIOLATION'}
                      </ThemedText>
                    </View>
                  </View>
                );
              })()}

              <View>
                <ThemedText style={styles.modalLabel}>Attending Physician *</ThemedText>
                <TextInput
                  style={styles.modalInput}
                  value={attendingDoctorName}
                  editable={false}
                  placeholder="Doctor Name, MD"
                />
              </View>

              <View>
                <ThemedText style={styles.modalLabel}>PRC License # *</ThemedText>
                <TextInput
                  style={styles.modalInput}
                  value={doctorPrc}
                  onChangeText={setDoctorPrc}
                  placeholder="PRC License"
                />
              </View>

              <View>
                <ThemedText style={styles.modalLabel}>Readback Notes / Immediate Clinical Actions *</ThemedText>
                <TextInput
                  style={[styles.modalInput, { minHeight: 70 }]}
                  multiline
                  value={panicAckNotes}
                  onChangeText={setPanicAckNotes}
                  placeholder="e.g. Verbal telephone readback confirmed with laboratory. Ordered IV calcium gluconate, nebulized salbutamol, and repeat serum K in 2 hours."
                />
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable
                style={[styles.modalCancelBtn, { flex: 1 }]}
                onPress={() => setPanicModalVisible(false)}
              >
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.panicAckSubmitBtn, isAcknowledgingPanic && { opacity: 0.6 }]}
                onPress={handleAcknowledgePanic}
                disabled={isAcknowledgingPanic}
              >
                {isAcknowledgingPanic ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.panicAckSubmitText}>✓ Sign & Confirm Readback</ThemedText>
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
  docActionBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
  },
  modalSubmitBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 10,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
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

  // STAT Panic Alert Styles
  panicBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  panicBannerAcknowledged: {
    backgroundColor: '#F0FDF4',
    borderColor: '#22C55E',
  },
  panicHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  panicTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#991B1B',
    letterSpacing: 0.5,
  },
  panicSubtitle: {
    fontSize: 11,
    color: '#7F1D1D',
    marginTop: 2,
  },
  panicBadgeContainer: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  panicBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  panicDetailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 4,
  },
  panicFindings: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
  },
  panicAckInfo: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '600',
  },
  panicUrgentPrompt: {
    fontSize: 11,
    color: '#991B1B',
    fontStyle: 'italic',
  },
  panicActionsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  panicAckButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  panicAckButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  panicPdfButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  panicPdfButtonText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
  },

  // Lab Results Styles
  labResultCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 8,
  },
  labResultCardPanic: {
    borderColor: '#F87171',
    backgroundColor: '#FEF2F2',
  },
  labResultName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  labResultMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  labStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labStatusFinal: {
    backgroundColor: '#DCFCE7',
  },
  labStatusPending: {
    backgroundColor: '#FEF3C7',
  },
  labStatusText: {
    fontSize: 9,
    fontWeight: '700',
  },
  labStatusFinalText: {
    color: '#15803D',
  },
  labStatusPendingText: {
    color: '#B45309',
  },
  panicPill: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#F87171',
  },
  panicPillText: {
    color: '#B91C1C',
    fontSize: 9,
    fontWeight: '800',
  },
  labPdfBtn: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  labPdfBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  labFindingsBox: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  labFindingsText: {
    fontSize: 12,
    color: '#334155',
  },
  unackNoticeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 6,
    borderRadius: 6,
  },
  unackNoticeText: {
    fontSize: 11,
    color: '#991B1B',
    fontWeight: '600',
    flex: 1,
  },
  unackActionLink: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '800',
    marginLeft: 6,
  },

  // CDS Styles
  cdsContainer: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  cdsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  cdsPassedBox: {
    backgroundColor: '#DCFCE7',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  cdsPassedText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
  },
  cdsAlertCard: {
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    gap: 6,
  },
  cdsAlertCardCritical: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
  },
  cdsAlertCardMajor: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  cdsAlertCardModerate: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  cdsSeverityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cdsSeverityCritical: {
    backgroundColor: '#DC2626',
  },
  cdsSeverityMajor: {
    backgroundColor: '#D97706',
  },
  cdsSeverityModerate: {
    backgroundColor: '#2563EB',
  },
  cdsSeverityBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  cdsCategoryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  cdsDrugText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  cdsAlertMessage: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },
  cdsAlertRecommendation: {
    fontSize: 11,
    color: '#4B5563',
    lineHeight: 16,
  },
  cdsOverrideBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    padding: 10,
    gap: 6,
    marginTop: 4,
  },
  cdsOverrideHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#991B1B',
  },
  cdsOverrideSub: {
    fontSize: 11,
    color: '#7F1D1D',
  },
  cdsOverrideInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    color: '#1F2937',
    minHeight: 50,
  },
  overrideCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  overrideCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  overrideCheckboxActive: {
    backgroundColor: '#DC2626',
  },
  overrideCheckLabel: {
    fontSize: 11,
    color: '#7F1D1D',
    fontWeight: '600',
    flex: 1,
  },

  // Panic Modal Additional Styles
  panicModalInfoBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
  },
  panicAckSubmitBtn: {
    flex: 2,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  panicAckSubmitText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalCancelBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
});
