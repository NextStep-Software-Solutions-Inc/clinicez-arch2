import React, { useState } from 'react';
import { StyleSheet, View, Pressable, TextInput, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSignIn } from '@clerk/expo';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import Input from '@ui/Input';

type Step = 'email' | 'code' | 'password';

const STEPS: Step[] = ['email', 'code', 'password'];
const STEP_LABELS = ['Email', 'Code', 'Password'];

export default function ForgotPasswordScreenWeb() {
  const navigation = useNavigation<any>();
  const { colors, spacing, radii, sizes, typography } = useAppTheme();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { unlock } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isLoading = fetchStatus === 'fetching';
  const currentStepIndex = STEPS.indexOf(step);

  const handleSendCode = async () => {
    if (!email.trim() || isLoading) return;
    setErrorMessage(null);
    const { error: createError } = await signIn.create({ identifier: email.trim() });
    if (createError) {
      setErrorMessage(createError.message || 'Failed to initiate password reset.');
      return;
    }

    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) {
      setErrorMessage(sendError.message || 'Failed to send reset code.');
      return;
    }

    setStep('code');
  };

  const handleVerifyCode = async () => {
    if (code.length < 6 || isLoading) return;
    setErrorMessage(null);
    const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code });
    if (error) {
      setErrorMessage(error.message || 'Invalid reset code.');
      return;
    }
    setStep('password');
  };

  const handleSetPassword = async () => {
    if (!password || isLoading) return;
    setErrorMessage(null);
    const { error } = await signIn.resetPasswordEmailCode.submitPassword({
      password,
      signOutOfOtherSessions: true,
    });
    if (error) {
      setErrorMessage(error.message || 'Failed to set new password.');
      return;
    }

    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ session }) => {
          if (session?.currentTask) return;
          unlock();
        },
      });
    }
  };

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
        <View style={[styles.brandHeader, { gap: spacing.sm }]}>
          <View
            style={[
              styles.logoBadge,
              {
                backgroundColor: colors.primary,
                borderRadius: radii.sm,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
              },
            ]}
          >
            <ThemedText variant="smallBold" color="onPrimary" style={styles.logoText}>
              CLINIC EZ
            </ThemedText>
          </View>
          <ThemedText variant="h1" style={{ textAlign: 'center' }}>
            {step === 'email'
              ? 'Reset your password'
              : step === 'code'
                ? 'Check your email'
                : 'Create new password'}
          </ThemedText>
          <ThemedText variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            {step === 'email'
              ? "Enter your email address and we'll send you a 6-digit recovery code."
              : step === 'code'
                ? `Enter the 6-digit verification code sent to ${email}.`
                : 'Choose a strong new password to protect your account.'}
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

        {/* Step indicator */}
        <View
          style={[
            styles.stepper,
            {
              borderColor: colors.border,
              borderRadius: radii.md,
              backgroundColor: colors.surfaceSubtle,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            },
          ]}
        >
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.stepItem, { gap: spacing.xs }]}>
              <View
                style={[
                  styles.stepDot,
                  {
                    width: sizes.controlSm - 4,
                    height: sizes.controlSm - 4,
                    borderRadius: radii.full,
                    backgroundColor: i <= currentStepIndex ? colors.primary : colors.border,
                  },
                ]}
              >
                <ThemedText
                  variant="captionBold"
                  color={i <= currentStepIndex ? 'onPrimary' : 'textMuted'}
                >
                  {i + 1}
                </ThemedText>
              </View>
              <ThemedText
                variant="smallBold"
                color={i <= currentStepIndex ? 'primary' : 'textMuted'}
              >
                {STEP_LABELS[i]}
              </ThemedText>
              {i < STEPS.length - 1 && (
                <View
                  style={[
                    styles.stepLine,
                    {
                      backgroundColor: i < currentStepIndex ? colors.primary : colors.border,
                      marginHorizontal: spacing.xs,
                    },
                  ]}
                />
              )}
            </View>
          ))}
        </View>

        {/* Card */}
        <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.lg }]}>
          {step === 'email' && (
            <Input
              label="Email Address"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (errorMessage) setErrorMessage(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
              error={errors?.fields?.identifier?.message}
              returnKeyType="done"
              onSubmitEditing={handleSendCode}
              autoFocus
              containerStyle={{ marginBottom: 0 }}
            />
          )}

          {step === 'code' && (
            <View style={{ gap: spacing.xs, alignItems: 'center' }}>
              <ThemedText variant="smallBold" color="textSecondary">
                6-Digit Reset Code
              </ThemedText>
              <TextInput
                style={[
                  styles.codeInput,
                  typography.display,
                  {
                    width: '100%',
                    backgroundColor: colors.inputBackground,
                    borderColor: errors?.fields?.code ? colors.emergency : colors.border,
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
                  if (errorMessage) setErrorMessage(null);
                  if (v.length === 6) setTimeout(handleVerifyCode, 150);
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={colors.textLight}
                autoFocus
                onSubmitEditing={handleVerifyCode}
              />
              {errors?.fields?.code?.message ? (
                <ThemedText variant="small" color="emergencyText">
                  {errors.fields.code.message}
                </ThemedText>
              ) : null}
            </View>
          )}

          {step === 'password' && (
            <Input
              label="New Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (errorMessage) setErrorMessage(null);
              }}
              secureTextEntry
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              error={errors?.fields?.password?.message}
              hint="Must be at least 8 characters with a mix of letters and numbers"
              returnKeyType="done"
              onSubmitEditing={handleSetPassword}
              autoFocus
              containerStyle={{ marginBottom: 0 }}
            />
          )}

          <Button
            label={
              step === 'email'
                ? 'Send Reset Code'
                : step === 'code'
                  ? 'Verify Code'
                  : 'Set New Password'
            }
            variant="primary"
            size="lg"
            fullWidth
            loading={isLoading}
            disabled={
              isLoading ||
              (step === 'email' && !email.trim()) ||
              (step === 'code' && code.length < 6) ||
              (step === 'password' && !password)
            }
            onPress={
              step === 'email'
                ? handleSendCode
                : step === 'code'
                  ? handleVerifyCode
                  : handleSetPassword
            }
          />
        </Card>

        {step === 'code' && (
          <View style={[styles.resendRow, { gap: spacing.xs }]}>
            <ThemedText variant="body" color="textSecondary">
              Didn't receive it?{' '}
            </ThemedText>
            <Pressable onPress={() => signIn.resetPasswordEmailCode.sendCode()} accessibilityRole="button">
              <ThemedText variant="bodyBold" color="primary">
                Resend code
              </ThemedText>
            </Pressable>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            onPress={() => navigation.navigate('Auth', { screen: 'Login' })}
            accessibilityRole="button"
          >
            <ThemedText variant="bodyBold" color="primary">
              Back to sign in
            </ThemedText>
          </Pressable>
        </View>

        {/* Back to overview */}
        <Pressable
          onPress={() => navigation.navigate('Onboarding', { screen: 'Welcome' })}
          style={[styles.backToHomeBtn, { paddingVertical: spacing.sm }]}
          accessibilityRole="button"
        >
          <ThemedText variant="small" color="textMuted">
            ← Back to Clinic EZ overview
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
  logoBadge: {},
  logoText: {
    letterSpacing: 1.5,
  },
  errorBanner: {
    borderWidth: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  stepDot: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepLine: {
    flex: 1,
    maxWidth: 50,
    height: 2,
  },
  card: {
    width: '100%',
  },
  codeInput: {
    textAlign: 'center',
    letterSpacing: 8,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backToHomeBtn: {
    alignItems: 'center',
  },
});
