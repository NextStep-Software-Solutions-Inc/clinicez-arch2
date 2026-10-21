import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSignIn, useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import Input from '@ui/Input';
import { AppIcon } from '@ui/Icon';
import ClinicEzLogo from '@ui/ClinicEzLogo';
import GoogleSignInButton from '@ui/GoogleSignInButton';

// Warm up browser on Android if available
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
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
    } else if (signIn.status === 'needs_client_trust') {
      const emailFactor = signIn.supportedSecondFactors?.find(
        (f) => f.strategy === 'email_code',
      );
      if (emailFactor) {
        await signIn.mfa.sendEmailCode();
        navigation.navigate('Auth', { screen: 'Verify' });
      }
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsSocialLoading(true);
      setErrorMessage(null);

      const { createdSessionId, setActive, signUp: ssoSignUp } = await startSSOFlow({
        strategy: 'oauth_google',
      });

      if (createdSessionId) {
        await setActive!({ session: createdSessionId });
        unlock();
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
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: spacing.xl,
            paddingTop: spacing['2xl'],
            paddingBottom: spacing['2xl'],
            gap: spacing.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Header */}
        <View style={[styles.header, { gap: spacing.xs }]}>
          <ClinicEzLogo size={42} subtitle="Patient Portal" />
          <ThemedText variant="display" style={{ marginTop: spacing.xs }}>
            Welcome back
          </ThemedText>
          <ThemedText variant="body" color="textSecondary">
            Sign in to access your consultations, prescriptions, and records.
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

        {/* Google Social Login */}
        <GoogleSignInButton
          onPress={handleGoogleSignIn}
          loading={isSocialLoading}
          disabled={isLoading}
          label="Continue with Google"
        />

        {/* Hairline Divider */}
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

        {/* Credentials Form Card */}
        <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.md }]}>
          <Input
            label="Email or Username"
            value={identifier}
            onChangeText={(v) => {
              setIdentifier(v);
              if (errorMessage) setErrorMessage(null);
            }}
            autoCapitalize="none"
            autoComplete="username"
            placeholder="you@example.com or username"
            leftIcon="user"
            error={hasIdentifierError}
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
              onChangeText={(v) => {
                setPassword(v);
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
              containerStyle={{ marginBottom: 0 }}
            />
          </View>
        </Card>

        <Button
          label="Sign In"
          variant="primary"
          size="lg"
          fullWidth
          loading={isLoading}
          disabled={!identifier.trim() || !password || isLoading || isSocialLoading}
          onPress={handleSignIn}
        />

        {/* Footer switch to Signup */}
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

        {/* Clinical Security Safeguard */}
        <View style={[styles.trustRow, { gap: spacing.xs }]}>
          <AppIcon name="shield" size={14} color="textMuted" />
          <ThemedText variant="caption" color="textMuted">
            256-bit encrypted health data • HIPAA & PhilHealth compliant
          </ThemedText>
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
  header: {
    marginBottom: 4,
  },
  card: {
    width: '100%',
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
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
    width: '100%',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
});
