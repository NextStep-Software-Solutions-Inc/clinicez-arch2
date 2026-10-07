import React, { useState } from 'react';
import { View } from 'react-native';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuth } from '../../context/AuthContext';
import { useFacilityLicense } from '../FacilityActivationGate';
import { isValidEmail, validatePasswordPolicy } from '../../services/passwordPolicy';
import { AuthScreen, ErrorNotice, InfoNotice, authStyles } from './AuthScreen';

/**
 * First start of a freshly activated facility: creates the first administrator.
 * The license key is requested again as proof that the person setting this up controls the facility.
 */
export default function FirstAdminSetupScreen() {
  const { bootstrap } = useAuth();
  const { license } = useFacilityLicense();
  const [licenseToken, setLicenseToken] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const problems = validatePasswordPolicy(password);
    if (!licenseToken.trim()) return setError('Paste the facility license key you activated this clinic with.');
    if (!fullName.trim()) return setError('Enter the administrator’s full name.');
    if (!isValidEmail(email)) return setError('Enter a valid email address. It will be your sign-in name.');
    if (problems.length > 0) return setError(problems.join(' '));
    if (password !== confirm) return setError('The two passwords do not match.');

    setBusy(true);
    setError(null);
    const failure = await bootstrap({ licenseToken, email, password, fullName });
    if (failure) {
      setError(failure);
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title="Create the administrator account"
      subtitle={`${license?.clinicName ?? 'This clinic'} has no users yet. The administrator can then add everyone else.`}
    >
      <View style={authStyles.form}>
        <InfoNotice message="Accounts are stored on your clinic server, so sign-in keeps working without an internet connection." />
        {error ? <ErrorNotice message={error} /> : null}

        <Input
          label="Facility license key"
          value={licenseToken}
          onChangeText={setLicenseToken}
          placeholder="Paste the key from your ClinicEz Portal workspace"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          numberOfLines={3}
          required
        />
        <Input label="Full name" value={fullName} onChangeText={setFullName} textContentType="name" autoComplete="name" required />
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="username"
          required
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          helperText="At least 10 characters, with letters and numbers."
          required
        />
        <Input
          label="Confirm password"
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
        <Button title="Create account and continue" size="lg" loading={busy} onPress={submit} />
      </View>
    </AuthScreen>
  );
}
