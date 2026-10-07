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
import { useNavigation } from '@react-navigation/native';
import { ThemedText, Badge, Button, Input, Card, Icon, EmptyState, ErrorState, SkeletonList } from '@ui';
import SegmentedControl from '@ui/SegmentedControl';
import { useClinic } from '@context/ClinicContext';
import { useStaff } from '@context/StaffContext';
import { openDocument } from '../../services/documentOpener';
import { notify } from '@utils/feedback';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import PrescriptionSlipModal from '../../components/PrescriptionSlipModal';
import RecordExternalDispenseModal from '../../components/RecordExternalDispenseModal';
import PhilHealthProfileModal from '../../components/PhilHealthProfileModal';
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

const humanizeKey = (key: string) => {
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

type PatientFilter = 'ALL' | 'ALERTS' | 'SENIOR_PWD' | 'STUDENTS' | 'EMPLOYEES';

export default function PatientsScreen() {
  const navigation = useNavigation<any>();
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

  // Chart Modal state
  const [chartVisible, setChartVisible] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<ClinicPatient | null>(null);
  const [patientChart, setPatientChart] = useState<PatientChart | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  // Standalone PhilHealth Profile Modal state
  const [philHealthProfileModalVisible, setPhilHealthProfileModalVisible] = useState(false);
  const [selectedPatientForProfile, setSelectedPatientForProfile] = useState<ClinicPatient | null>(null);

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
    });
    return unsub;
  }, [fetchPatients]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPatients();
    setRefreshing(false);
  }, [fetchPatients]);

  const handleRegisterPatient = async () => {
    if (!formFirstName.trim() || !formLastName.trim() || !formPhone.trim() || !formDob.trim()) {
      Alert.alert('Missing details', 'First name, last name, date of birth and phone number are required.');
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
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      verificationStatus: 'Verified',
    };

    const [newPat, err] = await clinicService.registerPatient(payload);
    setSavingPatient(false);

    if (newPat) {
      setPatients((prev) => [newPat, ...(prev ?? [])]);
      notify.success(`${newPat.fullName} registered (${newPat.patientCode}).`);
    } else {
      // Offline queue fallback
      const offlinePat = await offlineSyncService.enqueuePatient(payload);
      setPatients((prev) => [offlinePat, ...(prev ?? [])]);
      Alert.alert(
        'Saved on this device',
        `${offlinePat.fullName} (${offlinePat.patientCode}) was saved locally because the server could not be reached. It will sync automatically once the connection is back.${err?.message ? `\n\n${err.message}` : ''}`
      );
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
    setFormPhone('');
    setFormEmail('');
    setFormPhilHealth('');
    setFormSeniorId('');
    setFormPwdId('');
    setFormAllergies('');
    setFormChronicConditions('');
    setFormAlerts('');
    setDynamicFieldValues({});
  };

  const handleOpenChart = async (patient: ClinicPatient) => {
    setSelectedPatient(patient);
    setChartVisible(true);
    setLoadingChart(true);
    setLoadingAttachments(true);
    setPatientChart(null);
    const [chartData, chartErr] = await clinicService.getPatientChart(patient.id);
    if (chartData) {
      setPatientChart(chartData);
      setChartError(null);
    } else {
      setChartError(chartErr?.message || 'Unable to load the patient chart.');
    }
    setLoadingChart(false);

    // Fetch attachments
    const [attData] = await clinicService.getPatientRecordAttachments(patient.id);
    if (attData) {
      setPatientAttachments(attData);
    } else {
      setPatientAttachments([]);
    }
    setLoadingAttachments(false);
  };

  const handleOpenPhilHealthProfile = (patient: ClinicPatient) => {
    setSelectedPatientForProfile(patient);
    setPhilHealthProfileModalVisible(true);
  };

  const handlePhilHealthProfileSaved = () => {
    fetchPatients();
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

  const handleUploadDocument = async () => {
    if (!selectedPatient) return;
    if (!docTitle.trim()) {
      Alert.alert('Title required', 'Enter a document title.');
      return;
    }

    setUploadingDoc(true);
    const payload = {
      patientId: selectedPatient.id,
      recordType: docRecordType,
      title: docTitle.trim(),
      fileName: `${docTitle.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}.${docFileType === 'PDF' ? 'pdf' : 'jpg'}`,
      contentType: docFileType === 'PDF' ? 'application/pdf' : 'image/jpeg',
      fileSizeBytes: 1024 * 450,
      storageUri: `tenants/${selectedPatient.tenantId}/clinics/${selectedPatient.clinicId}/records/${Date.now()}.${docFileType === 'PDF' ? 'pdf' : 'jpg'}.cez`,
      documentDate: new Date().toISOString(),
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
      setDocTitle('');
      setDocNotes('');
      notify.success('Document attached to the patient record.');
    } else {
      const queuedAtt = await offlineSyncService.enqueueAttachment(payload, currentName || undefined);
      setPatientAttachments((prev) => [queuedAtt, ...prev]);
      setUploadDocModalVisible(false);
      setDocTitle('');
      setDocNotes('');
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
      documentUrl: [process.env.EXPO_PUBLIC_STORAGE_PUBLIC_URL, 'external-labs', 'lab-result.pdf'].filter(Boolean).join('/'),
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
    const report = await offlineSyncService.syncPendingOutbox();
    setSyncingOffline(false);
    Alert.alert(
      'Sync complete',
      `Synced ${report.syncedPatients} patient(s) and ${report.syncedAttachments} attachment(s).` +
        (report.failedCount > 0 ? ` (${report.failedCount} remaining)` : '')
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
        <Button title="Register patient" variant="primary" size="sm" icon="plus" onPress={() => setRegisterVisible(true)} />
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
            const demographics = [
              item.age !== undefined && item.age !== null ? `${item.age} yrs` : null,
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
                  <ThemedText style={styles.inputLabel}>Date of Birth (YYYY-MM-DD) *</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="1990-01-01"
                    placeholderTextColor={theme.colors.textMuted}
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

              <View>
                <ThemedText style={styles.inputLabel}>PhilHealth PIN (RA 11223)</ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="12-345678901-2"
                  placeholderTextColor={theme.colors.textMuted}
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

              <View>
                <ThemedText style={styles.inputLabel}>Known Allergies (Crucial Alert)</ThemedText>
                <TextInput
                  style={[styles.textInput, { borderColor: theme.colors.emergencyBorder, backgroundColor: theme.colors.emergencySubtle }]}
                  placeholder="e.g. Penicillin, Aspirin, Shellfish"
                  placeholderTextColor={theme.colors.textMuted}
                  value={formAllergies}
                  onChangeText={setFormAllergies}
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

              <Pressable
                style={[styles.saveBtn, savingPatient && { opacity: 0.6 }]}
                onPress={handleRegisterPatient}
                disabled={savingPatient}
              >
                {savingPatient ? (
                  <ActivityIndicator color={theme.colors.textInverted} />
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
                <ThemedText variant="title">Medical chart</ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>{selectedPatient?.fullName}</ThemedText>
              </View>
              <View style={styles.chartHeaderActions}>
                {selectedPatient && (
                  <Button
                    title="PhilHealth profile"
                    variant="outline"
                    size="sm"
                    icon="shield"
                    onPress={() => handleOpenPhilHealthProfile(selectedPatient)}
                  />
                )}
                <Pressable onPress={() => setChartVisible(false)}>
                  <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            {loadingChart ? (
              <SkeletonList rows={5} />
            ) : chartError && !patientChart ? (
              <ErrorState
                title="Unable to load the chart"
                message={chartError}
                onRetry={() => selectedPatient && handleOpenChart(selectedPatient)}
              />
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

                {/* Institutional Profile Banner (Student / Employee) */}
                {selectedPatient?.customFields?.classification === 'Student' || selectedPatient?.customFields?.student_id ? (
                  <View style={styles.institutionalBanner}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ThemedText style={styles.institutionalBannerTitle}>Student Institutional Profile (COR / Enrollment)
                      </ThemedText>
                      <ThemedText style={{
                        fontSize: theme.fontSizes.xs,
                        fontWeight: '700',
                        color: selectedPatient.verificationStatus === 'PendingVerification' ? theme.colors.warningText : theme.colors.successText,
                        backgroundColor: selectedPatient.verificationStatus === 'PendingVerification' ? theme.colors.warningBg : theme.colors.successBg,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: theme.radii.sm,
                      }}>
                        {selectedPatient.verificationStatus === 'PendingVerification' ? 'Verification pending' : 'Verified Enrollment'}
                      </ThemedText>
                    </View>
                    <View style={styles.institutionalGrid}>
                      <View style={styles.institutionalItem}>
                        <ThemedText style={styles.institutionalLabel}>Student ID / LRN</ThemedText>
                        <ThemedText style={styles.institutionalValue}>{selectedPatient.customFields?.student_id || '—'}</ThemedText>
                      </View>
                      <View style={styles.institutionalItem}>
                        <ThemedText style={styles.institutionalLabel}>Year Level</ThemedText>
                        <ThemedText style={styles.institutionalValue}>{selectedPatient.customFields?.year_level || '—'}</ThemedText>
                      </View>
                      <View style={styles.institutionalItem}>
                        <ThemedText style={styles.institutionalLabel}>College</ThemedText>
                        <ThemedText style={styles.institutionalValue}>{selectedPatient.customFields?.college || '—'}</ThemedText>
                      </View>
                      <View style={styles.institutionalItem}>
                        <ThemedText style={styles.institutionalLabel}>Degree Program</ThemedText>
                        <ThemedText style={styles.institutionalValue}>{selectedPatient.customFields?.program || '—'}</ThemedText>
                      </View>
                      {selectedPatient.customFields &&
                        Object.entries(selectedPatient.customFields)
                          .filter(([k]) => !['classification', 'student_id', 'college', 'program', 'year_level', 'employee_id', 'department'].includes(k))
                          .map(([k, v]) => (
                            <View key={k} style={styles.institutionalItem}>
                              <ThemedText style={styles.institutionalLabel}>{humanizeKey(k)}</ThemedText>
                              <ThemedText style={styles.institutionalValue}>{String(v)}</ThemedText>
                            </View>
                          ))}
                    </View>
                  </View>
                ) : selectedPatient?.customFields?.classification === 'Employee' || selectedPatient?.customFields?.employee_id ? (
                  <View style={[styles.institutionalBanner, { backgroundColor: theme.colors.successBg, borderColor: theme.colors.successBorder }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ThemedText style={[styles.institutionalBannerTitle, { color: theme.colors.successText }]}>Employee Institutional Profile
                      </ThemedText>
                      <ThemedText style={{
                        fontSize: theme.fontSizes.xs,
                        fontWeight: '700',
                        color: theme.colors.successText,
                        backgroundColor: theme.colors.successBg,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: theme.radii.sm,
                      }}>Verified Staff
                      </ThemedText>
                    </View>
                    <View style={styles.institutionalGrid}>
                      <View style={styles.institutionalItem}>
                        <ThemedText style={styles.institutionalLabel}>Employee ID</ThemedText>
                        <ThemedText style={styles.institutionalValue}>{selectedPatient.customFields?.employee_id || '—'}</ThemedText>
                      </View>
                      <View style={styles.institutionalItem}>
                        <ThemedText style={styles.institutionalLabel}>Department / Unit</ThemedText>
                        <ThemedText style={styles.institutionalValue}>{selectedPatient.customFields?.department || '—'}</ThemedText>
                      </View>
                      {selectedPatient.customFields &&
                        Object.entries(selectedPatient.customFields)
                          .filter(([k]) => !['classification', 'student_id', 'college', 'program', 'year_level', 'employee_id', 'department'].includes(k))
                          .map(([k, v]) => (
                            <View key={k} style={styles.institutionalItem}>
                              <ThemedText style={styles.institutionalLabel}>{humanizeKey(k)}</ThemedText>
                              <ThemedText style={styles.institutionalValue}>{String(v)}</ThemedText>
                            </View>
                          ))}
                    </View>
                  </View>
                ) : null}

                {selectedPatient?.allergies && (
                  <View style={[styles.noticeStrip, styles.allergyStrip]}>
                    <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                    <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.noticeText}>
                      Allergies: {selectedPatient.allergies}
                    </ThemedText>
                  </View>
                )}

                {/* History Section */}
                <View style={styles.chartSection}>
                  <ThemedText style={styles.chartSectionTitle}>Clinical Visits & Diagnoses</ThemedText>
                  {patientChart.consultations && patientChart.consultations.length > 0 ? (
                    patientChart.consultations.map((c) => (
                      <View key={c.id} style={styles.historyCard}>
                        <ThemedText style={{ fontSize: theme.fontSizes.xs, fontWeight: '700', color: theme.colors.primary }}>
                          Encounter: {new Date(c.encounterDate).toLocaleDateString()} • Dr: {c.doctorName}
                        </ThemedText>
                        <ThemedText style={{ fontSize: theme.fontSizes.sm, color: theme.colors.textSecondary }}>
                          Subjective: {c.subjective ?? 'Follow-up'}
                        </ThemedText>
                        <ThemedText style={{ fontSize: theme.fontSizes.sm, fontWeight: '600', color: theme.colors.text }}>
                          Assessment: {c.assessment ?? 'Clinical examination normal'}
                        </ThemedText>

                        {/* Prescriptions & Dual-Path Status */}
                        {((c.prescriptions && c.prescriptions.length > 0) || c.prescriptionNumber) && (
                          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, gap: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <ThemedText style={{ fontSize: theme.fontSizes.xs, fontWeight: '700', color: theme.colors.textSecondary }}>Prescriptions ({c.prescriptions?.length ?? 0}):
                              </ThemedText>
                              <ThemedText style={{
                                fontSize: theme.fontSizes.xs,
                                fontWeight: '700',
                                color: c.rxDispenseStatus === 'Dispensed' ? theme.colors.successText : c.rxDispenseStatus === 'DispensedExternally' ? theme.colors.warningText : theme.colors.primary,
                                backgroundColor: c.rxDispenseStatus === 'Dispensed' ? theme.colors.successBg : c.rxDispenseStatus === 'DispensedExternally' ? theme.colors.warningBg : theme.colors.primaryLight,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: theme.radii.xs,
                              }}>
                                {c.rxDispenseStatus === 'Dispensed'
                                  ? 'Dispensed (Partner)'
                                  : c.rxDispenseStatus === 'DispensedExternally'
                                  ? `Dispensed (${c.rxDispensedPharmacyName || 'External'})`
                                  : '● In Partner Queue'}
                              </ThemedText>
                            </View>

                            {c.prescriptions && c.prescriptions.length > 0 && (
                              <ThemedText style={{ fontSize: theme.fontSizes.xs, color: theme.colors.textSecondary }}>
                                {c.prescriptions.map(p => `${p.genericName} ${p.dosage} (Qty: ${p.quantity})`).join(', ')}
                              </ThemedText>
                            )}

                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                              <Pressable
                                style={styles.viewSlipBtn}
                                onPress={() => handleViewPrescriptionSlip(c)}
                              >
                                <ThemedText style={styles.viewSlipBtnText}>View E-Rx Slip</ThemedText>
                              </Pressable>

                              {c.rxDispenseStatus !== 'Dispensed' && c.rxDispenseStatus !== 'DispensedExternally' && (
                                <Pressable
                                  style={[styles.viewSlipBtn, { backgroundColor: theme.colors.primarySubtle, borderColor: theme.colors.primaryBorder }]}
                                  onPress={() => handleOpenExternalDispense(c)}
                                >
                                  <ThemedText style={[styles.viewSlipBtnText, { color: theme.colors.primary }]}>Log External Dispense
                                  </ThemedText>
                                </Pressable>
                              )}
                            </View>
                          </View>
                        )}
                      </View>
                    ))
                  ) : (
                    <ThemedText style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.sm }}>
                      Prior visits documented under paper records. New encounters will appear here.
                    </ThemedText>
                  )}
                </View>

                <View style={styles.chartSection}>
                  <ThemedText style={styles.chartSectionTitle}>Historical Vitals Trends</ThemedText>
                  {patientChart.vitalsHistory && patientChart.vitalsHistory.length > 0 ? (
                    patientChart.vitalsHistory.map((v, i) => (
                      <View key={i} style={styles.historyCard}>
                        <ThemedText style={{ fontSize: theme.fontSizes.xs, fontWeight: '600', color: theme.colors.successText }}>
                          BP: {v.systolicBp}/{v.diastolicBp} mmHg • HR: {v.heartRateBpm} bpm • SpO2: {v.oxygenSaturationPercent}%
                        </ThemedText>
                      </View>
                    ))
                  ) : (
                    <ThemedText style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.sm }}>No vitals trend recorded yet.</ThemedText>
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

                          <ThemedText style={{ fontSize: theme.fontSizes.xs, color: theme.colors.textMuted }}>
                            Ordered: {new Date(order.orderDate).toLocaleDateString()} • Doctor: {order.orderedByDoctorName ?? 'Not recorded'}
                          </ThemedText>

                          {order.clinicalDiagnosis && (
                            <ThemedText style={{ fontSize: theme.fontSizes.xs, fontStyle: 'italic', color: theme.colors.textSecondary }}>
                              Dx: {order.clinicalDiagnosis}
                            </ThemedText>
                          )}

                          <View style={styles.testChipsRow}>
                            {order.items?.map((item, idx) => (
                              <View key={idx} style={styles.testChip}>
                                <ThemedText style={styles.testChipText}>{item.testName}</ThemedText>
                              </View>
                            ))}
                          </View>

                          {/* Dual-Path Verification Results */}
                          {order.status === 'CompletedWithExternalReport' && (
                            <View style={styles.externalResultBanner}>
                              <ThemedText style={styles.externalResultTitle}>External Lab Report ({order.externalLabName || 'Non-ClinicEz Lab'})
                              </ThemedText>
                              <ThemedText style={styles.externalResultMeta}>
                                Ingested via {order.uploadedBy || 'Portal Dropzone'} • Document Verified
                              </ThemedText>
                            </View>
                          )}

                          {order.verifiedByPathologist && (
                            <View style={styles.verifiedPathologistBanner}>
                              <ThemedText style={styles.verifiedPathologistTitle}>Verified by Pathologist: Dr. {order.verifiedByPathologist} ({order.pathologistPrcLicense})
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
                              <ThemedText style={styles.viewSlipBtnText}>View Lab Slip & QR</ThemedText>
                            </Pressable>

                            {!isCompleted && (
                              <Pressable
                                style={styles.attachResultBtn}
                                onPress={() => handleOpenAttach(order.id)}
                              >
                                <ThemedText style={styles.attachResultBtnText}>Attach External Result</ThemedText>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <ThemedText style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.sm }}>
                      No active or historical laboratory orders recorded for this patient.
                    </ThemedText>
                  )}
                </View>

                {/* Attached Physical Documents & External Records Section */}
                <View style={styles.chartSection}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <ThemedText style={styles.chartSectionTitle}>External Records & Physical Attachments ({patientAttachments.length})
                    </ThemedText>
                    <Pressable
                      style={styles.addDocBtn}
                      onPress={() => setUploadDocModalVisible(true)}
                    >
                      <ThemedText style={styles.addDocBtnText}>+ Attach External Document</ThemedText>
                    </Pressable>
                  </View>

                  <ThemedText style={{ fontSize: theme.fontSizes.xs, color: theme.colors.textMuted, marginBottom: 8 }}>
                    Scanned paper Certificate of Registration (COR), outside Chest X-Ray films, lab sheets, and outside medical clearance certificates.
                  </ThemedText>

                  {loadingAttachments ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} style={{ padding: 12 }} />
                  ) : patientAttachments.length > 0 ? (
                    patientAttachments.map((att) => {
                      const isVerified = att.verificationStatus === 'Verified';
                      const isPending = att.verificationStatus === 'PendingVerification' || !att.verificationStatus;
                      const isRejected = att.verificationStatus === 'Rejected';
                      return (
                        <View key={att.id} style={styles.attachmentCard}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <ThemedText style={styles.attachmentTitle}>{att.title}</ThemedText>
                              <ThemedText style={styles.attachmentMeta}>
                                Type: {att.recordType} • File: {att.fileName} ({Math.round(att.fileSizeBytes / 1024)} KB)
                              </ThemedText>
                              <ThemedText style={styles.attachmentMeta}>
                                Uploaded: {new Date(att.documentDate || att.createdAt).toLocaleDateString()} • Ingested by: {att.uploadedByStaffName || 'Clinic Staff'}
                              </ThemedText>
                              {att.encryptionAlgorithm ? (
                                <ThemedText style={[styles.attachmentMeta, { color: theme.colors.primary, fontWeight: '600' }]}>Encrypted At-Rest ({att.encryptionAlgorithm})
                                </ThemedText>
                              ) : null}
                              {att.notes ? (
                                <ThemedText style={styles.attachmentNotes}>Notes: {att.notes}
                                </ThemedText>
                              ) : null}
                              <Pressable
                                style={styles.viewDocBtn}
                                onPress={() => handleDownloadAttachment(att.id)}
                              >
                                <ThemedText style={styles.viewDocBtnText}>View / Decrypt Document</ThemedText>
                              </Pressable>
                            </View>
                            <View style={[
                              styles.attBadge,
                              isVerified ? styles.attBadgeVerified : isRejected ? styles.attBadgeRejected : styles.attBadgePending
                            ]}>
                              <ThemedText style={[
                                styles.attBadgeText,
                                isVerified ? styles.attBadgeTextVerified : isRejected ? styles.attBadgeTextRejected : styles.attBadgeTextPending
                              ]}>
                                {isVerified ? 'Verified' : isRejected ? 'Rejected' : 'Pending review'}
                              </ThemedText>
                            </View>
                          </View>

                          {/* Verification Meta or Action Buttons */}
                          {isVerified && att.verifiedByStaffName && (
                            <View style={styles.verifiedMetaBox}>
                              <ThemedText style={styles.verifiedMetaText}>Verified by {att.verifiedByStaffName} on {att.verifiedAt ? new Date(att.verifiedAt).toLocaleDateString() : 'today'}
                              </ThemedText>
                            </View>
                          )}

                          {isRejected && (
                            <View style={[styles.verifiedMetaBox, { backgroundColor: theme.colors.emergencySubtle, borderColor: theme.colors.emergencyBorder }]}>
                              <ThemedText style={[styles.verifiedMetaText, { color: theme.colors.emergencyText }]}>Rejection reason: {att.rejectionReason || 'Illegible or unverifiable external document.'}
                              </ThemedText>
                            </View>
                          )}

                          {isPending && (
                            <View style={styles.attActionRow}>
                              <Pressable
                                style={[styles.verifyBtn, verifyingAttachmentId === att.id && { opacity: 0.6 }]}
                                onPress={() => handleVerifyAttachment(att.id, true)}
                                disabled={verifyingAttachmentId === att.id}
                              >
                                <ThemedText style={styles.verifyBtnText}>Verify & Accept Document
                                </ThemedText>
                              </Pressable>
                              <Pressable
                                style={[styles.rejectBtn, verifyingAttachmentId === att.id && { opacity: 0.6 }]}
                                onPress={() => handleVerifyAttachment(att.id, false)}
                                disabled={verifyingAttachmentId === att.id}
                              >
                                <ThemedText style={styles.rejectBtnText}>Reject
                                </ThemedText>
                              </Pressable>
                            </View>
                          )}
                        </View>
                      );
                    })
                  ) : (
                    <EmptyState icon="paperclip" title="No documents attached" description="Outside records you attach appear here." />
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
                  Present this digital slip to ANY laboratory (whether or not it uses ClinicEz).
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
  chartHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
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
});
