import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import ThemedText from '../ui/ThemedText';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useFacilityLicense } from '../FacilityActivationGate';
import { clinicService } from '../../services/clinicService';
import { isValidEmail, validatePasswordPolicy } from '../../services/passwordPolicy';
import { AuthScreen, ErrorNotice, InfoNotice, authStyles } from './AuthScreen';

type SetupStep = 'verifyLicense' | 'createAccount';

/**
 * First start of a freshly activated facility: creates the first administrator.
 * Structured as a 2-step process:
 *  - Step 1: Verify facility ownership using the facility license key.
 *  - Step 2: Register the first administrator account (name, email, password).
 */
export default function FirstAdminSetupScreen() {
  const { bootstrap } = useAuth();
  const { license } = useFacilityLicense();
  const [step, setStep] = useState<SetupStep>('verifyLicense');
  const [licenseToken, setLicenseToken] = useState('');
  const [verifiedFacilityName, setVerifiedFacilityName] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const facilityName = verifiedFacilityName ?? license?.clinicName ?? 'This clinic';

  const handleVerifyLicense = async () => {
    const trimmed = licenseToken.trim();
    if (!trimmed) {
      setError('Paste the facility license key from your ClinicEz Portal workspace.');
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const [res, err] = await clinicService.applyLicense(trimmed);
      if (err) {
        setError(err.message || 'The license key does not match this facility or could not be verified.');
        setBusy(false);
        return;
      }
      if (res?.clinicName) {
        setVerifiedFacilityName(res.clinicName);
      }
      setStep('createAccount');
    } catch (e: any) {
      setError(e?.message || 'Failed to verify facility license key.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterAdmin = async () => {
    const problems = validatePasswordPolicy(password);
    if (!fullName.trim()) return setError('Enter the administrator’s full name.');
    if (!isValidEmail(email)) return setError('Enter a valid email address. It will be your sign-in name.');
    if (problems.length > 0) return setError(problems.join(' '));
    if (password !== confirm) return setError('The two passwords do not match.');

    setBusy(true);
    setError(null);
    const failure = await bootstrap({ licenseToken: licenseToken.trim(), email, password, fullName });
    if (failure) {
      setError(failure);
      setBusy(false);
    }
  };

  if (step === 'verifyLicense') {
    return (
      <AuthScreen
        title="Verify facility ownership"
        subtitle={`${facilityName} has no administrator yet. Enter your facility license key to prove you are the authorized owner.`}
      >
        <View style={authStyles.form}>
          <InfoNotice message="Step 1 of 2: Authenticate with the cryptographic license key generated in your ClinicEz Portal workspace." />
          {error ? <ErrorNotice message={error} /> : null}

          <Input
            label="Facility license key"
            value={licenseToken}
            onChangeText={setLicenseToken}
            placeholder="Paste the key from your ClinicEz Portal workspace"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            numberOfLines={4}
            required
            helperText="The key authenticates that the person initializing this clinic is the legitimate administrator."
          />

          <View style={authStyles.actions}>
            <Button
              title="Verify and continue"
              size="lg"
              loading={busy}
              icon="arrowRight"
              onPress={handleVerifyLicense}
            />
          </View>
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Create administrator account"
      subtitle={`Set up the primary administrator for ${facilityName}. The administrator can then add other staff members.`}
    >
      <View style={authStyles.form}>
        <View style={styles.verifiedBanner}>
          <View style={styles.verifiedHeader}>
            <Badge label="Facility ownership verified" variant="success" icon="check" />
            <Button
              title="Change key"
              variant="ghost"
              size="sm"
              onPress={() => {
                setError(null);
                setStep('verifyLicense');
              }}
            />
          </View>
          <ThemedText variant="small" color={theme.colors.textSecondary}>
            Verified for <ThemedText variant="smallBold">{facilityName}</ThemedText>
          </ThemedText>
        </View>

        <InfoNotice message="Step 2 of 2: Accounts are stored locally on your clinic server, so sign-in keeps working without an internet connection." />
        {error ? <ErrorNotice message={error} /> : null}

        <Input
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          textContentType="name"
          autoComplete="name"
          placeholder="e.g. Dr. Maria Santos"
          required
        />
        <Input
          label="Email address"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="username"
          placeholder="admin@clinic.local"
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
          onSubmitEditing={handleRegisterAdmin}
          required
        />

        <View style={authStyles.actions}>
          <Button
            title="Create account and finish"
            size="lg"
            loading={busy}
            onPress={handleRegisterAdmin}
          />
          <Button
            title="Back to license verification"
            variant="secondary"
            size="lg"
            disabled={busy}
            onPress={() => {
              setError(null);
              setStep('verifyLicense');
            }}
          />
        </View>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  verifiedBanner: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  verifiedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
