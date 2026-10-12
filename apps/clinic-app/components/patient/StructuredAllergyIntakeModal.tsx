import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Badge, { BadgeVariant } from '../ui/Badge';
import Icon, { IconSlot } from '../ui/Icon';
import ThemedText from '../ui/ThemedText';
import { theme } from '../../constants/theme';

export type AllergyCategory = 'Medication' | 'Food' | 'Environmental' | 'Biologic' | 'Other';
export type AllergySeverity = 'Mild' | 'Moderate' | 'Severe' | 'LifeThreatening';

export interface CreateAllergyRequest {
  category: AllergyCategory;
  allergen: string;
  allergenDrugCode?: string | null;
  severity: AllergySeverity;
  reactionManifestation?: string | null;
  isAnaphylactic: boolean;
  onsetDate?: string | null;
  notes?: string | null;
}

export type CreateAllergyPayload = CreateAllergyRequest;

export interface StructuredAllergyIntakeModalProps {
  visible: boolean;
  onClose: () => void;
  allergies?: CreateAllergyRequest[];
  onChange?: (allergies: CreateAllergyRequest[]) => void;
  onAddAllergy?: (allergy: CreateAllergyRequest) => void;
  existingAllergies?: CreateAllergyRequest[];
  title?: string;
  testID?: string;
}

export interface AllergyPillListProps {
  allergies: CreateAllergyRequest[];
  onRemove?: (index: number) => void;
  readOnly?: boolean;
}

const CATEGORY_CONFIG: Record<
  AllergyCategory,
  { label: string; badgeVariant: BadgeVariant; quickPicks: string[] }
> = {
  Medication: {
    label: 'Medication',
    badgeVariant: 'primary',
    quickPicks: ['Penicillin', 'Amoxicillin', 'Aspirin', 'Ibuprofen', 'Co-amoxiclav', 'Sulfonamides'],
  },
  Food: {
    label: 'Food',
    badgeVariant: 'warning',
    quickPicks: ['Peanuts', 'Shellfish', 'Crustaceans', 'Eggs', "Cow's Milk", 'Wheat', 'Soy'],
  },
  Environmental: {
    label: 'Environmental',
    badgeVariant: 'info',
    quickPicks: ['Latex', 'House Dust Mites', 'Pollen', 'Grass', 'Mold', 'Bee Venom'],
  },
  Biologic: {
    label: 'Biologic',
    badgeVariant: 'purple',
    quickPicks: ['Blood Products', 'Antivenom', 'Monoclonal Antibodies', 'Vaccines'],
  },
  Other: {
    label: 'Other',
    badgeVariant: 'neutral',
    quickPicks: ['Surgical Adhesive', 'Contrast Dye', 'Nickel', 'Chlorhexidine'],
  },
};

const SEVERITY_CONFIG: Record<
  AllergySeverity,
  { label: string; badgeVariant: BadgeVariant }
> = {
  Mild: { label: 'Mild', badgeVariant: 'info' },
  Moderate: { label: 'Moderate', badgeVariant: 'warning' },
  Severe: { label: 'Severe', badgeVariant: 'urgent' },
  LifeThreatening: { label: 'Life-Threatening / Anaphylaxis', badgeVariant: 'emergency' },
};

/**
 * Visual pill summary list rendering recorded structured allergies with removal actions.
 * Can be rendered both inside the intake modal and embedded in the registration form.
 */
export const AllergyPillList: React.FC<AllergyPillListProps> = ({
  allergies,
  onRemove,
  readOnly = false,
}) => {
  if (!allergies || allergies.length === 0) {
    return (
      <View style={styles.emptyPillContainer}>
        <ThemedText variant="caption" color={theme.colors.textMuted}>
          No known allergies documented (Patient has NKDA status).
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.pillListContainer}>
      {allergies.map((item, index) => {
        const catInfo = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.Other;
        const sevInfo = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.Moderate;
        const isCritical = item.isAnaphylactic || item.severity === 'LifeThreatening';

        return (
          <View
            key={`${item.allergen}-${index}`}
            style={[
              styles.pillCard,
              isCritical && styles.pillCardEmergency,
            ]}
          >
            <View style={styles.pillContent}>
              <View style={styles.badgeRow}>
                <Badge label={catInfo.label} variant={catInfo.badgeVariant} size="sm" />
                <Badge label={sevInfo.label} variant={sevInfo.badgeVariant} size="sm" />
                {item.isAnaphylactic ? (
                  <Badge
                    label="STAT Anaphylaxis"
                    variant="emergency"
                    size="sm"
                    icon="alertCircle"
                  />
                ) : null}
              </View>

              <View style={styles.allergenTitleRow}>
                <ThemedText
                  variant="bodyBold"
                  color={isCritical ? theme.colors.emergencyText : theme.colors.text}
                >
                  {item.allergen}
                </ThemedText>
                {item.allergenDrugCode ? (
                  <ThemedText variant="code" color={theme.colors.textMuted}>
                    [{item.allergenDrugCode}]
                  </ThemedText>
                ) : null}
              </View>

              {item.reactionManifestation ? (
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Reaction: {item.reactionManifestation}
                </ThemedText>
              ) : null}

              {item.notes ? (
                <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
                  Note: {item.notes}
                </ThemedText>
              ) : null}
            </View>

            {!readOnly && onRemove ? (
              <Pressable
                style={styles.pillRemoveBtn}
                onPress={() => onRemove(index)}
                accessibilityRole="button"
                accessibilityLabel={`Remove allergy ${item.allergen}`}
                hitSlop={theme.spacing.sm}
              >
                <Icon
                  name="trash"
                  size={theme.sizes.iconSm}
                  color={isCritical ? theme.colors.emergencyText : theme.colors.textSecondary}
                />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

export default function StructuredAllergyIntakeModal({
  visible,
  onClose,
  allergies: controlledAllergies,
  onChange,
  onAddAllergy,
  existingAllergies,
  title = 'Structured Allergy Intake',
  testID = 'structured-allergy-modal',
}: StructuredAllergyIntakeModalProps) {
  // Support both controlled allergies array and existingAllergies fallback
  const activeAllergies = controlledAllergies ?? existingAllergies ?? [];

  // Form draft state
  const [category, setCategory] = useState<AllergyCategory>('Medication');
  const [allergen, setAllergen] = useState('');
  const [allergenDrugCode, setAllergenDrugCode] = useState('');
  const [severity, setSeverity] = useState<AllergySeverity>('Moderate');
  const [isAnaphylactic, setIsAnaphylactic] = useState(false);
  const [reactionManifestation, setReactionManifestation] = useState('');
  const [onsetDate, setOnsetDate] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const resetDraft = () => {
    setCategory('Medication');
    setAllergen('');
    setAllergenDrugCode('');
    setSeverity('Moderate');
    setIsAnaphylactic(false);
    setReactionManifestation('');
    setOnsetDate('');
    setNotes('');
    setFormError(null);
  };

  const handleSelectSeverity = (sev: AllergySeverity) => {
    setSeverity(sev);
    if (sev === 'LifeThreatening') {
      setIsAnaphylactic(true);
    } else if (isAnaphylactic && sev === 'Mild') {
      setIsAnaphylactic(false);
    }
  };

  const handleToggleAnaphylactic = () => {
    const nextVal = !isAnaphylactic;
    setIsAnaphylactic(nextVal);
    if (nextVal && (severity === 'Mild' || severity === 'Moderate')) {
      setSeverity('LifeThreatening');
    }
  };

  const handleAddAllergy = () => {
    const trimmed = allergen.trim();
    if (!trimmed) {
      setFormError('Allergen name is required (e.g. Penicillin, Peanuts).');
      return;
    }

    if (trimmed.length > 150) {
      setFormError('Allergen name must not exceed 150 characters.');
      return;
    }

    // Check duplicate allergen in list
    const isDup = activeAllergies.some(
      (a) => a.allergen.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDup) {
      setFormError(`"${trimmed}" is already documented in this patient's allergy list.`);
      return;
    }

    const newAllergy: CreateAllergyRequest = {
      category,
      allergen: trimmed,
      allergenDrugCode: allergenDrugCode.trim() || undefined,
      severity,
      reactionManifestation: reactionManifestation.trim() || undefined,
      isAnaphylactic: isAnaphylactic || severity === 'LifeThreatening',
      onsetDate: onsetDate.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    onAddAllergy?.(newAllergy);
    onChange?.([...activeAllergies, newAllergy]);
    resetDraft();
  };

  const handleRemove = (index: number) => {
    onChange?.(activeAllergies.filter((_, i) => i !== index));
  };

  const isAnaphylaxisActive = isAnaphylactic || severity === 'LifeThreatening';

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle="Document structured drug, food, and environmental hypersensitivities"
      maxWidth={620}
      footer={
        <View style={styles.modalFooterRow}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            {activeAllergies.length} {activeAllergies.length === 1 ? 'allergy' : 'allergies'} recorded
          </ThemedText>
          <Button
            title="Done & Close"
            variant="primary"
            size="md"
            onPress={onClose}
          />
        </View>
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        {/* Section 1: Summary of Recorded Allergies */}
        <View style={styles.summarySection}>
          <View style={styles.sectionHeader}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              PATIENT ALLERGY LIST ({activeAllergies.length})
            </ThemedText>
          </View>
          <AllergyPillList allergies={activeAllergies} onRemove={onChange ? handleRemove : undefined} />
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Section 2: Form to Add New Allergy */}
        <View style={styles.formSection}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Add New Allergy / Sensitivity
          </ThemedText>

          {formError ? (
            <View style={styles.errorBanner}>
              <IconSlot value="alertCircle" size={theme.fontSizes.xs} color={theme.colors.emergencyText} />
              <ThemedText variant="captionBold" color={theme.colors.emergencyText}>
                {formError}
              </ThemedText>
            </View>
          ) : null}

          {/* 1. Category Picker */}
          <View style={styles.fieldGroup}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Allergy Category *
            </ThemedText>
            <View style={styles.chipRow}>
              {(Object.keys(CATEGORY_CONFIG) as AllergyCategory[]).map((cat) => {
                const isSelected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    style={[
                      styles.categoryChip,
                      isSelected && styles.categoryChipSelected,
                    ]}
                    onPress={() => {
                      setCategory(cat);
                      setFormError(null);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <ThemedText
                      variant="captionBold"
                      color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                    >
                      {CATEGORY_CONFIG[cat].label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            {/* Category Quick-Pick Presets */}
            <View style={styles.quickPickRow}>
              <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.quickPickLabel}>
                Quick pick:
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickPickScroll}>
                {CATEGORY_CONFIG[category].quickPicks.map((pick) => (
                  <Pressable
                    key={pick}
                    style={styles.quickPickBadge}
                    onPress={() => {
                      setAllergen(pick);
                      setFormError(null);
                    }}
                  >
                    <ThemedText variant="caption" color={theme.colors.primaryDark}>
                      +{pick}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* 2. Allergen Name & Optional Drug Code */}
          <Input
            label="Allergen Name"
            required
            value={allergen}
            onChangeText={(txt) => {
              setAllergen(txt);
              if (formError) setFormError(null);
            }}
            placeholder={
              category === 'Medication'
                ? 'e.g. Amoxicillin, Penicillin, Aspirin'
                : category === 'Food'
                ? 'e.g. Peanuts, Shrimp, Crab, Eggs'
                : 'e.g. Latex, Pollen, Dust Mites'
            }
          />

          {category === 'Medication' ? (
            <Input
              label="Generic PNF / RxNorm Drug Code (Optional)"
              value={allergenDrugCode}
              onChangeText={setAllergenDrugCode}
              placeholder="e.g. AMX500, PEN-G (enables automated CDS cross-reactivity screening)"
              helperText="Enables CDS cross-reactivity screening (e.g. Penicillin to Cephalosporins)"
            />
          ) : null}

          {/* 3. Severity Selector */}
          <View style={styles.fieldGroup}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Reaction Severity *
            </ThemedText>
            <View style={styles.severityGrid}>
              {(Object.keys(SEVERITY_CONFIG) as AllergySeverity[]).map((sev) => {
                const isSelected = severity === sev;
                const info = SEVERITY_CONFIG[sev];
                return (
                  <Pressable
                    key={sev}
                    style={[
                      styles.severityChip,
                      isSelected && styles.severityChipSelected,
                      isSelected && sev === 'LifeThreatening' && styles.severityChipLifeThreatening,
                    ]}
                    onPress={() => handleSelectSeverity(sev)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Badge label={info.label} variant={info.badgeVariant} size="sm" />
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 4. High-Urgency Red Alert Toggle for Anaphylaxis */}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: isAnaphylaxisActive }}
            style={[
              styles.anaphylaxisToggleCard,
              isAnaphylaxisActive
                ? styles.anaphylaxisCardActive
                : styles.anaphylaxisCardInactive,
            ]}
            onPress={handleToggleAnaphylactic}
          >
            <View style={styles.anaphylaxisHeader}>
              <View style={styles.anaphylaxisIconTitle}>
                <IconSlot
                  value={isAnaphylaxisActive ? 'emergency' : 'alert'}
                  size={theme.sizes.iconMd}
                  color={
                    isAnaphylaxisActive
                      ? theme.colors.emergencyText
                      : theme.colors.textSecondary
                  }
                />
                <View style={styles.flexFill}>
                  <ThemedText
                    variant="bodyBold"
                    color={
                      isAnaphylaxisActive
                        ? theme.colors.emergencyText
                        : theme.colors.text
                    }
                  >
                    High-Risk Anaphylaxis Alert (isAnaphylactic)
                  </ThemedText>
                  <ThemedText
                    variant="caption"
                    color={
                      isAnaphylaxisActive
                        ? theme.colors.emergencyText
                        : theme.colors.textMuted
                    }
                  >
                    Life-threatening systemic hypersensitivity (angioedema, airway obstruction, shock)
                  </ThemedText>
                </View>
              </View>

              <View
                style={[
                  styles.switchPill,
                  isAnaphylaxisActive
                    ? styles.switchPillActive
                    : styles.switchPillInactive,
                ]}
              >
                <ThemedText
                  variant="captionBold"
                  color={
                    isAnaphylaxisActive
                      ? theme.colors.textInverted
                      : theme.colors.textSecondary
                  }
                >
                  {isAnaphylaxisActive ? 'FLAGGED STAT' : 'OFF'}
                </ThemedText>
              </View>
            </View>

            {isAnaphylaxisActive ? (
              <View style={styles.anaphylaxisNoticeBanner}>
                <ThemedText variant="captionBold" color={theme.colors.emergencyText}>
                  CRITICAL CLINICAL ALERT: Flagging anaphylaxis will activate persistent red emergency spine banners on active patient encounters, trigger CDS prescription blocking, and flag the patient on triage boards.
                </ThemedText>
              </View>
            ) : null}
          </Pressable>

          {/* 5. Reaction Manifestation & Onset */}
          <Input
            label="Reaction Manifestation (Symptoms)"
            value={reactionManifestation}
            onChangeText={setReactionManifestation}
            placeholder="e.g. Diffuse urticaria, facial angioedema, bronchospasm, hypotension"
          />

          <View style={styles.notesRow}>
            <View style={styles.flexFill}>
              <Input
                label="Approximate Onset Date"
                value={onsetDate}
                onChangeText={setOnsetDate}
                placeholder="YYYY-MM-DD (e.g. 2021-05-15)"
              />
            </View>
          </View>

          <Input
            label="Clinical Notes / Prior Treatment"
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Diagnosed in ER, prescribed auto-injector EpiPen, advised to wear medical alert bracelet"
            multiline
            numberOfLines={2}
          />

          {/* Action to Add */}
          <View style={styles.addBtnContainer}>
            <Button
              title="+ Add Allergy to Record"
              variant="secondary"
              size="md"
              onPress={handleAddAllergy}
            />
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  summarySection: {
    gap: theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyPillContainer: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
  },
  pillListContainer: {
    gap: theme.spacing.sm,
  },
  pillCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  pillCardEmergency: {
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
  },
  pillContent: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  allergenTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  pillRemoveBtn: {
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: theme.sizes.borderWidth,
    backgroundColor: theme.colors.borderLight,
  },
  formSection: {
    gap: theme.spacing.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  categoryChip: {
    paddingVertical: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
  },
  categoryChipSelected: {
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.primaryLight,
  },
  quickPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  quickPickLabel: {
    fontStyle: 'italic',
  },
  quickPickScroll: {
    gap: theme.spacing.xs,
  },
  quickPickBadge: {
    paddingVertical: theme.spacing.xs / 2,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
  },
  severityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  severityChip: {
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.xs,
  },
  severityChipSelected: {
    borderColor: theme.colors.primary,
  },
  severityChipLifeThreatening: {
    borderColor: theme.colors.emergency,
    backgroundColor: theme.colors.emergencySubtle,
  },
  anaphylaxisToggleCard: {
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  anaphylaxisCardInactive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderDark,
  },
  anaphylaxisCardActive: {
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
  },
  anaphylaxisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  anaphylaxisIconTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.sm,
  },
  flexFill: {
    flex: 1,
  },
  switchPill: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchPillInactive: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
  },
  switchPillActive: {
    backgroundColor: theme.colors.emergency,
  },
  anaphylaxisNoticeBanner: {
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.emergencyBg,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.emergency,
  },
  notesRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  addBtnContainer: {
    marginTop: theme.spacing.xs,
  },
  modalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
