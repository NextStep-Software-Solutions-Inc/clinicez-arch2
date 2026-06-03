import { useState, useEffect } from 'react';
import { ScrollView, Alert, Platform } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from 'contexts/AuthContext';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';
import PinModal from '@ui/PinModal';

const LOCK_TIMEOUT_OPTIONS = [
  { label: 'Immediately', value: 0 },
  { label: '30 seconds', value: 30_000 },
  { label: '1 minute', value: 60_000 },
  { label: '5 minutes', value: 300_000 },
  { label: 'Never', value: -1 },
] as const;

type LockTimeoutValue = typeof LOCK_TIMEOUT_OPTIONS[number]['value'];

export default function SecuritySettingsScreen() {
  const navigation = useNavigation();
  const { hasPIN, biometricsEnabled, lockTimeout, setBiometricsEnabled, setLockTimeout, lock } = useAuth();

  const [biometricsSupported, setBiometricsSupported] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pendingBiometricValue, setPendingBiometricValue] = useState<boolean | null>(null);

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
    }
  };

  const handleLockNow = () => {
    lock();
    // navigate() would fail as we'll be routed to LockFlow automatically
  };

  const handleTimeoutSelect = (value: LockTimeoutValue) => {
    if (value === -1) {
      Alert.alert(
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

  const currentTimeoutLabel =
    LOCK_TIMEOUT_OPTIONS.find((o) => o.value === lockTimeout)?.label ?? 'Custom';

  if (!hasPIN) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, gap: 24 }}
      >
        <SettingsSection
          title="PIN Required"
          footer="Set up a PIN first to configure security options."
        >
          <SettingsRow
            title="Set Up PIN"
            icon={{ android: 'lock', ios: 'lock.fill' }}
            iconColor="#3B82F6"
            right={{ type: 'chevron' }}
            onPress={() => navigation.navigate('ChangePINScreen' as never)}
          />
        </SettingsSection>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 0 }}
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
            iconColor="#10B981"
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
          iconColor="#8B5CF6"
          right={{ type: 'chevron' }}
          onPress={() => navigation.navigate('ChangePINScreen' as never)}
        />
        <SettingsRow
          title="Lock App Now"
          icon={{ android: 'lock', ios: 'lock.fill' }}
          iconColor="#6B7280"
          right={{ type: 'none' }}
          onPress={handleLockNow}
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
                ? { type: 'value', label: '✓' }
                : { type: 'none' }
            }
            onPress={() => handleTimeoutSelect(option.value as LockTimeoutValue)}
          />
        ))}
      </SettingsSection>

      <PinModal
        visible={pinModalVisible}
        title="Confirm PIN"
        subtitle={`Enter your PIN to ${pendingBiometricValue ? 'enable' : 'disable'} ${biometricLabel}.`}
        onSuccess={handlePinSuccess}
        onDismiss={() => {
          setPinModalVisible(false);
          setPendingBiometricValue(null);
        }}
      />
    </ScrollView>
  );
}
