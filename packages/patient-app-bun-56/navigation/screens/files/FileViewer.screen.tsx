import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ColorValue, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  MaterialSymbol,
  SFSymbol,
  useNavigation,
  useTheme,
  type MaterialSymbolProps,
  type SFSymbolProps,
} from '@react-navigation/native';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
import * as Sharing from 'expo-sharing';
import Pdf from 'react-native-pdf';
import ThemedText from '@ui/ThemedText';
import { usePatientId } from 'hooks/usePatientId';
import { cleanupPreviewCache, preparePreviewFile } from '../../../services/files';
import type { PreparedPreviewFile } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';

function Icon({ android, ios, color, size = 20 }: { android: MaterialSymbolProps["name"]; ios: SFSymbolProps["name"]; color: ColorValue; size?: number }) {
  return Platform.select({
    android: <MaterialSymbol name={android} size={size} color={color} />,
    ios: <SFSymbol name={ios} size={size - 3} color={color} />,
  });
}

export default function FileViewerScreen({ route }: FilesScreenProps<'FileViewerScreen'>) {
  const { colors } = useTheme();
  const navigation = useNavigation('FileViewerScreen');
  const patientId = usePatientId();
  const { runWithAutoLockPaused } = useAppAuth();
  const { fileId } = route.params;
  const [preview, setPreview] = useState<PreparedPreviewFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    preparePreviewFile(patientId, fileId)
      .then((value) => {
        if (!mounted) return;
        setPreview(value);
        navigation.setOptions({ title: value.name });
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Unable to open this preview.');
      });

    return () => {
      mounted = false;
      cleanupPreviewCache(patientId, fileId).catch(() => {});
    };
  }, [fileId, navigation, patientId]);

  const openExternal = async () => {
    if (!preview) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('No app available', 'This device cannot open this file with another app.');
        return;
      }
      await runWithAutoLockPaused(() => Sharing.shareAsync(preview.uri, {
        mimeType: preview.mimeType,
        dialogTitle: preview.name,
      }));
    } catch (err) {
      Alert.alert('Could not open file', err instanceof Error ? err.message : 'Unable to open this file.');
    }
  };

  if (error) {
    return (
      <View style={styles.center}>
        <ThemedText style={styles.errorTitle}>Preview not available</ThemedText>
        <ThemedText style={[styles.errorText, { color: colors.text }]}>{error}</ThemedText>
      </View>
    );
  }

  if (!preview) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <ThemedText style={[styles.errorText, { color: colors.text }]}>Preparing preview...</ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.viewer, { backgroundColor: colors.background }]}>
      <View style={styles.previewSurface}>
        {preview.previewKind === 'image' ? (
          <Image source={{ uri: preview.uri }} resizeMode="contain" style={styles.image} />
        ) : (
          <Pdf source={{ uri: preview.uri }} style={styles.pdf} trustAllCerts={false} />
        )}
      </View>
      <Pressable onPress={openExternal} style={[styles.externalButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {Icon({ android: 'open_in_new', ios: 'square.and.arrow.up', color: colors.primary, size: 20 })}
        <ThemedText style={styles.externalText}>Open with another app</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
  },
  previewSurface: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  pdf: {
    flex: 1,
    width: '100%',
  },
  externalButton: {
    margin: 16,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  externalText: {
    fontSize: 14,
    fontWeight: '800',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.72,
  },
});
