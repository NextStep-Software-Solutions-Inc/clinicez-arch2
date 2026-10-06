import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
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
import { AppIcon } from '../../../components/ui/Icon';

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
  const [isFullScreen, setIsFullScreen] = useState(false);

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

  const handleDownloadOrOpen = () => {
    if (!preview) return;
    try {
      window.open(preview.uri, '_blank');
    } catch (err) {
      Alert.alert('Could not open file', err instanceof Error ? err.message : 'Unable to open this file.');
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
          <Image
            source={{ uri: preview.uri }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : preview.previewKind === 'pdf' ? (
          <iframe
            src={preview.uri}
            title={preview.name}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: '#fff',
            } as any}
          />
        ) : (
          <View style={styles.center}>
            <AppIcon name="document" size={64} color={colors.text as string} />
            <ThemedText style={[styles.errorTitle, { marginTop: 16 }]}>Preview not available</ThemedText>
            <ThemedText style={[styles.errorText, { color: colors.text, marginTop: 8 }]}>
              This file type cannot be rendered inline. You can download or open it in a new tab.
            </ThemedText>
          </View>
        )}
      </View>

      {/* Floating Action Toolbar */}
      <View style={[styles.floatingToolbarWrap, { paddingBottom: Math.max(insets.bottom, tabBarHeight) + 24 }]}>
        <View style={[styles.floatingToolbar, { backgroundColor: colors.card, shadowColor: '#000' }]}>
          <Pressable onPress={() => setIsFullScreen(true)} style={styles.toolbarBtn}>
            <AppIcon name="fullscreen" size={20} color={colors.text as string} />
            <ThemedText style={styles.toolbarLabel}>Full Screen</ThemedText>
          </Pressable>

          <Pressable onPress={handleDownloadOrOpen} style={styles.toolbarBtn}>
            <AppIcon name="share" size={20} color={colors.text as string} />
            <ThemedText style={styles.toolbarLabel}>Open / Save</ThemedText>
          </Pressable>

          <Pressable onPress={handleMove} style={styles.toolbarBtn}>
            <AppIcon name="folder" size={20} color={colors.text as string} />
            <ThemedText style={styles.toolbarLabel}>Move</ThemedText>
          </Pressable>

          <Pressable onPress={() => setRenameModalOpen(true)} style={styles.toolbarBtn}>
            <AppIcon name="edit" size={20} color={colors.text as string} />
            <ThemedText style={styles.toolbarLabel}>Rename</ThemedText>
          </Pressable>

          <Pressable onPress={handleDelete} style={styles.toolbarBtn}>
            <AppIcon name="delete" size={20} color="#EF4444" />
            <ThemedText style={[styles.toolbarLabel, { color: '#EF4444' }]}>Delete</ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Full Screen Modal */}
      <Modal visible={isFullScreen} transparent={false} onRequestClose={() => setIsFullScreen(false)} animationType="fade">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ position: 'absolute', top: 20, right: 20, zIndex: 100 }}>
            <Pressable
              onPress={() => setIsFullScreen(false)}
              style={{ padding: 10, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 20, cursor: 'pointer' } as any}
            >
              <AppIcon name="close" size={24} color="#fff" />
            </Pressable>
          </View>
          {preview.previewKind === 'image' ? (
            <Image
              source={{ uri: preview.uri }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          ) : preview.previewKind === 'pdf' ? (
            <iframe
              src={preview.uri}
              title={preview.name}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              } as any}
            />
          ) : null}
        </View>
      </Modal>

      <RenameModal
        visible={renameModalOpen}
        initialName={fileMetadata?.name || preview.name}
        onClose={() => setRenameModalOpen(false)}
        onSave={handleRename}
      />

      <CustomAlertModal
        visible={deleteModalOpen}
        title="Delete File"
        message={`Are you sure you want to delete "${fileMetadata?.name || preview.name}"?`}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={performDelete}
        confirmText="Delete"
        cancelText="Cancel"
        destructive
      />
    </View>
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    position: 'relative',
  },
  previewSurface: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  floatingToolbarWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'box-none' as any,
  },
  floatingToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 30,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    gap: 16,
  },
  toolbarBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    cursor: 'pointer',
  } as any,
  toolbarLabel: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
});
