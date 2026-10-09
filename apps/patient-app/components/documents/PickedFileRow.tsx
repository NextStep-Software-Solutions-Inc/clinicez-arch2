import React from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import { AppIcon } from '@ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';
import { formatBytes } from '../../services/documents/uploadRules';
import type { PickedFile } from '../../services/documents/filePicker';

interface PickedFileRowProps {
  picked: PickedFile;
  onRemove: () => void;
  disabled?: boolean;
}

export default function PickedFileRow({ picked, onRemove, disabled }: PickedFileRowProps) {
  const { colors, spacing, radii, sizes } = useAppTheme();

  return (
    <View
      style={[
        styles.row,
        {
          gap: spacing.sm,
          padding: spacing.sm,
          borderRadius: radii.md,
          borderWidth: sizes.borderWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceSubtle,
        },
      ]}
    >
      <AppIcon name={picked.file.mimeType === 'application/pdf' ? 'pdf' : 'image'} size={24} color="primaryText" />
      <View style={styles.flex}>
        <ThemedText variant="bodyBold" numberOfLines={1}>
          {picked.file.name}
        </ThemedText>
        {picked.size !== null ? (
          <ThemedText variant="caption" color="textMuted">
            {formatBytes(picked.size)}
          </ThemedText>
        ) : null}
      </View>
      <Button label="Remove" variant="ghost" size="sm" onPress={onRemove} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
