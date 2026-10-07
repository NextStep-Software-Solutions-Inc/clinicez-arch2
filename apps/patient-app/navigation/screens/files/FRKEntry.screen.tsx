import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { usePatientId } from 'hooks/usePatientId';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Input from '@ui/Input';
import { AppIcon } from '@ui/Icon';
import Screen from '../../../components/layout/Screen';
import { unlockMakWithFrk } from '../../../services/files/frkService';
import type { FilesScreenProps } from './navigationTypes';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';

export default function FRKEntryScreen({ route }: FilesScreenProps<'FRKEntryScreen'>) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const navigation = useNavigation();
  const patientId = usePatientId();
  const { encryptedMAK } = route.params;
  const [frkInput, setFrkInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFrkChange = (text: string) => {
    const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const formatted = cleaned.match(/.{1,4}/g)?.join('-') || cleaned;
    setFrkInput(formatted.substring(0, 19));
  };

  const handleSubmit = useCallback(async () => {
    const cleaned = frkInput.trim().toUpperCase();
    if (cleaned.replace(/-/g, '').length !== 16) {
      dialog.alert('Invalid Key', 'The Recovery Key should be exactly 16 characters.');
      return;
    }

    setIsSubmitting(true);
    const success = await unlockMakWithFrk(patientId, cleaned, encryptedMAK);
    setIsSubmitting(false);

    if (success) {
      dialog.alert('Success', 'Your files have been successfully unlocked!', [
        { text: 'Continue', onPress: () => navigation.goBack() },
      ]);
    } else {
      dialog.alert('Error', 'The Recovery Key is incorrect. Please try again.');
    }
  }, [frkInput, patientId, encryptedMAK, navigation]);

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
          <AppIcon name="lock" size={sizes.iconXl} color="primary" />
        </View>

        <ThemedText variant="h2" style={styles.textCenter}>
          Unlock Files
        </ThemedText>

        <ThemedText variant="body" color="textSecondary" style={styles.textCenter}>
          Please enter your 16-character File Recovery Key (FRK) to access your end-to-end encrypted files on this device.
        </ThemedText>

        <View style={styles.formArea}>
          <Input
            value={frkInput}
            onChangeText={handleFrkChange}
            placeholder="ABCD-EFGH-IJKL-MNOP"
            leftIcon="key"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={19}
            onSubmitEditing={handleSubmit}
          />
        </View>

        <View style={[styles.buttonGroup, { gap: spacing.md }]}>
          <Button
            label="Unlock Files"
            variant="primary"
            fullWidth
            loading={isSubmitting}
            disabled={frkInput.trim().replace(/-/g, '').length !== 16}
            onPress={handleSubmit}
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
