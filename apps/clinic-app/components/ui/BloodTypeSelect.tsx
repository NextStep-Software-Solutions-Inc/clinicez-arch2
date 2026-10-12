import React, { useState } from 'react';
import { View, StyleSheet, Pressable, ViewStyle } from 'react-native';
import ThemedText from './ThemedText';
import Icon from './Icon';
import Modal from './Modal';
import { theme } from '../../constants/theme';
import {
  StandardBloodType,
  RH_POSITIVE_TYPES,
  RH_NEGATIVE_TYPES,
  BLOOD_TYPE_METADATA,
} from '../../constants/bloodTypes';

export interface BloodTypeSelectProps {
  label?: string;
  value?: string | null;
  onChange: (val: string) => void;
  required?: boolean;
  error?: string;
  helperText?: string;
  placeholder?: string;
  containerStyle?: ViewStyle;
  disabled?: boolean;
  allowClear?: boolean;
}

export default function BloodTypeSelect({
  label = 'Blood Type',
  value,
  onChange,
  required,
  error,
  helperText,
  placeholder = 'Select blood type',
  containerStyle,
  disabled = false,
  allowClear = true,
}: BloodTypeSelectProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const displayValue = value?.trim() || '';

  const handleSelect = (bt: StandardBloodType) => {
    onChange(bt);
    setModalVisible(false);
  };

  const handleClear = () => {
    onChange('');
    setModalVisible(false);
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
        accessibilityLabel={`${label}, ${displayValue || 'none selected'}`}
        accessibilityState={{ expanded: modalVisible, disabled }}
      >
        <View style={styles.triggerLeft}>
          <Icon
            name="droplet"
            size={theme.sizes.iconSm}
            color={displayValue ? theme.colors.primary : theme.colors.textMuted}
          />
          {displayValue ? (
            <ThemedText variant="bodyBold" color={theme.colors.text}>
              {displayValue}
            </ThemedText>
          ) : (
            <ThemedText variant="body" color={theme.colors.textMuted}>
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

      {/* Standard Selection Modal */}
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Select Blood Type"
        subtitle="Standard ABO & RhD blood groups"
        maxWidth={480}
      >
        <View style={styles.modalContent}>
          {/* Rh Positive */}
          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
            Rh Positive (+)
          </ThemedText>
          <View style={styles.grid}>
            {RH_POSITIVE_TYPES.map((bt) => {
              const selected = displayValue === bt;
              return (
                <Pressable
                  key={bt}
                  onPress={() => handleSelect(bt)}
                  style={[styles.tile, selected && styles.tileActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <ThemedText
                    variant="title"
                    color={selected ? theme.colors.textInverted : theme.colors.text}
                  >
                    {bt}
                  </ThemedText>
                  <ThemedText
                    variant="micro"
                    color={selected ? theme.colors.primaryLight : theme.colors.textMuted}
                  >
                    {BLOOD_TYPE_METADATA[bt]?.antigen ?? ''} RhD+
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Rh Negative */}
          <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={{ marginTop: theme.spacing.sm }}>
            Rh Negative (-)
          </ThemedText>
          <View style={styles.grid}>
            {RH_NEGATIVE_TYPES.map((bt) => {
              const selected = displayValue === bt;
              return (
                <Pressable
                  key={bt}
                  onPress={() => handleSelect(bt)}
                  style={[styles.tile, selected && styles.tileActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <ThemedText
                    variant="title"
                    color={selected ? theme.colors.textInverted : theme.colors.text}
                  >
                    {bt}
                  </ThemedText>
                  <ThemedText
                    variant="micro"
                    color={selected ? theme.colors.primaryLight : theme.colors.textMuted}
                  >
                    {BLOOD_TYPE_METADATA[bt]?.antigen ?? ''} RhD-
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Other / Actions */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => handleSelect('Unknown')}
              style={[styles.secondaryTile, displayValue === 'Unknown' && styles.secondaryTileActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: displayValue === 'Unknown' }}
            >
              <ThemedText
                variant="smallBold"
                color={displayValue === 'Unknown' ? theme.colors.textInverted : theme.colors.textSecondary}
              >
                Unknown / Untested
              </ThemedText>
            </Pressable>

            {allowClear && (
              <Pressable
                onPress={handleClear}
                style={styles.clearBtn}
                accessibilityRole="button"
                accessibilityLabel="Clear blood type"
              >
                <ThemedText variant="smallBold" color={theme.colors.textMuted}>
                  Clear
                </ThemedText>
              </Pressable>
            )}
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
  },
  triggerActive: {
    borderColor: theme.colors.primary,
  },
  triggerError: {
    borderColor: theme.colors.emergency,
    backgroundColor: theme.colors.emergencySubtle,
  },
  triggerDisabled: {
    opacity: 0.6,
  },
  triggerPressed: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  modalContent: {
    gap: theme.spacing.md,
  },
  grid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  tile: {
    flex: 1,
    minHeight: 56,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  tileActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.md,
  },
  secondaryTile: {
    flex: 2,
    minHeight: 44,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  secondaryTileActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  clearBtn: {
    flex: 1,
    minHeight: 44,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
});
