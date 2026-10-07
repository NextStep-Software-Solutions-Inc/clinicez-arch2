import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
import { useAuth as useClerkAuth } from '@clerk/expo';
import * as Sharing from 'expo-sharing';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import { AppIcon } from '@ui/Icon';
import Screen from '../../../components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { cleanupPreviewCache, getFileById, preparePreviewFile } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';

export default function ExternalOpenConsentScreen({ route }: FilesScreenProps<'ExternalOpenConsentScreen'>) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const navigation = useNavigation('ExternalOpenConsentScreen');
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { runWithAutoLockPaused } = useAppAuth();
  const { fileId } = route.params;
  const [fileName, setFileName] = useState('File');
  const [isOpening, setIsOpening] = useState(false);

  useEffect(() => {
    getFileById(patientId, fileId).then((file) => {
      if (file?.name) setFileName(file.name);
    });
    return () => {
      cleanupPreviewCache(patientId, fileId).catch(() => {});
    };
  }, [fileId, patientId]);

  const handleAction = async () => {
    setIsOpening(true);
    try {
      if (Platform.OS === 'web') {
        const preview = await preparePreviewFile(patientId, fileId, getToken);
        if (typeof document !== 'undefined') {
          const link = document.createElement('a');
          link.href = preview.uri;
          link.download = preview.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          window.open(preview.uri, '_blank');
        }
        navigation.goBack();
      } else {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          dialog.alert('No app available', 'This device cannot open this file with another app.');
          return;
        }
        const preview = await preparePreviewFile(patientId, fileId, getToken);
        await runWithAutoLockPaused(() =>
          Sharing.shareAsync(preview.uri, { mimeType: preview.mimeType, dialogTitle: preview.name })
        );
        navigation.goBack();
      }
    } catch (error) {
      dialog.alert('Could not open file', error instanceof Error ? error.message : 'Unable to open this file.');
    } finally {
      setIsOpening(false);
    }
  };

  const isWeb = Platform.OS === 'web';

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
              backgroundColor: colors.warningBg,
            },
          ]}
        >
          <AppIcon name={isWeb ? 'download' : 'share'} size={sizes.iconXl} color="warningText" />
        </View>

        <ThemedText variant="h2" style={styles.textCenter}>
          {isWeb ? 'Download file?' : 'Open with another app?'}
        </ThemedText>

        <ThemedText variant="body" color="textSecondary" style={styles.textCenter}>
          <ThemedText variant="bodyBold" color="text">
            {fileName}
          </ThemedText>{' '}
          {isWeb
            ? 'will be downloaded and decrypted to your device.'
            : 'will be shared with the app you choose. Only continue if you trust the app.'}
        </ThemedText>

        <View
          style={[
            styles.noteCard,
            {
              backgroundColor: colors.warningBg,
              borderColor: colors.warningBorder,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.md,
              padding: spacing.md,
              gap: spacing.sm,
            },
          ]}
        >
          <AppIcon name="warning" size={sizes.iconSm} color="warningText" />
          <ThemedText variant="small" color="warningText" style={styles.noteText}>
            Shared files may be stored outside Clinic EZ. Share only with trusted apps.
          </ThemedText>
        </View>

        <View style={[styles.buttonGroup, { gap: spacing.md, marginTop: spacing.md }]}>
          <Button
            label={isWeb ? 'Download' : 'Choose app'}
            variant="primary"
            fullWidth
            loading={isOpening}
            onPress={handleAction}
            icon={isWeb ? 'download' : 'share'}
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
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  noteText: {
    flex: 1,
  },
  buttonGroup: {
    width: '100%',
  },
});
