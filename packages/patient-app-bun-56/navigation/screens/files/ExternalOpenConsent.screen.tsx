import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { MaterialSymbol, SFSymbol, useNavigation, useTheme } from '@react-navigation/native';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
import * as Sharing from 'expo-sharing';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { usePatientId } from 'hooks/usePatientId';
import { cleanupPreviewCache, getFileById, preparePreviewFile } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';

const BRAND = '#7C3AED';

export default function ExternalOpenConsentScreen({ route }: FilesScreenProps<'ExternalOpenConsentScreen'>) {
  const { colors, dark } = useTheme();
  const navigation = useNavigation('ExternalOpenConsentScreen');
  const patientId = usePatientId();
  const { runWithAutoLockPaused } = useAppAuth();
  const { fileId } = route.params;
  const [fileName, setFileName] = useState('File');
  const [isOpening, setIsOpening] = useState(false);

  useEffect(() => {
    getFileById(patientId, fileId).then((file) => { if (file?.name) setFileName(file.name); });
    return () => { cleanupPreviewCache(patientId, fileId).catch(() => { }); };
  }, [fileId, patientId]);

  const handleOpen = async () => {
    setIsOpening(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) { Alert.alert('No app available', 'This device cannot open this file with another app.'); return; }
      const preview = await preparePreviewFile(patientId, fileId);
      await runWithAutoLockPaused(() => Sharing.shareAsync(preview.uri, { mimeType: preview.mimeType, dialogTitle: preview.name }));
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not open file', error instanceof Error ? error.message : 'Unable to open this file.');
    } finally { setIsOpening(false); }
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: dark ? '#0F0A1E' : '#F5F3FF' }]}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          {Platform.select({
            android: <MaterialSymbol name="ios_share" size={34} color="#D97706" />,
            ios: <SFSymbol name="square.and.arrow.up" size={30} color="#D97706" />,
          })}
        </View>

        <ThemedText style={styles.title}>Open with another app?</ThemedText>
        <ThemedText style={[styles.body, { color: colors.text }]}>
          <ThemedText style={{ fontWeight: '700', color: colors.text }}>{fileName}</ThemedText>
          {' '}will be shared with the app you choose.
          Only continue if you trust the app.
        </ThemedText>

        <View style={[
          styles.noteCard,
          { backgroundColor: dark ? '#1C1633' : '#FEF3C7', borderColor: '#FCD34D' },
        ]}>
          {Platform.select({
            android: <MaterialSymbol name="warning" size={18} color="#D97706" />,
            ios: <SFSymbol name="exclamationmark.triangle.fill" size={15} color="#D97706" />,
          })}
          <ThemedText style={[styles.noteText, { color: dark ? '#FDE68A' : '#92400E' }]}>
            Shared files may be stored outside ClinicEZ. Share only with trusted apps.
          </ThemedText>
        </View>

        <Pressable
          onPress={handleOpen}
          disabled={isOpening}
          style={({ pressed }) => [styles.openBtn, { backgroundColor: BRAND, opacity: isOpening ? 0.5 : pressed ? 0.8 : 1 }]}
        >
          {isOpening ? <ActivityIndicator color="#fff" /> : null}
          <ThemedText style={styles.openBtnText}>Choose app</ThemedText>
        </Pressable>

        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.cancelBtn,
            { backgroundColor: dark ? '#1C1633' : '#fff', borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <ThemedText style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 14 },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(245,158,11,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21, opacity: 0.72, textAlign: 'center' },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    width: '100%',
  },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19 },
  openBtn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  openBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700' },
});
