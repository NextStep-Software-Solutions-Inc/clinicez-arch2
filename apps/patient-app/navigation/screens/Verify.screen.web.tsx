import React, { useState } from 'react';
import { StyleSheet, View, Pressable, TextInput, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSignIn, useSignUp } from '@clerk/expo';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import Input from '@ui/Input';
import { AppIcon } from '@ui/Icon';
import ClinicEzLogo from '@ui/ClinicEzLogo';

export default function VerifyScreenWeb() {
  const navigation = useNavigation<any>();
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const { unlock } = useAuth();
  const { colors, spacing, radii, sizes, typography } = useAppTheme();

  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmittingUsername, setIsSubmittingUsername] = useState(false);

  const isMFAFlow = signIn?.status === 'needs_client_trust';
  const isMissingRequirements = signUp?.status === 'missing_requirements';
  const isLoading = signInFetchStatus === 'fetching' || signUpFetchStatus === 'fetching' || isSubmittingUsername;

  const handleVerify = async () => {
    if (code.length < 6 || isLoading) return;
    setErrorMessage(null);

    try {
      if (isMFAFlow) {
        const { error } = await signIn!.mfa.verifyEmailCode({ code });
        if (error) {
          setErrorMessage(error.message || 'Invalid verification code.');
          return;
        }
        await signIn!.finalize({
          navigate: async ({ session }) => {
            if (session?.currentTask) return;
            unlock();
          },
        });
      } else {
        const { error: verifyError } = await signUp!.verifications.verifyEmailCode({ code });
        if (verifyError) {
          setErrorMessage(verifyError.message || 'Invalid verification code.');
          return;
        }
        if (signUp?.status === 'complete') {
          await signUp.finalize({
            navigate: async ({ session }) => {
              if (session?.currentTask) return;
              unlock();
            },
          });
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification failed. Please check the code.');
    }
  };

  const handleSetUsername = async () => {
    if (!username.trim() || username.trim().length < 3) {
      setErrorMessage('Username must be at least 3 characters long.');
      return;
    }

    setErrorMessage(null);
    setIsSubmittingUsername(true);

    try {
      const { error: updateError } = await signUp!.update({
        username: username.trim().toLowerCase(),
      });

      if (updateError) {
        setErrorMessage(updateError.message || 'Failed to set username.');
        return;
      }

      if (signUp?.status === 'complete') {
        await signUp.finalize({
          navigate: async ({ session }) => {
            if (session?.currentTask) return;
            unlock();
          },
        });
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update username.');
    } finally {
      setIsSubmittingUsername(false);
    }
  };

  const handleResend = async () => {
    setErrorMessage(null);
    try {
      if (isMFAFlow) {
        await signIn?.mfa.sendEmailCode();
      } else {
        await signUp?.verifications.sendEmailCode();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resend code.');
    }
  };

  const subtitle = isMissingRequirements
    ? 'Please choose a username to finalize your patient account.'
    : isMFAFlow
    ? 'We sent a verification code to your email. Enter it below to continue.'
    : 'We sent a 6-digit code to your email. Enter it below to confirm your account.';

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingVertical: spacing['4xl'],
          paddingHorizontal: spacing.xl,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.cardContainer, { maxWidth: sizes.dialogWidth, gap: spacing.xl }]}>
        {/* Brand Header */}
        <View style={[styles.brandHeader, { gap: spacing.xs }]}>
          <ClinicEzLogo size={52} subtitle="Patient Portal" />
          <ThemedText variant="h1" style={{ textAlign: 'center', marginTop: spacing.xs }}>
            {isMissingRequirements ? 'Choose your username' : 'Check your email'}
          </ThemedText>
          <ThemedText variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            {subtitle}
          </ThemedText>
        </View>

        {/* Global Error Banner */}
        {errorMessage ? (
          <View
            style={[
              styles.errorBanner,
              {
                backgroundColor: colors.emergencyBg,
                borderColor: colors.emergencyBorder,
                borderRadius: radii.md,
                padding: spacing.md,
              },
            ]}
          >
            <ThemedText variant="smallBold" color="emergencyText" style={{ textAlign: 'center' }}>
              {errorMessage}
            </ThemedText>
          </View>
        ) : null}

        {isMissingRequirements ? (
          /* Missing Requirements: Set Username Card */
          <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.lg }]}>
            <Input
              label="Username"
              value={username}
              onChangeText={(v) => {
                setUsername(v.toLowerCase().replace(/[^a-z0-9_.-]/g, ''));
                if (errorMessage) setErrorMessage(null);
              }}
              autoCapitalize="none"
              autoComplete="username"
              placeholder="e.g. mariasantos"
              leftIcon="user"
              hint="Min. 3 characters (letters, numbers, underscores)"
              autoFocus
              onSubmitEditing={handleSetUsername}
              containerStyle={{ marginBottom: 0 }}
            />

            <Button
              label="Complete Registration →"
              variant="primary"
              size="lg"
              fullWidth
              loading={isLoading}
              disabled={username.trim().length < 3 || isLoading}
              onPress={handleSetUsername}
            />
          </Card>
        ) : (
          /* Card: Enter Code */
          <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.lg, alignItems: 'center' }]}>
            <View
              style={[
                styles.iconArea,
                {
                  width: sizes.avatarLg,
                  height: sizes.avatarLg,
                  borderRadius: radii.full,
                  backgroundColor: colors.primaryLight,
                },
              ]}
            >
              <AppIcon name="mail" size={sizes.iconLg} color="primaryText" />
            </View>

            <View style={[styles.field, { gap: spacing.xs }]}>
              <ThemedText variant="smallBold" color="textSecondary" style={{ textAlign: 'center' }}>
                6-Digit Verification Code
              </ThemedText>
              <TextInput
                style={[
                  styles.codeInput,
                  typography.display,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.border,
                    borderRadius: radii.md,
                    borderWidth: sizes.borderWidth,
                    color: colors.text,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.md,
                    outlineStyle: 'none',
                  } as object,
                ]}
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  if (v.length === 6) setTimeout(handleVerify, 150);
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={colors.textLight}
                autoFocus
                onSubmitEditing={handleVerify}
              />
            </View>

            <Button
              label={isMFAFlow ? 'Verify Code' : 'Verify Email'}
              variant="primary"
              size="lg"
              fullWidth
              loading={isLoading}
              disabled={code.length < 6 || isLoading}
              onPress={handleVerify}
            />
          </Card>
        )}

        {!isMissingRequirements ? (
          /* Resend Footer */
          <View style={[styles.footer, { gap: spacing.xs }]}>
            <ThemedText variant="body" color="textSecondary">
              Didn't receive it?{' '}
            </ThemedText>
            <Pressable onPress={handleResend} accessibilityRole="button">
              <ThemedText variant="bodyBold" color="primary">
                Resend code
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        {/* Back to sign in */}
        <Pressable
          onPress={() => navigation.navigate('Auth', { screen: 'Login' })}
          style={[styles.backBtn, { paddingVertical: spacing.sm }]}
          accessibilityRole="button"
        >
          <ThemedText variant="small" color="textMuted">
            ← Back to sign in
          </ThemedText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    width: '100%',
  },
  brandHeader: {
    alignItems: 'center',
  },
  errorBanner: {
    borderWidth: 1,
  },
  card: {
    width: '100%',
  },
  iconArea: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  field: {
    width: '100%',
  },
  codeInput: {
    textAlign: 'center',
    letterSpacing: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtn: {
    alignItems: 'center',
  },
});
