import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSignIn, useSignUp } from '@clerk/expo';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Card from '@ui/Card';
import { AppIcon } from '@ui/Icon';
import { useSafeHeaderHeight } from '../../hooks/useSafeHeaderHeight';

export default function VerifyScreen() {
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const { unlock } = useAuth();
  const headerHeight = useSafeHeaderHeight();
  const { colors, spacing, radii, sizes, typography } = useAppTheme();
  const [code, setCode] = useState('');

  const isMFAFlow = signIn?.status === 'needs_client_trust';
  const isLoading = signInFetchStatus === 'fetching' || signUpFetchStatus === 'fetching';

  const handleVerify = async () => {
    if (isMFAFlow) {
      await signIn?.mfa.verifyEmailCode({ code });
      await signIn?.finalize({
        navigate: async ({ session }) => {
          if (session?.currentTask) return;
          unlock();
        },
      });
    } else {
      const { error: verifyError } = await signUp!.verifications.verifyEmailCode({ code });
      if (verifyError) return;
      if (signUp?.status === 'complete') {
        await signUp.finalize({
          navigate: async ({ session }) => {
            if (session?.currentTask) return;
            unlock();
          },
        });
      }
    }
  };

  const handleResend = async () => {
    if (isMFAFlow) {
      await signIn?.mfa.sendEmailCode();
    } else {
      await signUp?.verifications.sendEmailCode();
    }
  };

  const subtitle = isMFAFlow
    ? 'We sent a verification code to your email. Enter it below to continue.'
    : 'We sent a 6-digit code to your email. Enter it below to confirm your account.';

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
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
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { gap: spacing.xs }]}>
          <ThemedText variant="captionBold" color="primary" style={styles.brand}>
            Clinic EZ
          </ThemedText>
          <ThemedText variant="display">Check your email</ThemedText>
          <ThemedText variant="body" color="textSecondary" style={styles.subtitle}>
            {subtitle}
          </ThemedText>
        </View>

        <Card padding="lg" elevation="sm" style={[styles.card, { gap: spacing.lg, alignItems: 'center' }]}>
          <View
            style={[
              styles.iconArea,
              {
                width: sizes.avatarLg,
                height: sizes.avatarLg,
                borderRadius: radii.full,
                backgroundColor: colors.primaryLight,
              },
            ]}
          >
            <AppIcon name="mail" size={sizes.iconLg} color="primaryText" />
          </View>

          <View style={[styles.field, { gap: spacing.xs }]}>
            <ThemedText variant="smallBold" color="textSecondary" style={{ textAlign: 'center' }}>
              Verification code
            </ThemedText>
            <TextInput
              style={[
                styles.codeInput,
                typography.display,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                  borderRadius: radii.md,
                  borderWidth: sizes.borderWidth,
                  color: colors.text,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                },
              ]}
              value={code}
              onChangeText={(v) => {
                setCode(v);
                if (v.length === 6) setTimeout(handleVerify, 150);
              }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={colors.textLight}
              autoFocus
            />
          </View>
        </Card>

        <Button
          label={isMFAFlow ? 'Verify' : 'Verify email'}
          variant="primary"
          size="lg"
          fullWidth
          loading={isLoading}
          disabled={code.length < 6 || isLoading}
          onPress={handleVerify}
        />

        <View style={[styles.footer, { gap: spacing.xs }]}>
          <ThemedText variant="body" color="textSecondary">
            Didn't receive it?{' '}
          </ThemedText>
          <Pressable onPress={handleResend} accessibilityRole="button">
            <ThemedText variant="bodyBold" color="primary">
              Resend code
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
  subtitle: {
    maxWidth: 340,
  },
  card: {
    width: '100%',
  },
  iconArea: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  field: {
    width: '100%',
  },
  codeInput: {
    textAlign: 'center',
    letterSpacing: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});