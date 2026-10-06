import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import { useSignIn } from '@clerk/expo';
import ThemedText from '@ui/ThemedText';
import { useAuth } from 'contexts/AuthContext';

export default function LoginScreenWeb() {
  const navigation = useNavigation<any>();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { unlock } = useAuth();
  const { colors, dark: isDark } = useTheme();
  const { width } = useWindowDimensions();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLoading = fetchStatus === 'fetching';
  const hasPasswordError = !!errors?.fields?.password;
  const hasEmailError = !!errors?.fields?.identifier;

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
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.cardContainer}>
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <View style={styles.logoBadge}>
            <ThemedText style={styles.logoText}>CLINIC EZ</ThemedText>
          </View>
          <ThemedText style={[styles.title, { color: colors.text }]}>Welcome back</ThemedText>
          <ThemedText style={[styles.subtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            Sign in to your patient portal to access records and appointments.
          </ThemedText>
        </View>

        {/* Global Error Banner if any */}
        {errorMessage && (
          <View style={styles.errorBanner}>
            <ThemedText style={styles.errorBannerText}>{errorMessage}</ThemedText>
          </View>
        )}

        {/* Form Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#E2E8F0',
            },
          ]}
        >
          {/* Email Field */}
          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: colors.text }]}>Email Address</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  borderColor: hasEmailError ? '#EF4444' : isDark ? '#334155' : '#CBD5E1',
                  color: colors.text,
                },
              ]}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (errorMessage) setErrorMessage(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
              returnKeyType="next"
            />
            {errors?.fields?.identifier && (
              <ThemedText style={styles.fieldError}>
                {errors.fields.identifier.message}
              </ThemedText>
            )}
          </View>

          {/* Password Field */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <ThemedText style={[styles.label, { color: colors.text }]}>Password</ThemedText>
              <Pressable
                onPress={() => navigation.navigate('Auth', { screen: 'ForgotPassword' })}
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              >
                <ThemedText style={styles.forgotLink}>Forgot password?</ThemedText>
              </Pressable>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  borderColor: hasPasswordError ? '#EF4444' : isDark ? '#334155' : '#CBD5E1',
                  color: colors.text,
                },
              ]}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errorMessage) setErrorMessage(null);
              }}
              secureTextEntry
              autoComplete="current-password"
              autoCapitalize="none"
              placeholder="••••••••"
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
            />
            {errors?.fields?.password && (
              <ThemedText style={styles.fieldError}>
                {errors.fields.password.message}
              </ThemedText>
            )}
          </View>

          {/* Submit Button */}
          <Pressable
            style={({ pressed }) => [
              styles.cta,
              (!email || !password || isLoading) && styles.ctaDisabled,
              pressed && styles.ctaPressed,
            ]}
            onPress={handleSignIn}
            disabled={!email || !password || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.ctaText}>Sign in to Portal →</ThemedText>
            )}
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            Don't have an account?{' '}
          </ThemedText>
          <Pressable
            onPress={() => navigation.navigate('Auth', { screen: 'Signup' })}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <ThemedText style={styles.createAccountLink}>Create account</ThemedText>
          </Pressable>
        </View>

        {/* Back to Landing Page */}
        <Pressable
          onPress={() => navigation.navigate('Onboarding', { screen: 'Welcome' })}
          style={({ pressed }) => [styles.backToHomeBtn, pressed && { opacity: 0.7 }]}
        >
          <ThemedText style={styles.backToHomeText}>← Back to Clinic EZ overview</ThemedText>
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
    paddingVertical: 48,
    paddingHorizontal: 20,
  },
  cardContainer: {
    maxWidth: 440,
    width: '100%',
    gap: 24,
  },
  brandHeader: {
    alignItems: 'center',
    textAlign: 'center',
    gap: 10,
  },
  logoBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 4,
  },
  logoText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: '#EF4444',
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
  },
  errorBannerText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  card: {
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  fieldError: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },
  cta: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 6,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
  },
  createAccountLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3B82F6',
  },
  backToHomeBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  backToHomeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
});
