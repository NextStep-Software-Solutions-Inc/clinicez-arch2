import React, { useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSignIn, useSSO } from '@clerk/expo';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import Input from '@ui/Input';
import { AppIcon } from '@ui/Icon';
import ClinicEzLogo from '@ui/ClinicEzLogo';
import GoogleSignInButton from '@ui/GoogleSignInButton';
import {
  isSignInSecondFactorRequired,
  resolveDefaultSecondFactorStrategy,
  prepareSecondFactorIfNeeded,
} from '../../utils/mfaHelpers';

export default function LoginScreenWeb() {
  const navigation = useNavigation<any>();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { unlock } = useAuth();
  const { colors, spacing, radii, sizes } = useAppTheme();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSocialLoading, setIsSocialLoading] = useState(false);

  const isLoading = fetchStatus === 'fetching';
  const hasPasswordError = errors?.fields?.password?.message;
  const hasIdentifierError = errors?.fields?.identifier?.message;

  const handleSignIn = async () => {
    if (!identifier.trim() || !password || isLoading) return;
    setErrorMessage(null);

    const { error } = await signIn.password({
      identifier: identifier.trim(),
      password,
    });

    if (error) {
      setErrorMessage(error.message || 'Invalid email/username or password.');
      return;
    }

    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: async ({ session }) => {
          if (session?.currentTask) return;
          unlock();
        },
      });
    } else if (
      isSignInSecondFactorRequired(signIn.status) ||
      signIn.status === 'needs_second_factor' ||
      signIn.status === 'needs_client_trust'
    ) {
      const strategy = resolveDefaultSecondFactorStrategy(signIn);
      await prepareSecondFactorIfNeeded(signIn, strategy);
      navigation.navigate('Auth', { screen: 'Verify' });
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsSocialLoading(true);
      setErrorMessage(null);

      const {
        createdSessionId,
        setActive,
        signIn: ssoSignIn,
        signUp: ssoSignUp,
      } = await startSSOFlow({
        strategy: 'oauth_google',
      });

      if (createdSessionId) {
        await setActive!({ session: createdSessionId });
        unlock();
      } else if (isSignInSecondFactorRequired(ssoSignIn?.status ?? signIn?.status)) {
        const mfaSource = ssoSignIn?.status ? ssoSignIn : signIn;
        const strategy = resolveDefaultSecondFactorStrategy(mfaSource);
        await prepareSecondFactorIfNeeded(signIn?.mfa ? signIn : mfaSource, strategy);
        navigation.navigate('Auth', { screen: 'Verify' });
      } else if (ssoSignUp?.status === 'missing_requirements') {
        navigation.navigate('Auth', { screen: 'Verify' });
      }
    } catch (err: any) {
      if (err?.code !== 'ERR_REQUEST_CANCELED') {
        setErrorMessage(err?.message || 'Google sign-in was canceled or failed.');
      }
    } finally {
      setIsSocialLoading(false);
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
      <View style={[styles.cardContainer, { maxWidth: sizes.dialogWidth, gap: spacing.lg }]}>
        {/* Brand Header */}
        <View style={[styles.brandHeader, { gap: spacing.xs }]}>
          <ClinicEzLogo size={52} subtitle="Patient Portal" />
          <ThemedText variant="h1" style={{ textAlign: 'center', marginTop: spacing.xs }}>
            Welcome back
          </ThemedText>
          <ThemedText variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            Sign in to access your appointments, medical records, and digital care.
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

        {/* Social Sign In (Google) */}
        <GoogleSignInButton
          onPress={handleGoogleSignIn}
          loading={isSocialLoading}
          disabled={isLoading}
          label="Continue with Google"
        />

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <ThemedText
            variant="captionBold"
            color="textMuted"
            style={[styles.dividerBadge, { backgroundColor: colors.background, paddingHorizontal: spacing.sm }]}
          >
            OR SIGN IN WITH CREDENTIALS
          </ThemedText>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Form Card */}
        <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.lg }]}>
          <Input
            label="Email or Username"
            value={identifier}
            onChangeText={(text) => {
              setIdentifier(text);
              if (errorMessage) setErrorMessage(null);
            }}
            autoCapitalize="none"
            autoComplete="username"
            placeholder="you@example.com or username"
            leftIcon="user"
            error={hasIdentifierError}
            returnKeyType="next"
            containerStyle={{ marginBottom: 0 }}
          />

          <View style={{ gap: spacing.xs }}>
            <View style={styles.passwordHeader}>
              <ThemedText variant="smallBold" color="textSecondary">
                Password
              </ThemedText>
              <Pressable
                onPress={() => navigation.navigate('Auth', { screen: 'ForgotPassword' })}
                accessibilityRole="button"
              >
                <ThemedText variant="smallBold" color="primary">
                  Forgot password?
                </ThemedText>
              </Pressable>
            </View>
            <Input
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errorMessage) setErrorMessage(null);
              }}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              autoCapitalize="none"
              placeholder="••••••••"
              leftIcon="lock"
              right={
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <AppIcon
                    name={showPassword ? 'eyeOff' : 'eye'}
                    size={sizes.iconMd}
                    color="textMuted"
                  />
                </Pressable>
              }
              error={hasPasswordError}
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
              containerStyle={{ marginBottom: 0 }}
            />
          </View>

          <Button
            label="Sign in to Portal →"
            variant="primary"
            size="lg"
            fullWidth
            loading={isLoading}
            disabled={!identifier.trim() || !password || isLoading || isSocialLoading}
            onPress={handleSignIn}
          />
        </Card>

        {/* Footer */}
        <View style={[styles.footer, { gap: spacing.xs }]}>
          <ThemedText variant="body" color="textSecondary">
            Don't have an account?{' '}
          </ThemedText>
          <Pressable
            onPress={() => navigation.navigate('Auth', { screen: 'Signup' })}
            accessibilityRole="button"
          >
            <ThemedText variant="bodyBold" color="primary">
              Create account
            </ThemedText>
          </Pressable>
        </View>

        {/* Security Reassurance */}
        <View style={[styles.trustRow, { gap: spacing.xs }]}>
          <AppIcon name="shield" size={14} color="textMuted" />
          <ThemedText variant="caption" color="textMuted">
            Protected by end-to-end encryption & Data Privacy Act of 2012 (RA 10173) safeguards
          </ThemedText>
        </View>

        {/* Back to Landing Page */}
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerBadge: {
    letterSpacing: 0.8,
  },
  errorBanner: {
    borderWidth: 1,
  },
  card: {
    width: '100%',
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backToHomeBtn: {
    alignItems: 'center',
  },
});
