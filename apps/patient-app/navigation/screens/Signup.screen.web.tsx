import React, { useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSignUp } from '@clerk/expo';
import { useAppTheme } from '../../contexts/ThemeContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import Input from '@ui/Input';

export default function SignupScreenWeb() {
  const navigation = useNavigation<any>();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { colors, spacing, radii, sizes } = useAppTheme();

  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLoading = fetchStatus === 'fetching';
  const hasEmailError = errors?.fields?.emailAddress?.message;
  const hasPasswordError = errors?.fields?.password?.message;

  const handleSignUp = async () => {
    if (!email.trim() || !password || isLoading) return;
    setErrorMessage(null);

    const { error } = await signUp.password({
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
            Create your account
          </ThemedText>
          <ThemedText variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            Join the patient portal to securely manage your health and appointments.
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

        {/* Form Card */}
        <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.lg }]}>
          <Input
            label="First Name"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoComplete="given-name"
            placeholder="e.g. Maria"
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
            secureTextEntry
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            error={hasPasswordError}
            hint="Use at least 8 characters with a mix of letters and numbers"
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
            disabled={!email.trim() || !password || isLoading}
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
  logoBadge: {},
  logoText: {
    letterSpacing: 1.5,
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
  backToHomeBtn: {
    alignItems: 'center',
  },
});
