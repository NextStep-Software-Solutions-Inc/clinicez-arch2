import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import { AppIcon } from '@ui/Icon';
import Screen from '../../../components/layout/Screen';
import type { FilesScreenProps } from './navigationTypes';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';

export default function FRKSetupScreen({ route }: FilesScreenProps<'FRKSetupScreen'>) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const navigation = useNavigation();
  const { frk } = route.params;
  const [copied, setCopied] = useState(false);

  const copyToClipboard = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(frk);
      } else {
        await Clipboard.setStringAsync(frk);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await Clipboard.setStringAsync(frk);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [frk]);

  const handleContinue = useCallback(() => {
    dialog.alert(
      'Are you sure?',
      'If you lose this key, you will not be able to recover your encrypted files on a new device. Please make sure you have saved it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'I have saved it', style: 'default', onPress: () => navigation.goBack() },
      ]
    );
  }, [navigation]);

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
          <AppIcon name="key" size={sizes.iconXl} color="primary" />
        </View>

        <ThemedText variant="h2" style={styles.textCenter}>
          File Recovery Key
        </ThemedText>

        <ThemedText variant="body" color="textSecondary" style={styles.textCenter}>
          Your files are end-to-end encrypted. We have generated a unique File Recovery Key (FRK) for you.
          You will need this key to access your files if you log in from a new device.
        </ThemedText>

        <View
          style={[
            styles.keyBox,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.primaryBorder,
              borderWidth: sizes.borderWidth * 2,
              borderRadius: radii.lg,
              padding: spacing.lg,
            },
          ]}
        >
          <ThemedText variant="h2" color="primary" style={styles.keyText} numberOfLines={1}>
            {frk}
          </ThemedText>
        </View>

        <View style={[styles.buttonGroup, { gap: spacing.md }]}>
          <Button
            label={copied ? 'Copied!' : 'Copy to Clipboard'}
            variant="outline"
            icon={copied ? 'check' : 'copy'}
            fullWidth
            onPress={copyToClipboard}
          />
          <Button
            label="I have saved my key"
            variant="primary"
            fullWidth
            onPress={handleContinue}
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
  keyBox: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    letterSpacing: 2,
    textAlign: 'center',
  },
  buttonGroup: {
    width: '100%',
  },
});
