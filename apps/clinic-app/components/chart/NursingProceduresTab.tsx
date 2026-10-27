import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import {
  ThemedText,
  Badge,
  Icon,
  EmptyState,
  Input,
  Button,
  Modal,
  Select,
  SelectOption,
  ValidatedDateInput,
  validateDateString,
} from '../ui';
import { notify } from '@utils/feedback';
import { useAuth, usePermission } from '../../context/AuthContext';
import { useClinic } from '../../context/ClinicContext';
import { useStaff } from '../../context/StaffContext';
import { PERMISSIONS } from '../../constants/permissions';
import {
  clinicService,
  ClinicPatient,
  ClinicalProcedureRecord,
  ClinicServiceItem,
  StaffMember,
} from '../../services/clinicService';

function formatStaffDisplayName(staff?: Pick<StaffMember, 'title' | 'firstName' | 'lastName'> | null): string {
  if (!staff) return '';
  return [staff.title, staff.firstName, staff.lastName].filter(Boolean).join(' ').trim();
}

export interface NursingProceduresTabProps {
  patient?: ClinicPatient | null;
  patientId?: string;
  patientName?: string;
  queueItemId?: string;
  procedures: ClinicalProcedureRecord[];
  onOrderProcedure?: () => void;
  onExecuteProcedure?: (procedure: ClinicalProcedureRecord) => void;
  onRefreshChart?: () => void;
}

// Statutory mapping for PhilHealth lib_management
export const STATUTORY_MANAGEMENT_CODES: Record<string, { code: string; name: string }> = {
  breastfeeding: { code: '1', name: 'Breastfeeding Program Education' },
  smoking: { code: '2', name: 'Counselling for Smoking Cessation' },
  lifestyle: { code: '3', name: 'Counselling for Lifestyle Modification' },
  oral: { code: '4', name: 'Oral Check-up and Prophylaxis' },
};

export function lookupStatutoryManagementCode(procedureName: string): { code: string; name: string } {
  const norm = procedureName.toLowerCase();
  for (const [key, val] of Object.entries(STATUTORY_MANAGEMENT_CODES)) {
    if (norm.includes(key)) {
      return val;
    }
  }
  return { code: 'X', name: 'Others / In-Clinic Medical Management' };
}

export default function NursingProceduresTab({
  patient,
  patientId,
  patientName,
  queueItemId,
  procedures = [],
  onOrderProcedure,
  onExecuteProcedure,
  onRefreshChart,
}: NursingProceduresTabProps) {
  const { user } = useAuth();
  const hasProceduresWrite = usePermission(PERMISSIONS.proceduresWrite) || user?.role === 'Admin';
  const canOrderProcedures = user ? hasProceduresWrite : true;

  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [executingProc, setExecutingProc] = useState<ClinicalProcedureRecord | null>(null);
  const [orderModalVisible, setOrderModalVisible] = useState(false);

  const filteredProcedures = useMemo(() => {
    return procedures.filter((p) => {
      if (selectedFilter === 'SCHEDULED') {
        return p.status === 'Ordered' || (p.status as any) === 'Scheduled';
      }
      if (selectedFilter === 'IN_PROGRESS') {
        return p.status === 'InProgress';
      }
      if (selectedFilter === 'COMPLETED') {
        return p.status === 'Completed';
      }
      return true;
    });
  }, [procedures, selectedFilter]);

  const parseVitalsSummary = (jsonStr?: string) => {
    if (!jsonStr) return null;
    try {
      const v = JSON.parse(jsonStr);
      const items: string[] = [];
      if (v.systolicBp && v.diastolicBp) items.push(`BP ${v.systolicBp}/${v.diastolicBp}`);
      if (v.heartRateBpm || v.heartRate) items.push(`HR ${v.heartRateBpm || v.heartRate} bpm`);
      if (v.respiratoryRateBreathsPerMin || v.respiratoryRate) items.push(`RR ${v.respiratoryRateBreathsPerMin || v.respiratoryRate} cpm`);
      if (v.temperatureCelsius || v.temperature) items.push(`Temp ${v.temperatureCelsius || v.temperature}°C`);
      if (v.oxygenSaturationPercent || v.oxygenSaturation) items.push(`SpO2 ${v.oxygenSaturationPercent || v.oxygenSaturation}%`);
      return items.join(' • ');
    } catch {
      return jsonStr;
    }
  };

  const handleCancelProcedure = async (procedure: ClinicalProcedureRecord) => {
    const confirmed = typeof window !== 'undefined' && window.confirm
      ? window.confirm(`Cancel procedure order "${procedure.procedureName}"?`)
      : true;
    if (!confirmed) return;
    const [, err] = await clinicService.cancelProcedure(procedure.id);
    if (err) {
      notify.error(err.message || 'Failed to cancel procedure.');
      return;
    }
    notify.success(`${procedure.procedureName} cancelled.`);
    onRefreshChart?.();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ========================================================================= */}
      {/* FILTER BUTTONS & ACTION BAR                                               */}
      {/* ========================================================================= */}
      <View style={styles.topBar}>
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setSelectedFilter('ALL')}
            style={[styles.filterBtn, selectedFilter === 'ALL' && styles.filterBtn_active]}
          >
            <ThemedText
              variant="captionBold"
              color={selectedFilter === 'ALL' ? theme.colors.primaryDark : theme.colors.textSecondary}
            >
              All ({procedures.length})
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setSelectedFilter('SCHEDULED')}
            style={[styles.filterBtn, selectedFilter === 'SCHEDULED' && styles.filterBtn_active]}
          >
            <ThemedText
              variant="captionBold"
              color={selectedFilter === 'SCHEDULED' ? theme.colors.primaryDark : theme.colors.textSecondary}
            >
              Ordered / Scheduled
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setSelectedFilter('IN_PROGRESS')}
            style={[styles.filterBtn, selectedFilter === 'IN_PROGRESS' && styles.filterBtn_active]}
          >
            <ThemedText
              variant="captionBold"
              color={selectedFilter === 'IN_PROGRESS' ? theme.colors.primaryDark : theme.colors.textSecondary}
            >
              In Progress
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
        </View>

        {canOrderProcedures ? (
          <Pressable
            testID="order-procedure-button"
            onPress={onOrderProcedure || (() => setOrderModalVisible(true))}
            style={styles.orderProcedureBtn}
          >
            <Icon name="plus" size={14} color={theme.colors.onPrimary} />
            <ThemedText variant="captionBold" color={theme.colors.onPrimary}>
              Order Procedure
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {/* ========================================================================= */}
      {/* PROCEDURES LIST                                                           */}
      {/* ========================================================================= */}
      {filteredProcedures.length > 0 ? (
        <View style={styles.proceduresList}>
          {filteredProcedures.map((proc) => {
            const isCompleted = proc.status === 'Completed';
            const statMgmt = lookupStatutoryManagementCode(proc.procedureName);
            const preVitals = parseVitalsSummary(proc.preProcedureVitalsJson);
            const postVitals = parseVitalsSummary(proc.postProcedureVitalsJson);

            return (
              <View key={proc.id} style={styles.procedureCard}>
                {/* Header */}
                <View style={styles.procedureHeader}>
                  <View style={styles.procedureHeaderLeft}>
                    <View style={styles.titleRow}>
                      <ThemedText variant="bodyBold" color={theme.colors.text}>
                        {proc.procedureName}
                      </ThemedText>
                      {Boolean(
                        (patient?.philHealthNumber || (patient as any)?.isYakapEligible) &&
                        (proc.procedureCode?.startsWith('PH-') ||
                          proc.procedureCode?.startsWith('YAKAP-') ||
                          ['1', '2', '3', '4'].includes(proc.procedureCode || '') ||
                          statMgmt.code !== 'X' ||
                          proc.procedureName.toLowerCase().includes('counseling') ||
                          proc.procedureName.toLowerCase().includes('counselling') ||
                          proc.procedureName.toLowerCase().includes('breastfeeding') ||
                          proc.procedureName.toLowerCase().includes('prophylaxis'))
                      ) ? (
                        <Badge label="PhilHealth Covered" variant="purple" size="sm" />
                      ) : null}
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Scheduled: {new Date(proc.scheduledAt).toLocaleDateString()} • {new Date(proc.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </ThemedText>
                  </View>

                  <Badge
                    label={proc.status}
                    variant={
                      isCompleted
                        ? 'success'
                        : proc.status === 'InProgress'
                        ? 'warning'
                        : proc.status === 'Cancelled'
                        ? 'emergency'
                        : 'info'
                    }
                    size="sm"
                  />
                </View>

                {/* Indication / Notes */}
                {proc.clinicalNotes ? (
                  <View style={styles.detailRow}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      Clinical Notes / Indication:
                    </ThemedText>
                    <ThemedText variant="body" color={theme.colors.text}>
                      {proc.clinicalNotes}
                    </ThemedText>
                  </View>
                ) : null}

                {/* Execution Details (Lot, Route, Consumables) */}
                <View style={styles.executionBox}>
                  {proc.medicationAdministered ? (
                    <View style={styles.detailPill}>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>Medication / Consumable:</ThemedText>
                      <ThemedText variant="captionBold" color={theme.colors.text}>{proc.medicationAdministered}</ThemedText>
                    </View>
                  ) : null}
                  {proc.lotNumber ? (
                    <View style={styles.detailPill}>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>Lot #:</ThemedText>
                      <ThemedText variant="captionBold" color={theme.colors.text}>{proc.lotNumber}</ThemedText>
                      {proc.expirationDate ? (
                        <ThemedText variant="caption" color={theme.colors.textMuted}>Exp: {proc.expirationDate}</ThemedText>
                      ) : null}
                    </View>
                  ) : null}
                  {proc.siteRoute ? (
                    <View style={styles.detailPill}>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>Route / Site:</ThemedText>
                      <ThemedText variant="captionBold" color={theme.colors.text}>{proc.siteRoute}</ThemedText>
                    </View>
                  ) : null}
                </View>

                {/* Pre / Post Procedure Vitals */}
                {preVitals || postVitals ? (
                  <View style={styles.vitalsCompareBox}>
                    {preVitals ? (
                      <View style={styles.vitalsCol}>
                        <ThemedText variant="captionBold" color={theme.colors.textSecondary}>Pre-Procedure Vitals</ThemedText>
                        <ThemedText variant="caption" color={theme.colors.text}>{preVitals}</ThemedText>
                      </View>
                    ) : null}
                    {postVitals ? (
                      <View style={styles.vitalsCol}>
                        <ThemedText variant="captionBold" color={theme.colors.textSecondary}>Post-Procedure Vitals</ThemedText>
                        <ThemedText variant="caption" color={theme.colors.text}>{postVitals}</ThemedText>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Complications */}
                {proc.complications ? (
                  <View style={styles.complicationsBanner}>
                    <Icon name="alert" size={14} color={theme.colors.warningText} />
                    <ThemedText variant="caption" color={theme.colors.warningText}>
                      Complications: {proc.complications}
                    </ThemedText>
                  </View>
                ) : null}

                {/* Nurse Execution & Cancellation Action */}
                {!isCompleted && proc.status !== 'Cancelled' ? (
                  <View style={styles.procedureFooter}>
                    <Pressable
                      testID="execute-procedure-action"
                      onPress={() => {
                        if (onExecuteProcedure) {
                          onExecuteProcedure(proc);
                        } else {
                          setExecutingProc(proc);
                        }
                      }}
                      style={styles.executeBtn}
                    >
                      <Icon name="check" size={14} color={theme.colors.primaryDark} />
                      <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                        Execute / Document Procedure
                      </ThemedText>
                    </Pressable>

                    {hasProceduresWrite && proc.status === 'Ordered' ? (
                      <Pressable
                        testID="cancel-procedure-action"
                        onPress={() => handleCancelProcedure(proc)}
                        style={styles.cancelBtn}
                      >
                        <Icon name="close" size={14} color={theme.colors.emergencyText} />
                        <ThemedText variant="captionBold" color={theme.colors.emergencyText}>
                          Cancel Order
                        </ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyState
          icon="medical"
          title="No in-clinic procedures recorded"
          description="Zero nursing procedures ordered or executed for this patient."
        />
      )}

      {/* Embedded Execution Modal */}
      <ProcedureExecutionModal
        visible={!!executingProc}
        procedure={executingProc}
        patient={patient}
        onClose={() => setExecutingProc(null)}
        onSuccess={() => {
          setExecutingProc(null);
          onRefreshChart?.();
        }}
      />

      {/* Embedded Order Procedure Modal */}
      <OrderProcedureModal
        visible={orderModalVisible}
        patient={patient}
        patientId={patientId || patient?.id}
        patientName={patientName || (patient ? `${patient.firstName} ${patient.lastName}` : undefined)}
        onClose={() => setOrderModalVisible(false)}
        onSuccess={() => {
          setOrderModalVisible(false);
          onRefreshChart?.();
        }}
      />
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
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
  orderProcedureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.sm,
  },
  proceduresList: {
    gap: theme.spacing.sm,
  },
  procedureCard: {
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
  procedureHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  procedureHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailRow: {
    gap: 2,
  },
  executionBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 2,
  },
  detailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radii.xs,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  vitalsCompareBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  vitalsCol: {
    flex: 1,
    minWidth: 140,
    gap: 2,
  },
  complicationsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.warningBg,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.warningBorder,
  },
  procedureFooter: {
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  executeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderWidth: 1,
    borderColor: theme.colors.emergencyBorder,
  },
  modalContent: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  modalBodyFlow: {
    gap: theme.spacing.md,
  },
  modalFooterActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  procedureDetailsPreview: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    gap: 4,
    marginTop: -2,
    marginBottom: 4,
  },
  detailRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  doctorAutoAssignedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  doctorSelectionBox: {
    gap: 6,
  },
  doctorWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.warningBg,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.warningBorder,
  },
  modalSection: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  vitalsInputRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  inputHalf: {
    flex: 1,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  reEvalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  toggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  toggleBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
});

export interface ProcedureExecutionModalProps {
  visible: boolean;
  procedure: ClinicalProcedureRecord | null;
  patient?: ClinicPatient | null;
  onClose: () => void;
  onSuccess?: (updatedProc?: ClinicalProcedureRecord) => void;
  onSubmit?: (payload: any) => Promise<void> | void;
}

export function ProcedureExecutionModal({
  visible,
  procedure,
  patient,
  onClose,
  onSuccess,
  onSubmit,
}: ProcedureExecutionModalProps) {
  const { current: currentStaff } = useStaff();
  const [submitting, setSubmitting] = useState(false);

  // Pre-vitals
  const [preSys, setPreSys] = useState('');
  const [preDia, setPreDia] = useState('');
  const [preHr, setPreHr] = useState('');
  const [preRr, setPreRr] = useState('');
  const [preTemp, setPreTemp] = useState('');
  const [preSpo2, setPreSpo2] = useState('');

  // Execution administration
  const [medication, setMedication] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [siteRoute, setSiteRoute] = useState('');

  // Post-vitals
  const [postSys, setPostSys] = useState('');
  const [postDia, setPostDia] = useState('');
  const [postHr, setPostHr] = useState('');
  const [postRr, setPostRr] = useState('');
  const [postTemp, setPostTemp] = useState('');
  const [postSpo2, setPostSpo2] = useState('');

  // Notes & complications
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [complications, setComplications] = useState('None');
  const [requiresDoctorReEvaluation, setRequiresDoctorReEvaluation] = useState(Boolean(procedure?.orderedByDoctorId));

  React.useEffect(() => {
    if (procedure) {
      setRequiresDoctorReEvaluation(Boolean(procedure.orderedByDoctorId));
    }
  }, [procedure]);

  const handleComplete = async () => {
    if (!procedure) return;
    if (expirationDate.trim()) {
      const expValidation = validateDateString(expirationDate, { boundaryMode: 'futureOrToday' });
      if (!expValidation.isValid) {
        notify.error(expValidation.errorMessage || 'Invalid medication/vaccine expiry date (must be today or future).');
        return;
      }
    }
    setSubmitting(true);
    const preVitals = {
      systolicBp: preSys ? Number(preSys) : undefined,
      diastolicBp: preDia ? Number(preDia) : undefined,
      heartRateBpm: preHr ? Number(preHr) : undefined,
      respiratoryRateBreathsPerMin: preRr ? Number(preRr) : undefined,
      temperatureCelsius: preTemp ? Number(preTemp) : undefined,
      oxygenSaturationPercent: preSpo2 ? Number(preSpo2) : undefined,
    };
    const postVitals = {
      systolicBp: postSys ? Number(postSys) : undefined,
      diastolicBp: postDia ? Number(postDia) : undefined,
      heartRateBpm: postHr ? Number(postHr) : undefined,
      respiratoryRateBreathsPerMin: postRr ? Number(postRr) : undefined,
      temperatureCelsius: postTemp ? Number(postTemp) : undefined,
      oxygenSaturationPercent: postSpo2 ? Number(postSpo2) : undefined,
    };

    const payload = {
      performedByStaffId: currentStaff?.id,
      performedByStaffName: currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : 'Treatment Nurse',
      preProcedureVitalsJson: JSON.stringify(preVitals),
      postProcedureVitalsJson: JSON.stringify(postVitals),
      medicationAdministered: medication.trim() || undefined,
      lotNumber: lotNumber.trim() || undefined,
      expirationDate: expirationDate.trim() || undefined,
      siteRoute: siteRoute.trim() || undefined,
      clinicalNotes: clinicalNotes.trim() || undefined,
      complications: complications.trim() || 'None',
      requiresDoctorReEvaluation,
    };

    if (onSubmit) {
      await onSubmit(payload);
      setSubmitting(false);
      onSuccess?.();
      onClose();
      return;
    }

    const [updated, err] = await clinicService.completeProcedure(procedure.id, payload);

    setSubmitting(false);
    if (err) {
      notify.error(err.message || 'Failed to complete procedure execution.');
      return;
    }

    if (requiresDoctorReEvaluation) {
      notify.success(`${procedure.procedureName} completed. Patient routed to Doctor for re-evaluation.`);
    } else {
      notify.success(`${procedure.procedureName} completed. Patient visit completed and discharged.`);
    }
    onSuccess?.(updated || undefined);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      title={`Execute Procedure: ${procedure?.procedureName || ''}`}
      onClose={onClose}
      footer={
        <View style={styles.modalFooterActions}>
          <Button
            title="Cancel"
            variant="ghost"
            onPress={onClose}
            disabled={submitting}
          />
          <Button
            title={requiresDoctorReEvaluation ? 'Complete & Return for Re-Evaluation' : 'Complete & Discharge Patient'}
            variant="primary"
            icon="check"
            loading={submitting}
            onPress={handleComplete}
          />
        </View>
      }
    >
      <View style={styles.modalBodyFlow}>
        {/* Section 1: Pre-Procedure Vitals */}
        <View style={styles.modalSection}>
          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
            PRE-PROCEDURE VITALS
          </ThemedText>
          <View style={styles.vitalsInputRow}>
            <View style={styles.inputHalf}>
              <Input
                label="Systolic BP (mmHg)"
                value={preSys}
                onChangeText={setPreSys}
                placeholder="120"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputHalf}>
              <Input
                label="Diastolic BP (mmHg)"
                value={preDia}
                onChangeText={setPreDia}
                placeholder="80"
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={styles.vitalsInputRow}>
            <View style={styles.inputHalf}>
              <Input
                label="Heart Rate (bpm)"
                value={preHr}
                onChangeText={setPreHr}
                placeholder="75"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputHalf}>
              <Input
                label="Resp Rate (cpm)"
                value={preRr}
                onChangeText={setPreRr}
                placeholder="18"
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={styles.vitalsInputRow}>
            <View style={styles.inputHalf}>
              <Input
                label="Temp (°C)"
                value={preTemp}
                onChangeText={setPreTemp}
                placeholder="36.5"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputHalf}>
              <Input
                label="SpO2 (%)"
                value={preSpo2}
                onChangeText={setPreSpo2}
                placeholder="98"
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Section 2: Consumable & Medication Administration */}
        <View style={styles.modalSection}>
          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
            ADMINISTRATION & LOT NUMBER TRACKING
          </ThemedText>
          <Input
            label="Medication / Supply Administered"
            value={medication}
            onChangeText={setMedication}
            placeholder="e.g. Salbutamol 2.5mg / 2.5mL nebule"
          />
          <View style={styles.vitalsInputRow}>
            <View style={styles.inputHalf}>
              <Input
                label="Lot / Batch Number"
                value={lotNumber}
                onChangeText={setLotNumber}
                placeholder="e.g. LOT-99214A"
              />
            </View>
            <View style={styles.inputHalf}>
              <ValidatedDateInput
                label="Expiry Date (YYYY-MM-DD)"
                value={expirationDate}
                onChangeText={setExpirationDate}
                boundaryMode="futureOrToday"
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>
          <Input
            label="Route / Anatomical Site"
            value={siteRoute}
            onChangeText={setSiteRoute}
            placeholder="e.g. Inhalation via Jet Nebulizer"
          />
        </View>

        {/* Section 3: Post-Procedure Vitals */}
        <View style={styles.modalSection}>
          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
            POST-PROCEDURE VITALS & OUTCOME
          </ThemedText>
          <View style={styles.vitalsInputRow}>
            <View style={styles.inputHalf}>
              <Input
                label="Post Systolic BP"
                value={postSys}
                onChangeText={setPostSys}
                placeholder="118"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputHalf}>
              <Input
                label="Post Diastolic BP"
                value={postDia}
                onChangeText={setPostDia}
                placeholder="78"
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={styles.vitalsInputRow}>
            <View style={styles.inputHalf}>
              <Input
                label="Post Heart Rate (bpm)"
                value={postHr}
                onChangeText={setPostHr}
                placeholder="72"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputHalf}>
              <Input
                label="Post Resp Rate (cpm)"
                value={postRr}
                onChangeText={setPostRr}
                placeholder="16"
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={styles.vitalsInputRow}>
            <View style={styles.inputHalf}>
              <Input
                label="Post Temp (°C)"
                value={postTemp}
                onChangeText={setPostTemp}
                placeholder="36.5"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputHalf}>
              <Input
                label="Post SpO2 (%)"
                value={postSpo2}
                onChangeText={setPostSpo2}
                placeholder="99"
                keyboardType="numeric"
              />
            </View>
          </View>
          <Input
            label="Complications"
            value={complications}
            onChangeText={setComplications}
            placeholder="None"
          />
          <Input
            label="Clinical Execution Notes"
            value={clinicalNotes}
            onChangeText={setClinicalNotes}
            placeholder="Patient tolerated procedure well without distress."
            multiline
          />
        </View>

        {/* Section 4: Routing & Re-Evaluation Toggle */}
        <View style={styles.modalSection}>
          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
            ROUTING & DISCHARGE
          </ThemedText>
          <View style={styles.reEvalContainer}>
            <View style={{ flex: 1, paddingRight: theme.spacing.sm }}>
              <ThemedText variant="captionBold" color={theme.colors.text}>
                Requires Doctor Re-Evaluation?
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                {requiresDoctorReEvaluation
                  ? 'Patient will be returned to Doctor queue for re-evaluation upon completion.'
                  : 'Standalone procedure: complete and discharge patient visit directly.'}
              </ThemedText>
            </View>
            <Pressable
              testID="requires-doctor-re-eval-toggle"
              style={[styles.toggleBtn, requiresDoctorReEvaluation && styles.toggleBtnActive]}
              onPress={() => setRequiresDoctorReEvaluation(!requiresDoctorReEvaluation)}
            >
              <ThemedText
                variant="captionBold"
                color={requiresDoctorReEvaluation ? theme.colors.onPrimary : theme.colors.textSecondary}
              >
                {requiresDoctorReEvaluation ? 'Yes' : 'No'}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export interface OrderProcedureModalProps {
  visible: boolean;
  patient?: ClinicPatient | null;
  patientId?: string;
  patientName?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function OrderProcedureModal({
  visible,
  patient,
  patientId,
  patientName,
  onClose,
  onSuccess,
}: OrderProcedureModalProps) {
  const clinic = useClinic();
  const { current: currentStaff, staff = [] } = useStaff();

  const [services, setServices] = useState<ClinicServiceItem[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  // Form State
  const [procedureCode, setProcedureCode] = useState('PROC-NEB');
  const [procedureName, setProcedureName] = useState('Nebulization Therapy');
  const [category, setCategory] = useState('Procedure');
  const [selectedService, setSelectedService] = useState<ClinicServiceItem | null>(null);

  const [targetRoomName, setTargetRoomName] = useState('Treatment Bay 1');
  const [targetRoomId, setTargetRoomId] = useState<string | undefined>(undefined);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [ordering, setOrdering] = useState(false);

  // Load services catalog on modal visibility
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingServices(true);
    clinicService.getServices(undefined, true).then(([data, err]) => {
      if (cancelled) return;
      setLoadingServices(false);
      if (!err && data && data.length > 0) {
        setServices(data);
        const match = data.find((s) => s.code === procedureCode || s.name === procedureName);
        if (match) {
          setSelectedService(match);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // Determine active rooms
  const activeRooms = useMemo(() => {
    const list = clinic?.rooms && clinic.rooms.length > 0 ? clinic.rooms : [];
    const active = list.filter((r) => r.isActive);
    const treatment = active.filter((r) => r.type === 'Treatment');
    return treatment.length > 0 ? treatment : active;
  }, [clinic?.rooms]);

  // Determine active doctors in facility
  const activeDoctors = useMemo(() => {
    return staff.filter((s) => s.isActive && (s.role === 'Doctor' || Boolean(s.prcLicenseNumber)));
  }, [staff]);

  const isCurrentStaffDoctor = Boolean(
    currentStaff && (currentStaff.role === 'Doctor' || Boolean(currentStaff.prcLicenseNumber))
  );

  // Check if procedure is nurse-orderable
  const isNurseOrderable = useMemo(() => {
    if (selectedService && typeof selectedService.isNurseOrderable === 'boolean') {
      return selectedService.isNurseOrderable;
    }
    const normCode = procedureCode.trim().toUpperCase();
    return ['PROC-NEB', 'PROC-WOUND', 'PROC-VAX', 'LAB-RBS'].includes(normCode);
  }, [selectedService, procedureCode]);

  // Effective ordering doctor
  const effectiveDoctorId = isCurrentStaffDoctor
    ? currentStaff?.id
    : selectedDoctorId || undefined;

  const effectiveDoctorName = isCurrentStaffDoctor
    ? (currentStaff ? formatStaffDisplayName(currentStaff) : undefined)
    : (activeDoctors.find((d) => d.id === selectedDoctorId)
        ? formatStaffDisplayName(activeDoctors.find((d) => d.id === selectedDoctorId)!)
        : undefined);

  // Doctor order is required when non-doctor user orders a non-nurse-orderable procedure
  const doctorOrderRequired = !isCurrentStaffDoctor && !isNurseOrderable;

  // Procedure options
  const procedureOptions = useMemo<SelectOption[]>(() => {
    const catalogList = services.length > 0 ? services : [
      { id: '1', code: 'PROC-NEB', name: 'Nebulization Therapy', category: 'Procedure', standardPrice: 250, isActive: true, isNurseOrderable: true },
      { id: '2', code: 'PROC-WOUND', name: 'Wound Dressing & Debridement', category: 'Procedure', standardPrice: 350, isActive: true, isNurseOrderable: true },
      { id: '3', code: 'PROC-VAX', name: 'Vaccine Administration Fee', category: 'NursingService', standardPrice: 250, isActive: true, isNurseOrderable: true },
      { id: '4', code: 'LAB-RBS', name: 'Random Blood Sugar (RBS) Rapid Test', category: 'Diagnostic', standardPrice: 150, isActive: true, isNurseOrderable: true },
    ];
    return catalogList.map((s) => ({
      label: `${s.name} (${s.code})`,
      value: s.code,
      description: `₱${(s.standardPrice || 0).toLocaleString()} • ${s.category}`,
      badge: s.isNurseOrderable ? 'Nurse-Orderable' : 'Doctor Order',
    }));
  }, [services]);

  // Room options
  const roomOptions = useMemo<SelectOption[]>(() => {
    if (activeRooms.length > 0) {
      return activeRooms.map((r) => ({
        label: r.name,
        value: r.id,
        description: r.type ? `${r.type} Room` : undefined,
      }));
    }
    return [
      { label: 'Treatment Bay 1', value: 'Treatment Bay 1' },
      { label: 'Treatment Bay 2', value: 'Treatment Bay 2' },
      { label: 'Minor Procedure Room', value: 'Minor Procedure Room' },
      { label: 'Triage Room', value: 'Triage Room' },
    ];
  }, [activeRooms]);

  // Doctor options
  const doctorOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [
      {
        label: 'None / Protocol (Nurse Order)',
        value: '',
        description: 'Order initiated under standing clinic nursing protocols',
      },
    ];
    activeDoctors.forEach((doc) => {
      opts.push({
        label: `Dr. ${doc.firstName} ${doc.lastName}`,
        value: doc.id,
        description: doc.specialty || (doc.prcLicenseNumber ? `PRC #${doc.prcLicenseNumber}` : 'Licensed Physician'),
        badge: doc.prcLicenseNumber ? 'PRC Verified' : undefined,
      });
    });
    return opts;
  }, [activeDoctors]);

  const handleSelectProcedure = (codeOrCustom: string) => {
    setProcedureCode(codeOrCustom);
    const match = services.find((s) => s.code.toUpperCase() === codeOrCustom.toUpperCase() || s.name.toLowerCase() === codeOrCustom.toLowerCase());
    if (match) {
      setProcedureName(match.name);
      setCategory(match.category || 'Procedure');
      setSelectedService(match);
    } else {
      const defaultMatch = procedureOptions.find((o) => o.value === codeOrCustom);
      if (defaultMatch) {
        setProcedureName(defaultMatch.label.split(' (')[0]);
      } else {
        setProcedureName(codeOrCustom);
      }
      setSelectedService(null);
    }
  };

  const handleSelectRoom = (val: string) => {
    const roomObj = activeRooms.find((r) => r.id === val || r.name === val);
    if (roomObj) {
      setTargetRoomId(roomObj.id);
      setTargetRoomName(roomObj.name);
    } else {
      setTargetRoomId(undefined);
      setTargetRoomName(val);
    }
  };

  const handleOrder = async () => {
    const targetPatId = patientId || patient?.id;
    if (!targetPatId) {
      notify.error('No patient selected.');
      return;
    }
    if (!procedureName.trim()) {
      notify.error('Procedure name is required.');
      return;
    }
    if (doctorOrderRequired && !effectiveDoctorId) {
      notify.error('This procedure is restricted to physician orders. Please select an attending physician.');
      return;
    }

    setOrdering(true);
    const [created, err] = await clinicService.orderProcedure({
      patientId: targetPatId,
      patientName: patientName || (patient ? `${patient.firstName} ${patient.lastName}` : 'Walk-in Patient'),
      procedureCode: procedureCode.trim() || undefined,
      procedureName: procedureName.trim(),
      category: category.trim() || 'Procedure',
      targetRoomName: targetRoomName.trim() || undefined,
      targetRoomId: targetRoomId || undefined,
      clinicalNotes: clinicalNotes.trim() || undefined,
      orderedByDoctorId: effectiveDoctorId,
      orderedByDoctorName: effectiveDoctorName,
    });
    setOrdering(false);
    if (err) {
      notify.error(err.message || 'Failed to order procedure.');
      return;
    }
    notify.success(`${procedureName} ordered successfully.`);
    onSuccess?.();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      title="Order Clinical Procedure"
      onClose={onClose}
      footer={
        <View style={styles.modalFooterActions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} disabled={ordering} />
          <Button
            testID="confirm-order-procedure-button"
            title={ordering ? 'Ordering...' : 'Confirm Order'}
            variant="primary"
            icon="plus"
            loading={ordering}
            disabled={doctorOrderRequired && !effectiveDoctorId}
            onPress={handleOrder}
          />
        </View>
      }
    >
      <View style={styles.modalBodyFlow}>
        <View style={styles.modalSection}>
          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
            PROCEDURE CATALOG SELECTION
          </ThemedText>

          <Select
            label="Procedure Item *"
            value={procedureCode}
            options={procedureOptions}
            onSelect={handleSelectProcedure}
            placeholder="Select procedure from catalog..."
            modalTitle="Select Clinical Procedure"
            modalSubtitle="Choose standard procedure from fee schedule catalog"
          />

          <View style={styles.procedureDetailsPreview}>
            <View style={styles.detailRowInline}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>Selected Name:</ThemedText>
              <ThemedText variant="captionBold" color={theme.colors.text}>{procedureName}</ThemedText>
            </View>
            <View style={styles.detailRowInline}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>Category:</ThemedText>
              <ThemedText variant="caption" color={theme.colors.text}>{category}</ThemedText>
            </View>
            <View style={styles.badgeRow}>
              {isNurseOrderable ? (
                <Badge label="Nurse-Orderable Protocol" variant="success" size="sm" />
              ) : (
                <Badge label="Doctor Order Required" variant="warning" size="sm" />
              )}
            </View>
          </View>

          <Select
            label="Target Treatment Bay / Room"
            value={targetRoomId || targetRoomName}
            options={roomOptions}
            onSelect={handleSelectRoom}
            placeholder="Select treatment bay or procedure room..."
            modalTitle="Select Destination Room"
            modalSubtitle="Choose treatment bay or clinic operatory"
          />

          {isCurrentStaffDoctor ? (
            <View style={styles.doctorAutoAssignedBox}>
              <Icon name="medical" size={16} color={theme.colors.primaryDark} />
              <View style={{ flex: 1 }}>
                <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                  Ordering Physician: Dr. {currentStaff?.firstName} {currentStaff?.lastName}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  {currentStaff?.prcLicenseNumber ? `PRC License #${currentStaff.prcLicenseNumber}` : 'Licensed Physician'}
                </ThemedText>
              </View>
            </View>
          ) : (
            <View style={styles.doctorSelectionBox}>
              <Select
                label="Attending Physician (Doctor Order)"
                value={selectedDoctorId}
                options={doctorOptions}
                onSelect={setSelectedDoctorId}
                placeholder="Select ordering doctor..."
                modalTitle="Select Ordering Doctor"
                modalSubtitle="Select the physician authorizing this clinical order"
              />
              {doctorOrderRequired && !selectedDoctorId ? (
                <View style={styles.doctorWarningBanner}>
                  <Icon name="alert" size={14} color={theme.colors.warningText} />
                  <ThemedText variant="caption" color={theme.colors.warningText}>
                    Doctor order required: This procedure is not flagged as nurse-orderable. Please select the ordering doctor above.
                  </ThemedText>
                </View>
              ) : null}
            </View>
          )}

          <Input
            label="Clinical Notes / Indication"
            value={clinicalNotes}
            onChangeText={setClinicalNotes}
            placeholder="Clinical indications and dosage instructions..."
            multiline
          />
        </View>
      </View>
    </Modal>
  );
}
