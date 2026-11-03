import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import type { EhrOptionDescriptor } from '@shared/safe';
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
import { theme } from '../../constants/theme';
import type { PatientPhysicalExamFindingDto, PatientPhysicalExamDto } from '../../services/clinicService';
import type { PhilHealthLibraryName } from '../../services/philHealthCatalogService';
import { useEhrOptions } from '../../hooks/useEhrOptions';
import { usePhilHealthCatalog } from '../../utils/usePhilHealthCatalog';

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

export interface ExamSystemConfig {
  key: keyof PhysicalExamFindings;
  remarksKey: keyof PhysicalExamFindings;
  codeKey: keyof PhysicalExamFindings;
  label: string;
  normalDescription: string;
  normalCode: string;
  placeholder: string;
  philHealthLibrary?: PhilHealthLibraryName;
  optionSet?: string;
  options?: StatutoryOption[];
}

/**
 * Schema-only pointers linking each physical examination field group to its live server
 * PhilHealth Catalog (`lib_*`) or EHR Option Set (`pe_*`). Zero finding options are hardcoded here.
 */
const DEFAULT_EXAM_SYSTEM_SCHEMA: ExamSystemConfig[] = [
  {
    key: 'generalSurvey',
    remarksKey: 'generalSurveyRemarks',
    codeKey: 'generalSurveyId',
    label: 'General Survey',
    normalDescription: 'Conscious, coherent, oriented to person/place/time, not in acute distress',
    normalCode: '1',
    placeholder: 'Describe distress, altered sensorium, posture, or orientation deficits...',
    optionSet: 'pe_general_survey',
  },
  {
    key: 'skin',
    remarksKey: 'skinRemarks',
    codeKey: 'skinId',
    label: 'Skin & Extremities',
    normalDescription: 'Essentially normal, warm to touch, good turgor, no rashes or petechiae',
    normalCode: '1',
    placeholder: 'Describe lesions, petechiae, cyanosis, pallor, or edema...',
    philHealthLibrary: 'lib_skin_extremities',
  },
  {
    key: 'heent',
    remarksKey: 'heentRemarks',
    codeKey: 'heentId',
    label: 'HEENT',
    normalDescription: 'Anicteric sclerae, pink palpebral conjunctivae, tonsils not enlarged, no exudates',
    normalCode: '11',
    placeholder: 'Describe icterus, conjunctival injection, pharyngeal erythema, discharge...',
    philHealthLibrary: 'lib_heent',
  },
  {
    key: 'chest',
    remarksKey: 'chestRemarks',
    codeKey: 'chestId',
    label: 'Chest & Lungs',
    normalDescription: 'Symmetrical chest expansion, clear breath sounds, no crackles, wheezes, or rales',
    normalCode: '6',
    placeholder: 'Describe wheezes, rhonchi, crackles, stridor, or retractions...',
    philHealthLibrary: 'lib_chest',
  },
  {
    key: 'heart',
    remarksKey: 'heartRemarks',
    codeKey: 'heartId',
    label: 'Heart & CVS',
    normalDescription: 'Distinct heart sounds, normal rate, regular rhythm, no murmurs, thrills, or gallops',
    normalCode: '5',
    placeholder: 'Describe murmurs (grade/location), irregular rhythm, rub, or tachycardia...',
    philHealthLibrary: 'lib_heart',
  },
  {
    key: 'abdomen',
    remarksKey: 'abdomenRemarks',
    codeKey: 'abdomenId',
    label: 'Abdomen',
    normalDescription: 'Soft, non-tender, non-distended, normoactive bowel sounds, no palpable organomegaly',
    normalCode: '7',
    placeholder: 'Describe tenderness, guarding, rigidity, masses, or organomegaly...',
    philHealthLibrary: 'lib_abdomen',
  },
  {
    key: 'neuro',
    remarksKey: 'neuroRemarks',
    codeKey: 'neuroId',
    label: 'Neurological',
    normalDescription: 'Intact cranial nerves, gross motor 5/5 all extremities, sensory intact, no focal deficits',
    normalCode: '6',
    placeholder: 'Describe focal motor weakness, sensory loss, tremor, ataxia, or reflex changes...',
    philHealthLibrary: 'lib_neuro',
  },
  {
    key: 'rectal',
    remarksKey: 'rectalRemarks',
    codeKey: 'rectalId',
    label: 'Digital Rectal Exam',
    normalDescription: 'Good sphincter tone, smooth rectal vault, no masses, no blood on examining glove',
    normalCode: '1',
    placeholder: 'Describe hemorrhoids, fissures, tenderness, prostate enlargement, or blood...',
    philHealthLibrary: 'lib_digital_rectal',
  },
  {
    key: 'gu',
    remarksKey: 'guRemarks',
    codeKey: 'guId',
    label: 'Genitourinary',
    normalDescription: 'Essentially normal, no suprapubic tenderness, no flank tenderness, no discharge',
    normalCode: '1',
    placeholder: 'Describe CVA tenderness, genital ulcers, urethral/vaginal discharge, hernia...',
    philHealthLibrary: 'lib_genitourinary',
  },
  {
    key: 'musculoskeletal',
    remarksKey: 'musculoskeletalRemarks',
    codeKey: 'musculoskeletalId',
    label: 'Musculoskeletal',
    normalDescription: 'Full range of motion in all joints, no deformities, no joint swelling or tenderness',
    normalCode: '1',
    placeholder: 'Describe joint swelling, erythema, deformity, limited range of motion, muscle atrophy...',
    optionSet: 'pe_musculoskeletal',
  },
];

function mapDescriptorToExamSystem(desc: EhrOptionDescriptor): ExamSystemConfig | null {
  const schemaFallback = DEFAULT_EXAM_SYSTEM_SCHEMA.find(
    (s) => String(s.key).toLowerCase() === desc.code.toLowerCase()
  );
  const key = (schemaFallback?.key ?? (desc.code as keyof PhysicalExamFindings));
  if (!key) return null;

  const meta = desc.metadata ?? {};
  const remarksKey = (meta.remarksKey ?? schemaFallback?.remarksKey ?? `${String(key)}Remarks`) as keyof PhysicalExamFindings;
  const codeKey = (meta.codeKey ?? schemaFallback?.codeKey ?? `${String(key)}Id`) as keyof PhysicalExamFindings;
  const normalCode = meta.normalCode ?? desc.philHealthCode ?? schemaFallback?.normalCode ?? '1';
  const philHealthLibrary = (desc.philHealthLibrary ?? schemaFallback?.philHealthLibrary) as PhilHealthLibraryName | undefined;
  const optionSet = meta.optionSet ?? (!philHealthLibrary ? schemaFallback?.optionSet : undefined);

  return {
    key,
    remarksKey,
    codeKey,
    label: desc.label || schemaFallback?.label || String(key),
    normalDescription:
      meta.normalDescription || schemaFallback?.normalDescription || 'Essentially normal',
    normalCode,
    placeholder:
      meta.placeholder ||
      schemaFallback?.placeholder ||
      `Describe abnormal ${desc.label.toLowerCase()} findings...`,
    philHealthLibrary,
    optionSet,
  };
}

function sortStatutoryOptions(options: StatutoryOption[]): StatutoryOption[] {
  return [...options].sort((a, b) => {
    if (a.isNormal && !b.isNormal) return -1;
    if (!a.isNormal && b.isNormal) return 1;
    if (a.code === '99' && b.code !== '99') return 1;
    if (b.code === '99' && a.code !== '99') return -1;
    if (a.code === '0' && b.code !== '0') return 1;
    if (b.code === '0' && a.code !== '0') return -1;
    const numA = Number(a.code);
    const numB = Number(b.code);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB;
    }
    return a.description.localeCompare(b.description);
  });
}

interface PhysicalExamSystemRowProps {
  sys: ExamSystemConfig;
  index: number;
  findings: PhysicalExamFindings;
  disabled: boolean;
  onToggleSystem: (sys: ExamSystemConfig, resolvedOptions: StatutoryOption[]) => void;
  onSelectOption: (sys: ExamSystemConfig, option: StatutoryOption) => void;
  onRemarksChange: (remarksKey: keyof PhysicalExamFindings, text: string) => void;
}

const PhysicalExamSystemRow: React.FC<PhysicalExamSystemRowProps> = ({
  sys,
  index,
  findings,
  disabled,
  onToggleSystem,
  onSelectOption,
  onRemarksChange,
}) => {
  const hasInjectedOptions = Boolean(sys.options && sys.options.length > 0);
  const catalog = usePhilHealthCatalog(
    sys.philHealthLibrary ?? 'lib_skin_extremities',
    !hasInjectedOptions && Boolean(sys.philHealthLibrary)
  );
  const ehrSet = useEhrOptions(sys.optionSet ?? '', {
    enabled: !hasInjectedOptions && !sys.philHealthLibrary && Boolean(sys.optionSet),
  });

  const resolvedOptions: StatutoryOption[] = useMemo(() => {
    if (sys.options && sys.options.length > 0) {
      return sys.options;
    }
    if (sys.philHealthLibrary && catalog.items.length > 0) {
      const mapped = catalog.items.map((item) => ({
        code: item.code,
        description: item.description,
        isNormal:
          item.code === sys.normalCode ||
          /essentially normal/i.test(item.description) ||
          /^normal$/i.test(item.description),
      }));
      return sortStatutoryOptions(mapped);
    }
    if (sys.optionSet && ehrSet.options.length > 0) {
      const mapped = ehrSet.options
        .filter((opt) => opt.isActive !== false)
        .map((opt) => {
          const code = opt.philHealthCode || opt.code;
          return {
            code,
            description: opt.label,
            isNormal:
              opt.metadata?.isNormal === 'true' ||
              code === sys.normalCode ||
              /essentially normal/i.test(opt.label),
          };
        });
      return sortStatutoryOptions(mapped);
    }
    return [];
  }, [sys.options, sys.philHealthLibrary, sys.optionSet, sys.normalCode, catalog.items, ehrSet.options]);

  const status = (findings[sys.key] as SystemExamStatus) || 'Normal';
  const isAbnormal = status === 'Abnormal';
  const remarks = (findings[sys.remarksKey] as string) || '';
  const selectedCode = (findings[sys.codeKey] as string) || (isAbnormal ? '' : sys.normalCode);

  return (
    <View
      style={[
        styles.systemRow,
        index > 0 && styles.systemRowDivider,
        isAbnormal && styles.systemRowAbnormal,
      ]}
    >
      <View style={styles.systemHeader}>
        <View style={styles.systemTitleGroup}>
          <ThemedText variant="bodyBold" style={styles.systemLabel}>
            {sys.label}
          </ThemedText>
        </View>

        <Pressable
          disabled={disabled}
          onPress={() => onToggleSystem(sys, resolvedOptions)}
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
            {isAbnormal ? 'Set Normal' : 'Set Abnormal'}
          </ThemedText>
        </Pressable>
      </View>

      {resolvedOptions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsContainer}
        >
          {resolvedOptions.map((opt) => {
            const isSelected =
              selectedCode === opt.code || (opt.isNormal && !isAbnormal && !selectedCode);
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
                onPress={() => onSelectOption(sys, opt)}
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
      ) : null}

      {isAbnormal || remarks ? (
        <View style={styles.remarksContainer}>
          <Input
            label={`Clinical Findings & Remarks (${sys.label})`}
            value={remarks}
            onChangeText={(txt) => onRemarksChange(sys.remarksKey, txt)}
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
};

export interface InlinePhysicalExamCardProps {
  findings: PhysicalExamFindings;
  onChange: (updated: PhysicalExamFindings) => void;
  disabled?: boolean;
  embedded?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  systems?: ExamSystemConfig[];
}

export const InlinePhysicalExamCard: React.FC<InlinePhysicalExamCardProps> = ({
  findings,
  onChange,
  disabled = false,
  embedded = false,
  collapsible = false,
  defaultExpanded = false,
  systems: systemsOverride,
}) => {
  const { options: systemDescriptors } = useEhrOptions('physical_exam_system', {
    enabled: !systemsOverride || systemsOverride.length === 0,
  });

  const renderedSystems: ExamSystemConfig[] = useMemo(() => {
    if (systemsOverride && systemsOverride.length > 0) {
      return systemsOverride;
    }
    if (systemDescriptors && systemDescriptors.length > 0) {
      const mapped = systemDescriptors
        .filter((d) => d.isActive !== false)
        .map(mapDescriptorToExamSystem)
        .filter((item): item is ExamSystemConfig => item !== null);
      if (mapped.length > 0) {
        return mapped;
      }
    }
    return DEFAULT_EXAM_SYSTEM_SCHEMA;
  }, [systemsOverride, systemDescriptors]);

  const abnormalCount = renderedSystems.filter((sys) => findings[sys.key] === 'Abnormal').length;
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded || abnormalCount > 0);

  useEffect(() => {
    if (defaultExpanded || abnormalCount > 0) {
      setExpanded(true);
    }
  }, [defaultExpanded, abnormalCount]);

  const isAllNormal = renderedSystems.every(
    (sys) => findings[sys.key] === 'Normal' && !findings[sys.remarksKey]
  );

  const handleSetAllNormal = () => {
    if (disabled) return;
    const resetState: PhysicalExamFindings = { ...DEFAULT_PHYSICAL_EXAM_NORMAL };
    for (const sys of renderedSystems) {
      (resetState as any)[sys.key] = 'Normal';
      (resetState as any)[sys.codeKey] = sys.normalCode;
      (resetState as any)[sys.remarksKey] = '';
    }
    onChange(resetState);
  };

  const handleToggleSystem = (sys: ExamSystemConfig, resolvedOptions: StatutoryOption[]) => {
    if (disabled) return;
    const current = (findings[sys.key] as SystemExamStatus) || 'Normal';
    const next: SystemExamStatus = current === 'Normal' ? 'Abnormal' : 'Normal';
    const firstAbnormalOpt = resolvedOptions.find((o) => !o.isNormal && o.code !== '0');
    const nextCode = next === 'Normal' ? sys.normalCode : (firstAbnormalOpt?.code || '99');
    const defaultAbnormalDesc =
      resolvedOptions.find((o) => o.code === nextCode)?.description || '';

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

  const showSystemsBody = !collapsible || expanded;
  const systemChecklistSubtitle = `${renderedSystems.length}-system organ examination checklist`;

  const systemsBody = (
    <>
      <ThemedText variant="small" color={theme.colors.textMuted} style={styles.hint}>
        Select examination finding chips for each organ system, or add clinical remarks below.
      </ThemedText>

      <View style={styles.systemList}>
        {renderedSystems.map((sys, idx) => (
          <PhysicalExamSystemRow
            key={String(sys.key)}
            sys={sys}
            index={idx}
            findings={findings}
            disabled={disabled}
            onToggleSystem={handleToggleSystem}
            onSelectOption={handleSelectOption}
            onRemarksChange={handleRemarksChange}
          />
        ))}
      </View>
    </>
  );

  if (embedded) {
    return (
      <View style={styles.embeddedContainer} testID="embedded-physical-exam-section">
        <View style={styles.embeddedHeader}>
          <View style={styles.embeddedTitleCol}>
            <View style={styles.embeddedTitleRow}>
              <Icon name="stethoscope" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                Physical Examination
              </ThemedText>
              {abnormalCount > 0 ? (
                <Badge
                  label={`${abnormalCount} Abnormal`}
                  variant="warning"
                  size="sm"
                />
              ) : null}
            </View>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              {systemChecklistSubtitle}
            </ThemedText>
          </View>
          <View style={styles.headerActions}>
            {abnormalCount > 0 ? (
              <Button
                title="Set All Normal"
                size="sm"
                variant="primary"
                disabled={disabled}
                onPress={handleSetAllNormal}
                icon="check"
                testID="set-all-normal-btn"
              />
            ) : null}
            {collapsible ? (
              <Button
                title={expanded ? 'Collapse' : 'Show systems'}
                size="sm"
                variant="outline"
                icon={expanded ? 'chevronUp' : 'chevronDown'}
                onPress={() => setExpanded((prev) => !prev)}
                testID="toggle-physical-exam-systems-btn"
              />
            ) : null}
          </View>
        </View>
        {showSystemsBody ? <View style={styles.embeddedBody}>{systemsBody}</View> : null}
      </View>
    );
  }

  return (
    <Card style={styles.card}>
      <CardHeader
        title="Physical Examination (PE)"
        subtitle={systemChecklistSubtitle}
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
            {abnormalCount > 0 ? (
              <Button
                title="Set All Normal"
                size="sm"
                variant="primary"
                disabled={disabled}
                onPress={handleSetAllNormal}
                icon="check"
                testID="set-all-normal-btn"
              />
            ) : null}
          </View>
        }
      />
      <CardContent style={styles.content}>{systemsBody}</CardContent>
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
  embeddedContainer: {
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  embeddedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  embeddedTitleCol: {
    flex: 1,
    minWidth: 200,
    gap: 2,
  },
  embeddedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  embeddedBody: {
    paddingTop: theme.spacing.sm,
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
    marginBottom: theme.spacing.sm,
  },
  systemList: {
    gap: 0,
  },
  systemRow: {
    paddingVertical: theme.spacing.md,
  },
  systemRowDivider: {
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
  systemRowAbnormal: {
    backgroundColor: theme.colors.warningBg,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.xs,
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

export function to1NFFindings(
  findings: PhysicalExamFindings,
  systems: ExamSystemConfig[] = DEFAULT_EXAM_SYSTEM_SCHEMA
): PatientPhysicalExamFindingDto[] {
  return systems.map((sys) => {
    const isNormal = findings[sys.key] === 'Normal';
    const remarks = findings[sys.remarksKey] as string | undefined;
    const optionCode = findings[sys.codeKey] as string | undefined;
    return {
      system: sys.label,
      isNormal,
      findingTitle: isNormal ? sys.normalDescription : remarks || 'Abnormal finding',
      optionCode: optionCode || (isNormal ? sys.normalCode : '99'),
      remarks: remarks || null,
    };
  });
}

/**
 * Reconstructs PhysicalExamFindings workstation state from pure 1NF relational child rows.
 * Supports PatientPhysicalExamDto[] (nested findings) or flat PatientPhysicalExamFindingDto[].
 * Returns null if input is missing, empty, contains zero exam findings, or contains only degenerate child rows.
 */
export function from1NFFindings(
  input?: PatientPhysicalExamDto[] | PatientPhysicalExamFindingDto[] | null,
  systems: ExamSystemConfig[] = DEFAULT_EXAM_SYSTEM_SCHEMA
): PhysicalExamFindings | null {
  if (!input || !Array.isArray(input) || input.length === 0) {
    return null;
  }

  let generalSurveyId: string | undefined;
  let generalSurveyRemarks: string | undefined;
  let flatFindings: PatientPhysicalExamFindingDto[] = [];

  const first = input[0] as any;
  if ('findings' in first && Array.isArray(first.findings)) {
    const pe = first as PatientPhysicalExamDto;
    generalSurveyId = pe.generalSurveyId;
    generalSurveyRemarks = pe.generalSurveyRemarks;
    flatFindings = pe.findings || [];
  } else if ('system' in first) {
    flatFindings = input as PatientPhysicalExamFindingDto[];
  } else {
    return null;
  }

  const hasGeneralSurveyId = Boolean(generalSurveyId && generalSurveyId.trim());

  if (flatFindings.length === 0 && !hasGeneralSurveyId) {
    return null;
  }

  const normalizeSystemName = (sys: string): string =>
    (sys || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const result: PhysicalExamFindings = { ...DEFAULT_PHYSICAL_EXAM_NORMAL };

  if (hasGeneralSurveyId && generalSurveyId) {
    result.generalSurveyId = generalSurveyId;
    if (generalSurveyId === '2' || generalSurveyId === '99') {
      result.generalSurvey = 'Abnormal';
    }
  }
  if (generalSurveyRemarks !== undefined && generalSurveyRemarks !== null) {
    result.generalSurveyRemarks = generalSurveyRemarks;
  }

  let matchedCount = 0;

  for (const finding of flatFindings) {
    if (!finding || !finding.system) continue;

    const norm = normalizeSystemName(finding.system);
    if (!norm) continue;

    // Pass 1: Exact normalized match against sys.label or sys.key across active system schema
    let matchedSys = systems.find((sys) => {
      const sysLabelNorm = normalizeSystemName(sys.label);
      const sysKeyNorm = normalizeSystemName(String(sys.key));
      return norm === sysLabelNorm || norm === sysKeyNorm;
    });

    // Pass 2: Safe fuzzy heuristic strictly avoiding substring collisions (e.g. gastro, abdo, norm === 'gi')
    if (!matchedSys) {
      matchedSys = systems.find((sys) => {
        if (sys.key === 'generalSurvey' && (norm.includes('general') || norm.includes('survey'))) return true;
        if (sys.key === 'skin' && (norm.includes('skin') || norm.includes('extremit'))) return true;
        if (sys.key === 'heent' && (norm.includes('heent') || norm.includes('head') || norm.includes('eye'))) return true;
        if (sys.key === 'chest' && (norm.includes('chest') || norm.includes('lung') || norm.includes('pulmo') || norm.includes('respirat'))) return true;
        if (sys.key === 'heart' && (norm.includes('heart') || norm.includes('cvs') || norm.includes('cardio'))) return true;
        if (sys.key === 'abdomen' && (norm.includes('abdo') || norm.includes('gastro') || norm === 'gi' || norm === 'gitract')) return true;
        if (sys.key === 'neuro' && (norm.includes('neuro') || norm.includes('cns'))) return true;
        if (sys.key === 'rectal' && (norm.includes('rectal') || norm.includes('dre'))) return true;
        if (sys.key === 'gu' && (norm.includes('genito') || norm === 'gu')) return true;
        if (sys.key === 'musculoskeletal' && (norm.includes('musculo') || norm.includes('msk') || norm.includes('skelet'))) return true;
        return false;
      });
    }

    if (!matchedSys) continue;

    matchedCount++;

    const isNormal = Boolean(finding.isNormal);
    (result as any)[matchedSys.key] = isNormal ? 'Normal' : 'Abnormal';

    if (finding.optionCode) {
      (result as any)[matchedSys.codeKey] = finding.optionCode;
    } else if (isNormal) {
      (result as any)[matchedSys.codeKey] = matchedSys.normalCode;
    } else {
      (result as any)[matchedSys.codeKey] = '99';
    }

    if (finding.remarks !== undefined && finding.remarks !== null) {
      (result as any)[matchedSys.remarksKey] = finding.remarks;
    } else if (
      !isNormal &&
      finding.findingTitle &&
      finding.findingTitle !== matchedSys.normalDescription &&
      finding.findingTitle !== 'Abnormal finding'
    ) {
      (result as any)[matchedSys.remarksKey] = finding.findingTitle;
    } else if (isNormal) {
      (result as any)[matchedSys.remarksKey] = '';
    }

    if (matchedSys.key === 'generalSurvey') {
      if (finding.optionCode) {
        result.generalSurveyId = finding.optionCode;
      }
      if (finding.remarks) {
        result.generalSurveyRemarks = finding.remarks;
      }
    }
  }

  // Degenerate child rows guard: if flatFindings contains rows but 0 systems matched and generalSurveyId is not present, return null
  if (matchedCount === 0 && !hasGeneralSurveyId) {
    return null;
  }

  return result;
}

