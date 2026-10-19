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
import { useSignIn } from '@clerk/expo';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import Input from '@ui/Input';

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { unlock } = useAuth();
  const { colors, spacing } = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isLoading = fetchStatus === 'fetching';

  const hasPasswordError = errors?.fields?.password?.message;
  const hasEmailError = errors?.fields?.identifier?.message;

  const handleSignIn = async () => {
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) return;

    if (signIn.status === 'complete') {
      // Non-MFA login: finalize session, then unlock so state machine routes to Main or SetupPIN
      await signIn.finalize({
        navigate: async ({ session }) => {
          if (session?.currentTask) return;
          unlock();
        },
      });
    } else if (signIn.status === 'needs_client_trust') {
      // MFA required: send email code and navigate to Verify screen
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
          <ThemedText variant="display">Welcome back</ThemedText>
          <ThemedText variant="body" color="textSecondary">
            Sign in to manage your appointments and health records.
          </ThemedText>
        </View>

        <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.md }]}>
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
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              autoCapitalize="none"
              placeholder="••••••••"
              error={hasPasswordError}
              containerStyle={{ marginBottom: 0 }}
            />
          </View>
        </Card>

        <Button
          label="Sign in"
          variant="primary"
          size="lg"
          fullWidth
          loading={isLoading}
          disabled={!email || !password || isLoading}
          onPress={handleSignIn}
        />

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
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});