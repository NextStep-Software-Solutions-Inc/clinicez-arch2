import React, { useState, useMemo, useCallback } from 'react';
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
  StaffMember,
  formatClinicDateTime,
} from '../../services/clinicService';
import {
  OrderCatalogSearchModal,
  type OrderCatalogItemPayload,
} from '../consultation/OrderCatalogSearchModal';

function formatStaffDisplayName(
  staff?: Pick<StaffMember, 'title' | 'firstName' | 'lastName' | 'role'> | null
): string {
  if (!staff) return '';
  const raw = [staff.title, staff.firstName, staff.lastName].filter(Boolean).join(' ').trim();
  if (!raw) return '';
  if (staff.role === 'Doctor' && !/^dr\.?\s/i.test(raw)) {
    return `Dr. ${raw}`;
  }
  return raw;
}

function normalizeClinicianName(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/^dr\.?\s+/i, '')
    .toLowerCase();
}

const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NursingProceduresTabProps {
  patient?: ClinicPatient | null;
  patientId?: string;
  patientName?: string;
  queueItemId?: string;
  allowDuplicateActive?: boolean;
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
  allowDuplicateActive = false,
  procedures = [],
  onOrderProcedure,
  onExecuteProcedure,
  onRefreshChart,
}: NursingProceduresTabProps) {
  const { user } = useAuth();
  const clinic = useClinic();
  const { current: currentStaff, staff = [], currentName } = useStaff();
  const isAdmin = user?.role === 'Admin' || currentStaff?.role === 'Admin';
  const hasProceduresWrite = usePermission(PERMISSIONS.proceduresWrite) || isAdmin;
  const canOrderProcedures = user ? hasProceduresWrite : true;

  const dateFormat = clinic?.settings?.dateFormat ?? 'MM/DD/YYYY';
  const timeFormat = clinic?.settings?.timeFormat ?? '12h';
  const timeZoneId = clinic?.settings?.timeZoneId ?? 'Asia/Manila';

  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [executingProc, setExecutingProc] = useState<ClinicalProcedureRecord | null>(null);
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [materializedQueueItemId, setMaterializedQueueItemId] = useState<string | null>(null);

  const resolveOrderedByDisplay = useCallback(
    (proc: ClinicalProcedureRecord): string | null => {
      if (proc.orderedByDoctorName && proc.orderedByDoctorName.trim()) {
        return proc.orderedByDoctorName.trim();
      }
      const lookupId = proc.orderedByDoctorId || proc.createdBy;
      if (lookupId) {
        const matchStaff = staff.find((s) => s.id === lookupId);
        if (matchStaff) {
          const formatted = formatStaffDisplayName(matchStaff);
          if (formatted) return formatted;
        }
      }
      if (proc.createdBy && proc.createdBy.trim() && !UUID_LIKE_REGEX.test(proc.createdBy.trim())) {
        return proc.createdBy.trim();
      }
      return null;
    },
    [staff]
  );

  const canCancelProcedureOrder = useCallback(
    (proc: ClinicalProcedureRecord): boolean => {
      if (proc.status !== 'Ordered') return false;
      if (!user) return true;
      if (isAdmin) return true;
      if (!hasProceduresWrite) return false;

      const callerIds = [currentStaff?.id, user.id].filter(Boolean) as string[];
      if (proc.orderedByDoctorId && callerIds.includes(proc.orderedByDoctorId)) {
        return true;
      }
      if (proc.createdBy && callerIds.includes(proc.createdBy)) {
        return true;
      }

      const callerNames = [
        formatStaffDisplayName(currentStaff),
        currentName,
        user.name,
      ]
        .map((n) => normalizeClinicianName(n))
        .filter(Boolean);

      if (callerNames.length > 0) {
        const normOrderedBy = normalizeClinicianName(proc.orderedByDoctorName);
        if (normOrderedBy && callerNames.includes(normOrderedBy)) {
          return true;
        }
        const normCreatedBy = normalizeClinicianName(proc.createdBy);
        if (normCreatedBy && callerNames.includes(normCreatedBy)) {
          return true;
        }
      }

      return false;
    },
    [user, isAdmin, hasProceduresWrite, currentStaff, currentName]
  );

  const handleSelectCatalogOrder = useCallback(
    async (order: OrderCatalogItemPayload) => {
      const targetPatId = patientId || patient?.id;
      if (!targetPatId) {
        notify.error('No patient selected.');
        return;
      }
      const resolvedPatientName =
        patientName ||
        (patient ? `${patient.firstName} ${patient.lastName}`.trim() : 'Walk-in Patient');

      let effectiveQueueItemId = queueItemId || materializedQueueItemId;
      if (!effectiveQueueItemId && targetPatId) {
        const isDiagOrder = (order.category || '').toLowerCase().includes('diagnostic');
        const [directVisit, visitErr] = await clinicService.ensureDirectVisit({
          patientId: targetPatId,
          patientName: resolvedPatientName,
          visitType: 'RoutineCheckup',
          initialStatus: isDiagOrder ? 'InConsultation' : 'PendingProcedure',
          doctorId: order.orderedByDoctorId,
          doctorName: order.orderedByDoctorName,
          allowDuplicateActive: allowDuplicateActive && !materializedQueueItemId,
        });
        if (visitErr || !directVisit) {
          notify.error(visitErr?.message || 'Could not initialize direct visit for order.');
          return;
        }
        effectiveQueueItemId = directVisit.id;
        setMaterializedQueueItemId(directVisit.id);
      }

      const isDiag = (order.category || '').toLowerCase().includes('diagnostic');
      if (isDiag) {
        const [, err] = await clinicService.createLabOrder({
          patientId: targetPatId,
          patientName: resolvedPatientName,
          orderedByDoctorId: order.orderedByDoctorId,
          orderedByDoctorName: order.orderedByDoctorName,
          notes: order.instructions,
          queueItemId: effectiveQueueItemId || undefined,
          items: [
            {
              testName: order.name,
              category: order.category || 'Diagnostic',
              instructions: order.instructions,
              isDoneOutsideFacility: order.fulfillmentMode === 'outside',
              diagnosticFee: order.fulfillmentMode === 'outside' ? 0 : order.standardPrice,
              testCode: order.code || undefined,
            },
          ],
        });
        if (err) {
          notify.error(err.message || 'Failed to order diagnostic test.');
          return;
        }
        notify.success(`${order.name} ordered.`);
        onRefreshChart?.();
        return;
      }

      const [, err] = await clinicService.orderProcedure({
        patientId: targetPatId,
        patientName: resolvedPatientName,
        queueItemId: effectiveQueueItemId || undefined,
        procedureCode: order.code || undefined,
        procedureName: order.name,
        category: order.category || 'Procedure',
        targetRoomId: order.targetRoomId || order.roomId || undefined,
        targetRoomName: order.targetRoomName || order.roomName || undefined,
        toothNumber: order.toothNumber,
        toothSurface: order.toothSurface,
        clinicalNotes: order.instructions,
        orderedByDoctorId: order.orderedByDoctorId,
        orderedByDoctorName: order.orderedByDoctorName,
      });
      if (err) {
        notify.error(err.message || 'Failed to order procedure.');
        return;
      }
      notify.success(`${order.name} ordered successfully.`);
      onRefreshChart?.();
    },
    [patientId, patient, patientName, queueItemId, materializedQueueItemId, allowDuplicateActive, onRefreshChart]
  );

  const filteredProcedures = useMemo(() => {
    return procedures.filter((p) => {
      if (selectedFilter === 'SCHEDULED') {
        return p.status === 'Ordered';
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
        <View style={styles.filterScrollWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterRow}
          >
            <Pressable
              onPress={() => setSelectedFilter('ALL')}
              style={[styles.filterBtn, selectedFilter === 'ALL' && styles.filterBtn_active]}
            >
              <ThemedText
                variant="captionBold"
                numberOfLines={1}
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
                numberOfLines={1}
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
                numberOfLines={1}
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
                numberOfLines={1}
                color={selectedFilter === 'COMPLETED' ? theme.colors.primaryDark : theme.colors.textSecondary}
              >
                Completed
              </ThemedText>
            </Pressable>
          </ScrollView>
        </View>

        {canOrderProcedures ? (
          <Button
            testID="order-procedure-button"
            variant="primary"
            size="sm"
            icon="plus"
            title="Order Procedure"
            numberOfLines={1}
            onPress={onOrderProcedure || (() => setOrderModalVisible(true))}
            style={styles.orderProcedureBtn}
          />
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
                      Scheduled:{' '}
                      {formatClinicDateTime(proc.scheduledAt, {
                        dateFormat,
                        timeFormat,
                        timeZoneId,
                        fallback: proc.scheduledAt,
                      })}
                      {resolveOrderedByDisplay(proc)
                        ? ` • Ordered by ${resolveOrderedByDisplay(proc)}`
                        : ''}
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
                    <Button
                      testID="execute-procedure-action"
                      variant="outline"
                      size="xs"
                      icon="check"
                      title="Execute / Document Procedure"
                      onPress={() => {
                        if (onExecuteProcedure) {
                          onExecuteProcedure(proc);
                        } else {
                          setExecutingProc(proc);
                        }
                      }}
                    />

                    {canCancelProcedureOrder(proc) ? (
                      <Button
                        testID="cancel-procedure-action"
                        variant="dangerOutline"
                        size="xs"
                        icon="close"
                        title="Cancel Order"
                        onPress={() => handleCancelProcedure(proc)}
                      />
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

      {/* Standard Permission-Aware Add Test or Procedure Modal */}
      {!onOrderProcedure ? (
        <OrderCatalogSearchModal
          visible={orderModalVisible}
          onClose={() => setOrderModalVisible(false)}
          initialCategory="Procedure"
          isYakapEligible={Boolean(
            patient?.philHealthNumber || (patient as any)?.isYakapEligible
          )}
          alreadyOrderedNames={procedures
            .filter((p) => p.status === 'Ordered' || p.status === 'InProgress')
            .map((p) => p.procedureName)}
          alreadyOrderedCodes={procedures
            .filter((p) => p.status === 'Ordered' || p.status === 'InProgress')
            .map((p) => p.procedureCode || '')
            .filter(Boolean)}
          onSelectOrder={handleSelectCatalogOrder}
        />
      ) : null}
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
    flexWrap: 'nowrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    width: '100%',
    minWidth: 0,
  },
  filterScrollWrap: {
    flexDirection: 'row',
    flex: 1,
    minWidth: 0,
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: theme.spacing.xs,
  },
  filterBtn: {
    flexShrink: 0,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  filterBtn_active: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  orderProcedureBtn: {
    flexShrink: 0,
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
