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

export interface StatutoryOption {
  code: string;
  description: string;
  isNormal?: boolean;
}

export interface PhysicalExamFindings {
  generalSurvey: SystemExamStatus;
  generalSurveyRemarks?: string;
  generalSurveyId?: string;
  skin: SystemExamStatus;
  skinRemarks?: string;
  skinId?: string;
  heent: SystemExamStatus;
  heentRemarks?: string;
  heentId?: string;
  chest: SystemExamStatus;
  chestRemarks?: string;
  chestId?: string;
  heart: SystemExamStatus;
  heartRemarks?: string;
  heartId?: string;
  abdomen: SystemExamStatus;
  abdomenRemarks?: string;
  abdomenId?: string;
  neuro: SystemExamStatus;
  neuroRemarks?: string;
  neuroId?: string;
  rectal: SystemExamStatus;
  rectalRemarks?: string;
  rectalId?: string;
  gu: SystemExamStatus;
  guRemarks?: string;
  guId?: string;
  musculoskeletal: SystemExamStatus;
  musculoskeletalRemarks?: string;
  musculoskeletalId?: string;
}

export const DEFAULT_PHYSICAL_EXAM_NORMAL: PhysicalExamFindings = {
  generalSurvey: 'Normal',
  generalSurveyRemarks: '',
  generalSurveyId: '1',
  skin: 'Normal',
  skinRemarks: '',
  skinId: '1',
  heent: 'Normal',
  heentRemarks: '',
  heentId: '11',
  chest: 'Normal',
  chestRemarks: '',
  chestId: '6',
  heart: 'Normal',
  heartRemarks: '',
  heartId: '5',
  abdomen: 'Normal',
  abdomenRemarks: '',
  abdomenId: '7',
  neuro: 'Normal',
  neuroRemarks: '',
  neuroId: '6',
  rectal: 'Normal',
  rectalRemarks: '',
  rectalId: '1',
  gu: 'Normal',
  guRemarks: '',
  guId: '1',
  musculoskeletal: 'Normal',
  musculoskeletalRemarks: '',
  musculoskeletalId: '1',
};

interface ExamSystemConfig {
  key: keyof PhysicalExamFindings;
  remarksKey: keyof PhysicalExamFindings;
  codeKey: keyof PhysicalExamFindings;
  label: string;
  normalDescription: string;
  normalCode: string;
  icon: IconName;
  placeholder: string;
  options: StatutoryOption[];
}

const EXAM_SYSTEMS: ExamSystemConfig[] = [
  {
    key: 'generalSurvey',
    remarksKey: 'generalSurveyRemarks',
    codeKey: 'generalSurveyId',
    label: 'General Survey',
    normalDescription: 'Conscious, coherent, oriented to person/place/time, not in acute distress',
    normalCode: '1',
    icon: 'patient',
    placeholder: 'Describe distress, altered sensorium, posture, or orientation deficits...',
    options: [
      { code: '1', description: 'Conscious, coherent, oriented, not in acute distress', isNormal: true },
      { code: '2', description: 'Altered sensorium / In acute distress' },
      { code: '99', description: 'Others' },
    ],
  },
  {
    key: 'skin',
    remarksKey: 'skinRemarks',
    codeKey: 'skinId',
    label: 'Skin & Extremities',
    normalDescription: 'Essentially normal, warm to touch, good turgor, no rashes or petechiae',
    normalCode: '1',
    icon: 'activity',
    placeholder: 'Describe lesions, petechiae, cyanosis, pallor, or edema...',
    options: [
      { code: '1', description: 'Essentially normal', isNormal: true },
      { code: '9', description: 'Rashes/Petechiae' },
      { code: '5', description: 'Edema/swelling' },
      { code: '4', description: 'Cyanosis/mottled skin' },
      { code: '8', description: 'Poor skin turgor' },
      { code: '7', description: 'Pale nailbeds' },
      { code: '3', description: 'Cold clammy' },
      { code: '2', description: 'Clubbing' },
      { code: '10', description: 'Weak pulses' },
      { code: '6', description: 'Decreased mobility' },
      { code: '99', description: 'Others' },
    ],
  },
  {
    key: 'heent',
    remarksKey: 'heentRemarks',
    codeKey: 'heentId',
    label: 'HEENT',
    normalDescription: 'Anicteric sclerae, pink palpebral conjunctivae, tonsils not enlarged, no exudates',
    normalCode: '11',
    icon: 'eye',
    placeholder: 'Describe icterus, conjunctival injection, pharyngeal erythema, discharge...',
    options: [
      { code: '11', description: 'Essentially Normal', isNormal: true },
      { code: '16', description: 'Pale conjunctivae' },
      { code: '15', description: 'Icteric sclerae' },
      { code: '13', description: 'Cervical lympadenopathy' },
      { code: '12', description: 'Abnormal pupillary reaction' },
      { code: '14', description: 'Dry mucous membrane' },
      { code: '17', description: 'Sunken eyeballs' },
      { code: '18', description: 'Sunken fontanelle' },
      { code: '99', description: 'Others' },
    ],
  },
  {
    key: 'chest',
    remarksKey: 'chestRemarks',
    codeKey: 'chestId',
    label: 'Chest & Lungs',
    normalDescription: 'Symmetrical chest expansion, clear breath sounds, no crackles, wheezes, or rales',
    normalCode: '6',
    icon: 'activity',
    placeholder: 'Describe wheezes, rhonchi, crackles, stridor, or retractions...',
    options: [
      { code: '6', description: 'Essentially normal', isNormal: true },
      { code: '4', description: 'Crackles/rales' },
      { code: '5', description: 'Wheezes' },
      { code: '8', description: 'Decreased breath sounds' },
      { code: '3', description: 'Retractions' },
      { code: '7', description: 'Asymmetrical chest expansion' },
      { code: '10', description: 'Lumps over breast(s)' },
      { code: '99', description: 'Others' },
    ],
  },
  {
    key: 'heart',
    remarksKey: 'heartRemarks',
    codeKey: 'heartId',
    label: 'Heart & CVS',
    normalDescription: 'Distinct heart sounds, normal rate, regular rhythm, no murmurs, thrills, or gallops',
    normalCode: '5',
    icon: 'heartPulse',
    placeholder: 'Describe murmurs (grade/location), irregular rhythm, rub, or tachycardia...',
    options: [
      { code: '5', description: 'Essentially normal', isNormal: true },
      { code: '4', description: 'Murmurs' },
      { code: '7', description: 'Irregular rhythm' },
      { code: '3', description: 'Heaves/trills' },
      { code: '6', description: 'Displaced apex beat' },
      { code: '8', description: 'Muffled heart sounds' },
      { code: '9', description: 'Pericardial bulge' },
      { code: '99', description: 'Others' },
    ],
  },
  {
    key: 'abdomen',
    remarksKey: 'abdomenRemarks',
    codeKey: 'abdomenId',
    label: 'Abdomen',
    normalDescription: 'Soft, non-tender, non-distended, normoactive bowel sounds, no palpable organomegaly',
    normalCode: '7',
    icon: 'dot',
    placeholder: 'Describe tenderness, guarding, rigidity, masses, or organomegaly...',
    options: [
      { code: '7', description: 'Essentially normal', isNormal: true },
      { code: '9', description: 'Abdominal tenderness' },
      { code: '8', description: 'Abdominal rigidity' },
      { code: '11', description: 'Palpable mass(es)' },
      { code: '10', description: 'Hyperactive bowel sounds' },
      { code: '12', description: 'Tympanitic/dull abdomen' },
      { code: '13', description: 'Uterine contraction' },
      { code: '99', description: 'Others' },
    ],
  },
  {
    key: 'neuro',
    remarksKey: 'neuroRemarks',
    codeKey: 'neuroId',
    label: 'Neurological',
    normalDescription: 'Intact cranial nerves, gross motor 5/5 all extremities, sensory intact, no focal deficits',
    normalCode: '6',
    icon: 'zap',
    placeholder: 'Describe focal motor weakness, sensory loss, tremor, ataxia, or reflex changes...',
    options: [
      { code: '6', description: 'Essentially normal', isNormal: true },
      { code: '4', description: 'Motor Deficit' },
      { code: '5', description: 'Sensory Deficit' },
      { code: '2', description: 'Seizures' },
      { code: '7', description: 'Abnormal gait' },
      { code: '10', description: 'Abnormal reflex(es)' },
      { code: '12', description: 'Poor muscle tone/strength' },
      { code: '13', description: 'Poor coordination' },
      { code: '1', description: 'Developmental delay' },
      { code: '99', description: 'Others' },
    ],
  },
  {
    key: 'rectal',
    remarksKey: 'rectalRemarks',
    codeKey: 'rectalId',
    label: 'Digital Rectal Exam',
    normalDescription: 'Good sphincter tone, smooth rectal vault, no masses, no blood on examining glove',
    normalCode: '1',
    icon: 'shield',
    placeholder: 'Describe hemorrhoids, fissures, tenderness, prostate enlargement, or blood...',
    options: [
      { code: '1', description: 'Essentially normal', isNormal: true },
      { code: '4', description: 'Hemorrhoids' },
      { code: '2', description: 'Enlarge Prospate' },
      { code: '3', description: 'Mass' },
      { code: '5', description: 'Pus' },
      { code: '0', description: 'Not Applicable' },
      { code: '99', description: 'Others' },
    ],
  },
  {
    key: 'gu',
    remarksKey: 'guRemarks',
    codeKey: 'guId',
    label: 'Genitourinary',
    normalDescription: 'Essentially normal, no suprapubic tenderness, no flank tenderness, no discharge',
    normalCode: '1',
    icon: 'checkCircle',
    placeholder: 'Describe CVA tenderness, genital ulcers, urethral/vaginal discharge, hernia...',
    options: [
      { code: '1', description: 'Essentially normal', isNormal: true },
      { code: '4', description: 'Presence of abnormal discharge' },
      { code: '2', description: 'Blood stained in exam finger' },
      { code: '3', description: 'Cervical dilatation' },
      { code: '99', description: 'Others' },
    ],
  },
  {
    key: 'musculoskeletal',
    remarksKey: 'musculoskeletalRemarks',
    codeKey: 'musculoskeletalId',
    label: 'Musculoskeletal',
    normalDescription: 'Full range of motion in all joints, no deformities, no joint swelling or tenderness',
    normalCode: '1',
    icon: 'activity',
    placeholder: 'Describe joint swelling, erythema, deformity, limited range of motion, muscle atrophy...',
    options: [
      { code: '1', description: 'Essentially normal (Full ROM, no deformities)', isNormal: true },
      { code: '2', description: 'Joint swelling / tenderness' },
      { code: '3', description: 'Limited range of motion' },
      { code: '4', description: 'Deformity / fracture' },
      { code: '99', description: 'Others' },
    ],
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

  const handleToggleSystem = (sys: ExamSystemConfig) => {
    if (disabled) return;
    const current = (findings[sys.key] as SystemExamStatus) || 'Normal';
    const next: SystemExamStatus = current === 'Normal' ? 'Abnormal' : 'Normal';
    const nextCode = next === 'Normal' ? sys.normalCode : (sys.options.find((o) => !o.isNormal)?.code || '99');
    const defaultAbnormalDesc = sys.options.find((o) => o.code === nextCode)?.description || '';

    onChange({
      ...findings,
      [sys.key]: next,
      [sys.codeKey]: nextCode,
      [sys.remarksKey]: next === 'Normal' ? '' : (findings[sys.remarksKey] || defaultAbnormalDesc),
    });
  };

  const handleSelectOption = (sys: ExamSystemConfig, option: StatutoryOption) => {
    if (disabled) return;
    if (option.isNormal) {
      onChange({
        ...findings,
        [sys.key]: 'Normal',
        [sys.codeKey]: option.code,
        [sys.remarksKey]: '',
      });
    } else {
      const existingRemarks = findings[sys.remarksKey] as string;
      onChange({
        ...findings,
        [sys.key]: 'Abnormal',
        [sys.codeKey]: option.code,
        [sys.remarksKey]: existingRemarks?.trim() ? existingRemarks : option.description,
      });
    }
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
        subtitle="PhilHealth Konsulta physical examination statutory findings"
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
          Select statutory examination finding chips for each organ system. Detailed clinical notes and descriptions can be entered in the open text field.
        </ThemedText>

        <View style={styles.systemList}>
          {EXAM_SYSTEMS.map((sys) => {
            const status = (findings[sys.key] as SystemExamStatus) || 'Normal';
            const isAbnormal = status === 'Abnormal';
            const remarks = (findings[sys.remarksKey] as string) || '';
            const selectedCode = (findings[sys.codeKey] as string) || (isAbnormal ? '' : sys.normalCode);

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
                    onPress={() => handleToggleSystem(sys)}
                    accessibilityRole="button"
                    accessibilityLabel={`Toggle ${sys.label} status`}
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

                {/* PhilHealth Statutory Options Chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipsScroll}
                  contentContainerStyle={styles.chipsContainer}
                >
                  {sys.options.map((opt) => {
                    const isSelected = selectedCode === opt.code || (opt.isNormal && !isAbnormal && !selectedCode);
                    const isNormalOpt = Boolean(opt.isNormal);
                    const textColor = !isSelected
                      ? theme.colors.textSecondary
                      : isNormalOpt
                        ? theme.colors.successText
                        : theme.colors.warningText;

                    return (
                      <Pressable
                        key={opt.code}
                        disabled={disabled}
                        onPress={() => handleSelectOption(sys, opt)}
                        accessibilityRole="button"
                        accessibilityLabel={`${sys.label}: ${opt.description}`}
                        accessibilityState={{ selected: isSelected }}
                        style={[
                          styles.chip,
                          isSelected && isNormalOpt && styles.chipSelectedNormal,
                          isSelected && !isNormalOpt && styles.chipSelectedAbnormal,
                        ]}
                      >
                        {isSelected ? (
                          <Icon
                            name={isNormalOpt ? 'check' : 'alert'}
                            size={12}
                            color={textColor}
                          />
                        ) : null}
                        <ThemedText
                          variant={isSelected ? 'smallBold' : 'small'}
                          color={textColor}
                        >
                          {opt.description}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {isAbnormal || remarks ? (
                  <View style={styles.remarksContainer}>
                    <Input
                      label={`Clinical Findings & Remarks (${sys.label})`}
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
  chipsScroll: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  chipsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelectedNormal: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successBg,
  },
  chipSelectedAbnormal: {
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
