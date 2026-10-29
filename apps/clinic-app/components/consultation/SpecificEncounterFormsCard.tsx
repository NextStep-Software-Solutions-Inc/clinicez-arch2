import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import { theme } from '../../constants/theme';
import type {
  EncounterObGyneExamDto,
  EncounterPediatricMilestoneDto,
  EncounterAdolescentAssessmentDto,
  EncounterHeadsssDomainAssessmentDto,
  PatientBpMonitoringLogDto,
} from '../../services/clinicService';

export interface SpecificEncounterFormsCardProps {
  obGyneExam?: EncounterObGyneExamDto | null;
  onObGyneExamChange: (val: EncounterObGyneExamDto | null) => void;

  pediatricMilestones?: EncounterPediatricMilestoneDto[];
  onPediatricMilestonesChange: (val: EncounterPediatricMilestoneDto[]) => void;

  adolescentAssessment?: EncounterAdolescentAssessmentDto | null;
  onAdolescentAssessmentChange: (val: EncounterAdolescentAssessmentDto | null) => void;

  headsssAssessments?: EncounterHeadsssDomainAssessmentDto[];
  onHeadsssAssessmentsChange: (val: EncounterHeadsssDomainAssessmentDto[]) => void;

  bpMonitoringLogs?: PatientBpMonitoringLogDto[];
  onBpMonitoringLogsChange: (val: PatientBpMonitoringLogDto[]) => void;

  disabled?: boolean;
}

type FormTab = 'obgyne' | 'pediatric' | 'adolescent' | 'headsss' | 'bplog';

export default function SpecificEncounterFormsCard({
  obGyneExam,
  onObGyneExamChange,
  pediatricMilestones = [],
  onPediatricMilestonesChange,
  adolescentAssessment,
  onAdolescentAssessmentChange,
  headsssAssessments = [],
  onHeadsssAssessmentsChange,
  bpMonitoringLogs = [],
  onBpMonitoringLogsChange,
  disabled = false,
}: SpecificEncounterFormsCardProps) {
  const [activeTab, setActiveTab] = useState<FormTab>('obgyne');
  const [isExpanded, setIsExpanded] = useState(false);

  const activeCount = [
    Boolean(obGyneExam?.gravidity || obGyneExam?.lmp),
    pediatricMilestones.length > 0,
    Boolean(adolescentAssessment?.tannerStage || adolescentAssessment?.smrBreastRating),
    headsssAssessments.length > 0,
    bpMonitoringLogs.length > 0,
  ].filter(Boolean).length;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.md,
        },
      ]}
    >
      {/* Header with expand / collapse toggle */}
      <TouchableOpacity
        onPress={() => setIsExpanded((prev) => !prev)}
        style={styles.headerRow}
      >
        <View style={styles.titleInfo}>
          <ThemedText variant="bodyBold">Specific Encounter Forms</ThemedText>
          <ThemedText variant="small" color={theme.colors.textSecondary}>
            PhilHealth YAKAP 2.0 specialized cohorts (Ob-Gyne, Pediatric, Adolescent, HEADSSS, BP Log)
          </ThemedText>
        </View>
        <View style={styles.headerRight}>
          <Badge
            variant={activeCount > 0 ? 'primary' : 'neutral'}
            label={`${activeCount} Active`}
          />
          <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={18} color={theme.colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={{ marginTop: theme.spacing.md }}>
          {/* Tab Selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.tabBar, { gap: theme.spacing.xs, marginBottom: theme.spacing.md }]}
          >
            {[
              { id: 'obgyne', label: 'Ob-Gyne Exam' },
              { id: 'pediatric', label: 'Pediatric Milestones' },
              { id: 'adolescent', label: 'Adolescent Assessment' },
              { id: 'headsss', label: 'HEADSSS Assessment' },
              { id: 'bplog', label: 'BP Monitoring Log' },
            ].map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id as FormTab)}
                  style={[
                    styles.tabPill,
                    {
                      backgroundColor: selected ? theme.colors.primaryLight : theme.colors.surfaceSubtle,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      borderRadius: theme.radii.full,
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: theme.spacing.xs,
                    },
                  ]}
                >
                  <ThemedText
                    variant="caption"
                    style={{
                      color: selected ? theme.colors.primaryDark : theme.colors.text,
                      fontWeight: selected ? '700' : '500',
                    }}
                  >
                    {tab.label}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Tab 1: Ob-Gyne Exam */}
          {activeTab === 'obgyne' && (
            <View style={{ gap: theme.spacing.sm }}>
              <View style={styles.rowTwo}>
                <Input
                  label="Gravidity (G)"
                  value={obGyneExam?.gravidity != null ? String(obGyneExam.gravidity) : ''}
                  onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, gravidity: parseInt(val, 10) || null })}
                  keyboardType="numeric"
                  editable={!disabled}
                />
                <Input
                  label="Parity (P)"
                  value={obGyneExam?.parity != null ? String(obGyneExam.parity) : ''}
                  onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, parity: parseInt(val, 10) || null })}
                  keyboardType="numeric"
                  editable={!disabled}
                />
              </View>
              <View style={styles.rowTwo}>
                <Input
                  label="Last Menstrual Period (LMP)"
                  value={obGyneExam?.lmp || ''}
                  onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, lmp: val })}
                  placeholder="YYYY-MM-DD"
                  editable={!disabled}
                />
                <Input
                  label="Expected Date of Delivery (EDD)"
                  value={obGyneExam?.edd || ''}
                  onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, edd: val })}
                  placeholder="YYYY-MM-DD"
                  editable={!disabled}
                />
              </View>
              <View style={styles.rowTwo}>
                <Input
                  label="Fundic Height (cm)"
                  value={obGyneExam?.fundicHeightCm != null ? String(obGyneExam.fundicHeightCm) : ''}
                  onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, fundicHeightCm: parseFloat(val) || null })}
                  keyboardType="numeric"
                  editable={!disabled}
                />
                <Input
                  label="Fetal Heart Tone (bpm)"
                  value={obGyneExam?.fetalHeartToneBpm != null ? String(obGyneExam.fetalHeartToneBpm) : ''}
                  onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, fetalHeartToneBpm: parseInt(val, 10) || null })}
                  keyboardType="numeric"
                  editable={!disabled}
                />
              </View>
              <Input
                label="Fetal Presentation / Remarks"
                value={obGyneExam?.fetalPresentation || ''}
                onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, fetalPresentation: val })}
                placeholder="e.g. Cephalic, Breech, Transverse"
                editable={!disabled}
              />
            </View>
          )}

          {/* Tab 2: Pediatric Milestones */}
          {activeTab === 'pediatric' && (
            <View style={{ gap: theme.spacing.sm }}>
              <Input
                label="Milestone Age / Visit Age"
                value={pediatricMilestones[0]?.milestoneVisitAge || ''}
                onChangeText={(val) => {
                  const first = pediatricMilestones[0] || { grossMotorStatus: 'Normal' };
                  onPediatricMilestonesChange([{ ...first, milestoneVisitAge: val }]);
                }}
                placeholder="e.g. 2 months, 6 months, 1 year"
                editable={!disabled}
              />
              <View style={styles.rowTwo}>
                <Input
                  label="Gross Motor"
                  value={pediatricMilestones[0]?.grossMotorStatus || ''}
                  onChangeText={(val) => {
                    const first = pediatricMilestones[0] || {};
                    onPediatricMilestonesChange([{ ...first, grossMotorStatus: val }]);
                  }}
                  placeholder="e.g. Normal, Delayed"
                  editable={!disabled}
                />
                <Input
                  label="Fine Motor"
                  value={pediatricMilestones[0]?.fineMotorStatus || ''}
                  onChangeText={(val) => {
                    const first = pediatricMilestones[0] || {};
                    onPediatricMilestonesChange([{ ...first, fineMotorStatus: val }]);
                  }}
                  placeholder="e.g. Normal, Delayed"
                  editable={!disabled}
                />
              </View>
              <Input
                label="Pediatric Danger Signs (comma-separated)"
                value={pediatricMilestones[0]?.dangerSigns?.join(', ') || ''}
                onChangeText={(val) => {
                  const first = pediatricMilestones[0] || {};
                  const signs = val.split(',').map((s) => s.trim()).filter(Boolean);
                  onPediatricMilestonesChange([{ ...first, dangerSigns: signs }]);
                }}
                placeholder="e.g. Convulsions, Lethargy, Inability to feed"
                editable={!disabled}
              />
            </View>
          )}

          {/* Tab 3: Adolescent Assessment */}
          {activeTab === 'adolescent' && (
            <View style={{ gap: theme.spacing.sm }}>
              <View style={styles.rowTwo}>
                <Input
                  label="Tanner Stage (1 - 5)"
                  value={adolescentAssessment?.tannerStage != null ? String(adolescentAssessment.tannerStage) : ''}
                  onChangeText={(val) => onAdolescentAssessmentChange({ ...adolescentAssessment, tannerStage: parseInt(val, 10) || null })}
                  keyboardType="numeric"
                  editable={!disabled}
                />
                <Input
                  label="Menarche Age (Years)"
                  value={adolescentAssessment?.menarcheAgeYears != null ? String(adolescentAssessment.menarcheAgeYears) : ''}
                  onChangeText={(val) => onAdolescentAssessmentChange({ ...adolescentAssessment, menarcheAgeYears: parseInt(val, 10) || null })}
                  keyboardType="numeric"
                  editable={!disabled}
                />
              </View>
              <View style={styles.rowTwo}>
                <Input
                  label="SMR Breast Rating"
                  value={adolescentAssessment?.smrBreastRating || ''}
                  onChangeText={(val) => onAdolescentAssessmentChange({ ...adolescentAssessment, smrBreastRating: val })}
                  placeholder="Stage 1 - 5"
                  editable={!disabled}
                />
                <Input
                  label="SMR Pubic Hair Rating"
                  value={adolescentAssessment?.smrPubicHairRating || ''}
                  onChangeText={(val) => onAdolescentAssessmentChange({ ...adolescentAssessment, smrPubicHairRating: val })}
                  placeholder="Stage 1 - 5"
                  editable={!disabled}
                />
              </View>
            </View>
          )}

          {/* Tab 4: HEADSSS Assessment */}
          {activeTab === 'headsss' && (
            <View style={{ gap: theme.spacing.sm }}>
              {['Home', 'Education', 'Activities', 'Drugs', 'Sexuality', 'Suicide', 'Safety'].map((domain) => {
                const existing = headsssAssessments.find((h) => h.domain === domain);
                return (
                  <Input
                    key={domain}
                    label={`HEADSSS: ${domain}`}
                    value={existing?.assessmentText || ''}
                    onChangeText={(val) => {
                      const updated = headsssAssessments.filter((h) => h.domain !== domain);
                      if (val.trim()) {
                        updated.push({ domain, assessmentText: val, hasRedFlags: false });
                      }
                      onHeadsssAssessmentsChange(updated);
                    }}
                    placeholder={`Clinical observations regarding ${domain}...`}
                    editable={!disabled}
                  />
                );
              })}
            </View>
          )}

          {/* Tab 5: BP Monitoring Log */}
          {activeTab === 'bplog' && (
            <View style={{ gap: theme.spacing.sm }}>
              <View style={styles.rowTwo}>
                <Input
                  label="Systolic (mmHg)"
                  value={bpMonitoringLogs[0]?.systolic != null ? String(bpMonitoringLogs[0].systolic) : ''}
                  onChangeText={(val) => {
                    const first = bpMonitoringLogs[0] || { recordedAt: new Date().toISOString(), diastolic: 80 };
                    onBpMonitoringLogsChange([{ ...first, systolic: parseInt(val, 10) || 120 }]);
                  }}
                  keyboardType="numeric"
                  editable={!disabled}
                />
                <Input
                  label="Diastolic (mmHg)"
                  value={bpMonitoringLogs[0]?.diastolic != null ? String(bpMonitoringLogs[0].diastolic) : ''}
                  onChangeText={(val) => {
                    const first = bpMonitoringLogs[0] || { recordedAt: new Date().toISOString(), systolic: 120 };
                    onBpMonitoringLogsChange([{ ...first, diastolic: parseInt(val, 10) || 80 }]);
                  }}
                  keyboardType="numeric"
                  editable={!disabled}
                />
              </View>
              <View style={styles.rowTwo}>
                <Input
                  label="Pulse (bpm)"
                  value={bpMonitoringLogs[0]?.pulseBpm != null ? String(bpMonitoringLogs[0].pulseBpm) : ''}
                  onChangeText={(val) => {
                    const first = bpMonitoringLogs[0] || { recordedAt: new Date().toISOString(), systolic: 120, diastolic: 80 };
                    onBpMonitoringLogsChange([{ ...first, pulseBpm: parseInt(val, 10) || null }]);
                  }}
                  keyboardType="numeric"
                  editable={!disabled}
                />
                <Input
                  label="Location / Arm"
                  value={bpMonitoringLogs[0]?.location || bpMonitoringLogs[0]?.arm || ''}
                  onChangeText={(val) => {
                    const first = bpMonitoringLogs[0] || { recordedAt: new Date().toISOString(), systolic: 120, diastolic: 80 };
                    onBpMonitoringLogsChange([{ ...first, location: val, arm: val }]);
                  }}
                  placeholder="e.g. Right Arm, Sitting"
                  editable={!disabled}
                />
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleInfo: {
    flex: 1,
    marginRight: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabPill: {
    borderWidth: 1,
  },
  rowTwo: {
    flexDirection: 'row',
    gap: 12,
  },
});
