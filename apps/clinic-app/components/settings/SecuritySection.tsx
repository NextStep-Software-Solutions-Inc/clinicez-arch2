import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import {
  biometricAvailable,
  clearUnlock,
  isBiometricEnabled,
  isUnlockConfigured,
  offlineUnlockSupported,
  setPin,
} from '../../services/offlineUnlock';
import { PIN_LENGTH, isWeakPin } from '../../services/pinCrypto';
import { getOfflineGraceHours } from '../../services/runtimeConfig';

/**
 * Settings -> Security. Native devices only: a PIN (and optionally biometrics) keeps the app usable when the clinic
 * server cannot be reached. Offline use is limited to queued entries and cached reads for the grace period.
 */
export default function SecuritySection() {
  const [configured, setConfigured] = useState(false);
  const [biometric, setBiometric] = useState(false);
  const [canBiometric, setCanBiometric] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [useBiometric, setUseBiometric] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setConfigured(await isUnlockConfigured());
    setBiometric(await isBiometricEnabled());
    const available = await biometricAvailable();
    setCanBiometric(available);
    setUseBiometric(available);
  }, []);

  useEffect(() => {
    if (offlineUnlockSupported) refresh();
  }, [refresh]);

  if (!offlineUnlockSupported) return null;

  const save = async () => {
    if (isWeakPin(pin)) return setError(`Choose a ${PIN_LENGTH}-digit PIN that is not a simple sequence or repeated digit.`);
    if (pin !== confirm) return setError('The two PINs do not match.');
    setBusy(true);
    setError(null);
    try {
      await setPin(pin, useBiometric);
      notify.success('Offline unlock saved.');
      setEditing(false);
      setPinValue('');
      setConfirm('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the PIN.');
    }
    setBusy(false);
  };

  const remove = async () => {
    await clearUnlock();
    notify.success('Offline unlock removed. You will need the server to sign in.');
    await refresh();
  };

  return (
    <Card>
      <CardHeader
        title="Security"
        subtitle={`Offline unlock keeps this device usable for up to ${getOfflineGraceHours()} hours without the clinic server.`}
        rightAction={<Badge label={configured ? (biometric ? 'PIN and biometrics' : 'PIN set') : 'Not set'} variant={configured ? 'success' : 'neutral'} />}
      />
      <CardContent>
        {editing ? (
          <View style={styles.form}>
            {error ? (
              <ThemedText variant="small" color={theme.colors.emergencyText}>
                {error}
              </ThemedText>
            ) : null}
            <Input label={`New ${PIN_LENGTH}-digit PIN`} value={pin} onChangeText={setPinValue} keyboardType="number-pad" secureTextEntry maxLength={PIN_LENGTH} />
            <Input label="Confirm PIN" value={confirm} onChangeText={setConfirm} keyboardType="number-pad" secureTextEntry maxLength={PIN_LENGTH} />
            {canBiometric ? (
              <Button
                title={useBiometric ? 'Biometrics on' : 'Biometrics off'}
                variant="secondary"
                icon={useBiometric ? 'check' : 'close'}
                onPress={() => setUseBiometric((v) => !v)}
              />
            ) : null}
            <View style={styles.row}>
              <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} disabled={busy} />
              <Button title="Save" loading={busy} onPress={save} />
            </View>
          </View>
        ) : (
          <View style={styles.row}>
            <Button title={configured ? 'Change PIN' : 'Set PIN'} icon="key" onPress={() => setEditing(true)} />
            {configured ? <Button title="Remove" variant="secondary" onPress={remove} /> : null}
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
});
