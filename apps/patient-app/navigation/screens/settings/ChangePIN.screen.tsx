import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import NumericKeypad from '@ui/NumericKeypad';
import { dialog } from '@utils/dialog';

const PIN_LENGTH = 4;

type Step = 'verify' | 'new' | 'confirm';

const STEP_CONFIG: Record<Step, { title: string; subtitle: string }> = {
  verify: {
    title: 'Enter Current PIN',
    subtitle: 'Confirm your identity before changing your PIN.',
  },
  new: {
    title: 'Enter New PIN',
    subtitle: 'Choose a new 4-digit PIN for your account.',
  },
  confirm: {
    title: 'Confirm New PIN',
    subtitle: 'Re-enter your new PIN to confirm.',
  },
};

export default function ChangePINScreen() {
  const navigation = useNavigation<any>();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { verifyPin, savePin } = useAuth();

  const [step, setStep] = useState<Step>('verify');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');

  const { title, subtitle } = STEP_CONFIG[step];

  const handleFullPin = useCallback(
    async (entered: string) => {
      if (step === 'verify') {
        const ok = await verifyPin(entered);
        if (ok) {
          setPin('');
          setStep('new');
        } else {
          setPin('');
          setError('Incorrect PIN. Please try again.');
        }
      } else if (step === 'new') {
        setNewPin(entered);
        setPin('');
        setStep('confirm');
      } else if (step === 'confirm') {
        if (entered === newPin) {
          await savePin(entered);
          dialog.alert('PIN Changed', 'Your PIN has been updated successfully.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } else {
          setPin('');
          setNewPin('');
          setStep('new');
          setError("PINs didn't match. Please start again.");
        }
      }
    },
    [step, newPin, verifyPin, savePin, navigation],
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length >= PIN_LENGTH) return;
      const next = pin + digit;
      setPin(next);
      setError('');

      if (next.length === PIN_LENGTH) {
        handleFullPin(next);
      }
    },
    [pin, handleFullPin],
  );

  const handleDelete = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
  }, []);

  // Web hardware keyboard listener
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleDelete]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingVertical: spacing['3xl'] }]}>
      <View style={[styles.inner, { maxWidth: sizes.dialogWidth, gap: spacing.xl, paddingHorizontal: spacing.xl }]}>
        {/* Step indicator */}
        <View style={[styles.stepsRow, { gap: spacing.sm }]}>
          {(['verify', 'new', 'confirm'] as Step[]).map((s, i) => (
            <View
              key={s}
              style={[
                styles.stepDot,
                {
                  borderRadius: radii.full,
                  backgroundColor:
                    s === step
                      ? colors.primary
                      : i < (['verify', 'new', 'confirm'] as Step[]).indexOf(step)
                        ? colors.primaryBorder
                        : colors.border,
                },
              ]}
            />
          ))}
        </View>

        {/* Title */}
        <View style={[styles.titleSection, { gap: spacing.xs }]}>
          <ThemedText variant="h2" style={{ textAlign: 'center' }}>
            {title}
          </ThemedText>
          <ThemedText variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            {subtitle}
          </ThemedText>
        </View>

        {/* Dot indicators */}
        <View style={styles.dotsRow}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  width: sizes.iconMd,
                  height: sizes.iconMd,
                  borderRadius: radii.full,
                  borderColor: error ? colors.emergency : colors.primary,
                  backgroundColor:
                    i < pin.length
                      ? error
                        ? colors.emergency
                        : colors.primary
                      : colors.transparent,
                },
              ]}
            />
          ))}
        </View>

        {/* Error message */}
        <View style={styles.errorContainer}>
          {error ? (
            <ThemedText variant="small" color="emergencyText" style={{ textAlign: 'center' }}>
              {error}
            </ThemedText>
          ) : (
            <View style={{ height: spacing.lg }} />
          )}
        </View>

        {/* Keypad */}
        <NumericKeypad onPress={handleDigit} onDelete={handleDelete} />

        {Platform.OS === 'web' ? (
          <ThemedText variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
            Type numbers on your keyboard or use the keypad
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: '100%',
    alignItems: 'center',
  },
  stepsRow: {
    flexDirection: 'row',
  },
  stepDot: {
    width: 8,
    height: 8,
  },
  titleSection: {
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 20,
  },
  dot: {
    borderWidth: 2,
  },
  errorContainer: {
    minHeight: 20,
    alignItems: 'center',
  },
});
