import React, { useState, useEffect } from 'react';
import { ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
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

export default function SecuritySettingsScreen() {
  const navigation = useNavigation<any>();
  const { colors, spacing } = useAppTheme();
  const { hasPIN, biometricsEnabled, lockTimeout, setBiometricsEnabled, setLockTimeout, lock } =
    useAuth();

  const [biometricsSupported, setBiometricsSupported] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pendingBiometricValue, setPendingBiometricValue] = useState<boolean | null>(null);
  const [regenerateFrkPending, setRegenerateFrkPending] = useState(false);

  const { getToken } = useClerkAuth();
  const patientId = usePatientId();

  useEffect(() => {
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        setBiometricsSupported(true);
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricLabel(Platform.OS === 'ios' ? 'Face ID' : 'Face Recognition');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricLabel(Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint');
        }
      }
    })();
  }, []);

  const requestBiometricToggle = (value: boolean) => {
    setPendingBiometricValue(value);
    setPinModalVisible(true);
  };

  const handlePinSuccess = async () => {
    setPinModalVisible(false);
    if (pendingBiometricValue !== null) {
      await setBiometricsEnabled(pendingBiometricValue);
      setPendingBiometricValue(null);
    } else if (regenerateFrkPending) {
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
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
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
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: spacing.lg, gap: 0 }}
    >
      {/* Biometrics */}
      {biometricsSupported && (
        <SettingsSection
          title="Biometric Authentication"
          footer={`Use ${biometricLabel} to unlock the app instead of entering your PIN.`}
        >
          <SettingsRow
            title={biometricLabel}
            icon={{
              android: 'fingerprint',
              ios: biometricLabel === 'Face ID' ? 'faceid' : 'touchid',
            }}
            iconColor={colors.success}
            right={{
              type: 'switch',
              value: biometricsEnabled,
              onValueChange: requestBiometricToggle,
            }}
          />
        </SettingsSection>
      )}

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
        footer="The app locks automatically after this period of inactivity in the background."
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
        subtitle={
          regenerateFrkPending
            ? 'Enter your PIN to regenerate your File Recovery Key.'
            : `Enter your PIN to ${pendingBiometricValue ? 'enable' : 'disable'} ${biometricLabel}.`
        }
        onSuccess={handlePinSuccess}
        onDismiss={() => {
          setPinModalVisible(false);
          setPendingBiometricValue(null);
          setRegenerateFrkPending(false);
        }}
      />
    </ScrollView>
  );
}
