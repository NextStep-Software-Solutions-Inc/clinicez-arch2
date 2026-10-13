import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSignIn } from '@clerk/expo';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import Input from '@ui/Input';
import { useSafeHeaderHeight } from '../../hooks/useSafeHeaderHeight';

type Step = 'email' | 'code' | 'password';

const STEPS: Step[] = ['email', 'code', 'password'];
const STEP_LABELS = ['Email', 'Code', 'Password'];

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const headerHeight = useSafeHeaderHeight();
  const { colors, spacing, radii, sizes, typography } = useAppTheme();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { unlock } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const isLoading = fetchStatus === "fetching";
  const currentStepIndex = STEPS.indexOf(step);

  const handleSendCode = async () => {
    const { error: createError } = await signIn.create({ identifier: email });
    if (createError) return;

    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) return;

    setStep("code");
  };

  const handleVerifyCode = async () => {
    const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code });
    if (error) return;
    setStep("password");
  };

  const handleSetPassword = async () => {
    const { error } = await signIn.resetPasswordEmailCode.submitPassword({
      password,
      signOutOfOtherSessions: true,
    });
    if (error) return;

    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ session }) => {
          if (session?.currentTask) return;
          unlock();
        },
      });
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.xl,
            paddingBottom: spacing['2xl'],
            gap: spacing.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
      >
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

        <View style={[styles.header, { gap: spacing.xs }]}>
          <ThemedText variant="captionBold" color="primary" style={styles.brand}>
            Clinic EZ
          </ThemedText>
          {step === 'email' && (
            <>
              <ThemedText variant="display">Forgot password?</ThemedText>
              <ThemedText variant="body" color="textSecondary">
                Enter your email and we'll send a reset code.
              </ThemedText>
            </>
          )}
          {step === 'code' && (
            <>
              <ThemedText variant="display">Check your email</ThemedText>
              <ThemedText variant="body" color="textSecondary">
                Enter the 6-digit code we sent to {email}.
              </ThemedText>
            </>
          )}
          {step === 'password' && (
            <>
              <ThemedText variant="display">New password</ThemedText>
              <ThemedText variant="body" color="textSecondary">
                Choose a strong password to protect your account.
              </ThemedText>
            </>
          )}
        </View>

        <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.md }]}>
          {step === 'email' && (
            <Input
              label="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
              error={errors?.fields?.identifier?.message}
              autoFocus
              containerStyle={{ marginBottom: 0 }}
            />
          )}

          {step === 'code' && (
            <View style={{ gap: spacing.xs, alignItems: 'center' }}>
              <ThemedText variant="smallBold" color="textSecondary">
                Reset code
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
                  },
                ]}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={colors.textLight}
                autoFocus
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
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              error={errors?.fields?.password?.message}
              hint="Must be at least 8 characters"
              autoFocus
              containerStyle={{ marginBottom: 0 }}
            />
          )}
        </Card>

        <Button
          label={
            step === 'email'
              ? 'Send reset code'
              : step === 'code'
                ? 'Verify code'
                : 'Set new password'
          }
          variant="primary"
          size="lg"
          fullWidth
          loading={isLoading}
          disabled={
            isLoading ||
            (step === 'email' && !email) ||
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

        {step === 'code' && (
          <View style={[styles.resendRow, { gap: spacing.xs }]}>
            <ThemedText variant="body" color="textSecondary">
              Didn't get it?{' '}
            </ThemedText>
            <Pressable onPress={() => signIn.resetPasswordEmailCode.sendCode()} accessibilityRole="button">
              <ThemedText variant="bodyBold" color="primary">
                Resend code
              </ThemedText>
            </Pressable>
          </View>
        )}

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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  scroll: {},
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
  header: {
    marginBottom: 4,
  },
  brand: {
    letterSpacing: 2,
    textTransform: 'uppercase',
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
    marginTop: 4,
  },
});