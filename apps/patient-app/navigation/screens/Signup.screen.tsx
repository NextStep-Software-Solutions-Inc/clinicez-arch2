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
import { useSignUp } from '@clerk/expo';
import { useAppTheme } from '../../contexts/ThemeContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import Input from '@ui/Input';

export default function SignupScreen() {
  const navigation = useNavigation<any>();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { colors, spacing } = useAppTheme();
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isLoading = fetchStatus === 'fetching';

  const hasEmailError = errors?.fields?.emailAddress?.message;
  const hasPasswordError = errors?.fields?.password?.message;

  const handleSignUp = async () => {
    const { error } = await signUp.password({
      emailAddress: email,
      password,
      ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
    });
    if (error) return;

    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) return;

    navigation.navigate('Auth', { screen: 'Verify' });
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
        <View style={[styles.header, { gap: spacing.xs }]}>
          <ThemedText variant="captionBold" color="primary" style={styles.brand}>
            Clinic EZ
          </ThemedText>
          <ThemedText variant="display">Create account</ThemedText>
          <ThemedText variant="body" color="textSecondary">
            Join to access secure healthcare management from your phone.
          </ThemedText>
        </View>

        <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.md }]}>
          <Input
            label="First name"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoComplete="given-name"
            placeholder="John"
            containerStyle={{ marginBottom: 0 }}
          />

          <Input
            label="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            error={hasEmailError}
            containerStyle={{ marginBottom: 0 }}
          />

          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            error={hasPasswordError}
            containerStyle={{ marginBottom: 0 }}
          />
        </Card>

        {/* Required for Clerk's bot sign-up protection */}
        <View nativeID="clerk-captcha" />

        <Button
          label="Create account"
          variant="primary"
          size="lg"
          fullWidth
          loading={isLoading}
          disabled={!email || !password || isLoading}
          onPress={handleSignUp}
        />

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
  brand: {
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  card: {
    width: '100%',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});