import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Pressable, ViewStyle, ScrollView, TextInput } from 'react-native';
import ThemedText from './ThemedText';
import Icon, { IconName, IconSlot } from './Icon';
import Modal from './Modal';
import Badge from './Badge';
import { theme } from '../../constants/theme';

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  badge?: string;
  category?: string;
  icon?: IconName;
  requiresCustom?: boolean;
}

export interface SelectProps {
  label?: string;
  value?: string | null;
  options: SelectOption[];
  onSelect: (val: string) => void;
  required?: boolean;
  error?: string;
  helperText?: string;
  placeholder?: string;
  containerStyle?: ViewStyle;
  disabled?: boolean;
  allowClear?: boolean;
  allowCustom?: boolean;
  modalTitle?: string;
  modalSubtitle?: string;
  icon?: IconName;
}

export default function Select({
  label,
  value,
  options,
  onSelect,
  required,
  error,
  helperText,
  placeholder = 'Select an option...',
  containerStyle,
  disabled = false,
  allowClear = false,
  allowCustom = true,
  modalTitle,
  modalSubtitle,
  icon,
}: SelectProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [isEnteringCustom, setIsEnteringCustom] = useState(false);

  const displayValue = value?.trim() || '';
  const selectedOption = options.find((o) => o.value === displayValue || o.label === displayValue);

  // Group or filter options
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.description?.toLowerCase().includes(q) ||
        opt.badge?.toLowerCase().includes(q) ||
        opt.category?.toLowerCase().includes(q)
    );
  }, [options, searchQuery]);

  const handleSelect = (optVal: string) => {
    const picked = options.find((o) => o.value === optVal);
    if ((optVal === 'Other' || picked?.requiresCustom) && allowCustom) {
      setIsEnteringCustom(true);
      return;
    }
    setIsEnteringCustom(false);
    onSelect(optVal);
    setModalVisible(false);
    setSearchQuery('');
  };

  const handleApplyCustom = () => {
    if (customValue.trim()) {
      onSelect(customValue.trim());
    }
    setModalVisible(false);
    setIsEnteringCustom(false);
    setSearchQuery('');
  };

  const handleClear = () => {
    onSelect('');
    setModalVisible(false);
    setIsEnteringCustom(false);
    setSearchQuery('');
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.label}>
          {label}
          {required ? <ThemedText color={theme.colors.emergency}> *</ThemedText> : null}
        </ThemedText>
      ) : null}

      <Pressable
        onPress={() => !disabled && setModalVisible(true)}
        style={({ pressed }) => [
          styles.trigger,
          error ? styles.triggerError : null,
          modalVisible ? styles.triggerActive : null,
          disabled ? styles.triggerDisabled : null,
          pressed && !disabled ? styles.triggerPressed : null,
        ]}
        accessibilityRole="combobox"
        accessibilityLabel={`${label || 'Select'}, ${selectedOption?.label || displayValue || 'none selected'}`}
        accessibilityState={{ expanded: modalVisible, disabled }}
      >
        <View style={styles.triggerLeft}>
          {icon ? (
            <Icon
              name={icon}
              size={theme.sizes.iconSm}
              color={displayValue ? theme.colors.primary : theme.colors.textMuted}
            />
          ) : null}
          {displayValue ? (
            <ThemedText variant="bodyBold" color={theme.colors.text} numberOfLines={1} style={{ flex: 1 }}>
              {selectedOption ? selectedOption.label : displayValue}
            </ThemedText>
          ) : (
            <ThemedText variant="body" color={theme.colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
              {placeholder}
            </ThemedText>
          )}
        </View>

        <Icon name="chevronDown" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
      </Pressable>

      {error ? (
        <ThemedText variant="caption" color={theme.colors.emergency}>
          {error}
        </ThemedText>
      ) : helperText ? (
        <ThemedText variant="caption" color={theme.colors.textMuted}>
          {helperText}
        </ThemedText>
      ) : null}

      {/* Selection Modal */}
      <Modal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setIsEnteringCustom(false);
          setSearchQuery('');
        }}
        title={modalTitle || `Select ${label || 'Option'}`}
        subtitle={modalSubtitle}
        maxWidth={520}
      >
        <View style={styles.modalContent}>
          {options.length > 5 && !isEnteringCustom && (
            <View style={styles.searchWrapper}>
              <Icon name="search" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
              <TextInput
                placeholder="Search..."
                placeholderTextColor={theme.colors.textLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
                autoCorrect={false}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          )}

          {isEnteringCustom ? (
            <View style={styles.customContainer}>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                Specify Other
              </ThemedText>
              <TextInput
                placeholder="Enter details..."
                placeholderTextColor={theme.colors.textLight}
                value={customValue}
                onChangeText={setCustomValue}
                style={styles.customInput}
                autoFocus
              />
              <View style={styles.customActions}>
                <Pressable
                  style={[styles.customBtn, styles.customCancelBtn]}
                  onPress={() => setIsEnteringCustom(false)}
                >
                  <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                    Back
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.customBtn, styles.customSaveBtn]}
                  onPress={handleApplyCustom}
                >
                  <ThemedText variant="smallBold" color={theme.colors.onPrimary}>
                    Save
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ) : (
            <ScrollView style={styles.optionsList} contentContainerStyle={styles.optionsListContent}>
              {filteredOptions.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <ThemedText variant="body" color={theme.colors.textMuted}>
                    {options.length === 0 ? 'No options available.' : 'No matches found.'}
                  </ThemedText>
                </View>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = displayValue === opt.value || displayValue === opt.label;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => handleSelect(opt.value)}
                      style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <View style={styles.optionLeft}>
                        <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                          {isSelected && <View style={styles.radioDot} />}
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={styles.optionLabelRow}>
                            <ThemedText
                              variant="bodyBold"
                              color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                            >
                              {opt.label}
                            </ThemedText>
                            {opt.badge ? (
                              <Badge
                                label={opt.badge}
                                variant={isSelected ? 'primary' : 'outline'}
                                size="sm"
                              />
                            ) : null}
                          </View>
                          {opt.description ? (
                            <ThemedText variant="caption" color={theme.colors.textSecondary}>
                              {opt.description}
                            </ThemedText>
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          )}

          {/* Modal Footer Controls */}
          <View style={styles.modalFooter}>
            {allowClear && displayValue ? (
              <Pressable onPress={handleClear} style={styles.clearBtn}>
                <Icon name="trash" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                <ThemedText variant="small" color={theme.colors.textMuted}>
                  Clear Selection
                </ThemedText>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => {
                setModalVisible(false);
                setIsEnteringCustom(false);
              }}
              style={styles.closeBtn}
            >
              <ThemedText variant="smallBold" color={theme.colors.primary}>
                Close
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.xs,
  },
  label: {
    marginBottom: 2,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.sizes.controlMd,
    gap: theme.spacing.sm,
  },
  triggerActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  triggerPressed: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  triggerDisabled: {
    opacity: 0.6,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  triggerError: {
    borderColor: theme.colors.emergency,
    backgroundColor: theme.colors.emergencySubtle,
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.sm,
  },
  modalContent: {
    gap: theme.spacing.sm,
    maxHeight: 520,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    minHeight: 40,
    gap: theme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSizes.sm,
    paddingVertical: theme.spacing.xs,
  },
  optionsList: {
    maxHeight: 360,
  },
  optionsListContent: {
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  optionRow: {
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  optionRowSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  optionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: theme.radii.full,
    borderWidth: 2,
    borderColor: theme.colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioCircleSelected: {
    borderColor: theme.colors.primary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
  },
  emptyWrap: {
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customContainer: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  customInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
    minHeight: 44,
    backgroundColor: theme.colors.surface,
  },
  customActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  customBtn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
  },
  customCancelBtn: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  customSaveBtn: {
    backgroundColor: theme.colors.primary,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
  closeBtn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
});
