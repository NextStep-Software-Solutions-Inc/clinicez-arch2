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

export interface ClinicJoinCodeModalProps {
  visible: boolean;
  clinicId: string;
  clinicName: string;
  onUnlock: (joinCode: string) => Promise<void>;
  onClose: () => void;
  onScanQr?: () => void;
  initialCode?: string;
}

const CODE_LENGTH = 6;

export default function ClinicJoinCodeModal({
  visible,
  clinicId: _clinicId,
  clinicName,
  onUnlock,
  onClose,
  onScanQr,
  initialCode = '',
}: ClinicJoinCodeModalProps) {
  const { colors, radii, spacing, sizes } = useAppTheme();

  const [code, setCode] = useState(initialCode);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setCode(initialCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH));
      setErrorMessage(null);
      setIsUnlocking(false);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [visible, initialCode]);

  const handleCodeChange = (text: string) => {
    const sanitized = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
    setCode(sanitized);
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const handleUnlock = async (overrideCode?: string) => {
    const targetCode = (overrideCode ?? code).trim().toUpperCase();
    if (targetCode.length !== CODE_LENGTH) {
      setErrorMessage(GATED_CATALOG_STRINGS.modal.lengthError);
      void triggerHaptic('error');
      return;
    }

    setIsUnlocking(true);
    setErrorMessage(null);

    try {
      await onUnlock(targetCode);
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

            {/* Segmented Code Entry Boxes */}
            <Pressable
              onPress={() => inputRef.current?.focus()}
              style={styles.codeContainer}
              accessibilityRole="none"
            >
              <View style={[styles.boxRow, { gap: spacing.sm }]}>
                {Array.from({ length: CODE_LENGTH }).map((_, index) => {
                  const char = code[index] || '';
                  const isFocused = code.length === index;
                  const hasError = Boolean(errorMessage);

                  return (
                    <View
                      key={index}
                      style={[
                        styles.codeBox,
                        {
                          borderRadius: radii.md,
                          borderColor: hasError
                            ? colors.emergency
                            : isFocused
                            ? colors.primary
                            : char
                            ? colors.borderDark
                            : colors.border,
                          backgroundColor: hasError
                            ? colors.emergencySubtle
                            : isFocused
                            ? colors.primarySubtle
                            : colors.background,
                          borderWidth: isFocused || hasError ? 2 : sizes.borderWidth,
                        },
                      ]}
                    >
                      <ThemedText
                        variant="h2"
                        color={hasError ? 'emergencyText' : 'text'}
                        style={styles.codeText}
                      >
                        {char}
                      </ThemedText>
                    </View>
                  );
                })}
              </View>

              {/* Underlying TextInput for cross-platform input and paste */}
              <TextInput
                ref={inputRef}
                value={code}
                onChangeText={handleCodeChange}
                maxLength={CODE_LENGTH}
                autoCapitalize="characters"
                autoCorrect={false}
                keyboardType="default"
                editable={!isUnlocking}
                style={styles.hiddenInput}
                accessibilityLabel={GATED_CATALOG_STRINGS.modal.inputAccessibilityLabel}
              />
            </Pressable>

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
                disabled={code.length !== CODE_LENGTH || isUnlocking}
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
    alignItems: 'center',
    marginVertical: 8,
  },
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  codeBox: {
    width: 46,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeText: {
    textAlign: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
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
