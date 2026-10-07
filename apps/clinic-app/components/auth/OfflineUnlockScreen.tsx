import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuth } from '../../context/AuthContext';
import { authenticateBiometric, isBiometricEnabled, verifyPin } from '../../services/offlineUnlock';
import { PIN_LENGTH } from '../../services/pinCrypto';
import { AuthScreen, ErrorNotice, InfoNotice, authStyles } from './AuthScreen';

/**
 * Native only. The clinic server cannot be reached, so the cached session is protected by a PIN / biometrics.
 * Unlocking opens the app in offline mode: queued work and cached data, no server round-trips.
 */
export default function OfflineUnlockScreen() {
  const { user, completeUnlock, useDifferentAccount } = useAuth();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometric, setBiometric] = useState(false);

  const tryBiometric = useCallback(async () => {
    if (await authenticateBiometric()) completeUnlock();
  }, [completeUnlock]);

  useEffect(() => {
    let active = true;
    (async () => {
      const enabled = await isBiometricEnabled();
      if (!active) return;
      setBiometric(enabled);
      if (enabled) tryBiometric();
    })();
    return () => {
      active = false;
    };
  }, [tryBiometric]);

  const submit = async (value: string) => {
    if (value.length !== PIN_LENGTH) return;
    setBusy(true);
    setError(null);
    const result = await verifyPin(value);
    if (result.ok) {
      completeUnlock();
      return;
    }
    setPin('');
    setBusy(false);
    if (result.lockedOut) {
      setError('Too many incorrect PINs. Offline access was removed from this device; sign in with your password when connected.');
      await useDifferentAccount();
      return;
    }
    setError(`Incorrect PIN. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`);
  };

  return (
    <AuthScreen
      title="Unlock ClinicEz"
      subtitle={user ? `${user.name} · working offline` : 'Working offline'}
    >
      <View style={authStyles.form}>
        <InfoNotice message="The clinic server cannot be reached. You can keep working from this device; changes are saved and sent when the connection returns." />
        {error ? <ErrorNotice message={error} /> : null}
        <Input
          label={`${PIN_LENGTH}-digit PIN`}
          value={pin}
          onChangeText={(text) => {
            const digits = text.replace(/\D/g, '').slice(0, PIN_LENGTH);
            setPin(digits);
            if (digits.length === PIN_LENGTH) submit(digits);
          }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN_LENGTH}
          autoFocus
          editable={!busy}
        />
        <View style={authStyles.actions}>
          {biometric ? <Button title="Use fingerprint or face" variant="secondary" icon="lock" onPress={tryBiometric} /> : null}
          <Button title="Sign in with a different account" variant="ghost" onPress={useDifferentAccount} />
        </View>
      </View>
    </AuthScreen>
  );
}
