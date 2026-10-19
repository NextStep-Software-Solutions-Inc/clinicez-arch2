import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import NumericKeypad from '@ui/NumericKeypad';
import { AppIcon } from '@ui/Icon';

const PIN_LENGTH = 4;
type Phase = 'create' | 'confirm';

function PINDots({ filled, error }: { filled: number; error: boolean }) {
  const { colors, radii, sizes } = useAppTheme();
  const dotColor = error ? colors.emergency : colors.primary;
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

export default function CreatePINScreen() {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { savePin } = useAuth();
  const [phase, setPhase] = useState<Phase>('create');
  const [firstPIN, setFirstPIN] = useState('');
  const [currentInput, setCurrentInput] = useState('');
  const [error, setError] = useState('');

  const reset = useCallback(() => {
    setCurrentInput('');
    setPhase('create');
    setFirstPIN('');
    setError('');
  }, []);

  const handleComplete = useCallback(
    (pin: string) => {
      if (phase === 'create') {
        setFirstPIN(pin);
        setCurrentInput('');
        setPhase('confirm');
      } else {
        if (pin === firstPIN) {
          savePin(pin);
        } else {
          setError("PINs don't match. Try again.");
          setTimeout(reset, 800);
        }
      }
    },
    [phase, firstPIN, savePin, reset],
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (currentInput.length >= PIN_LENGTH) return;
      const next = currentInput + digit;
      setCurrentInput(next);
      setError('');
      if (next.length === PIN_LENGTH) {
        setTimeout(() => handleComplete(next), 150);
      }
    },
    [currentInput, handleComplete],
  );

  const handleDelete = useCallback(() => {
    setCurrentInput((prev) => prev.slice(0, -1));
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
            {phase === 'create' ? 'Create your PIN' : 'Confirm your PIN'}
          </ThemedText>
          <ThemedText variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            {phase === 'create'
              ? 'Set a 4-digit PIN to secure your app.'
              : 'Enter your PIN again to confirm.'}
          </ThemedText>
        </View>

        <PINDots filled={currentInput.length} error={!!error} />

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
});