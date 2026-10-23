import React, { useState, useEffect } from 'react';
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
import {
  type SecondFactorStrategy,
  isSignInSecondFactorRequired,
  getAvailableSecondFactorStrategies,
  resolveDefaultSecondFactorStrategy,
  getSecondFactorSafeIdentifier,
  getSecondFactorStrategyMeta,
  prepareSecondFactorIfNeeded,
} from '../../utils/mfaHelpers';

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
  const [mfaStrategy, setMfaStrategy] = useState<SecondFactorStrategy>(() =>
    resolveDefaultSecondFactorStrategy(signIn),
  );

  const isMFAFlow =
    isSignInSecondFactorRequired(signIn?.status) ||
    signIn?.status === 'needs_second_factor' ||
    signIn?.status === 'needs_client_trust';
  const isMissingRequirements = !isMFAFlow && signUp?.status === 'missing_requirements';
  const isLoading =
    signInFetchStatus === 'fetching' ||
    signUpFetchStatus === 'fetching' ||
    isSubmittingUsername;

  const availableMfaStrategies = getAvailableSecondFactorStrategies(signIn);
  const mfaSafeIdentifier = getSecondFactorSafeIdentifier(signIn, mfaStrategy);
  const mfaMeta = getSecondFactorStrategyMeta(mfaStrategy, mfaSafeIdentifier);
  const isBackupCodeMode = isMFAFlow && mfaStrategy === 'backup_code';
  const canResendCode =
    !isMFAFlow || mfaStrategy === 'phone_code' || mfaStrategy === 'email_code';

  useEffect(() => {
    if (!isMFAFlow) return;
    if (
      availableMfaStrategies.length > 0 &&
      !availableMfaStrategies.some((item) => item.strategy === mfaStrategy)
    ) {
      setMfaStrategy(resolveDefaultSecondFactorStrategy(signIn));
    }
  }, [isMFAFlow, signIn?.status, availableMfaStrategies, mfaStrategy, signIn]);

  const handleVerifyWithCode = async (rawCode?: string) => {
    const submittedCode = typeof rawCode === 'string' ? rawCode : code;
    const minLen = isBackupCodeMode ? 4 : 6;
    if (submittedCode.trim().length < minLen || isLoading) return;
    setErrorMessage(null);

    try {
      if (isMFAFlow) {
        let verifyResult: { error: { message?: string } | null };
        if (mfaStrategy === 'totp') {
          verifyResult = await signIn!.mfa.verifyTOTP({ code: submittedCode.trim() });
        } else if (mfaStrategy === 'phone_code') {
          verifyResult = await signIn!.mfa.verifyPhoneCode({ code: submittedCode.trim() });
        } else if (mfaStrategy === 'backup_code') {
          verifyResult = await signIn!.mfa.verifyBackupCode({ code: submittedCode.trim() });
        } else {
          verifyResult = await signIn!.mfa.verifyEmailCode({ code: submittedCode.trim() });
        }

        if (verifyResult.error) {
          setErrorMessage(verifyResult.error.message || 'Invalid verification code.');
          return;
        }
        if (signIn?.status === 'complete') {
          const { error: finalizeError } = await signIn!.finalize({
            navigate: async ({ session }) => {
              if (session?.currentTask) return;
              unlock();
            },
          });
          if (finalizeError) {
            setErrorMessage(finalizeError.message || 'Failed to finalize sign-in session.');
          }
        } else {
          setErrorMessage('Verification incomplete. Please try again.');
        }
      } else {
        const { error: verifyError } = await signUp!.verifications.verifyEmailCode({
          code: submittedCode.trim(),
        });
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

  const handleVerify = () => handleVerifyWithCode(code);

  const handleSwitchMfaStrategy = async (nextStrategy: SecondFactorStrategy) => {
    if (nextStrategy === mfaStrategy || isLoading) return;
    setErrorMessage(null);
    setCode('');
    setMfaStrategy(nextStrategy);

    try {
      const { error: prepError } = await prepareSecondFactorIfNeeded(signIn, nextStrategy);
      if (prepError) {
        setErrorMessage(prepError.message || 'Failed to send verification code.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to prepare verification method.');
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
        if (mfaStrategy === 'phone_code') {
          const res = await signIn?.mfa.sendPhoneCode();
          if (res?.error) {
            setErrorMessage(res.error.message || 'Failed to resend SMS code.');
          }
        } else if (mfaStrategy === 'email_code') {
          const res = await signIn?.mfa.sendEmailCode();
          if (res?.error) {
            setErrorMessage(res.error.message || 'Failed to resend email code.');
          }
        }
      } else {
        await signUp?.verifications.sendEmailCode();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resend code.');
    }
  };

  const headerTitle = isMissingRequirements
    ? 'Choose your username'
    : isMFAFlow
      ? mfaMeta.title
      : 'Check your email';

  const subtitle = isMissingRequirements
    ? 'Please choose a username to finalize your patient account.'
    : isMFAFlow
      ? mfaMeta.subtitle
      : 'We sent a 6-digit code to your email. Enter it below to confirm your account.';

  const activeIconName = isMFAFlow ? mfaMeta.icon : 'mail';

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
            {headerTitle}
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
              <AppIcon name={activeIconName} size={sizes.iconLg} color="primaryText" />
            </View>

            <View style={[styles.field, { gap: spacing.xs }]}>
              <ThemedText variant="smallBold" color="textSecondary" style={{ textAlign: 'center' }}>
                {isMFAFlow ? mfaMeta.fieldLabel : '6-Digit Verification Code'}
              </ThemedText>
              <TextInput
                style={[
                  styles.codeInput,
                  isBackupCodeMode ? typography.h2 : typography.display,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.border,
                    borderRadius: radii.md,
                    borderWidth: sizes.borderWidth,
                    color: colors.text,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.md,
                    letterSpacing: isBackupCodeMode ? 2 : 8,
                    outlineStyle: 'none',
                  } as object,
                ]}
                value={code}
                onChangeText={(v) => {
                  if (errorMessage) setErrorMessage(null);
                  if (isBackupCodeMode) {
                    setCode(v);
                  } else {
                    const digits = v.replace(/\D/g, '').slice(0, 6);
                    setCode(digits);
                    if (digits.length === 6) {
                      setTimeout(() => handleVerifyWithCode(digits), 150);
                    }
                  }
                }}
                keyboardType={isBackupCodeMode ? 'default' : 'number-pad'}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={isBackupCodeMode ? 32 : 6}
                placeholder={isBackupCodeMode ? 'Enter backup code' : '000000'}
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
              disabled={(isBackupCodeMode ? code.trim().length < 4 : code.length < 6) || isLoading}
              onPress={handleVerify}
            />
          </Card>
        )}

        {!isMissingRequirements && canResendCode ? (
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

        {!isMissingRequirements && isMFAFlow && availableMfaStrategies.length > 1 ? (
          <View style={[styles.strategySection, { gap: spacing.sm }]}>
            <ThemedText
              variant="captionBold"
              color="textMuted"
              style={styles.strategyHeading}
            >
              USE ANOTHER VERIFICATION METHOD
            </ThemedText>
            <View style={[styles.strategyGrid, { gap: spacing.sm }]}>
              {availableMfaStrategies.map((option) => {
                const isSelected = option.strategy === mfaStrategy;
                return (
                  <Pressable
                    key={option.strategy}
                    onPress={() => handleSwitchMfaStrategy(option.strategy)}
                    disabled={isSelected || isLoading}
                    accessibilityRole="button"
                    style={[
                      styles.strategyPill,
                      {
                        borderRadius: radii.md,
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.md,
                        gap: spacing.xs,
                      },
                    ]}
                  >
                    <AppIcon
                      name={option.icon}
                      size={sizes.iconSm}
                      color={isSelected ? 'primary' : 'textSecondary'}
                    />
                    <ThemedText
                      variant="smallBold"
                      color={isSelected ? 'primary' : 'text'}
                    >
                      {option.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
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
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  strategySection: {
    width: '100%',
    alignItems: 'center',
  },
  strategyHeading: {
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  strategyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
  },
  strategyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  backBtn: {
    alignItems: 'center',
  },
});
