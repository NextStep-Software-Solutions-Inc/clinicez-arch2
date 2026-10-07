import React, { useState } from 'react';
import { View } from 'react-native';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ThemedText from '../ui/ThemedText';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useFacilityLicense } from '../FacilityActivationGate';
import { useConnection } from '../connection/ConnectionGate';
import { isValidEmail } from '../../services/passwordPolicy';
import { AuthScreen, ErrorNotice, InfoNotice, authStyles } from './AuthScreen';

/** Email + password sign-in against the facility's own user store. Works on a LAN with no internet. */
export default function LoginScreen() {
  const { login, notice } = useAuth();
  const { license } = useFacilityLicense();
  const { serverLabel, changeServer } = useConnection();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!isValidEmail(email)) {
      setError('Enter the email address you were registered with.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await login(email, password);
    // On success the auth state changes and this screen unmounts.
    if (failure) {
      setError(failure);
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title="Sign in"
      subtitle={license?.clinicName ? `Welcome to ${license.clinicName}.` : 'Sign in to your clinic workstation.'}
      footer={
        changeServer ? (
          <View>
            <Button
              title={`Server: ${serverLabel}`}
              variant="ghost"
              size="sm"
              icon="wifi"
              onPress={changeServer}
              accessibilityLabel="Change clinic server"
            />
          </View>
        ) : null
      }
    >
      <View style={authStyles.form}>
        {notice ? <InfoNotice message={notice} /> : null}
        {error ? <ErrorNotice message={error} /> : null}

        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@clinic.example"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="username"
          returnKeyType="next"
          required
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={submit}
          rightIcon={showPassword ? 'lock' : 'eye'}
          onRightIconPress={() => setShowPassword((v) => !v)}
          required
        />

        <Button title="Sign in" size="lg" loading={busy} onPress={submit} />
        <ThemedText variant="caption" color={theme.colors.textMuted}>
          Forgot your password? Ask a clinic administrator to issue a temporary one.
        </ThemedText>
      </View>
    </AuthScreen>
  );
}
