import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import { theme } from '../../constants/theme';
import {
  acceptInvitation,
  getInvitationDetails,
  type ClinicInvitationDetails,
} from '../../services/authSession';
import { AuthScreen, ErrorNotice, InfoNotice, authStyles } from './AuthScreen';
import { validateWorkstationPassword } from '../../utils/passwordValidation';

export interface InvitationAcceptScreenProps {
  token: string;
  onAccepted?: () => void;
  onCancel?: () => void;
}

export default function InvitationAcceptScreen({
  token,
  onAccepted,
  onCancel,
}: InvitationAcceptScreenProps) {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<ClinicInvitationDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const [res, err] = await getInvitationDetails(token);
      if (!mounted) return;
      if (err || !res) {
        setLoadError(err?.message || 'Invitation link was not found or is invalid.');
      } else {
        setDetails(res);
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  const handleSubmit = async () => {
    const validationError = validateWorkstationPassword(password, confirmPassword);
    if (validationError) {
      setActionError(validationError);
      return;
    }

    setSubmitting(true);
    setActionError(null);

    const [, err] = await acceptInvitation(token, password);
    if (err) {
      setActionError(err.message || 'Failed to accept invitation. Please try again.');
      setSubmitting(false);
    } else {
      onAccepted?.();
    }
  };

  if (loading) {
    return (
      <AuthScreen title="Verifying invitation..." subtitle="Please wait while we load your invitation details.">
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </AuthScreen>
    );
  }

  if (loadError || !details) {
    return (
      <AuthScreen
        title="Invalid Invitation"
        subtitle="We could not verify this invitation link."
      >
        <View style={authStyles.form}>
          <ErrorNotice message={loadError || 'This invitation link is invalid or has expired.'} />
          {onCancel ? (
            <Button
              title="Return to Sign In"
              variant="secondary"
              size="lg"
              onPress={onCancel}
            />
          ) : null}
        </View>
      </AuthScreen>
    );
  }

  if (details.isRevoked) {
    return (
      <AuthScreen
        title="Invitation Revoked"
        subtitle={`Your invitation to join ${details.clinicName} has been revoked.`}
        clinicName={details.clinicName}
      >
        <View style={authStyles.form}>
          <ErrorNotice message="This invitation has been revoked by your clinic administrator. Please contact your clinic for assistance." />
          {onCancel ? (
            <Button
              title="Return to Sign In"
              variant="secondary"
              size="lg"
              onPress={onCancel}
            />
          ) : null}
        </View>
      </AuthScreen>
    );
  }

  if (details.isSuspended) {
    return (
      <AuthScreen
        title="Account Suspended"
        subtitle={`Your staff account at ${details.clinicName} is currently suspended.`}
        clinicName={details.clinicName}
      >
        <View style={authStyles.form}>
          <ErrorNotice message="This account is currently suspended. Please contact your clinic administrator." />
          {onCancel ? (
            <Button
              title="Return to Sign In"
              variant="secondary"
              size="lg"
              onPress={onCancel}
            />
          ) : null}
        </View>
      </AuthScreen>
    );
  }

  if (details.isExpired) {
    return (
      <AuthScreen
        title="Invitation Expired"
        subtitle={`Your invitation to join ${details.clinicName} has expired.`}
        clinicName={details.clinicName}
      >
        <View style={authStyles.form}>
          <ErrorNotice message="This invitation link has expired (invitations are valid for 7 days). Please ask your clinic administrator to resend your invitation." />
          {onCancel ? (
            <Button
              title="Return to Sign In"
              variant="secondary"
              size="lg"
              onPress={onCancel}
            />
          ) : null}
        </View>
      </AuthScreen>
    );
  }

  if (details.isAlreadyAccepted) {
    return (
      <AuthScreen
        title="Invitation Accepted"
        subtitle={`You have already accepted your invitation to join ${details.clinicName}.`}
        clinicName={details.clinicName}
      >
        <View style={authStyles.form}>
          <InfoNotice message="This invitation has already been accepted. Sign in with your email and password to access your clinic workstation." />
          {onCancel ? (
            <Button
              title="Sign In to Workstation"
              size="lg"
              onPress={onCancel}
            />
          ) : null}
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Accept Staff Invitation"
      subtitle={`Set your password to join ${details.clinicName}.`}
      clinicName={details.clinicName}
    >
      <View style={authStyles.form}>
        {actionError ? <ErrorNotice message={actionError} /> : null}

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              INVITEE
            </ThemedText>
            <ThemedText variant="bodyBold">
              {details.inviteeFullName}
            </ThemedText>
          </View>

          <View style={styles.summaryRow}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              EMAIL
            </ThemedText>
            <ThemedText variant="body">
              {details.inviteeEmail}
            </ThemedText>
          </View>

          <View style={styles.summaryRow}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              ROLE
            </ThemedText>
            <View style={styles.roleBadgeWrapper}>
              <Badge variant="neutral" label={details.role} />
            </View>
          </View>
        </View>

        <Input
          label="New Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          placeholder="At least 8 characters"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          returnKeyType="next"
          rightIcon={showPassword ? 'lock' : 'eye'}
          onRightIconPress={() => setShowPassword((v) => !v)}
          required
        />

        <Input
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showPassword}
          placeholder="Re-enter password"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          required
        />

        <Button
          title="Accept Invitation & Set Password"
          size="lg"
          loading={submitting}
          onPress={handleSubmit}
        />

        {onCancel ? (
          <Button
            title="Already have an account? Sign in"
            variant="ghost"
            size="sm"
            onPress={onCancel}
          />
        ) : null}
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    paddingVertical: theme.spacing['4xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roleBadgeWrapper: {
    flexDirection: 'row',
  },
});
