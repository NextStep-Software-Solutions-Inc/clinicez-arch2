import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../../contexts/AuthContext';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { usePatientId } from '../../../hooks/usePatientId';
import * as Clipboard from 'expo-clipboard';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';
import PinModal from '@ui/PinModal';
import { regenerateFrk } from '../../../services/files/frkService';
import { dialog } from '@utils/dialog';

const LOCK_TIMEOUT_OPTIONS = [
  { label: 'Immediately', value: 0 },
  { label: '30 seconds', value: 30_000 },
  { label: '1 minute', value: 60_000 },
  { label: '5 minutes', value: 300_000 },
  { label: 'Never', value: -1 },
] as const;

type LockTimeoutValue = (typeof LOCK_TIMEOUT_OPTIONS)[number]['value'];

export default function SecuritySettingsScreenWeb() {
  const navigation = useNavigation<any>();
  const { colors, spacing, sizes } = useAppTheme();
  const { hasPIN, lockTimeout, setLockTimeout, lock } = useAuth();

  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [regenerateFrkPending, setRegenerateFrkPending] = useState(false);

  const { getToken } = useClerkAuth();
  const patientId = usePatientId();

  const handlePinSuccess = async () => {
    setPinModalVisible(false);
    if (regenerateFrkPending) {
      setRegenerateFrkPending(false);
      try {
        const newFrk = await regenerateFrk(patientId, getToken);
        await Clipboard.setStringAsync(newFrk);
        dialog.alert(
          'Recovery Key Regenerated',
          `Your new File Recovery Key is:\n\n${newFrk}\n\nIt has been copied to your clipboard. Please write this down immediately. Your old key will no longer work.`,
        );
      } catch (err: any) {
        dialog.alert('Error', err.message || 'Failed to regenerate Recovery Key.');
      }
    }
  };

  const requestFrkRegeneration = async () => {
    const confirmed = await dialog.confirm({
      title: 'Regenerate Recovery Key?',
      message:
        'This will invalidate your current File Recovery Key. Any backups of the old key will no longer work to recover your files on a new device.\n\nAre you sure you want to proceed?',
      confirmLabel: 'Regenerate',
      destructive: true,
    });
    if (confirmed) {
      setRegenerateFrkPending(true);
      setPinModalVisible(true);
    }
  };

  const handleLockNow = () => {
    lock();
  };

  const handleTimeoutSelect = (value: LockTimeoutValue) => {
    if (value === -1) {
      dialog.alert(
        'Disable auto-lock?',
        'Your app will stay unlocked indefinitely while running. Are you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Disable', style: 'destructive', onPress: () => setLockTimeout(-1) },
        ],
      );
    } else {
      setLockTimeout(value);
    }
  };

  if (!hasPIN) {
    return (
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          maxWidth: sizes.formMaxWidth,
          alignSelf: 'center',
          width: '100%',
        }}
      >
        <SettingsSection
          title="PIN Required"
          footer="Set up a PIN first to configure security options."
        >
          <SettingsRow
            title="Set Up PIN"
            icon={{ android: 'lock', ios: 'lock.fill' }}
            iconColor={colors.primary}
            right={{ type: 'chevron' }}
            onPress={() => navigation.navigate('Main', { screen: 'ChangePINScreen' })}
          />
        </SettingsSection>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{
        padding: spacing.xl,
        maxWidth: sizes.formMaxWidth,
        alignSelf: 'center',
        width: '100%',
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* PIN */}
      <SettingsSection title="PIN">
        <SettingsRow
          title="Change PIN"
          icon={{ android: 'password', ios: 'key.fill' }}
          iconColor={colors.purple}
          right={{ type: 'chevron' }}
          onPress={() => navigation.navigate('Main', { screen: 'ChangePINScreen' })}
        />
        <SettingsRow
          title="Lock App Now"
          icon={{ android: 'lock', ios: 'lock.fill' }}
          iconColor={colors.textMuted}
          right={{ type: 'none' }}
          onPress={handleLockNow}
        />
      </SettingsSection>

      {/* End-to-End Encryption */}
      <SettingsSection
        title="End-to-End Encryption"
        footer="Your File Recovery Key (FRK) is required to restore your encrypted files on a new device."
      >
        <SettingsRow
          title="Regenerate Recovery Key"
          icon={{ android: 'vpn_key', ios: 'key.icloud.fill' }}
          iconColor={colors.warning}
          right={{ type: 'none' }}
          onPress={requestFrkRegeneration}
        />
      </SettingsSection>

      {/* Session */}
      <SettingsSection
        title="Session"
        footer="The web session locks automatically after this period of inactivity."
      >
        {LOCK_TIMEOUT_OPTIONS.map((option) => (
          <SettingsRow
            key={option.value}
            title={option.label}
            right={
              lockTimeout === option.value
                ? { type: 'value', label: 'Active' }
                : { type: 'none' }
            }
            onPress={() => handleTimeoutSelect(option.value as LockTimeoutValue)}
          />
        ))}
      </SettingsSection>

      <PinModal
        visible={pinModalVisible}
        title="Confirm PIN"
        subtitle="Enter your PIN to regenerate your File Recovery Key."
        onSuccess={handlePinSuccess}
        onDismiss={() => {
          setPinModalVisible(false);
          setRegenerateFrkPending(false);
        }}
      />
    </ScrollView>
  );
}
