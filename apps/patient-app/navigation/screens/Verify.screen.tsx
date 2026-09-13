import { StyleSheet, View, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useSignIn, useSignUp } from '@clerk/expo';
import ThemedText from '@ui/ThemedText';
import { useAuth } from 'contexts/AuthContext';
import { useState } from 'react';

export default function VerifyScreen() {
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const { unlock } = useAuth();
  const [code, setCode] = useState('');

  const isMFAFlow = signIn?.status === 'needs_client_trust';
  const isLoading = signInFetchStatus === 'fetching' || signUpFetchStatus === 'fetching';

  const handleVerify = async () => {
    if (isMFAFlow) {
      // Login MFA: verify second factor; signIn.status updates after this call
      await signIn?.mfa.verifyEmailCode({ code });
      // After MFA verify, signIn status may be 'complete' — finalize session
      await signIn?.finalize({ navigate: async ({ session }) => { if (session?.currentTask) return; unlock(); } });
    } else {
      const { error: verifyError } = await signUp!.verifications.verifyEmailCode({ code });
      if (verifyError) return;
      if (signUp?.status === 'complete') {
        await signUp.finalize({ navigate: async ({ session }) => { if (session?.currentTask) return; unlock(); } });
      }
    }
  };

  const handleResend = async () => {
    if (isMFAFlow) { await signIn?.mfa.sendEmailCode(); }
    else { await signUp?.verifications.sendEmailCode(); }
  };

  const subtitle = isMFAFlow
    ? 'We sent a verification code to your email. Enter it below to continue.'
    : 'We sent a 6-digit code to your email. Enter it below to confirm your account.';

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps='handled' showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={styles.brand}>Clinic EZ</ThemedText>
          <ThemedText style={styles.title}>Check your email</ThemedText>
          <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
        </View>
        <View style={styles.card}>
          <View style={styles.iconArea}><ThemedText style={styles.iconText}>📬</ThemedText></View>
          <View style={styles.field}>
            <ThemedText style={styles.label}>Verification code</ThemedText>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(v) => { setCode(v); if (v.length === 6) setTimeout(handleVerify, 150); }}
              keyboardType='number-pad'
              maxLength={6}
              placeholder='000000'
              placeholderTextColor='#9CA3AF'
              autoFocus
            />
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [styles.cta, (code.length < 6 || isLoading) && styles.ctaDisabled, pressed && styles.ctaPressed]}
          onPress={handleVerify}
          disabled={code.length < 6 || isLoading}
        >
          {isLoading ? <ActivityIndicator color='#FFFFFF' /> : <ThemedText style={styles.ctaText}>{isMFAFlow ? 'Verify' : 'Verify email'}</ThemedText>}
        </Pressable>
        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>Didn't receive it? </ThemedText>
          <Pressable onPress={handleResend}><ThemedText style={styles.link}>Resend code</ThemedText></Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FAFAFB' },
  scroll: { paddingHorizontal: 28, paddingTop: 40, paddingBottom: 36, gap: 20 },
  header: { gap: 10, marginBottom: 4 },
  brand: { fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.75 },
  title: { fontSize: 34, fontWeight: '700', lineHeight: 42 },
  subtitle: { fontSize: 16, lineHeight: 24, opacity: 0.75, maxWidth: 340 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, gap: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6, alignItems: 'center' },
  iconArea: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  iconText: { fontSize: 36 },
  field: { gap: 8, width: '100%' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#111827' },
  codeInput: { textAlign: 'center', fontSize: 32, fontWeight: '700', letterSpacing: 10 },
  cta: { backgroundColor: '#111827', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  ctaDisabled: { opacity: 0.4 },
  ctaPressed: { opacity: 0.8 },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { fontSize: 14, opacity: 0.7 },
  link: { fontSize: 14, fontWeight: '600', color: '#3B82F6' },
});