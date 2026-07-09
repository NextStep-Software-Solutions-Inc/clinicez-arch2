import React from 'react';
import { Modal, View, Pressable, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '@react-navigation/native';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';

interface CustomAlertModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  buttonText?: string;
  icon?: string;
  onConfirm?: () => void;
  confirmText?: string;
  destructive?: boolean;
}

const { width } = Dimensions.get('window');

export default function CustomAlertModal({
  visible,
  onClose,
  title,
  message,
  buttonText = 'OK',
  icon = '⚠️',
  onConfirm,
  confirmText = 'Confirm',
  destructive = false,
}: CustomAlertModalProps) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <ThemedView style={[styles.dialog, { backgroundColor: colors.card }]}>
          {/* Icon Wrapper */}
          <View style={[styles.iconWrapper, { backgroundColor: String(colors.primary) + '15' }]}>
            <ThemedText style={styles.icon}>{icon}</ThemedText>
          </View>

          {/* Texts */}
          <ThemedText style={styles.title}>{title}</ThemedText>
          <ThemedText style={[styles.message, { color: String(colors.text) + '99' }]}>
            {message}
          </ThemedText>

          {/* Action Buttons */}
          {onConfirm ? (
            <View style={styles.buttonRow}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.button,
                  styles.flexButton,
                  { backgroundColor: String(colors.text) + '11', opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <ThemedText style={[styles.buttonText, { color: colors.text }]}>Cancel</ThemedText>
              </Pressable>
              
              <Pressable
                onPress={onConfirm}
                style={({ pressed }) => [
                  styles.button,
                  styles.flexButton,
                  { backgroundColor: destructive ? '#EF4444' : colors.primary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <ThemedText style={styles.buttonText}>{confirmText}</ThemedText>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <ThemedText style={styles.buttonText}>{buttonText}</ThemedText>
            </Pressable>
          )}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: Math.min(width - 48, 340),
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  button: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  flexButton: {
    flex: 1,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
