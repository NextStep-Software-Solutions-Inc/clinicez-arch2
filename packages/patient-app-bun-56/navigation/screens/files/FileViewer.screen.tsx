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
import { useAuth as useClerkAuth } from '@clerk/expo';
import { usePatientId } from 'hooks/usePatientId';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { cleanupPreviewCache, preparePreviewFile, getFileById, deleteItem, renameFile } from '../../../services/files';
import type { PreparedPreviewFile } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import RenameModal from '../../../components/ui/RenameModal';
import CustomAlertModal from '../../../components/ui/CustomAlertModal';

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
  const { getToken } = useClerkAuth();
  const { fileId } = route.params;
  const [preview, setPreview] = useState<PreparedPreviewFile | null>(null);
  const [fileMetadata, setFileMetadata] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  
  const insets = useSafeAreaInsets();
  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight?.() || 96; } catch (e) { tabBarHeight = 96; }

  useEffect(() => {
    let mounted = true;
    Promise.all([
      preparePreviewFile(patientId, fileId, getToken),
      getFileById(patientId, fileId)
    ])
      .then(([previewRes, fileRes]) => {
        if (!mounted) return;
        setPreview(previewRes);
        setFileMetadata(fileRes);
        navigation.setOptions({ title: fileRes?.name || previewRes.name });
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Unable to open this preview.');
      });

    return () => {
      mounted = false;
      cleanupPreviewCache(patientId, fileId).catch(() => {});
    };
  }, [fileId, navigation, patientId, getToken]);

  const handleShare = async () => {
    if (!preview) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('No app available', 'This device cannot share files with other apps.');
        return;
      }
      await runWithAutoLockPaused(() => Sharing.shareAsync(preview.uri, {
        mimeType: preview.mimeType,
        dialogTitle: preview.name,
      }));
    } catch (err) {
      Alert.alert('Could not share file', err instanceof Error ? err.message : 'Unable to share this file.');
    }
  };

  const handleDelete = () => {
    setDeleteModalOpen(true);
  };

  const performDelete = async () => {
    try {
      await deleteItem(patientId, 'file', fileId);
      setDeleteModalOpen(false);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not delete', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleMove = () => {
    if (!fileMetadata) return;
    navigation.navigate('FileMoveScreen', {
      itemKind: 'file',
      itemId: fileId,
      currentFolderId: fileMetadata.folderId
    });
  };

  const handleRename = async (newName: string) => {
    try {
      await renameFile(patientId, fileId, newName);
      setRenameModalOpen(false);
      navigation.setOptions({ title: newName });
      setFileMetadata((prev: any) => ({ ...prev, name: newName }));
    } catch (err) {
      throw err;
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
        ) : preview.previewKind === 'pdf' ? (
          <Pdf source={{ uri: preview.uri }} style={styles.pdf} trustAllCerts={false} />
        ) : (
          <View style={styles.center}>
            {Icon({ android: 'draft', ios: 'doc.fill', color: colors.text, size: 64 })}
            <ThemedText style={[styles.errorTitle, { marginTop: 16 }]}>Preview not available</ThemedText>
            <ThemedText style={[styles.errorText, { color: colors.text, marginTop: 8 }]}>
              This file type cannot be previewed within the app. You can share it to open it in another app.
            </ThemedText>
          </View>
        )}
      </View>
      <View style={[styles.floatingToolbarWrap, { paddingBottom: Math.max(insets.bottom, tabBarHeight) + 24 }]}>
        <View style={[styles.floatingToolbar, { backgroundColor: colors.card, shadowColor: '#000' }]}>
        <Pressable onPress={handleShare} style={styles.toolbarBtn}>
          {Icon({ android: 'share', ios: 'square.and.arrow.up', color: colors.text, size: 22 })}
          <ThemedText style={styles.toolbarLabel}>Share</ThemedText>
        </Pressable>
        <Pressable onPress={handleMove} style={styles.toolbarBtn}>
          {Icon({ android: 'drive_file_move', ios: 'folder', color: colors.text, size: 22 })}
          <ThemedText style={styles.toolbarLabel}>Move</ThemedText>
        </Pressable>
        <Pressable onPress={() => setRenameModalOpen(true)} style={styles.toolbarBtn}>
          {Icon({ android: 'edit', ios: 'pencil', color: colors.text, size: 22 })}
          <ThemedText style={styles.toolbarLabel}>Rename</ThemedText>
        </Pressable>
        <Pressable onPress={handleDelete} style={styles.toolbarBtn}>
          {Icon({ android: 'delete', ios: 'trash', color: '#EF4444', size: 22 })}
          <ThemedText style={[styles.toolbarLabel, { color: '#EF4444' }]}>Delete</ThemedText>
        </Pressable>
        </View>
      </View>

      {renameModalOpen && fileMetadata && (
        <RenameModal
          visible={renameModalOpen}
          initialName={fileMetadata.name}
          onClose={() => setRenameModalOpen(false)}
          onSave={handleRename}
        />
      )}

      <CustomAlertModal
        visible={deleteModalOpen}
        title="Delete file?"
        message="This file will be moved to the trash."
        icon="🗑️"
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={performDelete}
        confirmText="Delete"
        destructive={true}
      />
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
  floatingToolbarWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    pointerEvents: 'box-none',
  },
  floatingToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    width: '100%',
    maxWidth: 400,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  toolbarBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 56,
  },
  toolbarLabel: {
    fontSize: 11,
    fontWeight: '700',
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
