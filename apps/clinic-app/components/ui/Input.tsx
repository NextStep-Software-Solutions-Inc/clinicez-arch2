import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
  Pressable,
} from 'react-native';
import ThemedText from './ThemedText';
import { TextInput } from './Text';
import { IconSlot, resolveIconName } from './Icon';
import { theme } from '../../constants/theme';
import { useUiDensity } from '../../context/UiDensityContext';

export interface InputProps extends TextInputProps {
  label?: string;
  labelTooltip?: string;
  labelTooltipAlign?: 'left' | 'right';
  error?: string;
  helperText?: string;
  disabled?: boolean;
  /** IconName (e.g. "search"). Legacy emoji glyphs are still resolved for old call sites. */
  leftIcon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  required?: boolean;
  inputRef?: React.Ref<any>;
}

export default function Input({
  label,
  labelTooltip,
  labelTooltipAlign = 'left',
  error,
  helperText,
  disabled,
  leftIcon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  inputStyle,
  required,
  inputRef,
  onFocus,
  onBlur,
  editable,
  ...rest
}: InputProps) {
  const { multiplier } = useUiDensity();
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const isEditable = disabled !== undefined ? !disabled : (editable ?? true);

  const densityWrapperStyle =
    multiplier !== 1
      ? {
          minHeight: rest.multiline
            ? Math.max(50, Math.round((theme.sizes.controlLg + theme.sizes.controlMd) * multiplier))
            : Math.max(28, Math.round(theme.sizes.controlMd * multiplier)),
          paddingHorizontal: Math.max(8, Math.round(theme.spacing.md * multiplier)),
          borderRadius: Math.max(4, Math.round(theme.radii.md * multiplier)),
        }
      : null;

  const densityInputStyle =
    multiplier !== 1
      ? {
          paddingVertical: Math.max(2, Math.round(theme.spacing.sm * multiplier)),
        }
      : null;

  return (
    <View style={[styles.container, showTooltip ? styles.containerTooltipActive : null, containerStyle]}>
      {label ? (
        labelTooltip ? (
          <View style={styles.labelRow}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.labelInline}>
              {label}
              {required ? <ThemedText color={theme.colors.emergency}> *</ThemedText> : null}
            </ThemedText>
            <View style={styles.tooltipAnchor}>
              <Pressable
                testID="input-label-tooltip-trigger"
                accessibilityRole="button"
                accessibilityLabel={labelTooltip}
                hitSlop={theme.spacing.xs}
                onPress={() => setShowTooltip((prev) => !prev)}
                onFocus={() => setShowTooltip(true)}
                onBlur={() => setShowTooltip(false)}
                {...({
                  onHoverIn: () => setShowTooltip(true),
                  onHoverOut: () => setShowTooltip(false),
                  onMouseEnter: () => setShowTooltip(true),
                  onMouseLeave: () => setShowTooltip(false),
                } as Record<string, unknown>)}
                style={styles.tooltipTrigger}
              >
                <IconSlot
                  value="helpCircle"
                  size={theme.fontSizes.sm}
                  color={showTooltip ? theme.colors.primary : theme.colors.textMuted}
                />
              </Pressable>
              {showTooltip ? (
                <View
                  testID="input-label-tooltip-popover"
                  pointerEvents="none"
                  style={[
                    styles.tooltipPopover,
                    labelTooltipAlign === 'right' ? styles.tooltipPopoverRight : styles.tooltipPopoverLeft,
                  ]}
                >
                  <ThemedText variant="caption" color={theme.colors.textInverted}>
                    {labelTooltip}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.label}>
            {label}
            {required ? <ThemedText color={theme.colors.emergency}> *</ThemedText> : null}
          </ThemedText>
        )
      ) : null}

      <View
        {...({
          onMouseEnter: () => setIsHovered(true),
          onMouseLeave: () => setIsHovered(false),
        } as any)}
        style={[
          styles.inputWrapper,
          densityWrapperStyle,
          isHovered && !isFocused && !disabled && !error ? styles.inputHovered : null,
          isFocused && styles.inputFocused,
          disabled ? styles.inputDisabled : null,
          error ? styles.inputError : null,
          rest.multiline ? styles.inputMultiline : null,
        ]}
      >
        {resolveIconName(leftIcon) ? (
          <View style={styles.leftIcon}>
            <IconSlot
              value={leftIcon}
              size={theme.sizes.iconSm}
              color={isFocused && !error ? theme.colors.primary : theme.colors.textMuted}
            />
          </View>
        ) : null}

        <TextInput
          ref={inputRef}
          editable={isEditable}
          style={[styles.input, densityInputStyle, inputStyle]}
          placeholderTextColor={theme.colors.textLight}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />

        {resolveIconName(rightIcon) ? (
          <Pressable onPress={onRightIconPress} style={styles.rightIconBtn} hitSlop={theme.spacing.sm}>
            <IconSlot value={rightIcon} size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={styles.feedbackRow}>
          <IconSlot value="alertCircle" size={theme.fontSizes.xs} color={theme.colors.emergency} />
          <ThemedText variant="caption" color={theme.colors.emergency}>
            {error}
          </ThemedText>
        </View>
      ) : helperText ? (
        <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.feedback}>
          {helperText}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.xs,
  },
  containerTooltipActive: {
    zIndex: 60,
  },
  label: {
    marginBottom: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: 2,
    zIndex: 60,
  },
  labelInline: {
    flexShrink: 1,
  },
  tooltipAnchor: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipTrigger: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 1,
  },
  tooltipPopover: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: theme.spacing.xs,
    width: 248,
    backgroundColor: theme.colors.surfaceInverse,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    zIndex: 100,
    ...theme.shadows.md,
  },
  tooltipPopoverLeft: {
    left: 0,
  },
  tooltipPopoverRight: {
    right: 0,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.sizes.controlMd,
  },
  inputMultiline: {
    minHeight: theme.sizes.controlLg + theme.sizes.controlMd,
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.sm,
  },
  inputHovered: {
    borderColor: theme.colors.primaryBorder,
  },
  inputFocused: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  inputDisabled: {
    opacity: 0.6,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  inputError: {
    borderColor: theme.colors.emergency,
    backgroundColor: theme.colors.emergencySubtle,
  },
  leftIcon: {
    marginRight: theme.spacing.sm,
  },
  rightIconBtn: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.sm,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
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
});
