import React, { useState, useEffect } from 'react';
import { Modal, View, Pressable, StyleSheet, Dimensions, TextInput, Platform } from 'react-native';
import { useTheme } from '@react-navigation/native';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';

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
  const { colors } = useTheme();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (visible) {
      setName(initialName);
    }
  }, [visible, initialName]);

  const handleSave = () => {
    onSave(name);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <ThemedView style={[styles.dialog, { backgroundColor: colors.card }]}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          
          <ThemedView style={[
            styles.inputWrap,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter new name"
              placeholderTextColor={String(colors.text) + '66'}
              autoFocus
              style={[styles.input, { color: colors.text }]}
            />
          </ThemedView>

          <View style={styles.buttonRow}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                { backgroundColor: String(colors.text) + '11', opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <ThemedText style={[styles.buttonText, { color: colors.text }]}>Cancel</ThemedText>
            </Pressable>
            
            <Pressable
              onPress={handleSave}
              disabled={!name.trim() || name === initialName}
              style={({ pressed }) => [
                styles.button,
                styles.saveButton,
                { 
                  backgroundColor: colors.primary, 
                  opacity: (!name.trim() || name === initialName) ? 0.5 : (pressed ? 0.8 : 1) 
                },
              ]}
            >
              <ThemedText style={[styles.buttonText, { color: '#fff' }]}>Save</ThemedText>
            </Pressable>
          </View>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
  },
  inputWrap: {
    width: '100%',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    marginBottom: 24,
  },
  input: {
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    
  },
  saveButton: {
    
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
