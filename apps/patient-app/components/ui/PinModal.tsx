import { useState, useEffect } from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { useAuth } from 'contexts/AuthContext';
import ThemedText from './ThemedText';
import NumericKeypad from './NumericKeypad';
import { dialog } from '@utils/dialog';

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 3;

interface PinModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onSuccess: () => void;
  onDismiss: () => void;
}

export default function PinModal({ visible, title = 'Enter PIN', subtitle, onSuccess, onDismiss }: PinModalProps) {
  const { colors } = useTheme();
  const { verifyPin } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (visible) {
      setPin('');
      setError('');
      setAttempts(0);
    }
  }, [visible]);

  const handleDigit = (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    setError('');

    if (next.length === PIN_LENGTH) {
      handleVerify(next);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleVerify = async (enteredPin: string) => {
    const ok = await verifyPin(enteredPin);
    if (ok) {
      onSuccess();
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPin('');
      if (newAttempts >= MAX_ATTEMPTS) {
        dialog.alert('Too many attempts', 'Please try again later.', [
          { text: 'OK', onPress: onDismiss },
        ]);
      } else {
        setError(`Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? '' : 's'} remaining.`);
      }
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
       
        {/* Title */}
        <View style={styles.titleSection}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          {subtitle ? (
            <ThemedText style={[styles.subtitle, { color: (colors.text as string) + '80' }]}>{subtitle}</ThemedText>
          ) : null}
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
         <View style={styles.cancel}>
          <Pressable onPress={onDismiss} accessibilityLabel="Cancel" style={{
            padding: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.border,
            width: 200,
            alignItems: 'center',
            justifyContent: 'center',
            
          }}>
            <ThemedText style={[styles.cancelText, { color: colors.text }]}>Cancel</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    position: 'relative',
    paddingTop: 32,
  },
 

  cancelText: {
    fontSize: 16,
  },
  titleSection: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 22,
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
    justifyContent: 'center',
    gap: 20,
    marginVertical: 8,
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
