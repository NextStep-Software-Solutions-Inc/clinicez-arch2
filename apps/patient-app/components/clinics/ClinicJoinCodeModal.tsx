import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import ThemedText from '../ui/ThemedText';
import { AppIcon } from '../ui/Icon';
import Button from '../ui/Button';
import { triggerHaptic } from '../../utils/haptics';
import { ApiError } from '../../services/api/apiClient';
import { GATED_CATALOG_STRINGS } from '../../constants/gatedCatalogStrings';
import {
  MAX_JOIN_CODE_LENGTH,
  sanitizeClinicJoinCodeInput,
  validateClinicJoinCode,
} from '../../utils/joinCode';

export interface ClinicJoinCodeModalProps {
  visible: boolean;
  clinicId: string;
  clinicName: string;
  onUnlock: (joinCode: string) => Promise<void>;
  onClose: () => void;
  onScanQr?: () => void;
  initialCode?: string;
}

export default function ClinicJoinCodeModal({
  visible,
  clinicId: _clinicId,
  clinicName,
  onUnlock,
  onClose,
  onScanQr,
  initialCode = '',
}: ClinicJoinCodeModalProps) {
  const { colors, radii, spacing, sizes, fontSizes, fonts } = useAppTheme();

  const [code, setCode] = useState(() => sanitizeClinicJoinCodeInput(initialCode));
  const [isFocused, setIsFocused] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setCode(sanitizeClinicJoinCodeInput(initialCode));
      setErrorMessage(null);
      setIsUnlocking(false);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
    setIsFocused(false);
  }, [visible, initialCode]);

  const handleCodeChange = (text: string) => {
    const sanitized = sanitizeClinicJoinCodeInput(text);
    setCode(sanitized);
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const handleClearCode = () => {
    setCode('');
    if (errorMessage) {
      setErrorMessage(null);
    }
    inputRef.current?.focus();
  };

  const handleUnlock = async (overrideCode?: string) => {
    const validation = validateClinicJoinCode(overrideCode ?? code);
    if (!validation.isValid) {
      setErrorMessage(validation.error || GATED_CATALOG_STRINGS.modal.lengthError);
      void triggerHaptic('error');
      return;
    }

    setIsUnlocking(true);
    setErrorMessage(null);

    try {
      await onUnlock(validation.normalizedCode);
      void triggerHaptic('success');
      onClose();
    } catch (err: unknown) {
      void triggerHaptic('error');
      if (err instanceof ApiError) {
        setErrorMessage(err.firstMessage || GATED_CATALOG_STRINGS.modal.defaultError);
      } else if (err instanceof Error) {
        setErrorMessage(
          err.message === 'OFFLINE_ERROR'
            ? GATED_CATALOG_STRINGS.modal.offlineError
            : err.message || GATED_CATALOG_STRINGS.modal.defaultError,
        );
      } else {
        setErrorMessage(GATED_CATALOG_STRINGS.modal.defaultError);
      }
    } finally {
      setIsUnlocking(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
      >
        <Pressable style={styles.backdropPressable} onPress={onClose} />

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              borderWidth: sizes.borderWidth,
              padding: spacing.xl,
              gap: spacing.md,
            },
          ]}
        >
          {/* Top Bar Icon & Close */}
          <View style={styles.topBar}>
            <View
              style={[
                styles.iconCircle,
                {
                  backgroundColor: colors.primarySubtle,
                  borderRadius: radii.full,
                  borderColor: colors.primaryBorder,
                  borderWidth: sizes.borderWidth,
                },
              ]}
            >
              <AppIcon name="key" size={sizes.iconMd} color="primary" />
            </View>
            <Pressable
              onPress={onClose}
              disabled={isUnlocking}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <AppIcon name="close" size={sizes.iconMd} color="textSecondary" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText variant="h2" style={styles.title}>
              {GATED_CATALOG_STRINGS.modal.title}
            </ThemedText>

            <ThemedText variant="body" color="textSecondary" style={styles.subtitle}>
              {GATED_CATALOG_STRINGS.modal.subtitlePrefix}
              {clinicName}
              {GATED_CATALOG_STRINGS.modal.subtitleSuffix}
            </ThemedText>

            {/* Canonical Join Passcode Input */}
            <View style={[styles.codeContainer, { gap: spacing.xs }]}>
              <Pressable
                onPress={() => inputRef.current?.focus()}
                accessibilityRole="none"
                style={[
                  styles.codeInputBox,
                  {
                    minHeight: sizes.controlLg + spacing.xs,
                    borderRadius: radii.lg,
                    borderColor: errorMessage
                      ? colors.emergency
                      : isFocused
                      ? colors.primary
                      : code.length > 0
                      ? colors.borderDark
                      : colors.border,
                    backgroundColor: errorMessage
                      ? colors.emergencySubtle
                      : isFocused
                      ? colors.primarySubtle
                      : colors.background,
                    borderWidth: isFocused || Boolean(errorMessage) ? 2 : sizes.borderWidth,
                    paddingHorizontal: spacing.md,
                    gap: spacing.xs,
                  },
                ]}
              >
                <TextInput
                  ref={inputRef}
                  value={code}
                  onChangeText={handleCodeChange}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onSubmitEditing={() => {
                    if (code.trim().length > 0 && !isUnlocking) {
                      void handleUnlock();
                    }
                  }}
                  maxLength={MAX_JOIN_CODE_LENGTH}
                  placeholder={GATED_CATALOG_STRINGS.modal.inputPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  spellCheck={false}
                  keyboardType="default"
                  returnKeyType="done"
                  editable={!isUnlocking}
                  style={[
                    styles.codeTextInput,
                    {
                      color: errorMessage ? colors.emergencyText : colors.text,
                      fontSize: fontSizes.xl,
                      fontFamily: fonts.mono['700'],
                    },
                  ]}
                  accessibilityLabel={GATED_CATALOG_STRINGS.modal.inputAccessibilityLabel}
                />
                {code.length > 0 && !isUnlocking ? (
                  <Pressable
                    onPress={handleClearCode}
                    accessibilityRole="button"
                    accessibilityLabel="Clear join code"
                    hitSlop={spacing.xs}
                    style={({ pressed }) => [styles.clearCodeButton, { opacity: pressed ? 0.65 : 1 }]}
                  >
                    <AppIcon name="close" size={sizes.iconSm} color="textMuted" />
                  </Pressable>
                ) : null}
              </Pressable>

              <ThemedText variant="caption" color="textMuted" style={styles.inputHint}>
                {GATED_CATALOG_STRINGS.modal.inputHint}
              </ThemedText>
            </View>

            {/* Error Banner */}
            {errorMessage ? (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: colors.emergencyBg,
                    borderColor: colors.emergencyBorder,
                    borderRadius: radii.md,
                    borderWidth: sizes.borderWidth,
                    padding: spacing.md,
                    gap: spacing.xs,
                  },
                ]}
              >
                <View style={styles.errorHeader}>
                  <AppIcon name="alert" size={sizes.iconSm} color="emergency" />
                  <ThemedText variant="smallBold" color="emergencyText">
                    Verification Failed
                  </ThemedText>
                </View>
                <ThemedText variant="caption" color="emergencyText" style={styles.errorText}>
                  {errorMessage}
                </ThemedText>
              </View>
            ) : null}

            {/* Action Buttons */}
            <View style={[styles.actionRow, { gap: spacing.sm, marginTop: spacing.xs }]}>
              <Button
                label={
                  isUnlocking
                    ? GATED_CATALOG_STRINGS.modal.submittingButton
                    : GATED_CATALOG_STRINGS.modal.submitButton
                }
                variant="primary"
                size="lg"
                loading={isUnlocking}
                disabled={code.trim().length === 0 || isUnlocking}
                onPress={() => handleUnlock()}
                fullWidth
              />

              {onScanQr ? (
                <Button
                  label={GATED_CATALOG_STRINGS.modal.qrButton}
                  variant="outline"
                  icon="qrCode"
                  disabled={isUnlocking}
                  onPress={onScanQr}
                  fullWidth
                />
              ) : null}

              <Button
                label={GATED_CATALOG_STRINGS.modal.cancelButton}
                variant="ghost"
                disabled={isUnlocking}
                onPress={onClose}
                fullWidth
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    maxHeight: '90%',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconCircle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    gap: 12,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 20,
  },
  codeContainer: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 8,
  },
  codeInputBox: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeTextInput: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    letterSpacing: 1.5,
    paddingVertical: 10,
  },
  clearCodeButton: {
    padding: 4,
  },
  inputHint: {
    textAlign: 'center',
  },
  errorBanner: {
    gap: 4,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorText: {
    lineHeight: 18,
  },
  actionRow: {
    width: '100%',
  },
});
