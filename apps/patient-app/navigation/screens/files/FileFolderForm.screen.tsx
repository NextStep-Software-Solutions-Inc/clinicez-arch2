import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Input from '@ui/Input';
import { AppIcon } from '@ui/Icon';
import Screen from '../../../components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { createFolder, getFolder, renameFolder } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';

export default function FileFolderFormScreen({ route }: FilesScreenProps<'FileFolderFormScreen'>) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const navigation = useNavigation('FileFolderFormScreen');
  const patientId = usePatientId();
  const parentId = route.params?.parentId;
  const folderId = route.params?.folderId;
  const isEdit = !!folderId;
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!folderId) return;
    getFolder(patientId, folderId)
      .then((folder) => setName(folder?.name ?? ''))
      .catch((error) =>
        dialog.alert('Folder not available', error instanceof Error ? error.message : 'Unable to load this folder.')
      );
  }, [folderId, patientId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (folderId) await renameFolder(patientId, folderId, name.trim());
      else await createFolder(patientId, name.trim(), parentId ?? null);
      navigation.goBack();
    } catch (error) {
      dialog.alert('Could not save folder', error instanceof Error ? error.message : 'Unable to save this folder.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen width="form" scroll={false}>
      <View style={[styles.content, { gap: spacing.lg, padding: spacing.xl }]}>
        <View
          style={[
            styles.iconWrap,
            {
              width: sizes.avatarLg,
              height: sizes.avatarLg,
              borderRadius: radii.xl,
              backgroundColor: colors.primaryLight,
            },
          ]}
        >
          <AppIcon name="folderPlus" size={sizes.iconXl} color="primary" />
        </View>

        <ThemedText variant="h2" style={styles.textCenter}>
          {isEdit ? 'Rename folder' : 'New folder'}
        </ThemedText>
        <ThemedText variant="body" color="textSecondary" style={styles.textCenter}>
          {isEdit ? 'Enter a new name for this folder.' : 'Give your folder a descriptive name.'}
        </ThemedText>

        <View style={styles.formArea}>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. Medical records"
            leftIcon="folder"
            autoFocus
            onSubmitEditing={name.trim() && !isSaving ? handleSave : undefined}
          />
        </View>

        <View style={[styles.buttonGroup, { gap: spacing.md }]}>
          <Button
            label={isEdit ? 'Save changes' : 'Create folder'}
            variant="primary"
            fullWidth
            loading={isSaving}
            disabled={!name.trim()}
            onPress={handleSave}
          />
          <Button
            label="Cancel"
            variant="outline"
            fullWidth
            onPress={() => navigation.goBack()}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCenter: {
    textAlign: 'center',
  },
  formArea: {
    width: '100%',
  },
  buttonGroup: {
    width: '100%',
  },
});
