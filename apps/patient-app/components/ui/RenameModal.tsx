import React, { useState, useEffect } from 'react';
import { Modal, View, StyleSheet, Dimensions, TextInput } from 'react-native';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';
import Button from './Button';
import { useAppTheme } from '../../contexts/ThemeContext';

interface RenameModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (newName: string) => void;
  initialName: string;
  title?: string;
}

const { width } = Dimensions.get('window');

export default function RenameModal({
  visible,
  onClose,
  onSave,
  initialName,
  title = 'Rename',
}: RenameModalProps) {
  const { colors, radii, spacing, shadows } = useAppTheme();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (visible) {
      setName(initialName);
    }
  }, [visible, initialName]);

  const canSave = !!name.trim() && name !== initialName;

  const handleSave = () => {
    if (canSave) {
      onSave(name.trim());
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <ThemedView
          style={[
            styles.dialog,
            shadows.lg,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.xl,
              padding: spacing['2xl'],
            },
          ]}
        >
          <ThemedText variant="h2" style={[styles.title, { marginBottom: spacing.lg }]}>
            {title}
          </ThemedText>

          <ThemedView
            style={[
              styles.inputWrap,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderRadius: radii.md,
                marginBottom: spacing.xl,
              },
            ]}
          >
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter new name"
              placeholderTextColor={colors.textMuted}
              autoFocus
              onSubmitEditing={handleSave}
              returnKeyType="done"
              style={[
                styles.input,
                { color: colors.text, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
              ]}
            />
          </ThemedView>

          <View style={[styles.buttonRow, { gap: spacing.md }]}>
            <Button
              label="Cancel"
              variant="outline"
              onPress={onClose}
              style={styles.flexButton}
            />
            <Button
              label="Save"
              variant="primary"
              onPress={handleSave}
              disabled={!canSave}
              style={styles.flexButton}
            />
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: Math.min(width - 48, 380),
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    textAlign: 'center',
  },
  inputWrap: {
    borderWidth: 1,
  },
  input: {
    minHeight: 44,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
  },
  flexButton: {
    flex: 1,
  },
});
