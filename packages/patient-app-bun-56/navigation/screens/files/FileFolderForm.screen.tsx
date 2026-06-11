import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MaterialSymbol, SFSymbol, useNavigation, useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { usePatientId } from 'hooks/usePatientId';
import { createFolder, getFolder, renameFolder } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';

const BRAND = '#7C3AED';

export default function FileFolderFormScreen({ route }: FilesScreenProps<'FileFolderFormScreen'>) {
  const { colors, dark } = useTheme();
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
      .catch((error) => Alert.alert('Folder not available', error instanceof Error ? error.message : 'Unable to load this folder.'));
  }, [folderId, patientId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (folderId) await renameFolder(patientId, folderId, name);
      else await createFolder(patientId, name, parentId ?? null);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not save folder', error instanceof Error ? error.message : 'Unable to save this folder.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ThemedView style={[styles.container]}>
      <ThemedView style={styles.content}>
        <ThemedView style={[styles.iconWrap, { backgroundColor: BRAND + '18' }]}>
          {Platform.select({
            android: <MaterialSymbol name="create_new_folder" size={32} color={BRAND} />,
            ios: <SFSymbol name="folder.badge.plus" size={28} color={BRAND} />,
          })}
        </ThemedView>

        <ThemedText style={styles.title}>{isEdit ? 'Rename folder' : 'New folder'}</ThemedText>
        <ThemedText style={[styles.subtitle, { color: colors.text }]}>
          {isEdit ? 'Enter a new name for this folder.' : 'Give your folder a descriptive name.'}
        </ThemedText>

        <ThemedView style={[
          styles.inputWrap,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}>
          {Platform.select({
            android: <MaterialSymbol name="folder" size={20} color={BRAND} />,
            ios: <SFSymbol name="folder.fill" size={17} color={BRAND} />,
          })}
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Medical records"
            placeholderTextColor={colors.text}
            autoFocus
            style={[styles.input, { color: colors.text }]}
          />
        </ThemedView>

        <Pressable
          onPress={handleSave}
          disabled={!name.trim() || isSaving}
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: BRAND, opacity: !name.trim() || isSaving ? 0.45 : pressed ? 0.8 : 1 },
          ]}
        >
          {isSaving ? <ActivityIndicator color="#fff" /> : null}
          <ThemedText style={styles.saveBtnText}>{isEdit ? 'Save changes' : 'Create folder'}</ThemedText>
        </Pressable>

        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 20, opacity: pressed ? 0.7 : 1 }]}
        >
          <ThemedText style={[styles.cancelText, { color: colors.text }]}>Cancel</ThemedText>
        </Pressable>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 12 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, opacity: 0.65, textAlign: 'center', lineHeight: 20 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  input: { flex: 1, fontSize: 16 },
  saveBtn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelText: { fontSize: 15, fontWeight: '600', opacity: 0.65 },
});
