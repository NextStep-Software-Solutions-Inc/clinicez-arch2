import { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import { useAuth } from 'contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import NumericKeypad from '@ui/NumericKeypad';

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
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { verifyPin, savePin } = useAuth();

  const [step, setStep] = useState<Step>('verify');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');

  const { title, subtitle } = STEP_CONFIG[step];

  const handleDigit = (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    setError('');

    if (next.length === PIN_LENGTH) {
      handleFullPin(next);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleFullPin = async (entered: string) => {
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
        Alert.alert('PIN Changed', 'Your PIN has been updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        setPin('');
        setNewPin('');
        setStep('new');
        setError("PINs didn't match. Please start again.");
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Step indicator */}
      <View style={styles.stepsRow}>
        {(['verify', 'new', 'confirm'] as Step[]).map((s, i) => (
          <View
            key={s}
            style={[
              styles.stepDot,
              {
                backgroundColor:
                  s === step
                    ? colors.primary
                    : i < (['verify', 'new', 'confirm'] as Step[]).indexOf(step)
                      ? (colors.primary as string) + '60'
                      : colors.border,
              },
            ]}
          />
        ))}
      </View>

      {/* Title */}
      <View style={styles.titleSection}>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <ThemedText style={[styles.subtitle, { color: (colors.text as string) + '80' }]}>{subtitle}</ThemedText>
      </View>

      {/* Dot indicators */}
      <View style={styles.dotsRow}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i < pin.length ? colors.primary : 'transparent',
                borderColor: i < pin.length ? colors.primary : (colors.text as string) + '40',
              },
            ]}
          />
        ))}
      </View>

      {/* Error message */}
      <View style={styles.errorContainer}>
        {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
      </View>

      {/* Keypad */}
      <NumericKeypad onPress={handleDigit} onDelete={handleDelete} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 32,
    gap: 24,
  },
  stepsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  titleSection: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 20,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  errorContainer: {
    minHeight: 20,
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: -8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
  },
});
