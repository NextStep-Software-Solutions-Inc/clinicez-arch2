import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import { useSignUp } from '@clerk/expo';
import ThemedText from '@ui/ThemedText';

export default function SignupScreenWeb() {
  const navigation = useNavigation<any>();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { colors, dark: isDark } = useTheme();

  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLoading = fetchStatus === 'fetching';

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
          <ThemedText style={[styles.title, { color: colors.text }]}>Create your account</ThemedText>
          <ThemedText style={[styles.subtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            Join the patient portal to securely manage your health and appointments.
          </ThemedText>
        </View>

        {/* Global Error Banner */}
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
          {/* First Name Field */}
          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: colors.text }]}>First Name</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  borderColor: isDark ? '#334155' : '#CBD5E1',
                  color: colors.text,
                },
              ]}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoComplete="given-name"
              placeholder="e.g. Maria"
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
              returnKeyType="next"
            />
          </View>

          {/* Email Field */}
          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: colors.text }]}>Email Address</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  borderColor: errors?.fields?.emailAddress
                    ? '#EF4444'
                    : isDark
                      ? '#334155'
                      : '#CBD5E1',
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
            {errors?.fields?.emailAddress && (
              <ThemedText style={styles.fieldError}>
                {errors.fields.emailAddress.message}
              </ThemedText>
            )}
          </View>

          {/* Password Field */}
          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: colors.text }]}>Password</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  borderColor: errors?.fields?.password
                    ? '#EF4444'
                    : isDark
                      ? '#334155'
                      : '#CBD5E1',
                  color: colors.text,
                },
              ]}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errorMessage) setErrorMessage(null);
              }}
              secureTextEntry
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
              returnKeyType="done"
              onSubmitEditing={handleSignUp}
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
            onPress={handleSignUp}
            disabled={!email || !password || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.ctaText}>Create Account →</ThemedText>
            )}
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            Already have an account?{' '}
          </ThemedText>
          <Pressable
            onPress={() => navigation.navigate('Auth', { screen: 'Login' })}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <ThemedText style={styles.signInLink}>Sign In</ThemedText>
          </Pressable>
        </View>
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
  signInLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3B82F6',
  },
});
