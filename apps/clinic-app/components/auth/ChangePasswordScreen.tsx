import React, { useState } from 'react';
import { View } from 'react-native';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuth } from '../../context/AuthContext';
import { validatePasswordPolicy } from '../../services/passwordPolicy';
import { AuthScreen, ErrorNotice, InfoNotice, authStyles } from './AuthScreen';

/** Shown when an administrator issued a temporary password: it must be replaced before anything else. */
export default function ChangePasswordScreen() {
  const { changePassword, logout, user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const problems = validatePasswordPolicy(next);
    if (!current) return setError('Enter the temporary password you were given.');
    if (problems.length > 0) return setError(problems.join(' '));
    if (next !== confirm) return setError('The two passwords do not match.');
    if (next === current) return setError('Choose a password different from the temporary one.');

    setBusy(true);
    setError(null);
    const failure = await changePassword(current, next);
    if (failure) {
      setError(failure);
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title="Choose a new password"
      subtitle={user ? `${user.name}, your administrator gave you a temporary password. Set your own to continue.` : undefined}
    >
      <View style={authStyles.form}>
        <InfoNotice message="Only you will know this password. Use at least 10 characters with letters and numbers." />
        {error ? <ErrorNotice message={error} /> : null}
        <Input
          label="Temporary password"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          required
        />
        <Input
          label="New password"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          required
        />
        <Input
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          onSubmitEditing={submit}
          required
        />
        <View style={authStyles.actions}>
          <Button title="Save password" size="lg" loading={busy} onPress={submit} />
          <Button title="Sign out" variant="ghost" onPress={logout} disabled={busy} />
        </View>
      </View>
    </AuthScreen>
  );
}
