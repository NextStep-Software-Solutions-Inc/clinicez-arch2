import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import { AppIcon } from '@ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

interface FileDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  fileName: string;
  category?: string | null;
  mimeType?: string | null;
  sizeFormatted?: string | null;
  uploadedAtFormatted?: string | null;
  onRename?: (newName: string) => Promise<void> | void;
}

export default function FileDetailsModal({
  visible,
  onClose,
  fileName,
  category,
  mimeType,
  sizeFormatted,
  uploadedAtFormatted,
  onRename,
}: FileDetailsModalProps) {
  const { colors, radii, spacing, shadows, sizes, fontSizes } = useAppTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(fileName);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setEditedName(fileName);
      setIsEditing(false);
      setIsSaving(false);
    }
  }, [visible, fileName]);

  const handleSaveRename = async () => {
    if (!editedName.trim() || editedName.trim() === fileName) {
      setIsEditing(false);
      return;
    }
    if (onRename) {
      setIsSaving(true);
      try {
        await onRename(editedName.trim());
        setIsEditing(false);
      } finally {
        setIsSaving(false);
      }
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
        >
          <View
            style={[
              styles.dialog,
              shadows.lg,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderLight,
                borderRadius: radii.xl,
                padding: spacing.xl,
                gap: spacing.lg,
              },
            ]}
          >
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View
                  style={[
                    styles.iconBox,
                    { backgroundColor: colors.surfaceSubtle, borderRadius: radii.md },
                  ]}
                >
                  <AppIcon name="info" size={sizes.iconMd} color="primary" />
                </View>
                <ThemedText variant="h3">File Details</ThemedText>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close file details"
                style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
              >
                <AppIcon name="close" size={sizes.iconMd} color="textMuted" />
              </Pressable>
            </View>

            {/* Metadata Rows */}
            <View style={[styles.metaList, { gap: spacing.md }]}>
              {/* File Name Row / Edit Form */}
              <View style={styles.metaRow}>
                <ThemedText variant="caption" color="textMuted">
                  Name
                </ThemedText>
                {isEditing ? (
                  <View style={{ gap: spacing.xs, marginTop: spacing.xxs }}>
                    <TextInput
                      value={editedName}
                      onChangeText={setEditedName}
                      autoFocus
                      selectTextOnFocus
                      returnKeyType="done"
                      onSubmitEditing={handleSaveRename}
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.background,
                          borderColor: colors.primary,
                          borderRadius: radii.md,
                          color: colors.text,
                          padding: spacing.sm,
                          fontSize: fontSizes.md,
                        },
                      ]}
                    />
                    <View style={styles.editActionsRow}>
                      <Button
                        label="Cancel"
                        variant="ghost"
                        size="sm"
                        onPress={() => {
                          setEditedName(fileName);
                          setIsEditing(false);
                        }}
                      />
                      <Button
                        label="Save"
                        variant="primary"
                        size="sm"
                        loading={isSaving}
                        disabled={!editedName.trim() || editedName.trim() === fileName}
                        onPress={handleSaveRename}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.nameDisplayRow}>
                    <ThemedText variant="bodyBold" numberOfLines={2} style={styles.flex}>
                      {fileName}
                    </ThemedText>
                    {onRename ? (
                      <Pressable
                        onPress={() => setIsEditing(true)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Rename file"
                        style={({ pressed }) => [
                          styles.renameAction,
                          {
                            backgroundColor: colors.surfaceSubtle,
                            borderRadius: radii.full,
                          },
                          pressed && styles.btnPressed,
                        ]}
                      >
                        <AppIcon name="edit" size={sizes.iconMd} color="primary" />
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>

              {category ? (
                <View style={styles.metaRow}>
                  <ThemedText variant="caption" color="textMuted">
                    Category
                  </ThemedText>
                  <ThemedText variant="body">{category}</ThemedText>
                </View>
              ) : null}

              {sizeFormatted ? (
                <View style={styles.metaRow}>
                  <ThemedText variant="caption" color="textMuted">
                    Size
                  </ThemedText>
                  <ThemedText variant="body">{sizeFormatted}</ThemedText>
                </View>
              ) : null}

              {mimeType ? (
                <View style={styles.metaRow}>
                  <ThemedText variant="caption" color="textMuted">
                    Type
                  </ThemedText>
                  <ThemedText variant="body">{mimeType}</ThemedText>
                </View>
              ) : null}

              {uploadedAtFormatted ? (
                <View style={styles.metaRow}>
                  <ThemedText variant="caption" color="textMuted">
                    Uploaded
                  </ThemedText>
                  <ThemedText variant="body">{uploadedAtFormatted}</ThemedText>
                </View>
              ) : null}
            </View>

            {/* Footer Action */}
            <View style={styles.footerRow}>
              <Button label="Close" variant="outline" fullWidth onPress={onClose} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  keyboardAvoid: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    width: '100%',
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    padding: 4,
  },
  btnPressed: {
    opacity: 0.6,
  },
  metaList: {
    width: '100%',
  },
  metaRow: {
    gap: 2,
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  renameAction: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    borderWidth: 1,
  },
  editActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  footerRow: {
    width: '100%',
    marginTop: 4,
  },
});
