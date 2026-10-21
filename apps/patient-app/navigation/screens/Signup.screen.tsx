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
import { useSignUp, useSSO } from '@clerk/expo';
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

export default function SignupScreen() {
  const navigation = useNavigation<any>();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { startSSOFlow } = useSSO();
  const { unlock } = useAuth();
  const { colors, spacing, radii, sizes } = useAppTheme();

  const [firstName, setFirstName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSocialLoading, setIsSocialLoading] = useState(false);

  const isLoading = fetchStatus === 'fetching';

  const hasEmailError = errors?.fields?.emailAddress?.message;
  const hasUsernameError = errors?.fields?.username?.message;
  const hasPasswordError = errors?.fields?.password?.message;

  const handleSignUp = async () => {
    if (!email.trim() || !password || !username.trim() || isLoading) return;
    setErrorMessage(null);

    if (username.trim().length < 3) {
      setErrorMessage('Username must be at least 3 characters long.');
      return;
    }

    const { error } = await signUp.password({
      username: username.trim().toLowerCase(),
      emailAddress: email.trim(),
      password,
      ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
    });

    if (error) {
      setErrorMessage(error.message || 'Registration failed. Please check your information.');
      return;
    }

    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) {
      setErrorMessage(sendError.message || 'Failed to send verification code.');
      return;
    }

    navigation.navigate('Auth', { screen: 'Verify' });
  };

  const handleGoogleSignUp = async () => {
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
        setErrorMessage(err?.message || 'Google registration was canceled or failed.');
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
            Create your account
          </ThemedText>
          <ThemedText variant="body" color="textSecondary">
            Join Clinic EZ to securely manage appointments, consultations, and medical records.
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

        {/* Google Social Sign Up */}
        <GoogleSignInButton
          onPress={handleGoogleSignUp}
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
            OR REGISTER WITH EMAIL
          </ThemedText>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Form Card */}
        <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.md }]}>
          <Input
            label="First Name"
            value={firstName}
            onChangeText={(v) => {
              setFirstName(v);
              if (errorMessage) setErrorMessage(null);
            }}
            autoCapitalize="words"
            autoComplete="given-name"
            placeholder="e.g. Maria"
            leftIcon="user"
            containerStyle={{ marginBottom: 0 }}
          />

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
            error={hasUsernameError}
            containerStyle={{ marginBottom: 0 }}
          />

          <Input
            label="Email Address"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (errorMessage) setErrorMessage(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            leftIcon="mail"
            error={hasEmailError}
            containerStyle={{ marginBottom: 0 }}
          />

          <Input
            label="Password"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (errorMessage) setErrorMessage(null);
            }}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            leftIcon="lock"
            hint="Use at least 8 characters with letters & numbers"
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
        </Card>

        {/* Required for Clerk's bot sign-up protection */}
        <View nativeID="clerk-captcha" />

        <Button
          label="Create Account"
          variant="primary"
          size="lg"
          fullWidth
          loading={isLoading}
          disabled={!email.trim() || !username.trim() || !password || isLoading || isSocialLoading}
          onPress={handleSignUp}
        />

        {/* Footer switch to Login */}
        <View style={[styles.footer, { gap: spacing.xs }]}>
          <ThemedText variant="body" color="textSecondary">
            Already have an account?{' '}
          </ThemedText>
          <Pressable
            onPress={() => navigation.navigate('Auth', { screen: 'Login' })}
            accessibilityRole="button"
          >
            <ThemedText variant="bodyBold" color="primary">
              Sign in
            </ThemedText>
          </Pressable>
        </View>

        {/* Clinical Security Safeguard */}
        <View style={[styles.trustRow, { gap: spacing.xs }]}>
          <AppIcon name="shield" size={14} color="textMuted" />
          <ThemedText variant="caption" color="textMuted">
            End-to-end encrypted medical record exchange
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
