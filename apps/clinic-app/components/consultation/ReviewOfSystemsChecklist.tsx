import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
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
}

export default function ReviewOfSystemsChecklist({
  items,
  onChange,
  disabled = false,
  options: propOptions,
  loading: propLoading,
}: ReviewOfSystemsChecklistProps) {
  // 1. Support injected options, ros_symptom option set, or fallback to lib_signs_symptoms catalog
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
    () => items.find((i) => i.optionCode.toLowerCase().includes('pain') || (i.symptomName?.toLowerCase() ?? '').includes('pain')),
    [items]
  );
  const activeOtherItem = useMemo(
    () => items.find((i) => i.optionCode.toLowerCase().includes('other') || (i.symptomName?.toLowerCase() ?? '').includes('other')),
    [items]
  );

  const [painSiteInput, setPainSiteInput] = useState(activePainItem?.painSite || '');
  const [otherSpecifyInput, setOtherSpecifyInput] = useState(activeOtherItem?.othersSpecifyText || '');

  // Keep local inputs synchronized when items change from parent
  useEffect(() => {
    if (activePainItem?.painSite !== undefined && activePainItem.painSite !== painSiteInput) {
      setPainSiteInput(activePainItem.painSite || '');
    }
  }, [activePainItem?.painSite]);

  useEffect(() => {
    if (activeOtherItem?.othersSpecifyText !== undefined && activeOtherItem.othersSpecifyText !== otherSpecifyInput) {
      setOtherSpecifyInput(activeOtherItem.othersSpecifyText || '');
    }
  }, [activeOtherItem?.othersSpecifyText]);

  const filteredOptions = useMemo(() => {
    if (!filterText.trim()) return options;
    const lower = filterText.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower) || o.code.toLowerCase().includes(lower));
  }, [options, filterText]);

  const activeCodes = useMemo(() => {
    return new Set(items.map((i) => i.optionCode));
  }, [items]);

  const hasPain = useMemo(() => {
    return items.some((i) => i.optionCode.toLowerCase().includes('pain') || (i.symptomName?.toLowerCase() ?? '').includes('pain'));
  }, [items]);

  const hasOther = useMemo(() => {
    return items.some((i) => i.optionCode.toLowerCase().includes('other') || (i.symptomName?.toLowerCase() ?? '').includes('other'));
  }, [items]);

  const toggleItem = (code: string, label: string) => {
    if (disabled) return;
    if (activeCodes.has(code)) {
      onChange(items.filter((i) => i.optionCode !== code));
    } else {
      const isPain = code.toLowerCase().includes('pain') || label.toLowerCase().includes('pain');
      const isOther = code.toLowerCase().includes('other') || label.toLowerCase().includes('other');
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
        i.optionCode.toLowerCase().includes('pain') || (i.symptomName?.toLowerCase() ?? '').includes('pain')
          ? { ...i, painSite: site || null }
          : i,
      ),
    );
  };

  const updateOtherSpecify = (text: string) => {
    setOtherSpecifyInput(text);
    onChange(
      items.map((i) =>
        i.optionCode.toLowerCase().includes('other') || (i.symptomName?.toLowerCase() ?? '').includes('other')
          ? { ...i, othersSpecifyText: text || null }
          : i,
      ),
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.lg, padding: theme.spacing.md }]}>
      <View style={styles.header}>
        <View>
          <ThemedText variant="bodyBold">Review of Systems (ROS) & Presenting Symptoms</ThemedText>
          <ThemedText variant="small" color={theme.colors.textSecondary}>
            Pure 1NF symptom itemization mapped to PhilHealth lib_signs_symptoms
          </ThemedText>
        </View>
        <Badge variant="neutral" label={`${items.length} Selected`} />
      </View>

      {/* Search Filter */}
      <View style={[styles.searchBox, { borderColor: theme.colors.border, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceSubtle, marginTop: theme.spacing.sm }]}>
        <Icon name="search" size={16} color={theme.colors.textMuted} />
        <TextInput
          value={filterText}
          onChangeText={setFilterText}
          placeholder="Filter symptoms (e.g. fever, cough, chest pain)..."
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.searchInput, { color: theme.colors.text }]}
          editable={!disabled}
        />
        {filterText ? (
          <TouchableOpacity onPress={() => setFilterText('')}>
            <Icon name="close" size={14} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Options Grid */}
      <View style={[styles.chipsGrid, { marginTop: theme.spacing.sm }]}>
        {loading ? (
          <ThemedText variant="small" color={theme.colors.textMuted}>
            Loading symptoms from dynamic catalog...
          </ThemedText>
        ) : (
          filteredOptions.slice(0, 36).map((opt) => {
            const isSelected = activeCodes.has(opt.code);
            return (
              <TouchableOpacity
                key={opt.code}
                disabled={disabled}
                onPress={() => toggleItem(opt.code, opt.label)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isSelected ? theme.colors.primaryLight : theme.colors.surfaceSubtle,
                    borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    borderRadius: theme.radii.full,
                  },
                ]}
              >
                <ThemedText
                  variant="caption"
                  style={{
                    color: isSelected ? theme.colors.primaryDark : theme.colors.text,
                    fontWeight: isSelected ? '700' : '500',
                  }}
                >
                  {opt.label}
                </ThemedText>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Conditional Pain Site Specification */}
      {hasPain && (
        <View style={{ marginTop: theme.spacing.md }}>
          <Input
            label="Specific Pain Site / Radiation"
            value={painSiteInput}
            onChangeText={updatePainSite}
            placeholder="e.g. Right lower quadrant, radiating to lumbar"
            editable={!disabled}
          />
        </View>
      )}

      {/* Conditional Other Complaint Specification */}
      {hasOther && (
        <View style={{ marginTop: theme.spacing.sm }}>
          <Input
            label="Other Complaint / Symptom Details"
            value={otherSpecifyInput}
            onChangeText={updateOtherSpecify}
            placeholder="Specify any signs/symptoms not listed in the catalog..."
            editable={!disabled}
          />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    height: 38,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSizes.sm,
    paddingVertical: 0,
  },
  chipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
});
