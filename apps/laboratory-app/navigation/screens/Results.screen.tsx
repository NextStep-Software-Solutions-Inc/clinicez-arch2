import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert, Modal, ActivityIndicator, Linking } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { laboratoryService, LabRequisitionItem, AnalyteCatalogSpec, NotificationMethod, LabStaffMember, LabProfile } from '../../services/laboratoryService';
import { describeActionError, isPaymentRequiredError } from '../../utils/requisitionPresentation';

interface AnalyteRow {
  code: string;
  name: string;
  panel: string;
  value: string;
  unit: string;
  ref: string;
  deltaAlert?: string;
  flag?: string;
}

const staffDisplayName = (s: LabStaffMember) => [s.title, s.firstName, s.lastName].filter(Boolean).join(' ');

interface StaffPickerProps {
  label: string;
  staff: LabStaffMember[];
  selectedId: string;
  onSelect: (id: string) => void;
  emptyText: string;
}

function StaffPicker({ label, staff, selectedId, onSelect, emptyText }: StaffPickerProps) {
  return (
    <View>
      <ThemedText style={styles.inputLabel}>{label}</ThemedText>
      {staff.length === 0 ? (
        <ThemedText style={styles.modalSub}>{emptyText}</ThemedText>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {staff.map(s => (
            <Pressable
              key={s.id}
              style={[styles.formatChip, selectedId === s.id && styles.formatChipActive]}
              onPress={() => onSelect(s.id)}
            >
              <ThemedText style={[styles.formatChipText, selectedId === s.id && styles.formatChipTextActive]}>
                {staffDisplayName(s)}{s.prcLicenseNumber ? ` • PRC ${s.prcLicenseNumber}` : ' • no PRC on file'}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
export default function ResultsScreen() {
  const [orders, setOrders] = useState<LabRequisitionItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<LabRequisitionItem | null>(null);
  const [catalog, setCatalog] = useState<AnalyteCatalogSpec[]>([]);
  const [activePanelFilter, setActivePanelFilter] = useState<string>('All');

  const [rows, setRows] = useState<AnalyteRow[]>([]);

  // Modals state
  const [signModalVisible, setSignModalVisible] = useState(false);
  const [analyzerModalVisible, setAnalyzerModalVisible] = useState(false);
  const [panicModalVisible, setPanicModalVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Signatories are chosen from the laboratory's own staff records
  const [pathologists, setPathologists] = useState<LabStaffMember[]>([]);
  const [medTechs, setMedTechs] = useState<LabStaffMember[]>([]);
  const [pathologistId, setPathologistId] = useState('');
  const [medTechId, setMedTechId] = useState('');
  const [labProfile, setLabProfile] = useState<LabProfile | null>(null);
  const [impression, setImpression] = useState('');
  // Analyzer simulator state
  const [analyzerModel, setAnalyzerModel] = useState('Mindray BC-5150');
  const [analyzerFormat, setAnalyzerFormat] = useState('ASTM');
  const [simulatedRawPayload, setSimulatedRawPayload] = useState('');
  const [simulatorEnabled, setSimulatorEnabled] = useState(false);

  // Panic dispatch modal state
  const [notifiedDoctor, setNotifiedDoctor] = useState('');
  const [readbackNotes, setReadbackNotes] = useState('');
  const [notificationMethod, setNotificationMethod] = useState<NotificationMethod>('Telephone');

  useEffect(() => {
    laboratoryService.getAnalyzerCapabilities().then(([capabilities]) => {
      setSimulatorEnabled(capabilities?.simulatorEnabled === true);
    });
  }, []);

  useEffect(() => {
    Promise.all([
      laboratoryService.getWorklist(),
      laboratoryService.getCatalog(),
      laboratoryService.getStaff('Pathologist', true),
      laboratoryService.getStaff('MedicalTechnologist', true),
      laboratoryService.getLabProfile(),
    ]).then(([[data], [cat], [pathologistStaff], [medTechStaff], [profile]]) => {
      const specs = cat ?? [];
      setCatalog(specs);
      setPathologists(pathologistStaff ?? []);
      setMedTechs(medTechStaff ?? []);
      setLabProfile(profile);
      if (data && data.length > 0) {
        setOrders(data);
        setSelectedOrder(data[0]);
        syncOrderResults(data[0], specs);
      }
    });
  }, []);

  const syncOrderResults = (order: LabRequisitionItem, specs: AnalyteCatalogSpec[] = catalog) => {
    if (order.analyteResults && order.analyteResults.length > 0) {
      setRows(order.analyteResults.map(a => ({
        code: a.analyteCode,
        name: a.analyteName,
        panel: a.panelName,
        value: a.value,
        unit: a.unit,
        ref: a.referenceInterval,
        flag: a.flag,
        deltaAlert: a.deltaCheckAlert || (a.interpretation?.includes('DELTA') ? a.interpretation : undefined),
      })));
    } else {
      setRows(specs.map(c => ({
        code: c.analyteCode,
        name: c.analyteName,
        panel: c.panelName,
        value: '',
        unit: c.unit,
        ref: c.referenceInterval,
      })));
    }
  };

  const handleSelectOrder = (order: LabRequisitionItem) => {
    setSelectedOrder(order);
    syncOrderResults(order);
    setNotifiedDoctor(order.orderingDoctorName || '');
  };
  const pathologist = pathologists.find(s => s.id === pathologistId);
  const medTech = medTechs.find(s => s.id === medTechId);
  const pathologistName = pathologist ? staffDisplayName(pathologist) : '';
  const pathologistPrc = pathologist?.prcLicenseNumber ?? '';
  const medTechName = medTech ? staffDisplayName(medTech) : '';
  const medTechPrc = medTech?.prcLicenseNumber ?? '';
  const registrationLine = [
    labProfile?.licenseToOperateNumber ? `DOH LTO: ${labProfile.licenseToOperateNumber}` : '',
    labProfile?.philHealthAccreditationNumber ? `PhilHealth: ${labProfile.philHealthAccreditationNumber}` : '',
  ].filter(Boolean).join(' • ');

  const requireMedTech = (): boolean => {
    if (medTechName) return true;
    Alert.alert('Technologist Required', 'Select the medical technologist on duty first.');
    return false;
  };
  const handleUpdateValue = (code: string, val: string) => {
    setRows(prev => prev.map(r => r.code === code ? { ...r, value: val } : r));
  };

  const handleSaveObservations = async () => {
    if (!selectedOrder || !requireMedTech()) return;
    const enteredRows = rows.filter(r => r.value.trim() !== '');
    if (enteredRows.length === 0) {
      Alert.alert('No Results', 'Enter at least one observed value before saving.');
      return;
    }
    setSubmitting(true);
    const [updated, err] = await laboratoryService.recordResults(
      selectedOrder.id,
      medTechName,
      enteredRows.map(r => ({
        panelName: r.panel,
        analyteCode: r.code,
        analyteName: r.name,
        value: r.value,
        unit: r.unit,
      }))
    );
    setSubmitting(false);

    if (err) {
      Alert.alert(isPaymentRequiredError(err) ? 'Payment Required' : 'Error', describeActionError(err));
    } else {
      Alert.alert('Saved', 'Observations recorded. Reference ranges and delta checks applied.');
      if (updated) {
        setSelectedOrder(updated);
        syncOrderResults(updated);
      }
    }
  };

  // Analyzer Simulation Trigger
  const handleGenerateSimulation = async () => {
    if (!selectedOrder) return;
    const [sim, err] = await laboratoryService.simulateAnalyzer(
      selectedOrder.accessionNumber,
      analyzerModel,
      analyzerFormat
    );
    if (sim) {
      setSimulatedRawPayload(sim.rawPayload);
    } else if (err) {
      Alert.alert('Simulation Error', err.message);
    }
  };

  const handleInjectFeed = async () => {
    if (!simulatedRawPayload.trim()) {
      Alert.alert('Error', 'Please generate or enter an analyzer payload first.');
      return;
    }
    if (!requireMedTech()) return;
    setSubmitting(true);
    const [res, err] = await laboratoryService.ingestAnalyzerFeed(simulatedRawPayload, analyzerFormat, medTechName);
    setSubmitting(false);

    if (err) {
      Alert.alert(isPaymentRequiredError(err) ? 'Payment Required' : 'Feed Ingestion Error', describeActionError(err));
    } else if (res) {
      setAnalyzerModalVisible(false);
      Alert.alert(
        'Analyzer Ingestion Succeeded! 🤖',
        `Successfully ingested ${res.ingestedCount} test parameter(s) from ${res.analyzerId} (${res.protocol}).`
      );
      if (res.requisition) {
        setSelectedOrder(res.requisition);
        syncOrderResults(res.requisition);
      }
    }
  };

  // Panic Dispatch Trigger
  const handleLogPanicDispatch = async () => {
    if (!selectedOrder || !requireMedTech()) return;
    if (!notifiedDoctor.trim() || !readbackNotes.trim()) {
      Alert.alert('Readback Required', 'Enter the physician notified and the verbal readback confirmation notes.');
      return;
    }
    setSubmitting(true);
    const [log, err] = await laboratoryService.recordPanicDispatch(selectedOrder.id, {
      dispatchedByMedTechName: medTechName,
      notifiedDoctorName: notifiedDoctor,
      notificationMethod,
      readbackConfirmed: true,
      readbackNotes,
    });
    setSubmitting(false);
    setPanicModalVisible(false);

    if (err) {
      Alert.alert('Dispatch Error', err.message);
    } else {
      Alert.alert(
        'Panic Alert Dispatched! 🚨',
        `Attending physician ${notifiedDoctor} notified via ${notificationMethod}. Statutory readback confirmation logged and STAT alert queued for delivery to the ordering clinic through the ClinicEZ interop hub.`
      );
    }
  };

  // Statutory Sign and Release
  const handleSignAndRelease = async () => {
    if (!selectedOrder) return;
    if (!pathologist || !medTech || !pathologistPrc || !medTechPrc) {
      Alert.alert('Signatories Required', 'Select the pathologist and medical technologist. Both must have a PRC license number on file in Settings.');
      return;
    }
    setSubmitting(true);

    const [finalOrder, err] = await laboratoryService.verifyAndSignReport(selectedOrder.id, {
      pathologistName,
      pathologistPrcLicense: pathologistPrc,
      medicalTechnologistName: medTechName,
      medicalTechnologistPrcLicense: medTechPrc,
      pathologistImpression: impression,
    });
    setSubmitting(false);
    setSignModalVisible(false);

    if (err) {
      Alert.alert(isPaymentRequiredError(err) ? 'Payment Required' : 'Release Error', describeActionError(err));
    } else {
      Alert.alert(
        'Diagnostic Report Released! 📜',
        `Accession ${selectedOrder.accessionNumber} verified under DOH AO 2007-0027 standards. Official PDF compiled and published to Clinic EMR.`
      );
      if (finalOrder) {
        setSelectedOrder(finalOrder);
        syncOrderResults(finalOrder);
      }
    }
  };

  const handleDownloadPdf = () => {
    if (!selectedOrder) return;
    const url = laboratoryService.getReportPdfDownloadUrl(selectedOrder.id);
    if (typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const canReject =
    !!selectedOrder &&
    selectedOrder.stage !== 'Rejected' &&
    selectedOrder.stage !== 'Cancelled' &&
    selectedOrder.stage !== 'ResultFinalized' &&
    selectedOrder.status !== 'Rejected' &&
    selectedOrder.status !== 'Verified';

  const closeRejectModal = () => {
    setRejectModalVisible(false);
    setRejectReason('');
  };

  const handleRejectOrder = async () => {
    if (!selectedOrder) return;
    const reason = rejectReason.trim();
    if (!reason) return;
    setSubmitting(true);
    const [rejected, err] = await laboratoryService.rejectRequisition(selectedOrder.id, reason);
    setSubmitting(false);

    if (err) {
      Alert.alert('Reject Error', describeActionError(err));
      return;
    }
    closeRejectModal();
    Alert.alert('Order Rejected', `Accession ${selectedOrder.accessionNumber} was rejected. The clinic and patient have been notified.`);
    if (rejected) {
      setSelectedOrder(rejected);
      setOrders(prev => prev.map(o => (o.id === rejected.id ? rejected : o)));
    }
  };

  // Detect critical values
  const hasCriticalResults = rows.some(r => r.flag === 'Critical');
  const criticalItems = rows.filter(r => r.flag === 'Critical');

  const filteredRows = rows.filter(r => activePanelFilter === 'All' || r.panel.includes(activePanelFilter));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Analytical Testing & Clinical Engine</ThemedText>
        <ThemedText style={styles.title}>Results & Report Release</ThemedText>
      </View>

      {/* Critical Panic Alert Banner */}
      {hasCriticalResults && (
        <View style={styles.criticalPanicBanner}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.panicBannerTitle}>🚨 CRITICAL PANIC THRESHOLD DETECTED</ThemedText>
              <ThemedText style={styles.panicBannerText}>
                {criticalItems.map(c => `${c.name}: ${c.value} ${c.unit}`).join(' • ')}
              </ThemedText>
              <ThemedText style={styles.panicBannerSub}>
                Statutory requirement: Immediate physician verbal alert and readback confirmation required.
              </ThemedText>
            </View>
            <Pressable style={styles.panicDispatchBtn} onPress={() => setPanicModalVisible(true)}>
              <ThemedText style={styles.panicDispatchBtnText}>📞 Dispatch STAT Alert</ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {/* Order Selector Banner */}
      <View style={styles.patientBanner}>
        <View style={styles.rowBetween}>
          <View>
            <ThemedText style={styles.patientName}>
              {selectedOrder ? `${selectedOrder.patientName} (${selectedOrder.accessionNumber})` : 'Select Active Worklist Order'}
            </ThemedText>
            {selectedOrder && (
              <>
                <ThemedText style={styles.patientMeta}>
                  Facility: {selectedOrder.orderingFacilityName} • Urgency: {selectedOrder.urgency}
                </ThemedText>
                <ThemedText style={styles.patientSubMeta}>
                  Status: {selectedOrder.status} • Attending: {selectedOrder.orderingDoctorName}
                </ThemedText>
              </>
            )}
          </View>

          <View style={{ gap: 6 }}>
            {simulatorEnabled && (
              <Pressable style={styles.analyzerSimBtn} onPress={() => { handleGenerateSimulation(); setAnalyzerModalVisible(true); }}>
                <ThemedText style={styles.analyzerSimBtnText}>🤖 Analyzer Data Feed</ThemedText>
              </Pressable>
            )}

            {selectedOrder?.diagnosticReport && (
              <Pressable style={styles.previewDohBtn} onPress={() => setReportModalVisible(true)}>
                <ThemedText style={styles.previewDohBtnText}>📄 View DOH Report</ThemedText>
              </Pressable>
            )}

            {selectedOrder && canReject && (
              <Pressable style={styles.rejectOrderBtn} onPress={() => setRejectModalVisible(true)}>
                <ThemedText style={styles.rejectOrderBtnText}>Reject order</ThemedText>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <StaffPicker
        label="Medical Technologist on Duty *"
        staff={medTechs}
        selectedId={medTechId}
        onSelect={setMedTechId}
        emptyText="No active medical technologist on file. Add one under Settings."
      />

      {/* Panel Filters */}
      <View style={styles.filterRow}>
        {['All', 'CBC', 'Chemistry', 'Urinalysis', 'Serology', 'Immunoassay'].map(p => (
          <Pressable
            key={p}
            style={[styles.filterChip, activePanelFilter === p && styles.filterChipActive]}
            onPress={() => setActivePanelFilter(p)}
          >
            <ThemedText style={[styles.filterChipText, activePanelFilter === p && styles.filterChipTextActive]}>
              {p}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* Analyte Results Entry Table */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <ThemedText style={[styles.colHeader, { flex: 2 }]}>Analyte Parameter</ThemedText>
          <ThemedText style={[styles.colHeader, { flex: 1.2, textAlign: 'center' }]}>Observed Value</ThemedText>
          <ThemedText style={[styles.colHeader, { flex: 1.5, textAlign: 'right' }]}>Reference Range</ThemedText>
        </View>

        {filteredRows.length === 0 && (
          <ThemedText style={styles.modalSub}>
            {selectedOrder ? 'No analytes to enter for this order.' : 'Select a worklist order to enter results.'}
          </ThemedText>
        )}

        {filteredRows.map((row, idx) => {
          const isCrit = row.flag === 'Critical';
          const isHigh = row.flag === 'High';
          const isLow = row.flag === 'Low';

          return (
            <View key={row.code} style={[styles.tableRow, idx > 0 && styles.borderTop]}>
              <View style={{ flex: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ThemedText style={styles.paramName}>{row.name}</ThemedText>
                  {isCrit ? (
                    <ThemedText style={styles.flagBadgeCrit}>PANIC</ThemedText>
                  ) : isHigh ? (
                    <ThemedText style={styles.flagBadgeAbn}>HIGH</ThemedText>
                  ) : isLow ? (
                    <ThemedText style={styles.flagBadgeAbn}>LOW</ThemedText>
                  ) : null}
                </View>
                <ThemedText style={styles.paramUnit}>{row.unit} • {row.panel}</ThemedText>

                {/* Delta check warning badge */}
                {row.deltaAlert && (
                  <View style={styles.deltaAlertBadge}>
                    <ThemedText style={styles.deltaAlertText}>⚡ {row.deltaAlert}</ThemedText>
                  </View>
                )}
              </View>

              <View style={{ flex: 1.2, alignItems: 'center' }}>
                <TextInput
                  style={[
                    styles.valueInput,
                    isCrit && { borderColor: '#DC2626', backgroundColor: '#FEE2E2', color: '#991B1B' }
                  ]}
                  value={row.value}
                  onChangeText={(val) => handleUpdateValue(row.code, val)}
                />
              </View>

              <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                <ThemedText style={styles.paramRef}>{row.ref}</ThemedText>
              </View>
            </View>
          );
        })}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Pressable
          style={styles.saveBtn}
          onPress={handleSaveObservations}
          disabled={submitting}
        >
          <ThemedText style={styles.saveBtnText}>Save Observations & Delta Check</ThemedText>
        </Pressable>

        <Pressable
          style={styles.verifyButton}
          onPress={() => setSignModalVisible(true)}
          disabled={submitting}
        >
          <ThemedText style={styles.verifyButtonText}>✍️ Pathologist PRC Statutory Sign & Release</ThemedText>
        </Pressable>
      </View>

      {/* 1. Automated Analyzer Simulation & Ingestion Modal */}
      <Modal visible={analyzerModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.analyzerModalCard}>
            <View style={styles.modalHeaderRow}>
              <ThemedText style={styles.modalHeading}>Automated Laboratory Analyzer Interface</ThemedText>
              <Pressable onPress={() => setAnalyzerModalVisible(false)}>
                <ThemedText style={styles.closeBtn}>✕</ThemedText>
              </Pressable>
            </View>

            <ThemedText style={styles.modalSub}>
              Simulate or inject real-time serial/TCP analyzer feeds directly into LIS accession #{selectedOrder?.accessionNumber}.
            </ThemedText>

            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.inputLabel}>Analyzer Model</ThemedText>
                <TextInput
                  style={styles.input}
                  value={analyzerModel}
                  onChangeText={setAnalyzerModel}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.inputLabel}>Protocol Standard</ThemedText>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  {['ASTM', 'HL7', 'JSON'].map(fmt => (
                    <Pressable
                      key={fmt}
                      style={[styles.formatChip, analyzerFormat === fmt && styles.formatChipActive]}
                      onPress={() => setAnalyzerFormat(fmt)}
                    >
                      <ThemedText style={[styles.formatChipText, analyzerFormat === fmt && styles.formatChipTextActive]}>
                        {fmt}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <Pressable style={styles.genSimBtn} onPress={handleGenerateSimulation}>
              <ThemedText style={styles.genSimBtnText}>⚡ Generate Realistic Test Packet</ThemedText>
            </Pressable>

            <View style={{ gap: 4 }}>
              <ThemedText style={styles.inputLabel}>Raw Stream Payload ({analyzerFormat})</ThemedText>
              <TextInput
                style={styles.rawPayloadArea}
                value={simulatedRawPayload}
                onChangeText={setSimulatedRawPayload}
                multiline
                placeholder="Raw analyzer stream frames (ASTM / HL7 / JSON)..."
              />
            </View>

            <View style={styles.modalActionsRow}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setAnalyzerModalVisible(false)}>
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={styles.injectBtn} onPress={handleInjectFeed} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.injectBtnText}>📥 Ingest Feed & Evaluate</ThemedText>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Panic Result Immediate Dispatch Modal */}
      <Modal visible={panicModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.panicModalCard}>
            <ThemedText style={styles.panicModalHeading}>🚨 Critical Panic Dispatch & Verbal Readback</ThemedText>
            <ThemedText style={styles.modalSub}>
              Philippine clinical laboratory regulations require immediate telephone/direct alert to the attending physician with verified verbal readback confirmation.
            </ThemedText>

            <View style={styles.criticalListBox}>
              <ThemedText style={styles.criticalListTitle}>Critical Values:</ThemedText>
              {criticalItems.map((c, i) => (
                <ThemedText key={i} style={styles.criticalListItem}>
                  • {c.name} ({c.code}): <strong>{c.value} {c.unit}</strong> [Ref: {c.ref}]
                </ThemedText>
              ))}
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.inputLabel}>Attending Physician Notified *</ThemedText>
              <TextInput
                style={styles.input}
                value={notifiedDoctor}
                onChangeText={setNotifiedDoctor}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.inputLabel}>Notification Channel</ThemedText>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['Telephone', 'DirectEMR', 'InPerson'] as const).map(m => (
                  <Pressable
                    key={m}
                    style={[styles.formatChip, notificationMethod === m && styles.formatChipActive]}
                    onPress={() => setNotificationMethod(m)}
                  >
                    <ThemedText style={[styles.formatChipText, notificationMethod === m && styles.formatChipTextActive]}>{m}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.inputLabel}>Verbal Readback Confirmation Notes *</ThemedText>
              <TextInput
                style={[styles.input, { minHeight: 60 }]}
                value={readbackNotes}
                onChangeText={setReadbackNotes}
                multiline
              />
            </View>

            <View style={styles.modalActionsRow}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setPanicModalVisible(false)}>
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={styles.confirmPanicBtn} onPress={handleLogPanicDispatch} disabled={submitting}>
                <ThemedText style={styles.confirmPanicText}>Broadcast STAT Alert & Save Audit</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reject Order Modal */}
      <Modal visible={rejectModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.panicModalCard}>
            <ThemedText style={styles.panicModalHeading}>Reject order</ThemedText>
            <ThemedText style={styles.modalSub}>
              {selectedOrder
                ? `The clinic and patient will be told that ${selectedOrder.patientName} (${selectedOrder.accessionNumber}) was rejected by the laboratory.`
                : ''}
            </ThemedText>

            <View style={styles.formGroup}>
              <ThemedText style={styles.inputLabel}>Reason *</ThemedText>
              <TextInput
                style={[styles.input, { minHeight: 60 }]}
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="e.g. Test not offered, unsuitable specimen"
                multiline
              />
            </View>

            <View style={styles.modalActionsRow}>
              <Pressable style={styles.cancelModalBtn} onPress={closeRejectModal}>
                <ThemedText style={styles.cancelModalText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.confirmRejectBtn, !rejectReason.trim() && { opacity: 0.5 }]}
                onPress={handleRejectOrder}
                disabled={submitting || !rejectReason.trim()}
              >
                <ThemedText style={styles.confirmReleaseText}>Reject order</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. Pathologist Sign-Off Modal */}
      <Modal visible={signModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Pathologist PRC Statutory Sign-Off</ThemedText>
            <ThemedText style={styles.modalSub}>
              Digital verification under Philippine DOH AO 2007-0027 and PRC Board of Medical Technology. Automatically generates official signed PDF and delivers it to the ordering clinic through the ClinicEZ interop hub.
            </ThemedText>

            <View style={styles.modalForm}>
              <StaffPicker
                label="Pathologist *"
                staff={pathologists}
                selectedId={pathologistId}
                onSelect={setPathologistId}
                emptyText="No active pathologist on file. Add one under Settings."
              />

              <View>
                <ThemedText style={styles.inputLabel}>Medical Technologist *</ThemedText>
                <ThemedText style={styles.modalSub}>
                  {medTech ? `${medTechName}${medTechPrc ? ` • PRC ${medTechPrc}` : ' • no PRC on file'}` : 'Select the medical technologist on duty on the results screen.'}
                </ThemedText>
              </View>
              <View>
                <ThemedText style={styles.inputLabel}>Pathologist Clinical Impression</ThemedText>
                <TextInput
                  style={[styles.input, { minHeight: 60 }]}
                  multiline
                  value={impression}
                  onChangeText={setImpression}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelModalBtn}
                onPress={() => setSignModalVisible(false)}
                disabled={submitting}
              >
                <ThemedText style={styles.cancelModalText}>Cancel</ThemedText>
              </Pressable>

              <Pressable
                style={styles.confirmReleaseBtn}
                onPress={handleSignAndRelease}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.confirmReleaseText}>Sign & Broadcast Event</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4. Official DOH Report Preview & PDF Download Modal */}
      <Modal visible={reportModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.reportModalCard}>
            <View style={styles.modalHeaderRow}>
              <ThemedText style={styles.modalHeading}>Official Philippine DOH Diagnostic Report</ThemedText>
              <Pressable onPress={() => setReportModalVisible(false)}>
                <ThemedText style={styles.closeBtn}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              <View style={styles.dohLetterheadPreview}>
                <ThemedText style={styles.dohLabTitle}>{(labProfile?.laboratoryName ?? '').toUpperCase()}</ThemedText>
                {registrationLine ? <ThemedText style={styles.dohLabSub}>{registrationLine}</ThemedText> : null}
                {labProfile?.physicalAddress ? <ThemedText style={styles.dohLabAddress}>{labProfile.physicalAddress}</ThemedText> : null}

                <View style={styles.dohMetaBox}>
                  <ThemedText style={styles.dohMetaLine}>Patient: <strong>{selectedOrder?.patientName}</strong> ({selectedOrder?.patientAge}y • {selectedOrder?.patientGender})</ThemedText>
                  <ThemedText style={styles.dohMetaLine}>Accession No.: <strong>{selectedOrder?.accessionNumber}</strong> • Priority: {selectedOrder?.urgency}</ThemedText>
                  <ThemedText style={styles.dohMetaLine}>Doctor: {selectedOrder?.orderingDoctorName} • Clinic: {selectedOrder?.orderingFacilityName}</ThemedText>
                </View>

                <ThemedText style={styles.dohResultsHeading}>Laboratory Observations</ThemedText>
                {rows.map((r, i) => (
                  <View key={i} style={styles.dohResultRow}>
                    <ThemedText style={{ flex: 2, fontSize: 11, fontWeight: '700' }}>{r.name}</ThemedText>
                    <ThemedText style={{ flex: 1, fontSize: 12, fontWeight: '800', textAlign: 'center', color: r.flag === 'Critical' ? '#DC2626' : '#111827' }}>
                      {r.value} {r.unit}
                    </ThemedText>
                    <ThemedText style={{ flex: 1.5, fontSize: 10, color: '#6B7280', textAlign: 'right' }}>{r.ref}</ThemedText>
                  </View>
                ))}

                {selectedOrder?.diagnosticReport?.pathologistImpression ? (
                  <View style={styles.dohImpressionBox}>
                    <ThemedText style={{ fontSize: 10, fontWeight: '700', color: '#5B21B6' }}>PATHOLOGIST IMPRESSION:</ThemedText>
                    <ThemedText style={{ fontSize: 11, color: '#1F2937', marginTop: 2 }}>{selectedOrder.diagnosticReport.pathologistImpression}</ThemedText>
                  </View>
                ) : null}

                <View style={styles.dohSigRow}>
                  <View style={{ alignItems: 'center' }}>
                    <ThemedText style={styles.dohSigName}>{selectedOrder?.diagnosticReport?.medicalTechnologistName}</ThemedText>
                    <ThemedText style={styles.dohSigPrc}>RMT • {selectedOrder?.diagnosticReport?.medicalTechnologistPrcLicense}</ThemedText>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <ThemedText style={styles.dohSigName}>{selectedOrder?.diagnosticReport?.pathologistName}</ThemedText>
                    <ThemedText style={styles.dohSigPrc}>Consultant Pathologist • {selectedOrder?.diagnosticReport?.pathologistPrcLicense}</ThemedText>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setReportModalVisible(false)}>
                <ThemedText style={styles.modalCancelText}>Close</ThemedText>
              </Pressable>
              <Pressable style={styles.downloadPdfBtn} onPress={handleDownloadPdf}>
                <ThemedText style={styles.downloadPdfText}>📥 Download Official PDF</ThemedText>
              </Pressable>
            </View>
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
  criticalPanicBanner: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
  },
  panicBannerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#991B1B',
  },
  panicBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
    marginTop: 2,
  },
  panicBannerSub: {
    fontSize: 11,
    color: '#7F1D1D',
    marginTop: 2,
  },
  panicDispatchBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'center',
  },
  panicDispatchBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  patientBanner: {
    backgroundColor: '#F5F3FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4C1D95',
  },
  patientMeta: {
    fontSize: 13,
    color: '#6D28D9',
  },
  patientSubMeta: {
    fontSize: 12,
    color: '#7C3AED',
  },
  analyzerSimBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  analyzerSimBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  previewDohBtn: {
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  previewDohBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  rejectOrderBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectOrderBtnText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#7C3AED',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  colHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  paramName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  paramUnit: {
    fontSize: 11,
    color: '#6B7280',
  },
  flagBadgeCrit: {
    backgroundColor: '#DC2626',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  flagBadgeAbn: {
    backgroundColor: '#FEE2E2',
    color: '#B91C1C',
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  deltaAlertBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  deltaAlertText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  valueInput: {
    width: 80,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  paramRef: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 13,
  },
  verifyButton: {
    flex: 2,
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 520,
    maxHeight: '95%',
    overflow: 'hidden',
    gap: 16,
  },
  analyzerModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 560,
    maxHeight: '95%',
    overflow: 'hidden',
    gap: 14,
  },
  panicModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 520,
    maxHeight: '95%',
    overflow: 'hidden',
    gap: 14,
  },
  reportModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 620,
    maxHeight: '95%',
    overflow: 'hidden',
    gap: 14,
  },
  modalHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  panicModalHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DC2626',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  modalSub: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeBtn: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6B7280',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  formatChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  formatChipActive: {
    backgroundColor: '#7C3AED',
  },
  formatChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  formatChipTextActive: {
    color: '#FFFFFF',
  },
  genSimBtn: {
    backgroundColor: '#F3E8FF',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D8B4FE',
  },
  genSimBtnText: {
    color: '#6B21A8',
    fontWeight: '700',
    fontSize: 12,
  },
  rawPayloadArea: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#111827',
    minHeight: 110,
    backgroundColor: '#F9FAFB',
  },
  injectBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  injectBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  criticalListBox: {
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    gap: 4,
  },
  criticalListTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#991B1B',
  },
  criticalListItem: {
    fontSize: 11,
    color: '#B91C1C',
  },
  confirmPanicBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  confirmPanicText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  dohLetterheadPreview: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  dohLabTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#5B21B6',
    textAlign: 'center',
  },
  dohLabSub: {
    fontSize: 10,
    color: '#4B5563',
    textAlign: 'center',
  },
  dohLabAddress: {
    fontSize: 9,
    color: '#6B7280',
    textAlign: 'center',
  },
  dohMetaBox: {
    backgroundColor: '#F9FAFB',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginVertical: 8,
    gap: 2,
  },
  dohMetaLine: {
    fontSize: 11,
    color: '#374151',
  },
  dohResultsHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    marginTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 4,
  },
  dohResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dohImpressionBox: {
    backgroundColor: '#F5F3FF',
    padding: 8,
    borderRadius: 6,
    marginVertical: 8,
  },
  dohSigRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  dohSigName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  dohSigPrc: {
    fontSize: 10,
    color: '#6B7280',
  },
  downloadPdfBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  downloadPdfText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  modalForm: {
    gap: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelModalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  cancelModalText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  modalCancelText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
  },
  confirmReleaseBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#7C3AED',
  },
  confirmReleaseText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  confirmRejectBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#B91C1C',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
