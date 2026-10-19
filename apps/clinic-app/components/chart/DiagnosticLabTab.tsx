import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Badge, Icon, EmptyState, Button, Modal } from '../ui';
import type {
  ClinicPatient,
  ClinicLabOrderRecord,
} from '../../services/clinicService';

export interface DiagnosticLabTabProps {
  patient?: ClinicPatient | null;
  patientId?: string;
  labOrders: ClinicLabOrderRecord[];
  onViewLabSlip?: (orderId: string) => void;
  onOpenLabSlip?: (order: ClinicLabOrderRecord) => void;
  onAttachExternalResult?: (orderId: string) => void;
  onAttachExternalLab?: (orderId: string) => void;
  onAcknowledgePanic?: (orderId: string, readbackNotes: string) => Promise<void>;
  onRefreshChart?: () => void;
}

// Statutory mapping for PhilHealth lib_diagnostic
export const STATUTORY_DIAGNOSTIC_CODES: Record<string, { code: string; name: string }> = {
  cbc: { code: '1', name: 'Complete Blood Count (CBC)' },
  completebloodcount: { code: '1', name: 'Complete Blood Count (CBC)' },
  urinalysis: { code: '2', name: 'Routine Urinalysis' },
  urine: { code: '2', name: 'Routine Urinalysis' },
  fecalysis: { code: '3', name: 'Routine Fecalysis / Stool Exam' },
  stool: { code: '3', name: 'Routine Fecalysis / Stool Exam' },
  chestxray: { code: '4', name: 'Chest X-Ray PA/AP' },
  cxr: { code: '4', name: 'Chest X-Ray PA/AP' },
  sputum: { code: '5', name: 'Sputum Microscopy / GeneXpert' },
  lipid: { code: '6', name: 'Lipid Profile (Cholesterol, HDL, LDL, Triglycerides)' },
  lipidprofile: { code: '6', name: 'Lipid Profile (Cholesterol, HDL, LDL, Triglycerides)' },
  fbs: { code: '7', name: 'Fasting Blood Sugar (FBS)' },
  creatinine: { code: '8', name: 'Serum Creatinine' },
  ecg: { code: '9', name: '12-Lead Electrocardiogram (ECG)' },
  electrocardiogram: { code: '9', name: '12-Lead Electrocardiogram (ECG)' },
  papsmear: { code: '13', name: 'Pap Smear / Cervical Cytology' },
  ogtt: { code: '14', name: 'Oral Glucose Tolerance Test (OGTT)' },
  fobt: { code: '15', name: 'Fecal Occult Blood Test (FOBT)' },
  ppd: { code: '17', name: 'Purified Protein Derivative (PPD) Tuberculin Skin Test' },
  hba1c: { code: '18', name: 'Hemoglobin A1c (HbA1c)' },
  rbs: { code: '19', name: 'Random Blood Sugar (RBS)' },
};

export function lookupStatutoryDiagnosticCode(testName: string): { code: string; name: string } {
  const norm = testName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, val] of Object.entries(STATUTORY_DIAGNOSTIC_CODES)) {
    if (norm.includes(key)) {
      return val;
    }
  }
  return { code: '99', name: testName };
}

export default function DiagnosticLabTab({
  patient,
  patientId,
  labOrders = [],
  onViewLabSlip,
  onOpenLabSlip,
  onAttachExternalResult,
  onAttachExternalLab,
  onAcknowledgePanic,
  onRefreshChart,
}: DiagnosticLabTabProps) {
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'EXTERNAL' | 'PANIC'>('ALL');
  const [panicModalVisible, setPanicModalVisible] = useState(false);
  const [targetPanicOrder, setTargetPanicOrder] = useState<any | null>(null);
  const [readbackNotes, setReadbackNotes] = useState('');
  const [submittingPanic, setSubmittingPanic] = useState(false);

  // Critical panic values requiring acknowledgment
  const activePanicOrders = useMemo(() => {
    return labOrders.filter((o: any) => o.hasCriticalPanicAlert && !o.isPanicAcknowledged);
  }, [labOrders]);

  const filteredOrders = useMemo(() => {
    return labOrders.filter((o: any) => {
      if (selectedFilter === 'PENDING') {
        return o.status !== 'Completed' && o.status !== 'CompletedWithExternalReport';
      }
      if (selectedFilter === 'COMPLETED') {
        return o.status === 'Completed' || o.status === 'CompletedWithExternalReport';
      }
      if (selectedFilter === 'EXTERNAL') {
        return o.status === 'CompletedWithExternalReport' || o.resultSource === 'ExternalLab';
      }
      if (selectedFilter === 'PANIC') {
        return Boolean(o.hasCriticalPanicAlert);
      }
      return true;
    });
  }, [labOrders, selectedFilter]);

  const handleOpenPanicModal = (order: any) => {
    setTargetPanicOrder(order);
    setReadbackNotes(`Results verbally read back and confirmed with laboratory at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
    setPanicModalVisible(true);
  };

  const handleConfirmPanic = async () => {
    if (!targetPanicOrder) return;
    setSubmittingPanic(true);
    try {
      if (onAcknowledgePanic) {
        await onAcknowledgePanic(targetPanicOrder.id, readbackNotes);
      }
      setPanicModalVisible(false);
      setTargetPanicOrder(null);
      if (onRefreshChart) onRefreshChart();
    } finally {
      setSubmittingPanic(false);
    }
  };

  const handleSlipAction = (order: ClinicLabOrderRecord) => {
    if (onOpenLabSlip) {
      onOpenLabSlip(order);
    } else if (onViewLabSlip) {
      onViewLabSlip(order.id);
    }
  };

  const handleAttachAction = (orderId: string) => {
    if (onAttachExternalLab) {
      onAttachExternalLab(orderId);
    } else if (onAttachExternalResult) {
      onAttachExternalResult(orderId);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ========================================================================= */}
      {/* CRITICAL PANIC ALERT BANNER                                               */}
      {/* ========================================================================= */}
      {activePanicOrders.length > 0 ? (
        <View style={styles.panicBannerContainer}>
          {activePanicOrders.map((pOrder: any) => (
            <View key={pOrder.id} style={styles.panicCard}>
              <View style={styles.panicTop}>
                <Icon name="emergency" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
                <View style={{ flex: 1 }}>
                  <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
                    CRITICAL LAB PANIC VALUE — VERBAL READBACK REQUIRED
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.emergencyText}>
                    Order #{pOrder.orderNumber} • Reported: {new Date(pOrder.panicAlertTriggeredAt || pOrder.orderDate).toLocaleString()}
                  </ThemedText>
                  {pOrder.criticalFindings ? (
                    <ThemedText variant="captionBold" color={theme.colors.emergencyText} style={{ marginTop: 2 }}>
                      Critical Findings: {pOrder.criticalFindings}
                    </ThemedText>
                  ) : null}
                </View>
              </View>
              <Pressable
                onPress={() => handleOpenPanicModal(pOrder)}
                style={styles.acknowledgeBtn}
              >
                <Icon name="checkCircle" size={14} color={theme.colors.onPrimary} />
                <ThemedText variant="captionBold" color={theme.colors.onPrimary}>
                  Acknowledge & Document Verbal Readback
                </ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {/* ========================================================================= */}
      {/* FILTER BUTTONS                                                            */}
      {/* ========================================================================= */}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setSelectedFilter('ALL')}
          style={[styles.filterBtn, selectedFilter === 'ALL' && styles.filterBtn_active]}
        >
          <ThemedText
            variant="captionBold"
            color={selectedFilter === 'ALL' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            All Orders ({labOrders.length})
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setSelectedFilter('PENDING')}
          style={[styles.filterBtn, selectedFilter === 'PENDING' && styles.filterBtn_active]}
        >
          <ThemedText
            variant="captionBold"
            color={selectedFilter === 'PENDING' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            Pending
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setSelectedFilter('COMPLETED')}
          style={[styles.filterBtn, selectedFilter === 'COMPLETED' && styles.filterBtn_active]}
        >
          <ThemedText
            variant="captionBold"
            color={selectedFilter === 'COMPLETED' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            Completed
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setSelectedFilter('EXTERNAL')}
          style={[styles.filterBtn, selectedFilter === 'EXTERNAL' && styles.filterBtn_active]}
        >
          <ThemedText
            variant="captionBold"
            color={selectedFilter === 'EXTERNAL' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            External Reports
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setSelectedFilter('PANIC')}
          style={[styles.filterBtn, selectedFilter === 'PANIC' && styles.filterBtn_active]}
        >
          <ThemedText
            variant="captionBold"
            color={selectedFilter === 'PANIC' ? theme.colors.emergencyText : theme.colors.textSecondary}
          >
            Critical / Panic ({activePanicOrders.length})
          </ThemedText>
        </Pressable>
      </View>

      {/* ========================================================================= */}
      {/* LAB ORDERS LIST                                                           */}
      {/* ========================================================================= */}
      {filteredOrders.length > 0 ? (
        <View style={styles.ordersList}>
          {filteredOrders.map((order: any) => {
            const isCompleted = order.status === 'Completed' || order.status === 'CompletedWithExternalReport';
            const isPanic = Boolean(order.hasCriticalPanicAlert);

            return (
              <View key={order.id} style={[styles.orderCard, isPanic && styles.orderCard_panic]}>
                {/* Header */}
                <View style={styles.orderHeader}>
                  <View style={styles.orderHeaderLeft}>
                    <View style={styles.orderNumberRow}>
                      <ThemedText variant="bodyBold" color={theme.colors.text}>
                        Order #{order.orderNumber}
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {new Date(order.orderDate).toLocaleDateString()}
                      </ThemedText>
                      {order.orderedByDoctorName ? (
                        <ThemedText variant="caption" color={theme.colors.textSecondary}>
                          • Dr. {order.orderedByDoctorName}
                        </ThemedText>
                      ) : null}
                    </View>
                    {order.clinicalDiagnosis ? (
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        Diagnosis: {order.clinicalDiagnosis}
                      </ThemedText>
                    ) : null}
                  </View>

                  <View style={styles.orderHeaderRight}>
                    {isPanic ? (
                      <Badge label="Panic Value" variant="emergency" size="sm" icon="emergency" />
                    ) : null}
                    <Badge
                      label={order.status}
                      variant={isCompleted ? 'success' : order.status === 'Draft' ? 'neutral' : 'info'}
                      size="sm"
                    />
                  </View>
                </View>

                {/* Test Items */}
                <View style={styles.itemsBlock}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Ordered Diagnostics:
                  </ThemedText>
                  <View style={styles.testChipsRow}>
                    {(order.items || []).map((item: any) => {
                      return (
                        <View key={item.id || item.testName} style={styles.testChip}>
                          <ThemedText variant="captionBold" color={theme.colors.text}>
                            {item.testName}
                          </ThemedText>
                          {item.category ? (
                            <ThemedText variant="caption" color={theme.colors.textMuted}>
                              ({item.category})
                            </ThemedText>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Results Section */}
                {isCompleted ? (
                  <View style={styles.resultsBlock}>
                    <View style={styles.resultBanner}>
                      <Icon name="checkCircle" size={14} color={theme.colors.successText} />
                      <ThemedText variant="captionBold" color={theme.colors.successText}>
                        Results Verified & Available
                      </ThemedText>
                      {order.verifiedByPathologist ? (
                        <ThemedText variant="caption" color={theme.colors.textSecondary}>
                          • Pathologist: {order.verifiedByPathologist}
                        </ThemedText>
                      ) : null}
                    </View>
                    {order.pathologistImpression ? (
                      <ThemedText variant="caption" color={theme.colors.text} style={{ marginTop: 2 }}>
                        Impression: {order.pathologistImpression}
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}

                {/* Actions */}
                <View style={styles.orderFooter}>
                  <Pressable
                    onPress={() => handleSlipAction(order)}
                    style={styles.actionBtn}
                  >
                    <Icon name="file" size={14} color={theme.colors.primaryDark} />
                    <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                      View Lab Slip & QR
                    </ThemedText>
                  </Pressable>

                  {!isCompleted ? (
                    <Pressable
                      onPress={() => handleAttachAction(order.id)}
                      style={styles.actionBtn}
                    >
                      <Icon name="upload" size={14} color={theme.colors.primaryDark} />
                      <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                        Attach External Result
                      </ThemedText>
                    </Pressable>
                  ) : null}

                  {isPanic && !order.isPanicAcknowledged ? (
                    <Pressable
                      onPress={() => handleOpenPanicModal(order)}
                      style={[styles.actionBtn, styles.actionBtn_emergency]}
                    >
                      <Icon name="checkCircle" size={14} color={theme.colors.emergencyText} />
                      <ThemedText variant="captionBold" color={theme.colors.emergencyText}>
                        Document Readback
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyState
          icon="lab"
          title="No laboratory orders"
          description="Zero diagnostic requisitions matching the selected filter."
        />
      )}

      {/* ========================================================================= */}
      {/* VERBAL READBACK ACKNOWLEDGMENT MODAL                                      */}
      {/* ========================================================================= */}
      <Modal raw visible={panicModalVisible} transparent animationType="fade" onClose={() => setPanicModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Icon name="emergency" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
              <ThemedText variant="h3" color={theme.colors.text}>
                Verbal Readback Acknowledgment
              </ThemedText>
            </View>

            <ThemedText variant="body" color={theme.colors.textSecondary} style={{ marginBottom: theme.spacing.sm }}>
              Order #{targetPanicOrder?.orderNumber} contains critical panic findings that require clinician verbal confirmation with the reporting pathologist / laboratory technician.
            </ThemedText>

            <ThemedText variant="captionBold" color={theme.colors.text} style={{ marginBottom: 4 }}>
              Verbal Readback Verification Notes:
            </ThemedText>
            <TextInput
              style={styles.readbackInput}
              multiline
              numberOfLines={3}
              value={readbackNotes}
              onChangeText={setReadbackNotes}
              placeholder="Document verbal readback details, clinician name, time, and patient action taken..."
              placeholderTextColor={theme.colors.textMuted}
            />

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setPanicModalVisible(false)}
                disabled={submittingPanic}
              />
              <Button
                title={submittingPanic ? 'Recording...' : 'Confirm Verbal Readback'}
                variant="primary"
                onPress={handleConfirmPanic}
                loading={submittingPanic}
              />
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
  },
  contentContainer: {
    paddingBottom: theme.spacing.lg,
  },
  panicBannerContainer: {
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  panicCard: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  panicTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  acknowledgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.emergency,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.sm,
    alignSelf: 'flex-start',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  filterBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  filterBtn_active: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  ordersList: {
    gap: theme.spacing.sm,
  },
  orderCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  orderCard_panic: {
    borderColor: theme.colors.emergencyBorder,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  orderHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  orderHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  orderNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  itemsBlock: {
    gap: 4,
    marginVertical: 4,
  },
  testChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  testChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surfaceSubtle,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: theme.radii.xs,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  resultsBlock: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xs,
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  orderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  actionBtn_emergency: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  modalBox: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '95%',
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  readbackInput: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
});
