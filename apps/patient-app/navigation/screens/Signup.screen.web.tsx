import React, { useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSignUp, useSSO } from '@clerk/expo';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import Input from '@ui/Input';
import { AppIcon } from '@ui/Icon';
import ClinicEzLogo from '@ui/ClinicEzLogo';
import GoogleSignInButton from '@ui/GoogleSignInButton';

export default function SignupScreenWeb() {
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
    if (!email.trim() || !username.trim() || !password || isLoading) return;
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
            Create your account
          </ThemedText>
          <ThemedText variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            Join the patient portal to securely manage your health, prescriptions, and appointments.
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
        <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.lg }]}>
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
            returnKeyType="next"
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
            returnKeyType="next"
            containerStyle={{ marginBottom: 0 }}
          />

          <Input
            label="Email Address"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (errorMessage) setErrorMessage(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            leftIcon="mail"
            error={hasEmailError}
            returnKeyType="next"
            containerStyle={{ marginBottom: 0 }}
          />

          <Input
            label="Password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (errorMessage) setErrorMessage(null);
            }}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            leftIcon="lock"
            error={hasPasswordError}
            hint="Use at least 8 characters with a mix of letters and numbers"
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
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
            containerStyle={{ marginBottom: 0 }}
          />

          {/* Required for Clerk's bot sign-up protection */}
          <View nativeID="clerk-captcha" />

          <Button
            label="Create Account →"
            variant="primary"
            size="lg"
            fullWidth
            loading={isLoading}
            disabled={!email.trim() || !username.trim() || !password || isLoading || isSocialLoading}
            onPress={handleSignUp}
          />
        </Card>

        {/* Footer */}
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

        {/* Security Reassurance */}
        <View style={[styles.trustRow, { gap: spacing.xs }]}>
          <AppIcon name="shield" size={14} color="textMuted" />
          <ThemedText variant="caption" color="textMuted">
            End-to-end encrypted medical record exchange
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
