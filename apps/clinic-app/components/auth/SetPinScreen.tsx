import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { biometricAvailable, setPin } from '../../services/offlineUnlock';
import { PIN_LENGTH, isWeakPin } from '../../services/pinCrypto';
import { AuthScreen, ErrorNotice, InfoNotice, authStyles } from './AuthScreen';

/**
 * Native only. Lets a staff member set a PIN (and optionally biometrics) so the device stays usable when the clinic
 * server cannot be reached. Shown once after sign-in and available later under Settings → Security.
 */
export default function SetPinScreen({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [useBiometric, setUseBiometric] = useState(false);
  const [canBiometric, setCanBiometric] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    biometricAvailable().then((available) => {
      setCanBiometric(available);
      setUseBiometric(available);
    });
  }, []);

  const save = async () => {
    if (isWeakPin(pin)) return setError(`Choose a ${PIN_LENGTH}-digit PIN that is not a simple sequence or repeated digit.`);
    if (pin !== confirm) return setError('The two PINs do not match.');
    setBusy(true);
    setError(null);
    try {
      await setPin(pin, useBiometric);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the PIN.');
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title="Work offline securely"
      subtitle="Set a PIN so you can open Clinic EZ on this device when the clinic network is down."
    >
      <View style={authStyles.form}>
        <InfoNotice message="The PIN only unlocks this device offline. Your password is still needed whenever you are online." />
        {error ? <ErrorNotice message={error} /> : null}
        <Input
          label={`${PIN_LENGTH}-digit PIN`}
          value={pin}
          onChangeText={(t) => setPinValue(t.replace(/\D/g, '').slice(0, PIN_LENGTH))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN_LENGTH}
        />
        <Input
          label="Confirm PIN"
          value={confirm}
          onChangeText={(t) => setConfirm(t.replace(/\D/g, '').slice(0, PIN_LENGTH))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN_LENGTH}
        />
        {canBiometric ? (
          <Button
            title={useBiometric ? 'Fingerprint / face unlock: on' : 'Fingerprint / face unlock: off'}
            variant="secondary"
            icon="lock"
            onPress={() => setUseBiometric((v) => !v)}
          />
        ) : null}
        <View style={authStyles.actions}>
          <Button title="Save PIN" size="lg" loading={busy} onPress={save} />
          <Button title="Not now" variant="ghost" onPress={onSkip} disabled={busy} />
        </View>
      </View>
    </AuthScreen>
  );
}
