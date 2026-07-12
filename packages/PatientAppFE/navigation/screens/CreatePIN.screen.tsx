import { View, StyleSheet } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { useState, useCallback } from 'react';
import { useAuth } from 'contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import NumericKeypad from '@ui/NumericKeypad';

const PIN_LENGTH = 4;
type Phase = 'create' | 'confirm';

function PINDots({ filled, error }: { filled: number; error: boolean }) {
  const { colors } = useTheme();
  const dotColor = error ? '#EF4444' : (colors.primary ?? '#3B82F6');
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View key={i} style={[styles.dot, { borderColor: dotColor }, i < filled && { backgroundColor: dotColor }]} />
      ))}
    </View>
  );
}

export default function CreatePINScreen() {
  const { savePin } = useAuth();
  const [phase, setPhase] = useState<Phase>('create');
  const [firstPIN, setFirstPIN] = useState('');
  const [currentInput, setCurrentInput] = useState('');
  const [error, setError] = useState('');

  const reset = () => { setCurrentInput(''); setPhase('create'); setFirstPIN(''); setError(''); };

  const handleComplete = useCallback((pin: string) => {
    if (phase === 'create') { setFirstPIN(pin); setCurrentInput(''); setPhase('confirm'); }
    else { if (pin === firstPIN) { savePin(pin); } else { setError("PINs don't match. Try again."); setTimeout(reset, 800); } }
  }, [phase, firstPIN, savePin]);

  const handleDigit = useCallback((digit: string) => {
    if (currentInput.length >= PIN_LENGTH) return;
    const next = currentInput + digit;
    setCurrentInput(next); setError('');
    if (next.length === PIN_LENGTH) { setTimeout(() => handleComplete(next), 150); }
  }, [currentInput, handleComplete]);

  const handleDelete = useCallback(() => { setCurrentInput(prev => prev.slice(0, -1)); setError(''); }, []);

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <ThemedText style={styles.icon}>🔐</ThemedText>
        <ThemedText style={styles.title}>{phase === 'create' ? 'Create your PIN' : 'Confirm your PIN'}</ThemedText>
        <ThemedText style={styles.subtitle}>{phase === 'create' ? 'Set a 4-digit PIN to secure your app.' : 'Enter your PIN again to confirm.'}</ThemedText>
      </View>
      <PINDots filled={currentInput.length} error={!!error} />
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : <View style={styles.ph} />}
      <NumericKeypad onPress={handleDigit} onDelete={handleDelete} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'space-evenly', alignItems: 'center', paddingVertical: 48 },
  header: { alignItems: 'center', paddingHorizontal: 32, gap: 8 },
  icon: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center', opacity: 0.6 },
  dotsRow: { flexDirection: 'row', gap: 20, justifyContent: 'center' },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  error: { color: '#EF4444', fontSize: 14, textAlign: 'center' },
  ph: { height: 20 },
});