import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import ThemedText from './ThemedText';
import { TextInput } from './Text';
import { IconSlot } from './Icon';
import Modal from './Modal';
import Button from './Button';
import { theme } from '../../constants/theme';

export interface TimeInputProps {
  value: string; // HH:MM (24-hour format)
  onChangeText: (time: string) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  editable?: boolean;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export function formatTimeMask(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

export function validateTimeString(time: string): { isValid: boolean; errorMessage?: string } {
  if (!time) return { isValid: true };
  const parts = time.split(':');
  if (parts.length !== 2 || parts[0].length !== 2 || parts[1].length !== 2) {
    return { isValid: false, errorMessage: 'Time must be in HH:MM format' };
  }
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || hours < 0 || hours > 23) {
    return { isValid: false, errorMessage: 'Hours must be between 00 and 23' };
  }
  if (isNaN(minutes) || minutes < 0 || minutes > 59) {
    return { isValid: false, errorMessage: 'Minutes must be between 00 and 59' };
  }
  return { isValid: true };
}

const CLINICAL_PRESETS = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

export default function TimeInput({
  value,
  onChangeText,
  label,
  placeholder = 'HH:MM',
  helperText,
  required = false,
  disabled = false,
  editable = true,
  error: externalError,
  containerStyle,
  inputStyle,
  testID = 'time-input',
}: TimeInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const isInteractive = !disabled && editable;
  const validation = useMemo(() => validateTimeString(value), [value]);

  const [selectedHour, setSelectedHour] = useState(() => {
    if (value && value.includes(':')) {
      return value.split(':')[0];
    }
    return '09';
  });

  const [selectedMinute, setSelectedMinute] = useState(() => {
    if (value && value.includes(':')) {
      return value.split(':')[1];
    }
    return '00';
  });

  const handleChangeText = (text: string) => {
    const formatted = formatTimeMask(text);
    onChangeText(formatted);
  };

  const handleOpenPicker = () => {
    if (!isInteractive) return;
    if (value && value.includes(':')) {
      const parts = value.split(':');
      if (parts[0]) setSelectedHour(parts[0]);
      if (parts[1]) setSelectedMinute(parts[1]);
    }
    setPickerVisible(true);
  };

  const handleSelectPreset = (preset: string) => {
    onChangeText(preset);
    const parts = preset.split(':');
    setSelectedHour(parts[0]);
    setSelectedMinute(parts[1]);
    setPickerVisible(false);
  };

  const handleConfirmCustom = () => {
    const timeStr = `${selectedHour}:${selectedMinute}`;
    onChangeText(timeStr);
    setPickerVisible(false);
  };

  const hasError = !!externalError || (!validation.isValid && value.length === 5);
  const errorMessage = externalError || validation.errorMessage;

  const wrapperBorderColor = hasError
    ? theme.colors.emergencyBorder
    : isFocused
    ? theme.colors.primary
    : theme.colors.borderDark;

  const wrapperBgColor = hasError
    ? theme.colors.emergencySubtle
    : !isInteractive
    ? theme.colors.surfaceMuted
    : theme.colors.surface;

  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      {label ? (
        <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.label}>
          {label}
          {required ? <ThemedText color={theme.colors.emergency}> *</ThemedText> : null}
        </ThemedText>
      ) : null}

      <View
        style={[
          styles.inputWrapper,
          { borderColor: wrapperBorderColor, backgroundColor: wrapperBgColor },
          !isInteractive && styles.disabledWrapper,
        ]}
      >
        <TextInput
          style={[styles.input, inputStyle]}
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textLight}
          keyboardType="numeric"
          maxLength={5}
          editable={isInteractive}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoCorrect={false}
          autoCapitalize="none"
        />

        {value.length > 0 && isInteractive ? (
          <Pressable
            onPress={() => onChangeText('')}
            style={styles.actionBtn}
            hitSlop={theme.spacing.sm}
            accessibilityLabel="Clear time"
          >
            <IconSlot value="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}

        {isInteractive ? (
          <Pressable
            onPress={handleOpenPicker}
            style={styles.actionBtn}
            hitSlop={theme.spacing.sm}
            testID={`${testID}-picker-btn`}
            accessibilityLabel="Open time picker"
          >
            <IconSlot value="clock" size={theme.sizes.iconSm} color={theme.colors.primary} />
          </Pressable>
        ) : null}
      </View>

      {hasError && errorMessage ? (
        <View style={styles.feedbackRow}>
          <IconSlot value="alertCircle" size={theme.fontSizes.xs} color={theme.colors.emergency} />
          <ThemedText variant="caption" color={theme.colors.emergencyText}>
            {errorMessage}
          </ThemedText>
        </View>
      ) : helperText ? (
        <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.feedback}>
          {helperText}
        </ThemedText>
      ) : null}

      {/* Interactive Time Picker Modal */}
      <Modal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        title={label ? `Select ${label}` : 'Select Time'}
        subtitle="Choose standard clinical shift time or pick hour & minute"
        maxWidth={440}
        footer={
          <View style={styles.modalFooter}>
            <Button
              title="Clear"
              variant="outline"
              size="sm"
              onPress={() => {
                onChangeText('');
                setPickerVisible(false);
              }}
            />
            <Button title="Apply Time" size="sm" onPress={handleConfirmCustom} />
          </View>
        }
      >
        <View style={styles.pickerContent}>
          {/* Quick Presets */}
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            Clinical Presets
          </ThemedText>
          <View style={styles.presetsGrid}>
            {CLINICAL_PRESETS.map((p) => {
              const isSelected = value === p;
              return (
                <Pressable
                  key={p}
                  style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                  onPress={() => handleSelectPreset(p)}
                >
                  <ThemedText
                    variant="captionBold"
                    color={isSelected ? theme.colors.onPrimary : theme.colors.text}
                  >
                    {p}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Hour & Minute Picker */}
          <View style={styles.customPickerSection}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Custom Time Selection
            </ThemedText>
            <View style={styles.timeSelectRow}>
              {/* Hours Column */}
              <View style={styles.columnContainer}>
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.columnTitle}>
                  Hour (24h)
                </ThemedText>
                <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
                  <View style={styles.chipsWrap}>
                    {HOURS.map((h) => {
                      const isSel = selectedHour === h;
                      return (
                        <Pressable
                          key={h}
                          style={[styles.timeChip, isSel && styles.timeChipSelected]}
                          onPress={() => setSelectedHour(h)}
                        >
                          <ThemedText
                            variant="captionBold"
                            color={isSel ? theme.colors.onPrimary : theme.colors.text}
                          >
                            {h}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* Minute Column */}
              <View style={styles.columnContainer}>
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.columnTitle}>
                  Minute
                </ThemedText>
                <View style={styles.chipsWrap}>
                  {MINUTES.map((m) => {
                    const isSel = selectedMinute === m;
                    return (
                      <Pressable
                        key={m}
                        style={[styles.timeChip, isSel && styles.timeChipSelected]}
                        onPress={() => setSelectedMinute(m)}
                      >
                        <ThemedText
                          variant="captionBold"
                          color={isSel ? theme.colors.onPrimary : theme.colors.text}
                        >
                          :{m}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.previewBox}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Selected:
            </ThemedText>
            <ThemedText variant="title" color={theme.colors.primary}>
              {selectedHour}:{selectedMinute}
            </ThemedText>
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    minHeight: theme.sizes.controlMd,
    overflow: 'hidden',
  },
  disabledWrapper: {
    opacity: 0.6,
  },
  actionBtn: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
    letterSpacing: 0.5,
    paddingVertical: theme.spacing.sm,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginLeft: 2,
  },
  feedback: {
    marginLeft: 2,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  pickerContent: {
    gap: theme.spacing.md,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  presetChip: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surfaceMuted,
  },
  presetChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  customPickerSection: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  timeSelectRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  columnContainer: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  columnTitle: {
    marginBottom: 2,
  },
  pickerScroll: {
    maxHeight: 140,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  timeChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  timeChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
  },
});
