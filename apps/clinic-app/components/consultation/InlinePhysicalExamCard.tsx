import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import {
  ThemedText,
  Button,
  Input,
  Card,
  CardHeader,
  CardContent,
  Icon,
  Badge,
} from '@ui';
import type { IconName } from '../ui/Icon';
import { theme } from '../../constants/theme';

export type SystemExamStatus = 'Normal' | 'Abnormal';

export interface PhysicalExamFindings {
  generalSurvey: SystemExamStatus;
  generalSurveyRemarks?: string;
  skin: SystemExamStatus;
  skinRemarks?: string;
  heent: SystemExamStatus;
  heentRemarks?: string;
  chest: SystemExamStatus;
  chestRemarks?: string;
  heart: SystemExamStatus;
  heartRemarks?: string;
  abdomen: SystemExamStatus;
  abdomenRemarks?: string;
  neuro: SystemExamStatus;
  neuroRemarks?: string;
  rectal: SystemExamStatus;
  rectalRemarks?: string;
  gu: SystemExamStatus;
  guRemarks?: string;
  musculoskeletal: SystemExamStatus;
  musculoskeletalRemarks?: string;
}

export const DEFAULT_PHYSICAL_EXAM_NORMAL: PhysicalExamFindings = {
  generalSurvey: 'Normal',
  generalSurveyRemarks: '',
  skin: 'Normal',
  skinRemarks: '',
  heent: 'Normal',
  heentRemarks: '',
  chest: 'Normal',
  chestRemarks: '',
  heart: 'Normal',
  heartRemarks: '',
  abdomen: 'Normal',
  abdomenRemarks: '',
  neuro: 'Normal',
  neuroRemarks: '',
  rectal: 'Normal',
  rectalRemarks: '',
  gu: 'Normal',
  guRemarks: '',
  musculoskeletal: 'Normal',
  musculoskeletalRemarks: '',
};

interface ExamSystemConfig {
  key: keyof PhysicalExamFindings;
  remarksKey: keyof PhysicalExamFindings;
  label: string;
  normalDescription: string;
  icon: IconName;
  placeholder: string;
}

const EXAM_SYSTEMS: ExamSystemConfig[] = [
  {
    key: 'generalSurvey',
    remarksKey: 'generalSurveyRemarks',
    label: 'General Survey',
    normalDescription: 'Conscious, coherent, oriented to person/place/time, not in acute distress',
    icon: 'patient',
    placeholder: 'Describe distress, altered sensorium, posture, or orientation deficits...',
  },
  {
    key: 'skin',
    remarksKey: 'skinRemarks',
    label: 'Skin & Extremities',
    normalDescription: 'Essentially normal, warm to touch, good turgor, no rashes or petechiae',
    icon: 'activity',
    placeholder: 'Describe lesions, petechiae, cyanosis, pallor, or edema...',
  },
  {
    key: 'heent',
    remarksKey: 'heentRemarks',
    label: 'HEENT',
    normalDescription: 'Anicteric sclerae, pink palpebral conjunctivae, tonsils not enlarged, no exudates',
    icon: 'eye',
    placeholder: 'Describe icterus, conjunctival injection, pharyngeal erythema, discharge...',
  },
  {
    key: 'chest',
    remarksKey: 'chestRemarks',
    label: 'Chest & Lungs',
    normalDescription: 'Symmetrical chest expansion, clear breath sounds, no crackles, wheezes, or rales',
    icon: 'activity',
    placeholder: 'Describe wheezes, rhonchi, crackles, stridor, or retractions...',
  },
  {
    key: 'heart',
    remarksKey: 'heartRemarks',
    label: 'Heart & CVS',
    normalDescription: 'Distinct heart sounds, normal rate, regular rhythm, no murmurs, thrills, or gallops',
    icon: 'heartPulse',
    placeholder: 'Describe murmurs (grade/location), irregular rhythm, rub, or tachycardia...',
  },
  {
    key: 'abdomen',
    remarksKey: 'abdomenRemarks',
    label: 'Abdomen',
    normalDescription: 'Soft, non-tender, non-distended, normoactive bowel sounds, no palpable organomegaly',
    icon: 'dot',
    placeholder: 'Describe tenderness, guarding, rigidity, masses, or organomegaly...',
  },
  {
    key: 'neuro',
    remarksKey: 'neuroRemarks',
    label: 'Neurological',
    normalDescription: 'Intact cranial nerves, gross motor 5/5 all extremities, sensory intact, no focal deficits',
    icon: 'zap',
    placeholder: 'Describe focal motor weakness, sensory loss, tremor, ataxia, or reflex changes...',
  },
  {
    key: 'rectal',
    remarksKey: 'rectalRemarks',
    label: 'Digital Rectal Exam',
    normalDescription: 'Good sphincter tone, smooth rectal vault, no masses, no blood on examining glove',
    icon: 'shield',
    placeholder: 'Describe hemorrhoids, fissures, tenderness, prostate enlargement, or blood...',
  },
  {
    key: 'gu',
    remarksKey: 'guRemarks',
    label: 'Genitourinary',
    normalDescription: 'Essentially normal, no suprapubic tenderness, no flank tenderness, no discharge',
    icon: 'checkCircle',
    placeholder: 'Describe CVA tenderness, genital ulcers, urethral/vaginal discharge, hernia...',
  },
  {
    key: 'musculoskeletal',
    remarksKey: 'musculoskeletalRemarks',
    label: 'Musculoskeletal',
    normalDescription: 'Full range of motion in all joints, no deformities, no joint swelling or tenderness',
    icon: 'activity',
    placeholder: 'Describe joint swelling, erythema, deformity, limited range of motion, muscle atrophy...',
  },
];

export interface InlinePhysicalExamCardProps {
  findings: PhysicalExamFindings;
  onChange: (updated: PhysicalExamFindings) => void;
  disabled?: boolean;
}

export const InlinePhysicalExamCard: React.FC<InlinePhysicalExamCardProps> = ({
  findings,
  onChange,
  disabled = false,
}) => {
  const isAllNormal = EXAM_SYSTEMS.every(
    (sys) => findings[sys.key] === 'Normal' && !findings[sys.remarksKey]
  );

  const handleSetAllNormal = () => {
    if (disabled) return;
    onChange({ ...DEFAULT_PHYSICAL_EXAM_NORMAL });
  };

  const handleToggleSystem = (key: keyof PhysicalExamFindings, remarksKey: keyof PhysicalExamFindings) => {
    if (disabled) return;
    const current = (findings[key] as SystemExamStatus) || 'Normal';
    const next: SystemExamStatus = current === 'Normal' ? 'Abnormal' : 'Normal';
    onChange({
      ...findings,
      [key]: next,
      [remarksKey]: next === 'Normal' ? '' : (findings[remarksKey] || ''),
    });
  };

  const handleRemarksChange = (remarksKey: keyof PhysicalExamFindings, text: string) => {
    if (disabled) return;
    onChange({
      ...findings,
      [remarksKey]: text,
    });
  };

  const abnormalCount = EXAM_SYSTEMS.filter((sys) => findings[sys.key] === 'Abnormal').length;

  return (
    <Card style={styles.card}>
      <CardHeader
        title="Physical Examination (PE)"
        subtitle="PhilHealth Konsulta physical examination findings"
        rightAction={
          <View style={styles.headerActions}>
            {abnormalCount > 0 ? (
              <Badge
                label={`${abnormalCount} Abnormal ${abnormalCount === 1 ? 'System' : 'Systems'}`}
                variant="warning"
              />
            ) : (
              <Badge label="All Systems Normal" variant="success" />
            )}
            <Button
              title="All Essentially Normal"
              size="sm"
              variant={isAllNormal ? 'secondary' : 'primary'}
              disabled={disabled}
              onPress={handleSetAllNormal}
              icon="check"
            />
          </View>
        }
      />
      <CardContent style={styles.content}>
        <ThemedText variant="small" color={theme.colors.textMuted} style={styles.hint}>
          Single-click to toggle any system abnormal to document clinical findings. Normal systems default to essentially normal findings.
        </ThemedText>

        <View style={styles.systemList}>
          {EXAM_SYSTEMS.map((sys) => {
            const status = (findings[sys.key] as SystemExamStatus) || 'Normal';
            const isAbnormal = status === 'Abnormal';
            const remarks = (findings[sys.remarksKey] as string) || '';

            return (
              <View
                key={String(sys.key)}
                style={[
                  styles.systemRow,
                  isAbnormal ? styles.systemRowAbnormal : styles.systemRowNormal,
                ]}
              >
                <View style={styles.systemHeader}>
                  <View style={styles.systemTitleGroup}>
                    <Icon
                      name={sys.icon}
                      size={18}
                      color={isAbnormal ? theme.colors.warning : theme.colors.primary}
                    />
                    <ThemedText variant="bodyBold" style={styles.systemLabel}>
                      {sys.label}
                    </ThemedText>
                    {isAbnormal ? (
                      <Badge label="Abnormal" variant="warning" />
                    ) : (
                      <Badge label="Essentially Normal" variant="neutral" />
                    )}
                  </View>

                  <Pressable
                    disabled={disabled}
                    onPress={() => handleToggleSystem(sys.key, sys.remarksKey)}
                    style={[
                      styles.toggleButton,
                      isAbnormal ? styles.toggleButtonAbnormal : styles.toggleButtonNormal,
                    ]}
                  >
                    <ThemedText
                      variant="smallBold"
                      color={isAbnormal ? theme.colors.warning : theme.colors.primary}
                    >
                      {isAbnormal ? 'Flagged Abnormal' : 'Set Abnormal'}
                    </ThemedText>
                  </Pressable>
                </View>

                {isAbnormal ? (
                  <View style={styles.remarksContainer}>
                    <Input
                      label={`Abnormal Findings & Remarks (${sys.label})`}
                      value={remarks}
                      onChangeText={(txt) => handleRemarksChange(sys.remarksKey, txt)}
                      placeholder={sys.placeholder}
                      multiline
                      numberOfLines={2}
                      editable={!disabled}
                    />
                  </View>
                ) : (
                  <ThemedText variant="small" color={theme.colors.textMuted} style={styles.normalNote}>
                    {sys.normalDescription}
                  </ThemedText>
                )}
              </View>
            );
          })}
        </View>
      </CardContent>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.lg,
  },
  content: {
    paddingTop: theme.spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  hint: {
    marginBottom: theme.spacing.md,
  },
  systemList: {
    gap: theme.spacing.sm,
  },
  systemRow: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
  },
  systemRowNormal: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  systemRowAbnormal: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  systemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  systemTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexShrink: 1,
  },
  systemLabel: {
    marginRight: theme.spacing.xs,
  },
  toggleButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
  },
  toggleButtonNormal: {
    borderColor: theme.colors.primary,
    backgroundColor: 'transparent',
  },
  toggleButtonAbnormal: {
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningBg,
  },
  normalNote: {
    marginTop: theme.spacing.xs,
    fontStyle: 'italic',
  },
  remarksContainer: {
    marginTop: theme.spacing.sm,
  },
});
