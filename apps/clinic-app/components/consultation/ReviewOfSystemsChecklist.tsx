import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, Pressable, TextInput } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import { theme } from '../../constants/theme';
import type { EncounterReviewOfSystemsItemDto } from '../../services/clinicService';
import { useEhrOptions } from '../../hooks/useEhrOptions';
import { usePhilHealthCatalog } from '../../utils/usePhilHealthCatalog';

export interface ReviewOfSystemsOption {
  code: string;
  label: string;
}

export interface ReviewOfSystemsChecklistProps {
  items: EncounterReviewOfSystemsItemDto[];
  onChange: (items: EncounterReviewOfSystemsItemDto[]) => void;
  disabled?: boolean;
  options?: ReviewOfSystemsOption[];
  loading?: boolean;
  embedded?: boolean;
}

export default function ReviewOfSystemsChecklist({
  items,
  onChange,
  disabled = false,
  options: propOptions,
  loading: propLoading,
  embedded = false,
}: ReviewOfSystemsChecklistProps) {
  // Dynamic symptom options: injected options -> tenant EHR options -> signs & symptoms catalog
  const { options: ehrOptions, loading: ehrLoading } = useEhrOptions('ros_symptom', {
    enabled: !propOptions || propOptions.length === 0,
  });
  const catalog = usePhilHealthCatalog(
    'lib_signs_symptoms',
    (!propOptions || propOptions.length === 0) && (!ehrOptions || ehrOptions.length === 0)
  );

  const options: ReviewOfSystemsOption[] = useMemo(() => {
    if (propOptions && propOptions.length > 0) {
      return propOptions;
    }
    if (ehrOptions && ehrOptions.length > 0) {
      return ehrOptions.map((o) => ({ code: o.code, label: o.label }));
    }
    return (catalog.items || []).map((item) => ({
      code: item.code,
      label: item.description
        ? item.description.charAt(0).toUpperCase() + item.description.slice(1).toLowerCase()
        : item.code,
    }));
  }, [propOptions, ehrOptions, catalog.items]);

  const loading = propLoading ?? (ehrLoading && catalog.loading);

  const [filterText, setFilterText] = useState('');

  // Derive active inputs directly from items to preserve existing documented notes
  const activePainItem = useMemo(
    () =>
      items.find(
        (i) =>
          i.optionCode.toLowerCase().includes('pain') ||
          (i.symptomName?.toLowerCase() ?? '').includes('pain')
      ),
    [items]
  );
  const activeOtherItem = useMemo(
    () =>
      items.find(
        (i) =>
          i.optionCode.toLowerCase().includes('other') ||
          (i.symptomName?.toLowerCase() ?? '').includes('other')
      ),
    [items]
  );

  const [painSiteInput, setPainSiteInput] = useState(activePainItem?.painSite || '');
  const [otherSpecifyInput, setOtherSpecifyInput] = useState(
    activeOtherItem?.othersSpecifyText || ''
  );

  useEffect(() => {
    if (activePainItem?.painSite !== undefined && activePainItem.painSite !== painSiteInput) {
      setPainSiteInput(activePainItem.painSite || '');
    }
  }, [activePainItem?.painSite, painSiteInput]);

  useEffect(() => {
    if (
      activeOtherItem?.othersSpecifyText !== undefined &&
      activeOtherItem.othersSpecifyText !== otherSpecifyInput
    ) {
      setOtherSpecifyInput(activeOtherItem.othersSpecifyText || '');
    }
  }, [activeOtherItem?.othersSpecifyText, otherSpecifyInput]);

  const filteredOptions = useMemo(() => {
    if (!filterText.trim()) return options;
    const lower = filterText.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(lower) || o.code.toLowerCase().includes(lower)
    );
  }, [options, filterText]);

  const activeCodes = useMemo(() => {
    return new Set(items.map((i) => i.optionCode));
  }, [items]);

  const hasPain = useMemo(() => {
    return items.some(
      (i) =>
        i.optionCode.toLowerCase().includes('pain') ||
        (i.symptomName?.toLowerCase() ?? '').includes('pain')
    );
  }, [items]);

  const hasOther = useMemo(() => {
    return items.some(
      (i) =>
        i.optionCode.toLowerCase().includes('other') ||
        (i.symptomName?.toLowerCase() ?? '').includes('other')
    );
  }, [items]);

  const toggleItem = (code: string, label: string) => {
    if (disabled) return;
    if (activeCodes.has(code)) {
      onChange(items.filter((i) => i.optionCode !== code));
    } else {
      const isPain = code.toLowerCase().includes('pain') || label.toLowerCase().includes('pain');
      const isOther =
        code.toLowerCase().includes('other') || label.toLowerCase().includes('other');
      const newItem: EncounterReviewOfSystemsItemDto = {
        optionCode: code,
        symptomName: label,
        isPertinentPositive: true,
        painSite: isPain ? painSiteInput || null : null,
        othersSpecifyText: isOther ? otherSpecifyInput || null : null,
        remarks: label,
      };
      onChange([...items, newItem]);
    }
  };

  const updatePainSite = (site: string) => {
    setPainSiteInput(site);
    onChange(
      items.map((i) =>
        i.optionCode.toLowerCase().includes('pain') ||
        (i.symptomName?.toLowerCase() ?? '').includes('pain')
          ? { ...i, painSite: site || null }
          : i
      )
    );
  };

  const updateOtherSpecify = (text: string) => {
    setOtherSpecifyInput(text);
    onChange(
      items.map((i) =>
        i.optionCode.toLowerCase().includes('other') ||
        (i.symptomName?.toLowerCase() ?? '').includes('other')
          ? { ...i, othersSpecifyText: text || null }
          : i
      )
    );
  };

  return (
    <View style={[styles.wrapper, !embedded && styles.cardContainer]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextArea}>
          {!embedded ? (
            <ThemedText variant="bodyBold">Presenting Symptoms</ThemedText>
          ) : null}
          <ThemedText variant="small" color={theme.colors.textMuted}>
            Select the symptoms reported during this visit. Each selection is added to the notes below.
          </ThemedText>
        </View>
        {!embedded || items.length > 0 ? (
          <Badge
            variant={items.length > 0 ? 'primary' : 'neutral'}
            size="sm"
            label={`${items.length} selected`}
          />
        ) : null}
      </View>

      {/* Search Filter */}
      <View style={styles.searchBox}>
        <Icon name="search" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
        <TextInput
          value={filterText}
          onChangeText={setFilterText}
          placeholder="Search symptoms (e.g. fever, cough, chest pain)..."
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          editable={!disabled}
          accessibilityLabel="Search symptoms"
        />
        {filterText ? (
          <Pressable
            onPress={() => setFilterText('')}
            accessibilityRole="button"
            accessibilityLabel="Clear symptom search"
            hitSlop={theme.spacing.xs}
          >
            <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Unified Symptom Chips (matches ToggleChip styling) */}
      <View style={styles.chipsRow}>
        {loading && options.length === 0 ? (
          <ThemedText variant="small" color={theme.colors.textMuted}>
            Loading symptoms...
          </ThemedText>
        ) : filteredOptions.length === 0 ? (
          <ThemedText variant="small" color={theme.colors.textMuted}>
            No matching symptoms found.
          </ThemedText>
        ) : (
          filteredOptions.map((opt) => {
            const isSelected = activeCodes.has(opt.code);
            return (
              <Pressable
                key={opt.code}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled }}
                disabled={disabled}
                onPress={() => toggleItem(opt.code, opt.label)}
                style={({ pressed }) => [
                  styles.chip,
                  isSelected ? styles.chipSelected : styles.chipIdle,
                  pressed && !disabled && styles.chipPressed,
                  disabled && styles.chipDisabled,
                ]}
              >
                <Icon
                  name={isSelected ? 'check' : 'plus'}
                  size={theme.sizes.iconSm}
                  color={isSelected ? theme.colors.primaryDark : theme.colors.textMuted}
                />
                <ThemedText
                  variant="small"
                  color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                >
                  {opt.label}
                </ThemedText>
              </Pressable>
            );
          })
        )}
      </View>

      {/* Conditional Pain Location Input */}
      {hasPain ? (
        <Input
          label="Pain location"
          value={painSiteInput}
          onChangeText={updatePainSite}
          placeholder="e.g. Upper abdomen, right shoulder, lower back"
          editable={!disabled}
        />
      ) : null}

      {/* Conditional Other Symptoms Input */}
      {hasOther ? (
        <Input
          label="Other symptoms"
          value={otherSpecifyInput}
          onChangeText={updateOtherSpecify}
          placeholder="Describe other symptoms"
          editable={!disabled}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  cardContainer: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  headerTextArea: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.sizes.controlSm,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    gap: theme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.text,
    paddingVertical: theme.spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: theme.sizes.controlSm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
  },
  chipIdle: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderDark,
  },
  chipSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipDisabled: {
    opacity: 0.6,
  },
});
