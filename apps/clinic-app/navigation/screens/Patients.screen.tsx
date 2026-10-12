import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { TextInput } from '@ui/Text';
import { Alert } from '@utils/feedback';
import { useNavigation, type StaticScreenProps } from '@react-navigation/native';
import { ThemedText, Badge, Button, Input, Card, Icon, EmptyState, ErrorState, SkeletonList, ValidatedDateInput, validateDateString } from '@ui';
import SegmentedControl, { type SegmentedOption } from '@ui/SegmentedControl';
import * as DocumentPicker from 'expo-document-picker';
import {
  PatientSummarySpine,
  PatientChartModal,
  CHART_TABS,
  type ChartTab,
  ExecutiveSummaryTab,
  EncountersTimelineTab,
  DiagnosticLabTab,
  NursingProceduresTab,
  StatutoryImmunizationsTab,
  HealthProfilesTab,
  ExternalDocumentVaultTab,
  ClinicalHistoryTab,
  LifestyleSocialTab,
  ReproductiveHealthTab,
  CardiometabolicRiskTab,
} from '../../components/chart';
import { useClinic } from '@context/ClinicContext';
import { useStaff } from '@context/StaffContext';
import { openDocument } from '../../services/documentOpener';
import { notify } from '@utils/feedback';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { PERMISSIONS } from '@constants/permissions';
import { usePermission } from '@context/AuthContext';
import { LabOrderStageChip } from '../../components/interop/InteropBadges';
import PrescriptionSlipModal from '../../components/PrescriptionSlipModal';
import RecordExternalDispenseModal from '../../components/RecordExternalDispenseModal';
import PhilHealthProfileModal from '../../components/PhilHealthProfileModal';
import PhilHealthPinInput from '../../components/ui/PhilHealthPinInput';
import DebouncedDuplicateChecker from '../../components/patient/DebouncedDuplicateChecker';
import StructuredAllergyIntakeModal, {
  AllergyPillList,
  CreateAllergyRequest,
} from '../../components/patient/StructuredAllergyIntakeModal';
import EditPatientModal from '../../components/patient/EditPatientModal';
import { formatLongAge } from '../../utils/age';

import {
  clinicService,
  ClinicPatient,
  RegisterPatientPayload,
  PatientChart,
  LabOrderSlipData,
  ClinicLabOrderRecord,
  PrescriptionSlipData,
  ConsultationRecord,
  ClinicRecordAttachmentRecord,
  ClinicCustomFieldDefinition,
} from '../../services/clinicService';
import { offlineSyncService } from '../../services/offlineSyncService';
import { getSetting } from '../../services/runtimeConfig';
import { shouldQueueOffline } from '../../services/outboxPolicy';

const humanizeKey = (key: string) => {
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

type PatientFilter = 'ALL' | 'ALERTS' | 'SENIOR_PWD' | 'STUDENTS' | 'EMPLOYEES';

export type PatientsScreenProps = StaticScreenProps<{ openPatientId?: string } | undefined>;

export default function PatientsScreen({ route }: PatientsScreenProps) {
  const navigation = useNavigation<any>();
  const canImportPatient = usePermission(PERMISSIONS.patientsWrite);
  const openPatientId = route.params?.openPatientId;
  const { letterhead } = useClinic();
  const { currentName } = useStaff();
  const [patients, setPatients] = useState<ClinicPatient[] | null>(null);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<PatientFilter>('ALL');

  // Register Modal state
  const [registerVisible, setRegisterVisible] = useState(false);
  const [savingPatient, setSavingPatient] = useState(false);
  const [formClassification, setFormClassification] = useState<'General' | 'Student' | 'Employee'>('General');
  const [formStudentId, setFormStudentId] = useState('');
  const [formCollege, setFormCollege] = useState('');
  const [formProgram, setFormProgram] = useState('');
  const [formYearLevel, setFormYearLevel] = useState('');
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [tenantCustomFields, setTenantCustomFields] = useState<ClinicCustomFieldDefinition[]>([]);
  const [dynamicFieldValues, setDynamicFieldValues] = useState<Record<string, string>>({});
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formMiddleName, setFormMiddleName] = useState('');
  const [formDob, setFormDob] = useState('');
  const [formGender, setFormGender] = useState('Male');
  const [formCivilStatus, setFormCivilStatus] = useState('Single');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formBarangay, setFormBarangay] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formProvince, setFormProvince] = useState('');
  const [formPhilHealth, setFormPhilHealth] = useState('');
  const [formSeniorId, setFormSeniorId] = useState('');
  const [formPwdId, setFormPwdId] = useState('');
  const [formBloodType, setFormBloodType] = useState('');
  const [formAllergies, setFormAllergies] = useState('');
  const [formChronicConditions, setFormChronicConditions] = useState('');
  const [formAlerts, setFormAlerts] = useState('');
  const [isPinValid, setIsPinValid] = useState<boolean | null>(null);
  const [structuredAllergies, setStructuredAllergies] = useState<CreateAllergyRequest[]>([]);
  const [allergyModalVisible, setAllergyModalVisible] = useState(false);
  const [formChiefComplaint, setFormChiefComplaint] = useState('');
  const [formTriagePriority, setFormTriagePriority] = useState<'Routine' | 'Urgent' | 'Emergency'>('Routine');


  // Chart Modal state
  const [chartVisible, setChartVisible] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<ClinicPatient | null>(null);
  const [patientChart, setPatientChart] = useState<PatientChart | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [activeChartTab, setActiveChartTab] = useState<ChartTab>('summary');

  // Standalone PhilHealth Profile Modal state
  const [philHealthProfileModalVisible, setPhilHealthProfileModalVisible] = useState(false);
  const [selectedPatientForProfile, setSelectedPatientForProfile] = useState<ClinicPatient | null>(null);

  // Edit Patient Demographics state
  const [editPatientModalVisible, setEditPatientModalVisible] = useState(false);
  const [patientToEdit, setPatientToEdit] = useState<ClinicPatient | null>(null);

  // Lab Slip & External Results Interoperability state
  const [selectedSlip, setSelectedSlip] = useState<LabOrderSlipData | null>(null);
  const [slipModalVisible, setSlipModalVisible] = useState(false);
  const [attachModalVisible, setAttachModalVisible] = useState(false);
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);
  const [externalLabName, setExternalLabName] = useState('');
  const [externalFileType, setExternalFileType] = useState<'Photo' | 'PDF'>('PDF');
  const [externalNotes, setExternalNotes] = useState('');
  const [attaching, setAttaching] = useState(false);

  // External Physical Attachments & Verification (School Clinic & 80/20) state
  const [patientAttachments, setPatientAttachments] = useState<ClinicRecordAttachmentRecord[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadDocModalVisible, setUploadDocModalVisible] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docRecordType, setDocRecordType] = useState('OutsideChestXRay');
  const [docFileType, setDocFileType] = useState<'PDF' | 'Photo'>('PDF');
  const [docNotes, setDocNotes] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [pickedDocFile, setPickedDocFile] = useState<{
    name: string;
    size?: number;
    uri: string;
    mimeType?: string;
    file?: any;
  } | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [verifyingAttachmentId, setVerifyingAttachmentId] = useState<string | null>(null);

  // Prescription Slip & External Dispense (Path B) state
  const [selectedRxSlip, setSelectedRxSlip] = useState<PrescriptionSlipData | null>(null);
  const [rxSlipModalVisible, setRxSlipModalVisible] = useState(false);
  const [targetConsultationId, setTargetConsultationId] = useState<string | null>(null);
  const [targetPrescriptionNumber, setTargetPrescriptionNumber] = useState<string | undefined>(undefined);
  const [externalDispenseModalVisible, setExternalDispenseModalVisible] = useState(false);

  // Offline outbox states
  const [offlinePendingCount, setOfflinePendingCount] = useState(offlineSyncService.getPendingCount());
  const [offlineFailedCount, setOfflineFailedCount] = useState(offlineSyncService.getFailedCount());
  const [syncingOffline, setSyncingOffline] = useState(false);

  const fetchPatients = useCallback(async () => {
    const [data, err] = await clinicService.getPatients(searchTerm || undefined);
    if (err) {
      setPatientsError(err.message || 'Unable to load patients.');
      return;
    }
    setPatientsError(null);
    setPatients(data ?? []);
  }, [searchTerm]);

  useEffect(() => {
    setLoading(true);
    fetchPatients().finally(() => setLoading(false));
    clinicService.getCustomFields('ClinicPatient').then(([fields]) => {
      if (fields && fields.length > 0) {
        setTenantCustomFields(fields);
      }
    });

    const unsub = offlineSyncService.subscribe(() => {
      setOfflinePendingCount(offlineSyncService.getPendingCount());
      setOfflineFailedCount(offlineSyncService.getFailedCount());
    });
    return unsub;
  }, [fetchPatients]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPatients();
    setRefreshing(false);
  }, [fetchPatients]);

  const handleRegisterPatient = async (options?: { sendToTriage?: boolean }) => {
    const sendToTriage = options?.sendToTriage ?? false;

    if (!formFirstName.trim() || !formLastName.trim() || !formPhone.trim() || !formDob.trim()) {
      Alert.alert('Missing details', 'First name, last name, date of birth and phone number are required.');
      return;
    }

    const dobValidation = validateDateString(formDob, { boundaryMode: 'pastOrToday' });
    if (!dobValidation.isValid) {
      Alert.alert('Invalid Date of Birth', dobValidation.errorMessage || 'Please enter a valid date of birth not in the future.');
      return;
    }

    setSavingPatient(true);

    const customFields: Record<string, any> = {};
    if (formClassification === 'Student') {
      customFields['classification'] = 'Student';
      if (formStudentId.trim()) customFields['student_id'] = formStudentId.trim();
      if (formCollege.trim()) customFields['college'] = formCollege.trim();
      if (formProgram.trim()) customFields['program'] = formProgram.trim();
      if (formYearLevel.trim()) customFields['year_level'] = formYearLevel.trim();
    } else if (formClassification === 'Employee') {
      customFields['classification'] = 'Employee';
      if (formEmployeeId.trim()) customFields['employee_id'] = formEmployeeId.trim();
      if (formDepartment.trim()) customFields['department'] = formDepartment.trim();
    }

    // Merge additional tenant-configured custom fields
    Object.entries(dynamicFieldValues).forEach(([k, v]) => {
      if (v && v.trim()) {
        customFields[k] = v.trim();
      }
    });

    const allergiesSummary = structuredAllergies.length > 0
      ? structuredAllergies.map((a) => `${a.allergen} (${a.category}${a.isAnaphylactic ? ' - STAT' : ''})`).join(', ')
      : formAllergies.trim() || undefined;

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
      allergies: allergiesSummary,
      chronicConditions: formChronicConditions.trim() || undefined,
      alerts: formAlerts.trim() || undefined,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      verificationStatus: 'Verified',
      structuredAllergies: structuredAllergies.length > 0 ? structuredAllergies : undefined,
      sendToTriage,
      priority: sendToTriage ? formTriagePriority : 'Routine',
      chiefComplaint: sendToTriage && formChiefComplaint.trim() ? formChiefComplaint.trim() : undefined,
    };

    const [newPat, err] = await clinicService.registerPatient(payload);
    setSavingPatient(false);

    if (newPat) {
      setPatients((prev) => [newPat, ...(prev ?? [])]);
      if (sendToTriage) {
        const ticketText = newPat.activeQueueTicket ? ` (${newPat.activeQueueTicket})` : '';
        notify.success(`${newPat.fullName} registered & queued for triage${ticketText}.`);
      } else {
        notify.success(`${newPat.fullName} registered (${newPat.patientCode}).`);
      }
    } else if (shouldQueueOffline(err?.status ?? 0)) {
      // Server unreachable: keep the registration on this device and sync it when the connection is back.
      const offlinePat = await offlineSyncService.enqueuePatient(payload);
      setPatients((prev) => [offlinePat, ...(prev ?? [])]);
      const triageNote = sendToTriage ? ' and will be placed in the triage queue upon sync' : '';
      Alert.alert(
        'Saved on this device',
        `${offlinePat.fullName} was saved locally because the server could not be reached. It will sync automatically${triageNote}.${err?.message ? `\n\n${err.message}` : ''}`
      );
    } else {
      // The server answered and refused: the user has to fix the form, so keep it open.
      Alert.alert('Could not register patient', err?.message || 'The server rejected this registration.');
      return;
    }

    setRegisterVisible(false);
    // Reset form
    setFormClassification('General');
    setFormStudentId('');
    setFormCollege('');
    setFormProgram('');
    setFormYearLevel('');
    setFormEmployeeId('');
    setFormDepartment('');
    setFormFirstName('');
    setFormLastName('');
    setFormMiddleName('');
    setFormDob('');
    setFormGender('Male');
    setFormCivilStatus('Single');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormBarangay('');
    setFormCity('');
    setFormProvince('');
    setFormPhilHealth('');
    setFormSeniorId('');
    setFormPwdId('');
    setFormBloodType('');
    setFormAllergies('');
    setFormChronicConditions('');
    setFormAlerts('');
    setDynamicFieldValues({});
    setStructuredAllergies([]);
    setIsPinValid(null);
    setFormChiefComplaint('');
    setFormTriagePriority('Routine');
  };

  const handleViewExistingPatient = async (patientId: string) => {
    setRegisterVisible(false);
    const [patient, err] = await clinicService.getPatientById(patientId);
    if (patient) {
      handleOpenChart(patient);
    } else {
      Alert.alert('Error', err?.message || 'Could not load existing patient record.');
    }
  };

  const handleOpenChart = async (patient: ClinicPatient) => {
    setSelectedPatient(patient);
    setActiveChartTab('summary');
    setChartVisible(true);
    setLoadingChart(true);
    setLoadingAttachments(true);
    setPatientChart(null);
    const [chartData, chartErr] = await clinicService.getPatientChart(patient.id);
    if (chartData) {
      setPatientChart(chartData);
      setChartError(null);
      if (chartData.attachments && chartData.attachments.length > 0) {
        setPatientAttachments(chartData.attachments);
        setLoadingAttachments(false);
      }
    } else {
      setChartError(chartErr?.message || 'Unable to load the patient chart.');
    }
    setLoadingChart(false);

    // Fetch attachments fallback if not populated
    if (!chartData?.attachments) {
      const [attData] = await clinicService.getPatientRecordAttachments(patient.id);
      if (attData) {
        setPatientAttachments(attData);
      } else {
        setPatientAttachments([]);
      }
      setLoadingAttachments(false);
    }
  };

  // Arriving from "Scan patient QR": open the freshly imported patient's chart once.
  useEffect(() => {
    if (!openPatientId) return;
    let cancelled = false;
    (async () => {
      const [patient, err] = await clinicService.getPatientById(openPatientId);
      if (cancelled) return;
      navigation.setParams({ openPatientId: undefined });
      if (patient) {
        handleOpenChart(patient);
      } else {
        notify.error(err?.message || 'Could not open the imported patient.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPatientId]);

  const handleOpenPhilHealthProfile = (patient: ClinicPatient) => {
    setSelectedPatientForProfile(patient);
    setPhilHealthProfileModalVisible(true);
  };

  const handlePhilHealthProfileSaved = () => {
    fetchPatients();
  };

  const handleOpenEditDemographics = (patient: ClinicPatient) => {
    setPatientToEdit(patient);
    setEditPatientModalVisible(true);
  };

  const handlePatientDemographicsSaved = (updated: ClinicPatient) => {
    setPatients((prev) =>
      prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : [updated]
    );
    if (selectedPatient?.id === updated.id) {
      setSelectedPatient(updated);
    }
  };

  const handleVerifyAttachment = async (attachmentId: string, isApproved: boolean) => {
    setVerifyingAttachmentId(attachmentId);
    const rejectionReason = !isApproved ? 'Document illegible or missing official physician signature/stamp.' : undefined;
    const [, verifyErr] = await clinicService.verifyRecordAttachment(attachmentId, isApproved, rejectionReason);
    setVerifyingAttachmentId(null);
    if (verifyErr) {
      notify.error(verifyErr.message || 'Could not update the document.');
      return;
    }

    setPatientAttachments((prev) =>
      prev.map((att) =>
        att.id === attachmentId
          ? {
              ...att,
              verificationStatus: isApproved ? 'Verified' : 'Rejected',
              rejectionReason,
              verifiedAt: new Date().toISOString(),
              verifiedByStaffName: currentName || undefined,
            }
          : att
      )
    );

    notify.success(isApproved ? 'Document verified.' : 'Document rejected.');
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    try {
      const url = clinicService.getRecordAttachmentDownloadUrl(attachmentId);
      if (!(await openDocument(url))) throw new Error('Could not open the document');
    } catch (e: any) {
      Alert.alert('Unable to open document', e.message || 'Network error');
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPickedDocFile({
        name: asset.name,
        size: asset.size,
        uri: asset.uri,
        mimeType: asset.mimeType || (asset.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        file: (asset as any).file,
      });
      if (!docTitle.trim()) {
        const cleanName = asset.name.replace(/\.[^/.]+$/, '');
        setDocTitle(cleanName);
      }
      if (asset.name.toLowerCase().endsWith('.pdf')) {
        setDocFileType('PDF');
      } else {
        setDocFileType('Photo');
      }
    } catch (err: any) {
      Alert.alert('File Selection Error', err?.message || 'Could not pick file.');
    }
  };

  const handleUploadDocument = async () => {
    if (!selectedPatient) return;
    if (!docTitle.trim()) {
      Alert.alert('Title required', 'Enter a document title.');
      return;
    }

    const docDateValidation = validateDateString(docDate, { boundaryMode: 'pastOrToday' });
    if (!docDateValidation.isValid) {
      Alert.alert('Invalid Document Date', docDateValidation.errorMessage || 'Please enter a valid document date not in the future.');
      return;
    }

    const strictlyFormattedDocDate = (docDateValidation.formattedDate || new Date().toISOString().split('T')[0]).split('T')[0];

    setUploadingDoc(true);

    if (pickedDocFile) {
      try {
        const formData = new FormData();
        formData.append('PatientId', selectedPatient.id);
        formData.append('RecordType', docRecordType);
        formData.append('Title', docTitle.trim());
        if (docNotes.trim()) formData.append('Notes', docNotes.trim());
        formData.append('DocumentDate', strictlyFormattedDocDate);

        if (pickedDocFile.file) {
          formData.append('File', pickedDocFile.file);
        } else {
          formData.append('File', {
            uri: pickedDocFile.uri,
            name: pickedDocFile.name,
            type: pickedDocFile.mimeType || 'application/octet-stream',
          } as any);
        }

        const [newAtt, err] = await clinicService.uploadRecordAttachmentFile(formData);
        setUploadingDoc(false);

        if (newAtt) {
          setPatientAttachments((prev) => [newAtt, ...prev]);
          setUploadDocModalVisible(false);
          setPickedDocFile(null);
          setDocTitle('');
          setDocNotes('');
          setDocDate(new Date().toISOString().split('T')[0]);
          notify.success('Document attached to the patient record.');
          return;
        } else if (err) {
          notify.error(err.message || 'The server rejected this document upload.');
          return;
        }
      } catch (uploadErr: any) {
        setUploadingDoc(false);
        notify.error(uploadErr?.message || 'Failed to upload document file.');
        return;
      }
    }

    const payload = {
      patientId: selectedPatient.id,
      recordType: docRecordType,
      title: docTitle.trim(),
      fileName: `${docTitle.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}.${docFileType === 'PDF' ? 'pdf' : 'jpg'}`,
      contentType: docFileType === 'PDF' ? 'application/pdf' : 'image/jpeg',
      fileSizeBytes: 1024 * 450,
      storageUri: `tenants/${selectedPatient.tenantId}/clinics/${selectedPatient.clinicId}/records/${Date.now()}.${docFileType === 'PDF' ? 'pdf' : 'jpg'}.cez`,
      documentDate: strictlyFormattedDocDate,
      notes: docNotes.trim() || undefined,
      uploadedByStaffName: currentName || undefined,
      encryptionAlgorithm: 'AES-256-GCM',
      encryptionKeyId: 'cmk-v1',
    };

    const [newAtt, err] = await clinicService.uploadRecordAttachment(payload);
    setUploadingDoc(false);

    if (newAtt) {
      setPatientAttachments((prev) => [newAtt, ...prev]);
      setUploadDocModalVisible(false);
      setPickedDocFile(null);
      setDocTitle('');
      setDocNotes('');
      setDocDate(new Date().toISOString().split('T')[0]);
      notify.success('Document attached to the patient record.');
    } else if (!shouldQueueOffline(err?.status ?? 0)) {
      notify.error(err?.message || 'The server rejected this document.');
    } else {
      const queuedAtt = await offlineSyncService.enqueueAttachment(payload, currentName || undefined);
      setPatientAttachments((prev) => [queuedAtt, ...prev]);
      setUploadDocModalVisible(false);
      setPickedDocFile(null);
      setDocTitle('');
      setDocNotes('');
      setDocDate(new Date().toISOString().split('T')[0]);
      Alert.alert('Saved on this device', 'The document is queued and will upload automatically once the connection is back.');
    }
  };

  const handleViewSlip = async (orderId: string) => {
    const [slip, slipErr] = await clinicService.getLabOrderSlip(orderId);
    if (slip) {
      setSelectedSlip(slip);
      setSlipModalVisible(true);
    } else {
      notify.error(slipErr?.message || 'Unable to load the lab requisition slip.');
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
      documentUrl: [getSetting('EXPO_PUBLIC_STORAGE_PUBLIC_URL'), 'external-labs', 'lab-result.pdf'].filter(Boolean).join('/'),
      uploadedBy: currentName || undefined
    });
    setAttaching(false);
    setAttachModalVisible(false);

    if (err) {
      notify.error(err.message || 'Could not attach the laboratory result.');
    } else {
      notify.success('External laboratory result attached. Requisition marked as completed.');
    }
    if (selectedPatient) {
      handleOpenChart(selectedPatient);
    }
  };

  const handleViewPrescriptionSlip = async (consultation: ConsultationRecord) => {
    const [slip, slipErr] = await clinicService.getPrescriptionSlip(consultation.id);
    if (slip) {
      setSelectedRxSlip(slip);
      setRxSlipModalVisible(true);
    } else {
      notify.error(slipErr?.message || 'Unable to load the prescription slip.');
    }
  };

  const handleOpenExternalDispense = (consultation: ConsultationRecord) => {
    setTargetConsultationId(consultation.id);
    setTargetPrescriptionNumber(consultation.prescriptionNumber);
    setExternalDispenseModalVisible(true);
  };

  const handleExternalDispenseSuccess = (updatedSlip: PrescriptionSlipData) => {
    if (patientChart) {
      const updatedConsultations = patientChart.consultations.map(c => {
        if (c.id === updatedSlip.consultationId) {
          return {
            ...c,
            rxDispenseStatus: 'DispensedExternally' as const,
            rxDispensedPharmacyName: updatedSlip.dispensedPharmacyName,
            rxDispensedPharmacistName: updatedSlip.dispensedPharmacistName,
            rxDispensedPharmacistPrc: updatedSlip.dispensedPharmacistPrc,
            rxDispensedReceiptNumber: updatedSlip.dispensedReceiptNumber,
            rxDispensedAt: updatedSlip.dispensedAt,
            rxDispenseNotes: updatedSlip.dispenseNotes,
          };
        }
        return c;
      });
      setPatientChart({ ...patientChart, consultations: updatedConsultations });
    }
    setSelectedRxSlip(updatedSlip);
  };

  const handleQueueCheckIn = async (patient: ClinicPatient) => {
    const isUrgent = patient.alerts?.toLowerCase().includes('fall') || patient.alerts?.toLowerCase().includes('chest');
    const [, checkInErr] = await clinicService.checkInPatient({
      patientId: patient.id,
      patientName: patient.fullName,
      priority: isUrgent ? 'Urgent' : 'Routine',
      chiefComplaint: patient.chronicConditions ? `Follow-up: ${patient.chronicConditions}` : 'General consultation',
    });
    if (checkInErr) {
      notify.error(checkInErr.message || 'Could not add the patient to the queue.');
      return;
    }
    navigation.navigate('Dashboard');
  };

  const filteredPatients = (patients ?? []).filter((p) => {
    if (filterMode === 'ALERTS') {
      return (p.allergies && p.allergies.length > 0) || (p.alerts && p.alerts.length > 0);
    }
    if (filterMode === 'SENIOR_PWD') {
      return !!p.seniorCitizenId || !!p.pwdId || p.age >= 60;
    }
    if (filterMode === 'STUDENTS') {
      return p.customFields?.classification === 'Student' || !!p.customFields?.student_id;
    }
    if (filterMode === 'EMPLOYEES') {
      return p.customFields?.classification === 'Employee' || !!p.customFields?.employee_id;
    }
    return true;
  });

  const handleSyncNow = async () => {
    setSyncingOffline(true);
    const report = await offlineSyncService.syncPendingOutbox({ force: true });
    setSyncingOffline(false);
    const synced = report.syncedPatients + report.syncedAttachments;
    const remaining = report.failedCount > 0 ? ` ${report.failedCount} still waiting.` : '';
    const rejected = report.deadCount > 0 ? ` ${report.deadCount} need attention.` : '';
    Alert.alert(
      synced > 0 ? 'Sync complete' : 'Nothing synced',
      `Synced ${report.syncedPatients} patient(s) and ${report.syncedAttachments} attachment(s).${remaining}${rejected}` +
        (report.errors.length > 0 ? `\n\n${report.errors.slice(0, 3).join('\n')}` : '')
    );
    fetchPatients();
  };

  const retryPatients = () => {
    setLoading(true);
    fetchPatients().finally(() => setLoading(false));
  };

  const showSkeleton = loading && !refreshing && patients === null;

  return (
    <ResponsiveLayout
      headerTitle="Patients"
      rightAction={
        <View style={styles.headerActions}>
          {canImportPatient ? (
            <Button
              title="Scan patient QR"
              variant="outline"
              size="sm"
              icon="scan"
              onPress={() => navigation.navigate('ShareImport')}
            />
          ) : null}
          <Button title="Register patient" variant="primary" size="sm" icon="plus" onPress={() => setRegisterVisible(true)} />
        </View>
      }
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
      {/* Offline outbox sync banner */}
      {offlinePendingCount > 0 && (
        <View style={styles.offlineBanner}>
          <Icon name="wifi" size={theme.sizes.iconMd} color={theme.colors.warningText} />
          <View style={styles.offlineBannerText}>
            <ThemedText variant="bodyBold" color={theme.colors.warningText}>
              {offlinePendingCount} item{offlinePendingCount > 1 ? 's' : ''} waiting to sync
            </ThemedText>
            <ThemedText variant="small" color={theme.colors.warningText}>
              Registrations and documents saved on this device are uploaded once the connection is back.
            </ThemedText>
          </View>
          <Button
            title={syncingOffline ? 'Syncing…' : 'Sync now'}
            variant="outline"
            size="sm"
            icon="refresh"
            loading={syncingOffline}
            disabled={syncingOffline}
            onPress={handleSyncNow}
          />
        </View>
      )}

      {offlineFailedCount > 0 && (
        <View style={styles.offlineFailedBanner}>
          <Icon name="alert" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
          <View style={styles.offlineBannerText}>
            <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
              {offlineFailedCount} saved item{offlineFailedCount > 1 ? 's' : ''} could not be synced
            </ThemedText>
            <ThemedText variant="small" color={theme.colors.emergencyText}>
              The server rejected them. Retry after fixing the cause, or discard them.
            </ThemedText>
          </View>
          <Button title="Retry" variant="outline" size="sm" icon="refresh" onPress={() => offlineSyncService.retryFailed()} />
          <Button title="Discard" variant="outline" size="sm" onPress={() => offlineSyncService.discardFailed()} />
        </View>
      )}

      {/* Search */}
      <Input
        value={searchTerm}
        onChangeText={setSearchTerm}
        onSubmitEditing={fetchPatients}
        placeholder="Search by name, patient code, phone or ID number"
        leftIcon="search"
        rightIcon={searchTerm ? 'close' : undefined}
        onRightIconPress={() => setSearchTerm('')}
        returnKeyType="search"
        containerStyle={styles.searchInput}
      />

      {/* Filters */}
      <SegmentedControl<PatientFilter>
        value={filterMode}
        onChange={setFilterMode}
        options={[
          { value: 'ALL', label: 'All patients' },
          { value: 'STUDENTS', label: 'Students' },
          { value: 'EMPLOYEES', label: 'Employees' },
          { value: 'ALERTS', label: 'Alerts & allergies' },
          { value: 'SENIOR_PWD', label: 'Senior & PWD' },
        ]}
      />

      {showSkeleton ? (
        <Card>
          <View style={styles.skeletonWrap}>
            <SkeletonList rows={5} rowHeight={theme.sizes.controlLg + theme.spacing.lg} />
          </View>
        </Card>
      ) : patientsError && patients === null ? (
        <ErrorState title="Unable to load patients" message={patientsError} onRetry={retryPatients} />
      ) : filteredPatients.length === 0 ? (
        <Card>
          <EmptyState
            icon="patients"
            title={searchTerm || filterMode !== 'ALL' ? 'No patients match your search' : 'No patients registered yet'}
            description={
              searchTerm || filterMode !== 'ALL'
                ? 'Try a different name, code or filter.'
                : 'Register the first patient to start building the clinic registry.'
            }
            actionTitle={searchTerm || filterMode !== 'ALL' ? undefined : 'Register patient'}
            onAction={searchTerm || filterMode !== 'ALL' ? undefined : () => setRegisterVisible(true)}
          />
        </Card>
      ) : (
        <View style={styles.list}>
          {filteredPatients.map((item) => {
            const ageDisplay = item.dateOfBirth
              ? formatLongAge(item.dateOfBirth)
              : (item.age !== undefined && item.age !== null ? `${item.age} yrs` : null);
            const demographics = [
              ageDisplay,
              item.gender,
              item.civilStatus,
              item.bloodType ? `Blood type ${item.bloodType}` : null,
            ]
              .filter(Boolean)
              .join(' • ');
            const location = item.city ? [item.barangay, item.city].filter(Boolean).join(', ') : '';
            const hasAllergies = !!item.allergies && item.allergies !== 'None known';

            return (
              <Card key={item.id} style={styles.patientCard}>
                <View style={styles.cardBody}>
                  <View style={styles.cardTitleRow}>
                    <ThemedText variant="h3" style={styles.patientName}>
                      {item.fullName}
                    </ThemedText>
                    <Badge label={item.patientCode} variant="neutral" />
                    {item.verificationStatus === 'PendingVerification' && (
                      <Badge label="Pending verification" variant="warning" icon="hourglass" />
                    )}
                  </View>

                  {demographics ? (
                    <ThemedText variant="body" color={theme.colors.textSecondary}>
                      {demographics}
                    </ThemedText>
                  ) : null}

                  {item.customFields?.student_id ? (
                    <Badge
                      label={`Student ID ${item.customFields.student_id}${item.customFields.program ? ` • ${item.customFields.program}` : ''}${item.customFields.year_level ? ` (${item.customFields.year_level})` : ''}`}
                      variant="info"
                      style={styles.selfStart}
                    />
                  ) : item.customFields?.employee_id ? (
                    <Badge
                      label={`Employee ID ${item.customFields.employee_id}${item.customFields.department ? ` • ${item.customFields.department}` : ''}`}
                      variant="success"
                      style={styles.selfStart}
                    />
                  ) : null}

                  <ThemedText variant="small" color={theme.colors.textMuted}>
                    {[item.contactNumber, location].filter(Boolean).join(' • ')}
                  </ThemedText>

                  {item.philHealthNumber || item.seniorCitizenId || item.pwdId ? (
                    <View style={styles.badgeRow}>
                      {item.philHealthNumber ? <Badge label={`PhilHealth ${item.philHealthNumber}`} variant="primary" /> : null}
                      {item.seniorCitizenId ? <Badge label={`Senior ID ${item.seniorCitizenId}`} variant="warning" /> : null}
                      {item.pwdId ? <Badge label={`PWD ID ${item.pwdId}`} variant="purple" /> : null}
                    </View>
                  ) : null}

                  {hasAllergies ? (
                    <View style={[styles.noticeStrip, styles.allergyStrip]}>
                      <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                      <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.noticeText}>
                        Allergies: {item.allergies}
                      </ThemedText>
                    </View>
                  ) : null}

                  {item.alerts ? (
                    <View style={[styles.noticeStrip, styles.alertStrip]}>
                      <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.warningText} />
                      <ThemedText variant="small" color={theme.colors.warningText} style={styles.noticeText}>
                        {item.alerts}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>

                <View style={styles.actionRow}>
                  <Button title="View chart" variant="outline" size="sm" icon="clipboard" onPress={() => handleOpenChart(item)} />
                  <Button
                    title="Edit Demographics"
                    variant="outline"
                    size="sm"
                    icon="edit"
                    onPress={() => handleOpenEditDemographics(item)}
                  />
                  <Button
                    title="PhilHealth"
                    variant="outline"
                    size="sm"
                    icon="shield"
                    onPress={() => handleOpenPhilHealthProfile(item)}
                  />
                  <Button
                    title="Book appointment"
                    variant="secondary"
                    size="sm"
                    icon="calendar"
                    onPress={() => navigation.navigate('Appointments', { patientId: item.id, patientName: item.fullName })}
                  />
                  <Button
                    title="Add to queue"
                    variant="primary"
                    size="sm"
                    icon="plus"
                    onPress={() => handleQueueCheckIn(item)}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {/* Register Patient Modal */}
      <Modal visible={registerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Register Walk-In Patient</ThemedText>
              <Pressable onPress={() => setRegisterVisible(false)}>
                <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ gap: 12 }}>
              {/* Debounced Duplicate Detection Banner */}
              <DebouncedDuplicateChecker
                firstName={formFirstName}
                lastName={formLastName}
                dateOfBirth={formDob}
                contactNumber={formPhone}
                philHealthNumber={formPhilHealth}
                onSelectDuplicate={handleViewExistingPatient}
                onSelectExistingPatient={handleViewExistingPatient}
              />

              {/* Classification Selector */}
              <View>
                <ThemedText style={styles.inputLabel}>Patient Classification / Profile Type</ThemedText>
                <View style={styles.categoryRow}>
                  {(['General', 'Student', 'Employee'] as const).map((cat) => (
                    <Pressable
                      key={cat}
                      style={[styles.categoryPill, formClassification === cat && styles.categoryPillActive]}
                      onPress={() => setFormClassification(cat)}
                    >
                      <ThemedText style={[styles.categoryPillText, formClassification === cat && styles.categoryPillTextActive]}>
                        {cat === 'General' ? 'General' : cat === 'Student' ? 'Student' : 'Employee'}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Student-specific Institutional Fields */}
              {formClassification === 'Student' && (
                <View style={styles.institutionalBox}>
                  <ThemedText style={styles.institutionalBoxTitle}>School Clinic: Student Details</ThemedText>
                  <View style={styles.formRow}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.inputLabel}>Student ID / LRN *</ThemedText>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. 2026-10492"
                        placeholderTextColor={theme.colors.textMuted}
                        value={formStudentId}
                        onChangeText={setFormStudentId}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.inputLabel}>Year Level</ThemedText>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. 1st Year"
                        placeholderTextColor={theme.colors.textMuted}
                        value={formYearLevel}
                        onChangeText={setFormYearLevel}
                      />
                    </View>
                  </View>
                  <View style={styles.formRow}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.inputLabel}>College / Faculty</ThemedText>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. College of Computer Studies"
                        placeholderTextColor={theme.colors.textMuted}
                        value={formCollege}
                        onChangeText={setFormCollege}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.inputLabel}>Program / Course</ThemedText>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. BS Computer Science"
                        placeholderTextColor={theme.colors.textMuted}
                        value={formProgram}
                        onChangeText={setFormProgram}
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* Employee-specific Institutional Fields */}
              {formClassification === 'Employee' && (
                <View style={styles.institutionalBox}>
                  <ThemedText style={styles.institutionalBoxTitle}>School Clinic: Employee Details</ThemedText>
                  <View style={styles.formRow}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.inputLabel}>Employee ID *</ThemedText>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. EMP-2026-042"
                        placeholderTextColor={theme.colors.textMuted}
                        value={formEmployeeId}
                        onChangeText={setFormEmployeeId}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.inputLabel}>Department / Unit</ThemedText>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. Registrar / Faculty of Sciences"
                        placeholderTextColor={theme.colors.textMuted}
                        value={formDepartment}
                        onChangeText={setFormDepartment}
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* Additional Tenant-Configured Dynamic Custom Fields */}
              {tenantCustomFields
                .filter(
                  (f) =>
                    (f.category === formClassification || (!f.category && formClassification === 'General')) &&
                    !['student_id', 'college', 'program', 'year_level', 'employee_id', 'department'].includes(f.fieldKey)
                )
                .map((f) => (
                  <View key={f.id} style={{ marginTop: 2 }}>
                    <ThemedText style={styles.inputLabel}>
                      {f.label} {f.isRequired ? '*' : ''}
                    </ThemedText>
                    <TextInput
                      style={styles.textInput}
                      placeholder={f.placeholder || `Enter ${f.label}`}
                      placeholderTextColor={theme.colors.textMuted}
                      value={dynamicFieldValues[f.fieldKey] || ''}
                      onChangeText={(val) => setDynamicFieldValues((prev) => ({ ...prev, [f.fieldKey]: val }))}
                    />
                  </View>
                ))}

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>First Name *</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Maria"
                    placeholderTextColor={theme.colors.textMuted}
                    value={formFirstName}
                    onChangeText={setFormFirstName}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Last Name *</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Santos"
                    placeholderTextColor={theme.colors.textMuted}
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
                    placeholderTextColor={theme.colors.textMuted}
                    value={formMiddleName}
                    onChangeText={setFormMiddleName}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ValidatedDateInput
                    label="Date of Birth (YYYY-MM-DD)"
                    required
                    value={formDob}
                    onChangeText={setFormDob}
                    boundaryMode="pastOrToday"
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>

              {/* Sex / Gender Selector */}
              <View>
                <ThemedText style={styles.inputLabel}>Sex / Gender *</ThemedText>
                <View style={styles.categoryRow}>
                  {(['Male', 'Female', 'Other'] as const).map((gender) => (
                    <Pressable
                      key={gender}
                      style={[styles.categoryPill, formGender === gender && styles.categoryPillActive]}
                      onPress={() => setFormGender(gender)}
                    >
                      <ThemedText style={[styles.categoryPillText, formGender === gender && styles.categoryPillTextActive]}>
                        {gender}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Civil Status Selector */}
              <View>
                <ThemedText style={styles.inputLabel}>Civil Status</ThemedText>
                <View style={styles.categoryRow}>
                  {(['Single', 'Married', 'Widowed', 'Separated'] as const).map((status) => (
                    <Pressable
                      key={status}
                      style={[styles.categoryPill, formCivilStatus === status && styles.categoryPillActive]}
                      onPress={() => setFormCivilStatus(status)}
                    >
                      <ThemedText style={[styles.categoryPillText, formCivilStatus === status && styles.categoryPillTextActive]}>
                        {status}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Contact Phone *</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0917-123-4567"
                    placeholderTextColor={theme.colors.textMuted}
                    value={formPhone}
                    onChangeText={setFormPhone}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Blood Type</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="O+, A+, B+, AB+"
                    placeholderTextColor={theme.colors.textMuted}
                    value={formBloodType}
                    onChangeText={setFormBloodType}
                  />
                </View>
              </View>

              {/* Embedded PhilHealth PIN Input with Auto-Mask & Mod-11 Check */}
              <PhilHealthPinInput
                label="PhilHealth PIN (RA 11223)"
                value={formPhilHealth}
                onChangeText={setFormPhilHealth}
                onValidityChange={setIsPinValid}
              />

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Senior Citizen ID (RA 9994)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="SC-SP-2020-001"
                    placeholderTextColor={theme.colors.textMuted}
                    value={formSeniorId}
                    onChangeText={setFormSeniorId}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>PWD ID (RA 10754)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="PWD-BIN-2022-001"
                    placeholderTextColor={theme.colors.textMuted}
                    value={formPwdId}
                    onChangeText={setFormPwdId}
                  />
                </View>
              </View>

              {/* Embedded Structured Allergy Section */}
              <View style={styles.allergySectionCard}>
                <View style={styles.allergySectionHeader}>
                  <View style={styles.allergySectionTitleRow}>
                    <Icon name="emergency" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                    <ThemedText style={styles.inputLabel}>
                      Known Allergies & Anaphylaxis Alerts
                    </ThemedText>
                  </View>
                  <Button
                    title="+ Add Allergy"
                    variant="outline"
                    size="sm"
                    onPress={() => setAllergyModalVisible(true)}
                  />
                </View>

                <AllergyPillList
                  allergies={structuredAllergies}
                  onRemove={(index) => {
                    setStructuredAllergies((prev) => prev.filter((_, i) => i !== index));
                  }}
                />
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Chronic Conditions & Medical Alerts</ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Hypertension, Diabetes, High fall risk"
                  placeholderTextColor={theme.colors.textMuted}
                  value={formChronicConditions}
                  onChangeText={setFormChronicConditions}
                />
              </View>

              {/* Walk-in Triage Routing Box */}
              <View style={styles.triageRoutingBox}>
                <ThemedText style={styles.triageRoutingTitle}>Walk-in Triage Routing (Optional)</ThemedText>
                <ThemedText style={styles.inputLabel}>Chief Complaint / Triage Note</ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Fever x 3 days, cough and sore throat"
                  placeholderTextColor={theme.colors.textMuted}
                  value={formChiefComplaint}
                  onChangeText={setFormChiefComplaint}
                />
              </View>

              {/* Dual Submission Action Buttons */}
              <View style={styles.dualActionRow}>
                {/* Secondary: Save & Register Patient */}
                <Pressable
                  style={[styles.secondaryRegisterBtn, savingPatient && styles.disabledBtn]}
                  onPress={() => handleRegisterPatient({ sendToTriage: false })}
                  disabled={savingPatient}
                >
                  <ThemedText style={styles.secondaryRegisterBtnText}>Save & Register Patient</ThemedText>
                </Pressable>

                {/* Primary Teal: Register & Send to Triage */}
                <Pressable
                  style={[styles.primaryTriageBtn, savingPatient && styles.disabledBtn]}
                  onPress={() => handleRegisterPatient({ sendToTriage: true })}
                  disabled={savingPatient}
                >
                  {savingPatient ? (
                    <ActivityIndicator color={theme.colors.onPrimary} />
                  ) : (
                    <View style={styles.triageBtnContent}>
                      <Icon name="arrowRight" size={theme.sizes.iconSm} color={theme.colors.onPrimary} />
                      <ThemedText style={styles.primaryTriageBtnText}>Register & Send to Triage</ThemedText>
                    </View>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Structured Allergy Intake Sub-Modal */}
      <StructuredAllergyIntakeModal
        visible={allergyModalVisible}
        onClose={() => setAllergyModalVisible(false)}
        allergies={structuredAllergies}
        onChange={setStructuredAllergies}
      />

      {/* Patient Longitudinal Chart Workstation Modal */}
      <PatientChartModal
        visible={chartVisible}
        patient={selectedPatient}
        patientChart={patientChart}
        loadingChart={loadingChart}
        chartError={chartError}
        patientAttachments={patientAttachments}
        activeTab={activeChartTab}
        onTabChange={setActiveChartTab}
        onClose={() => setChartVisible(false)}
        onRefreshChart={() => selectedPatient && handleOpenChart(selectedPatient)}
        onViewPrescriptionSlip={handleViewPrescriptionSlip}
        onOpenExternalDispense={handleOpenExternalDispense}
        onViewLabSlip={handleViewSlip}
        onAttachExternalResult={handleOpenAttach}
        onUploadDocument={() => setUploadDocModalVisible(true)}
        onVerifyAttachment={handleVerifyAttachment}
        onDownloadAttachment={handleDownloadAttachment}
        onAdministerVaccine={async (payload) => {
          if (!selectedPatient) return;
          const [, err] = await clinicService.administerVaccine(selectedPatient.id, payload);
          if (err) {
            notify.error(err.message || 'Could not record vaccine administration.');
          } else {
            notify.success('Vaccine administration recorded.');
            handleOpenChart(selectedPatient);
          }
        }}
        onRecordHistoricalVaccine={async (payload) => {
          if (!selectedPatient) return;
          const [, err] = await clinicService.recordHistoricalImmunization(selectedPatient.id, payload);
          if (err) {
            notify.error(err.message || 'Could not record historical immunization.');
          } else {
            notify.success('Historical immunization added.');
            handleOpenChart(selectedPatient);
          }
        }}
        onRecordAefi={async (immId, payload) => {
          if (!selectedPatient) return;
          const [, err] = await clinicService.recordImmunizationAefi(selectedPatient.id, immId, payload);
          if (err) {
            notify.error(err.message || 'Could not record adverse reaction.');
          } else {
            notify.success('Adverse event (AEFI) recorded.');
            handleOpenChart(selectedPatient);
          }
        }}
        onPatientUpdated={handlePatientDemographicsSaved}
      />

      {/* Edit Patient Demographics Modal */}
      <EditPatientModal
        visible={editPatientModalVisible}
        patient={patientToEdit}
        onClose={() => {
          setEditPatientModalVisible(false);
          setPatientToEdit(null);
        }}
        onSaved={handlePatientDemographicsSaved}
      />

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
                  Present this digital slip to ANY laboratory (whether or not it uses Clinic EZ).
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

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              {selectedSlip?.orderId && (
                <Pressable
                  style={[styles.closeSlipBtn, { backgroundColor: theme.colors.successText }]}
                  onPress={async () => {
                    const url = clinicService.getLabOrderSlipPdfUrl(selectedSlip.orderId);
                    try {
                      if (!(await openDocument(url))) throw new Error('Could not open the document');
                    } catch {
                      Alert.alert('Download Error', 'Could not open requisition slip PDF. Please check connection and try again.');
                    }
                  }}
                >
                  <ThemedText style={styles.closeSlipBtnText}>Download Official Requisition PDF</ThemedText>
                </Pressable>
              )}
              <Pressable
                style={styles.closeSlipBtn}
                onPress={() => setSlipModalVisible(false)}
              >
                <ThemedText style={styles.closeSlipBtnText}>Close</ThemedText>
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
              Attach test reports from outside diagnostic centers to complete the electronic health record.
            </ThemedText>

            <View style={{ gap: 12, marginTop: 10 }}>
              <View>
                <ThemedText style={styles.inputLabel}>Diagnostic Laboratory Name *</ThemedText>
                <TextInput
                  style={styles.textInput}
                  value={externalLabName}
                  onChangeText={setExternalLabName}
                  placeholder="Laboratory name"
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
                        {fmt === 'PDF' ? 'Official PDF' : 'Scanned Photo'}
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
                  <ActivityIndicator color={theme.colors.textInverted} />
                ) : (
                  <ThemedText style={styles.confirmAttachText}>Confirm & Mark Completed</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Electronic Prescription Slip Modal (Dual-Path) */}
      <PrescriptionSlipModal
        visible={rxSlipModalVisible}
        onClose={() => setRxSlipModalVisible(false)}
        slip={selectedRxSlip}
        onOpenExternalDispense={() => {
          setRxSlipModalVisible(false);
          setExternalDispenseModalVisible(true);
        }}
      />

      {/* Record External Dispense Modal (Path B) */}
      <RecordExternalDispenseModal
        visible={externalDispenseModalVisible}
        onClose={() => setExternalDispenseModalVisible(false)}
        consultationId={targetConsultationId || ''}
        prescriptionNumber={targetPrescriptionNumber}
        onSuccess={handleExternalDispenseSuccess}
      />

      {/* Attach External Physical Document Modal (School Clinic / 80/20) */}
      <Modal visible={uploadDocModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 500 }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Attach External Physical Document</ThemedText>
              <Pressable onPress={() => setUploadDocModalVisible(false)}>
                <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
            <ThemedText style={styles.modalSub}>
              Ingest scanned physical documents (paper COR, outside Chest X-Ray films, lab sheets, or med certs) directly into {selectedPatient?.fullName}'s profile.
            </ThemedText>

            <View style={{ gap: 12, marginTop: 12 }}>
              <View>
                <ThemedText style={styles.inputLabel}>Document Title *</ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Chest X-ray (outside clinic)"
                  placeholderTextColor={theme.colors.textMuted}
                  value={docTitle}
                  onChangeText={setDocTitle}
                />
              </View>

              <ValidatedDateInput
                label="Document Date (YYYY-MM-DD)"
                required
                value={docDate}
                onChangeText={setDocDate}
                boundaryMode="pastOrToday"
                placeholder="YYYY-MM-DD"
              />

              <View>
                <ThemedText style={styles.inputLabel}>Document / Record Classification</ThemedText>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { key: 'OutsideChestXRay', label: 'Chest X-Ray' },
                    { key: 'CertificateOfRegistration', label: 'Paper COR' },
                    { key: 'MedicalCertificate', label: 'Outside MedCert' },
                    { key: 'LabResult', label: 'Lab Sheet' },
                    { key: 'Other', label: 'Other' },
                  ].map((t) => (
                    <Pressable
                      key={t.key}
                      style={[styles.formatChip, docRecordType === t.key && styles.formatChipActive]}
                      onPress={() => setDocRecordType(t.key)}
                    >
                      <ThemedText style={[styles.formatChipText, docRecordType === t.key && styles.formatChipTextActive]}>
                        {t.label}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Ingestion Source / Format</ThemedText>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['PDF', 'Photo'] as const).map((fmt) => (
                    <Pressable
                      key={fmt}
                      style={[styles.formatChip, docFileType === fmt && styles.formatChipActive]}
                      onPress={() => setDocFileType(fmt)}
                    >
                      <ThemedText style={[styles.formatChipText, docFileType === fmt && styles.formatChipTextActive]}>
                        {fmt === 'PDF' ? 'Scanned PDF' : 'Flatbed / Camera Scan'}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>File Attachment (PDF, JPEG, PNG)</ThemedText>
                {pickedDocFile ? (
                  <View style={styles.pickedFileBox}>
                    <View style={styles.pickedFileInfo}>
                      <Icon
                        name={pickedDocFile.name.toLowerCase().endsWith('.pdf') ? 'file' : 'paperclip'}
                        size={theme.sizes.iconMd}
                        color={theme.colors.primary}
                      />
                      <View style={{ flex: 1 }}>
                        <ThemedText variant="captionBold" color={theme.colors.text} numberOfLines={1}>
                          {pickedDocFile.name}
                        </ThemedText>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          {pickedDocFile.size ? `${(pickedDocFile.size / 1024).toFixed(1)} KB` : 'Ready to upload'}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pressable style={styles.changeFileBtn} onPress={handlePickDocument}>
                        <ThemedText variant="captionBold" color={theme.colors.primary}>Change</ThemedText>
                      </Pressable>
                      <Pressable style={styles.removeFileBtn} onPress={() => setPickedDocFile(null)}>
                        <ThemedText variant="captionBold" color={theme.colors.emergencyText}>Clear</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable style={styles.pickFileBtn} onPress={handlePickDocument}>
                    <Icon name="upload" size={theme.sizes.iconSm} color={theme.colors.primary} />
                    <ThemedText variant="captionBold" color={theme.colors.primary}>
                      Select Document File (PDF, JPEG, PNG)
                    </ThemedText>
                  </Pressable>
                )}
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Clinical Review Findings & Notes</ThemedText>
                <TextInput
                  style={[styles.textInput, { height: 60 }]}
                  multiline
                  placeholder="e.g. Clean chest PA film, no active pulmonary disease seen."
                  placeholderTextColor={theme.colors.textMuted}
                  value={docNotes}
                  onChangeText={setDocNotes}
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 14 }}>
                <Pressable
                  style={styles.cancelModalBtn}
                  onPress={() => setUploadDocModalVisible(false)}
                  disabled={uploadingDoc}
                >
                  <ThemedText style={styles.cancelModalText}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  style={styles.confirmAttachBtn}
                  onPress={handleUploadDocument}
                  disabled={uploadingDoc}
                >
                  {uploadingDoc ? (
                    <ActivityIndicator color={theme.colors.textInverted} />
                  ) : (
                    <ThemedText style={styles.confirmAttachText}>Save & Attach to Profile</ThemedText>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Standalone PhilHealth Patient Profile Modal (Offline & Walk-In Capable) */}
      <PhilHealthProfileModal
        visible={philHealthProfileModalVisible}
        onClose={() => {
          setPhilHealthProfileModalVisible(false);
          setSelectedPatientForProfile(null);
        }}
        patient={selectedPatientForProfile}
        onSaved={handlePhilHealthProfileSaved}
      />
    </ScrollView>
  </ResponsiveLayout>
);
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    width: '100%',
    maxWidth: theme.sizes.contentMaxWidth,
    alignSelf: 'center',
    paddingBottom: theme.spacing['4xl'],
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
  },
  offlineBannerText: {
    flex: 1,
    minWidth: 220,
    gap: theme.spacing.xs,
  },
  offlineFailedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
  },
  searchInput: {
    width: '100%',
  },
  skeletonWrap: {
    padding: theme.spacing.lg,
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
  },
  patientCard: {
    flexGrow: 1,
    flexBasis: 420,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  cardBody: {
    gap: theme.spacing.sm,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  patientName: {
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  noticeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  noticeText: {
    flex: 1,
  },
  allergyStrip: {
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
  },
  alertStrip: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    paddingBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '600',
    color: theme.colors.text,
  },
  modalSub: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputLabel: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    minHeight: theme.sizes.controlMd,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.fontSizes.md,
    color: theme.colors.text,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    minHeight: theme.sizes.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
  },
  saveBtnText: {
    color: theme.colors.textInverted,
    fontSize: theme.fontSizes.md,
    fontWeight: '700',
  },
  chartSummaryBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
  },
  chartMetric: {
    flex: 1,
    alignItems: 'center',
  },
  chartMetricVal: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  chartMetricLabel: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
  },
  chartSection: {
    gap: 6,
  },
  chartSectionTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  historyCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
    gap: 4,
  },
  labCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    gap: 6,
    marginBottom: 8,
  },
  orderNumberText: {
    fontSize: theme.fontSizes.md,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  orderStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radii.sm,
  },
  statusBadgePending: {
    backgroundColor: theme.colors.warningBg,
  },
  statusBadgeCompleted: {
    backgroundColor: theme.colors.successBg,
  },
  orderStatusText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.text,
  },
  testChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  testChip: {
    backgroundColor: theme.colors.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  testChipText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.primaryDark,
  },
  externalResultBanner: {
    backgroundColor: theme.colors.purpleBg,
    padding: 8,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.purpleBorder,
    gap: 2,
    marginTop: 4,
  },
  externalResultTitle: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.purpleText,
  },
  externalResultMeta: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.purple,
  },
  verifiedPathologistBanner: {
    backgroundColor: theme.colors.successBg,
    padding: 8,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.successBorder,
    gap: 2,
    marginTop: 4,
  },
  verifiedPathologistTitle: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.successText,
  },
  verifiedPathologistImpression: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.successText,
    fontStyle: 'italic',
  },
  labActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  viewSlipBtn: {
    backgroundColor: theme.colors.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
  },
  viewSlipBtnText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  attachResultBtn: {
    backgroundColor: theme.colors.infoBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
  },
  attachResultBtnText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.infoText,
  },
  slipHeader: {
    alignItems: 'center',
    gap: 2,
    marginBottom: 8,
  },
  slipClinicName: {
    fontSize: theme.fontSizes.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  slipClinicMeta: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
  },
  slipDivider: {
    height: 1,
    backgroundColor: theme.colors.surfaceHighlight,
    width: '100%',
    marginVertical: 6,
  },
  slipTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  slipOrderNo: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  slipSectionBox: {
    backgroundColor: theme.colors.surfaceMuted,
    padding: 10,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 3,
  },
  slipSectionHeading: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  slipBodyText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.text,
  },
  slipTestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slipTestName: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.text,
  },
  slipTestCat: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
  },
  slipQrBox: {
    backgroundColor: theme.colors.surfaceMuted,
    padding: 12,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderDark,
    alignItems: 'center',
    gap: 4,
  },
  slipQrTitle: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.text,
  },
  slipQrHelp: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  qrPlaceholder: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderDark,
    padding: 12,
    borderRadius: theme.radii.md,
    marginVertical: 6,
    alignItems: 'center',
  },
  qrCodeText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  qrPayloadText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  uploadUrlNotice: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.info,
    textAlign: 'center',
  },
  closeSlipBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
  },
  closeSlipBtnText: {
    color: theme.colors.textInverted,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
  formatChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  formatChipActive: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.info,
  },
  formatChipText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  formatChipTextActive: {
    color: theme.colors.infoText,
  },
  cancelModalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  cancelModalText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  confirmAttachBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primary,
  },
  confirmAttachText: {
    color: theme.colors.textInverted,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
  pickedFileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
  },
  pickedFileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  changeFileBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  removeFileBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderWidth: 1,
    borderColor: theme.colors.emergencyBorder,
  },
  pickFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.md,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  categoryPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  categoryPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  categoryPillText: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  categoryPillTextActive: {
    color: theme.colors.textInverted,
  },
  institutionalBox: {
    backgroundColor: theme.colors.infoBg,
    borderWidth: 1,
    borderColor: theme.colors.infoBorder,
    borderRadius: theme.radii.md,
    padding: 12,
    gap: 10,
  },
  institutionalBoxTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.infoText,
  },
  institutionalBanner: {
    backgroundColor: theme.colors.infoBg,
    borderWidth: 1,
    borderColor: theme.colors.infoBorder,
    borderRadius: theme.radii.md,
    padding: 12,
    gap: 8,
  },
  institutionalBannerTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.infoText,
  },
  institutionalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  institutionalItem: {
    minWidth: '45%',
    flex: 1,
  },
  institutionalLabel: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
  institutionalValue: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.text,
  },
  addDocBtn: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  addDocBtnText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
  attachmentCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: 12,
    gap: 8,
  },
  attachmentTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.text,
  },
  attachmentMeta: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  attachmentNotes: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  attBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
  },
  attBadgeVerified: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  attBadgePending: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  attBadgeRejected: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  attBadgeText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
  },
  attBadgeTextVerified: {
    color: theme.colors.successText,
  },
  attBadgeTextPending: {
    color: theme.colors.warningText,
  },
  attBadgeTextRejected: {
    color: theme.colors.emergencyText,
  },
  verifiedMetaBox: {
    backgroundColor: theme.colors.successBg,
    borderWidth: 1,
    borderColor: theme.colors.successBorder,
    padding: 8,
    borderRadius: theme.radii.sm,
  },
  verifiedMetaText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.successText,
    fontWeight: '600',
  },
  attActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  verifyBtn: {
    backgroundColor: theme.colors.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
  },
  verifyBtnText: {
    color: theme.colors.textInverted,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
  rejectBtn: {
    backgroundColor: theme.colors.emergency,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
  },
  rejectBtnText: {
    color: theme.colors.textInverted,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
  viewDocBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
    alignSelf: 'flex-start',
    marginTop: 8,
    marginBottom: 4,
  },
  viewDocBtnText: {
    color: theme.colors.textInverted,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
  allergySectionCard: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm + 4,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.xs,
  },
  allergySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  allergySectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  triageRoutingBox: {
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm + 4,
    gap: theme.spacing.xs,
  },
  triageRoutingTitle: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dualActionRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
  },
  secondaryRegisterBtn: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    paddingVertical: theme.spacing.sm + 4,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryRegisterBtnText: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.sm,
    fontWeight: '600',
  },
  primaryTriageBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm + 4,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triageBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  primaryTriageBtnText: {
    color: theme.colors.onPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.6,
  },
});
