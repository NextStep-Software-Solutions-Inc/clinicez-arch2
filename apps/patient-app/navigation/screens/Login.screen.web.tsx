import React, { useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSignIn } from '@clerk/expo';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import Input from '@ui/Input';

export default function LoginScreenWeb() {
  const navigation = useNavigation<any>();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { unlock } = useAuth();
  const { colors, spacing, radii, sizes } = useAppTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLoading = fetchStatus === 'fetching';
  const hasPasswordError = errors?.fields?.password?.message;
  const hasEmailError = errors?.fields?.identifier?.message;

  const handleSignIn = async () => {
    if (!email.trim() || !password || isLoading) return;
    setErrorMessage(null);

    const { error } = await signIn.password({ emailAddress: email.trim(), password });
    if (error) {
      setErrorMessage(error.message || 'Invalid email or password.');
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
            Welcome back
          </ThemedText>
          <ThemedText variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            Sign in to your patient portal to access records and appointments.
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
              secureTextEntry
              autoComplete="current-password"
              autoCapitalize="none"
              placeholder="••••••••"
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
            disabled={!email.trim() || !password || isLoading}
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
  backToHomeBtn: {
    alignItems: 'center',
  },
});
