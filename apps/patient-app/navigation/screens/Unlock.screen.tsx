import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { useState, useCallback, useEffect } from 'react';
import { useAuth } from 'contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import NumericKeypad from '@ui/NumericKeypad';

const PIN_LENGTH = 4;
const MAX_BIOMETRIC_ATTEMPTS = 3;

function PINDots({ filled, shaking }: { filled: number; shaking: boolean }) {
  const { colors } = useTheme();
  const dotColor = shaking ? '#EF4444' : (colors.primary ?? '#3B82F6');
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View key={i} style={[styles.dot, { borderColor: dotColor }, i < filled && { backgroundColor: dotColor }]} />
      ))}
    </View>
  );
}

export default function UnlockScreen() {
  const { verifyPin, biometricsEnabled, authenticateWithBiometrics } = useAuth();
  const [currentInput, setCurrentInput] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [biometricFailures, setBiometricFailures] = useState(0);
  const biometricsAvailable = biometricsEnabled && biometricFailures < MAX_BIOMETRIC_ATTEMPTS;

  const triggerBiometrics = useCallback(async () => {
    const result = await authenticateWithBiometrics();
    if (result === 'error') {
      setBiometricFailures(prev => { const next = prev + 1; if (next >= MAX_BIOMETRIC_ATTEMPTS) { setError('Biometrics unavailable. Use your PIN.'); } return next; });
    }
  }, [authenticateWithBiometrics]);

  useEffect(() => { if (biometricsEnabled && biometricFailures === 0) { triggerBiometrics(); } }, []);

  const handleWrongPIN = () => {
    setShaking(true); setError('Incorrect PIN. Try again.');
    setTimeout(() => { setCurrentInput(''); setShaking(false); }, 600);
  };

  const handleDigit = useCallback(async (digit: string) => {
    if (currentInput.length >= PIN_LENGTH || shaking) return;
    const next = currentInput + digit;
    setCurrentInput(next); setError('');
    if (next.length === PIN_LENGTH) {
      setTimeout(async () => {
        const ok = await verifyPin(next);
        if (ok === false) handleWrongPIN();
        // On success, isLocked becomes false → state machine routes to Main
      }, 150);
    }
  }, [currentInput, shaking, verifyPin]);

  const handleDelete = useCallback(() => { if (shaking) return; setCurrentInput(prev => prev.slice(0, -1)); setError(''); }, [shaking]);

  const biometricLabel = Platform.select({ ios: 'Use Face ID', default: 'Use Biometrics' });

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Enter PIN</ThemedText>
        <ThemedText style={styles.subtitle}>Enter your 4-digit PIN to unlock</ThemedText>
      </View>
      <PINDots filled={currentInput.length} shaking={shaking} />
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : <View style={styles.ph} />}
      <NumericKeypad onPress={handleDigit} onDelete={handleDelete} />
      {biometricsAvailable && (
        <Pressable style={({ pressed }) => [styles.biometricBtn, pressed && styles.pressed]} onPress={triggerBiometrics}>
          <ThemedText style={styles.biometricText}>{biometricLabel}</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'space-evenly', alignItems: 'center', paddingVertical: 48 },
  header: { alignItems: 'center', paddingHorizontal: 32, gap: 8 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center', opacity: 0.6 },
  dotsRow: { flexDirection: 'row', gap: 20, justifyContent: 'center' },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  error: { color: '#EF4444', fontSize: 14, textAlign: 'center' },
  ph: { height: 20 },
  biometricBtn: { padding: 12 },
  pressed: { opacity: 0.6 },
  biometricText: { fontSize: 16, color: '#3B82F6', fontWeight: '500' },
});