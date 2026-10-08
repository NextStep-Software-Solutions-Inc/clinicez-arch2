import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, StyleSheet, Platform } from 'react-native';
import { useAuth } from 'contexts/AuthContext';
import ThemedText from './ThemedText';
import NumericKeypad from './NumericKeypad';
import Button from './Button';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../contexts/ThemeContext';

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 3;

interface PinModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onSuccess: () => void;
  onDismiss: () => void;
}

export default function PinModal({
  visible,
  title = 'Enter PIN',
  subtitle,
  onSuccess,
  onDismiss,
}: PinModalProps) {
  const { colors, radii, spacing } = useAppTheme();
  const { verifyPin } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const containerRef = useRef<View>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (visible) {
      setPin('');
      setError('');
      setAttempts(0);
    }
  }, [visible]);

  // Elevate container z-index on web
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const el = containerRef.current as unknown as HTMLElement | null;
    if (!el) return;

    const elementsToRestore: Array<{ el: HTMLElement; prevZIndex: string }> = [];
    let curr: HTMLElement | null = el.parentElement;
    while (curr && curr !== document.body) {
      elementsToRestore.push({ el: curr, prevZIndex: curr.style.zIndex });
      curr.style.zIndex = '150000';
      curr = curr.parentElement;
    }

    return () => {
      for (const item of elementsToRestore) {
        item.el.style.zIndex = item.prevZIndex;
      }
    };
  }, [visible]);

  // Web keyboard: Escape to dismiss
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [visible, onDismiss]);

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
        setError(
          `Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? '' : 's'} remaining.`
        );
      }
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View ref={containerRef} style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Title */}
        <View style={styles.titleSection}>
          <ThemedText variant="h2" style={styles.title}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText variant="body" color="textSecondary" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
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
                  borderRadius: radii.full,
                  backgroundColor: i < pin.length ? colors.primary : 'transparent',
                  borderColor: i < pin.length ? colors.primary : colors.borderDark,
                },
              ]}
            />
          ))}
        </View>

        {/* Error message */}
        <View style={styles.errorContainer}>
          {error ? (
            <ThemedText variant="smallBold" color="emergency" style={styles.errorText}>
              {error}
            </ThemedText>
          ) : null}
        </View>

        {/* Keypad */}
        <NumericKeypad onPress={handleDigit} onDelete={handleDelete} />

        <View style={[styles.cancel, { paddingTop: spacing['2xl'] }]}>
          <Button
            label="Cancel"
            variant="outline"
            onPress={onDismiss}
            style={styles.cancelButton}
          />
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
  },
  cancelButton: {
    width: 200,
  },
  titleSection: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
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
    borderWidth: 2,
  },
  errorContainer: {
    minHeight: 20,
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: -8,
  },
  errorText: {
    textAlign: 'center',
  },
});
