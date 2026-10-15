import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Card, CardContent, CardHeader } from '../ui/Card';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { theme } from '../../constants/theme';
import { notify, Alert } from '../../utils/feedback';
import { safeAwait } from '@shared/safe';

function getUpdatesModule(): typeof import('expo-updates') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-updates');
  } catch {
    return null;
  }
}

/**
 * Settings Card for inspecting and manually triggering Over-The-Air (OTA) updates.
 * Active on native standalone mobile devices (Android tablets, phones, iOS).
 */
export default function AppUpdatesSettingsCard() {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);

  // In development builds (__DEV__) or web, expo-updates does not query the remote channel
  if (__DEV__ || Platform.OS === 'web') {
    return null;
  }

  const Updates = getUpdatesModule();
  if (!Updates) {
    return null;
  }

  const handleCheckForUpdates = async () => {
    setChecking(true);
    const [result, err] = await safeAwait(Updates.checkForUpdateAsync());
    setChecking(false);

    if (err) {
      notify.error('Unable to check for updates. Please verify your connection.');
      return;
    }

    if (result?.isAvailable) {
      setUpdateAvailable(true);
      notify.info('A new update is available for download.');
    } else {
      setUpdateAvailable(false);
      notify.success('Your app is up to date.');
    }
  };

  const handleDownloadAndRestart = async () => {
    setDownloading(true);
    const [, err] = await safeAwait(Updates.fetchUpdateAsync());
    setDownloading(false);

    if (err) {
      notify.error('Failed to download update. Please try again later.');
      return;
    }

    setUpdateDownloaded(true);
    Alert.alert(
      'Update Ready',
      'The update has been downloaded. Would you like to restart the app to apply the changes now?',
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Restart Now',
          onPress: () => {
            Updates.reloadAsync();
          },
        },
      ],
    );
  };

  const runtimeVersion = typeof Updates.runtimeVersion === 'string' ? Updates.runtimeVersion : '1.0.0';
  const channel = Updates.channel ?? 'production';
  const updateId = Updates.updateId ? `${Updates.updateId.slice(0, 8)}...` : 'Embedded';

  return (
    <Card>
      <CardHeader
        title="App Updates"
        subtitle="Over-the-air updates deliver bug fixes and clinical features without reinstalling."
        rightAction={
          <Badge
            label={updateDownloaded ? 'Ready to Apply' : updateAvailable ? 'Update Available' : 'Up to Date'}
            variant={updateDownloaded ? 'warning' : updateAvailable ? 'info' : 'success'}
          />
        }
      />
      <CardContent>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Release Channel
            </ThemedText>
            <ThemedText variant="smallBold" color={theme.colors.text}>
              {channel}
            </ThemedText>
          </View>
          <View style={styles.metaItem}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Runtime Version
            </ThemedText>
            <ThemedText variant="smallBold" color={theme.colors.text}>
              {runtimeVersion}
            </ThemedText>
          </View>
          <View style={styles.metaItem}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Current Build
            </ThemedText>
            <ThemedText variant="smallBold" color={theme.colors.text}>
              {updateId}
            </ThemedText>
          </View>
        </View>

        <View style={styles.actions}>
          {!updateDownloaded && (
            <Button
              title="Check for Updates"
              icon="refresh"
              variant="secondary"
              loading={checking}
              disabled={checking || downloading}
              onPress={handleCheckForUpdates}
            />
          )}

          {updateAvailable && !updateDownloaded && (
            <Button
              title="Download & Apply Update"
              icon="download"
              variant="primary"
              loading={downloading}
              disabled={downloading}
              onPress={handleDownloadAndRestart}
            />
          )}

          {updateDownloaded && (
            <Button
              title="Restart App to Apply"
              icon="refresh"
              variant="primary"
              onPress={() => Updates.reloadAsync()}
            />
          )}
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    marginBottom: theme.spacing.md,
  },
  metaItem: {
    gap: theme.spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
});
