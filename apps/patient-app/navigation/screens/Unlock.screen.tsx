import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import NumericKeypad from '@ui/NumericKeypad';
import { AppIcon } from '@ui/Icon';

const PIN_LENGTH = 4;
const MAX_BIOMETRIC_ATTEMPTS = 3;

function PINDots({ filled, shaking }: { filled: number; shaking: boolean }) {
  const { colors, radii, sizes } = useAppTheme();
  const dotColor = shaking ? colors.emergency : colors.primary;
  return (
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
              borderColor: dotColor,
              backgroundColor: i < filled ? dotColor : colors.transparent,
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function UnlockScreen() {
  const { colors, spacing, sizes } = useAppTheme();
  const { verifyPin, biometricsEnabled, authenticateWithBiometrics } = useAuth();
  const [currentInput, setCurrentInput] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [biometricFailures, setBiometricFailures] = useState(0);

  const biometricsAvailable =
    Platform.OS !== 'web' && biometricsEnabled && biometricFailures < MAX_BIOMETRIC_ATTEMPTS;

  const triggerBiometrics = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const result = await authenticateWithBiometrics();
    if (result === 'error') {
      setBiometricFailures((prev) => {
        const next = prev + 1;
        if (next >= MAX_BIOMETRIC_ATTEMPTS) {
          setError('Biometrics unavailable. Use your PIN.');
        }
        return next;
      });
    }
  }, [authenticateWithBiometrics]);

  useEffect(() => {
    if (Platform.OS !== 'web' && biometricsEnabled && biometricFailures === 0) {
      triggerBiometrics();
    }
  }, [biometricsEnabled, biometricFailures, triggerBiometrics]);

  const handleWrongPIN = useCallback(() => {
    setShaking(true);
    setError('Incorrect PIN. Try again.');
    setTimeout(() => {
      setCurrentInput('');
      setShaking(false);
    }, 600);
  }, []);

  const handleDigit = useCallback(
    async (digit: string) => {
      if (currentInput.length >= PIN_LENGTH || shaking) return;
      const next = currentInput + digit;
      setCurrentInput(next);
      setError('');
      if (next.length === PIN_LENGTH) {
        setTimeout(async () => {
          const ok = await verifyPin(next);
          if (ok === false) handleWrongPIN();
        }, 150);
      }
    },
    [currentInput, shaking, verifyPin, handleWrongPIN],
  );

  const handleDelete = useCallback(() => {
    if (shaking) return;
    setCurrentInput((prev) => prev.slice(0, -1));
    setError('');
  }, [shaking]);

  const biometricLabel = Platform.select({ ios: 'Use Face ID', default: 'Use Biometrics' });

  return (
    <View style={[styles.page, { backgroundColor: colors.background, paddingVertical: spacing['3xl'] }]}>
      <View
        style={[
          styles.container,
          {
            maxWidth: sizes.dialogWidth,
            gap: spacing.xl,
            paddingHorizontal: spacing.xl,
          },
        ]}
      >
        <View style={[styles.header, { gap: spacing.sm }]}>
          <View style={{ marginBottom: spacing.xs }}>
            <AppIcon name="lock" size={sizes.iconXl * 1.5} color="primary" />
          </View>
          <ThemedText variant="h2" style={{ textAlign: 'center' }}>
            Enter PIN
          </ThemedText>
          <ThemedText variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            Enter your 4-digit PIN to unlock
          </ThemedText>
        </View>

        <PINDots filled={currentInput.length} shaking={shaking} />

        {error ? (
          <ThemedText variant="small" color="emergencyText" style={{ textAlign: 'center' }}>
            {error}
          </ThemedText>
        ) : (
          <View style={{ height: spacing.lg }} />
        )}

        <NumericKeypad onPress={handleDigit} onDelete={handleDelete} />

        {Platform.OS === 'web' ? (
          <ThemedText variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
            Type numbers on your keyboard or use the keypad
          </ThemedText>
        ) : null}

        {biometricsAvailable ? (
          <Pressable
            style={({ pressed }) => [styles.biometricBtn, pressed && { opacity: 0.6 }]}
            onPress={triggerBiometrics}
          >
            <ThemedText variant="bodyBold" color="primary">
              {biometricLabel}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '100%',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'center',
  },
  dot: {
    borderWidth: 2,
  },
  biometricBtn: {
    padding: 12,
  },
});