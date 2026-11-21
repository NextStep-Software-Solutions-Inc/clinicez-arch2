import React, { useState } from 'react';
import { View } from 'react-native';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuth } from '../../context/AuthContext';
import { useFacilityLicense } from '../FacilityActivationGate';
import { resolveTenantContext } from '@shared/safe';
import { isValidEmail } from '../../services/passwordPolicy';
import { validateWorkstationPassword } from '../../utils/passwordValidation';
import { AuthScreen, ErrorNotice, InfoNotice, authStyles } from './AuthScreen';

export interface AdminRecoveryScreenProps {
  /** Callback to return to the sign-in form */
  onBackToLogin: () => void;
  /** Optional callback fired after successful token persistence */
  onSuccess?: () => void;
  /** Pre-filled email from login screen if entered */
  initialEmail?: string;
}

/**
 * Screen allowing the clinic administrator to recover access using their cryptographic
 * facility license key, resetting credentials and clearing lockouts.
 */
export default function AdminRecoveryScreen({
  onBackToLogin,
  onSuccess,
  initialEmail = '',
}: AdminRecoveryScreenProps) {
  const { recoverAdmin } = useAuth();
  const { license, activeTenant } = useFacilityLicense();

  const [licenseToken, setLicenseToken] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmedLicense = licenseToken.trim();
    const trimmedEmail = email.trim();

    if (!trimmedLicense) {
      setError('Paste the facility license key from your Clinic EZ Portal workspace.');
      return;
    }

    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    const passwordValidation = validateWorkstationPassword(newPassword, confirmPassword);
    if (passwordValidation) {
      setError(passwordValidation);
      return;
    }

    setBusy(true);
    setError(null);

    const currentWorkspace =
      activeTenant || resolveTenantContext().facilitySlug || resolveTenantContext().tenantSlug;

    const failure = await recoverAdmin({
      licenseToken: trimmedLicense,
      email: trimmedEmail || undefined,
      newPassword,
      workspace: currentWorkspace || undefined,
    });

    if (failure) {
      setError(failure);
      setBusy(false);
    } else {
      onSuccess?.();
    }
  };

  return (
    <AuthScreen
      title="Recover administrator account"
      subtitle="Reset credentials for the clinic administrator using the cryptographic facility license key."
      clinicName={license?.clinicName}
      clinicLogo={license?.primaryLogoUrl}
      primaryColor={license?.primaryColorHex}
    >
      <View style={authStyles.form}>
        <InfoNotice message="Authenticate using the cryptographic facility license key generated in your Clinic EZ Portal workspace to reset your credentials." />
        {error ? <ErrorNotice message={error} /> : null}

        <Input
          label="Facility license key"
          value={licenseToken}
          onChangeText={setLicenseToken}
          placeholder="Paste the key from your Clinic EZ Portal workspace"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          numberOfLines={3}
          required
          helperText="Cryptographically authenticates ownership of this facility."
          editable={!busy}
        />

        <Input
          label="Administrator email"
          value={email}
          onChangeText={setEmail}
          placeholder="admin@clinic.example"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="username"
          helperText="If omitted, the license owner email will be used."
          editable={!busy}
        />

        <Input
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="next"
          rightIcon={showPassword ? 'lock' : 'eye'}
          onRightIconPress={() => setShowPassword((v) => !v)}
          required
          helperText="At least 8 characters, with letters and numbers."
          editable={!busy}
        />

        <Input
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={submit}
          required
          editable={!busy}
        />

        <View style={authStyles.actions}>
          <Button
            title="Recover account"
            size="lg"
            icon="shield"
            loading={busy}
            onPress={submit}
            accessibilityLabel="Recover account"
          />
          <Button
            title="Back to sign in"
            variant="ghost"
            size="lg"
            icon="arrowLeft"
            disabled={busy}
            onPress={onBackToLogin}
            accessibilityLabel="Back to sign in"
          />
        </View>
      </View>
    </AuthScreen>
  );
}
