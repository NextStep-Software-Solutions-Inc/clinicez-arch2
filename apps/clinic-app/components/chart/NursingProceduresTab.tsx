import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Badge, Icon, EmptyState, Input, Button, Modal } from '../ui';
import { notify } from '@utils/feedback';
import { useStaff } from '../../context/StaffContext';
import {
  clinicService,
  ClinicPatient,
  ClinicalProcedureRecord,
} from '../../services/clinicService';

export interface NursingProceduresTabProps {
  patient?: ClinicPatient | null;
  patientId?: string;
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
  procedures = [],
  onOrderProcedure,
  onExecuteProcedure,
  onRefreshChart,
}: NursingProceduresTabProps) {
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [executingProc, setExecutingProc] = useState<ClinicalProcedureRecord | null>(null);

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

        {onOrderProcedure ? (
          <Pressable onPress={onOrderProcedure} style={styles.orderProcedureBtn}>
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
                      <Badge label={`lib_management: ${statMgmt.code}`} variant="purple" size="sm" />
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

                {/* Nurse Execution Action */}
                {!isCompleted ? (
                  <View style={styles.procedureFooter}>
                    <Pressable
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
    alignItems: 'flex-start',
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
  modalContent: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
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
});

export interface ProcedureExecutionModalProps {
  visible: boolean;
  procedure: ClinicalProcedureRecord | null;
  patient?: ClinicPatient | null;
  onClose: () => void;
  onSuccess?: (updatedProc?: ClinicalProcedureRecord) => void;
}

export function ProcedureExecutionModal({
  visible,
  procedure,
  patient,
  onClose,
  onSuccess,
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

  const handleComplete = async () => {
    if (!procedure) return;
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

    const [updated, err] = await clinicService.completeProcedure(procedure.id, {
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
    });

    setSubmitting(false);
    if (err) {
      notify.error(err.message || 'Failed to complete procedure execution.');
      return;
    }

    notify.success(`${procedure.procedureName} completed. Patient routed to Doctor for re-evaluation.`);
    onSuccess?.(updated || undefined);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      title={`Execute Procedure: ${procedure?.procedureName || ''}`}
      onClose={onClose}
    >
      <ScrollView contentContainerStyle={styles.modalContent}>
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
              <Input
                label="Expiry Date (YYYY-MM-DD)"
                value={expirationDate}
                onChangeText={setExpirationDate}
                placeholder="e.g. 2027-12-31"
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

        {/* Action Buttons */}
        <View style={styles.modalActionRow}>
          <Button
            title="Cancel"
            variant="ghost"
            onPress={onClose}
          />
          <Button
            title="Complete & Return for Re-Evaluation"
            variant="primary"
            icon="check"
            loading={submitting}
            onPress={handleComplete}
          />
        </View>
      </ScrollView>
    </Modal>
  );
}
