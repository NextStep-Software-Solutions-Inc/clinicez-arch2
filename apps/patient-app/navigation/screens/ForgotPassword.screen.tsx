import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Theme, useNavigation, useTheme } from "@react-navigation/native";
import { useSignIn } from "@clerk/expo";
import ThemedText from "@ui/ThemedText";
import { useAuth } from "contexts/AuthContext";
import { useState } from "react";

type Step = "email" | "code" | "password";

const STEPS: Step[] = ["email", "code", "password"];
const STEP_LABELS = ["Email", "Code", "Password"];

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const theme = useTheme();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { unlock, isAuthenticated } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const isLoading = fetchStatus === "fetching";
  const currentStepIndex = STEPS.indexOf(step);
  const styles = createStyles(theme);

  const handleSendCode = async () => {
    const { error: createError } = await signIn.create({ identifier: email });
    if (createError) return;

    const { error: sendError } =
      await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) return;

    setStep("code");
  };

  const handleVerifyCode = async () => {
    const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code });
    if (error) return;
    // After verifyCode succeeds, signIn.status becomes 'needs_new_password'
    setStep("password");
  };

  const handleSetPassword = async () => {
    const { error } = await signIn.resetPasswordEmailCode.submitPassword({
      password,
      signOutOfOtherSessions: true,
    });
    if (error) return;

    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ session }) => {
          if (session?.currentTask) return;
          unlock(); // Let state machine route to Main or SetupPIN based on hasPIN
        },
      });
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Step indicator */}
        <View style={styles.stepper}>
          {STEPS.map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  i <= currentStepIndex && styles.stepDotActive,
                ]}
              >
                <ThemedText
                  style={[
                    styles.stepNumber,
                    i <= currentStepIndex && styles.stepNumberActive,
                  ]}
                >
                  {i + 1}
                </ThemedText>
              </View>
              <ThemedText
                style={[
                  styles.stepLabel,
                  i <= currentStepIndex && styles.stepLabelActive,
                ]}
              >
                {STEP_LABELS[i]}
              </ThemedText>
              {i < STEPS.length - 1 && (
                <View
                  style={[
                    styles.stepLine,
                    i < currentStepIndex && styles.stepLineActive,
                  ]}
                />
              )}
            </View>
          ))}
        </View>

        <View style={styles.header}>
          <ThemedText style={styles.brand}>Clinic EZ</ThemedText>
          {step === "email" && (
            <>
              <ThemedText style={styles.title}>Forgot password?</ThemedText>
              <ThemedText style={styles.subtitle}>
                Enter your email and we'll send a reset code.
              </ThemedText>
            </>
          )}
          {step === "code" && (
            <>
              <ThemedText style={styles.title}>Check your email</ThemedText>
              <ThemedText style={styles.subtitle}>
                Enter the 6-digit code we sent to {email}.
              </ThemedText>
            </>
          )}
          {step === "password" && (
            <>
              <ThemedText style={styles.title}>New password</ThemedText>
              <ThemedText style={styles.subtitle}>
                Choose a strong password to protect your account.
              </ThemedText>
            </>
          )}
        </View>

        <View style={[styles.card]}>
          {step === "email" && (
            <View style={styles.field}>
              <ThemedText style={styles.label}>Email address</ThemedText>
              <TextInput
                style={{...styles.input}}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholder="you@example.com"
                placeholderTextColor="#9CA3AF"
                autoFocus
              />
              {errors?.fields?.identifier && (
                <ThemedText style={styles.error}>
                  {errors.fields.identifier.message}
                </ThemedText>
              )}
            </View>
          )}

          {step === "code" && (
            <View style={styles.field}>
              <ThemedText style={styles.label}>Reset code</ThemedText>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor="#9CA3AF"
                autoFocus
              />
              {errors?.fields?.code && (
                <ThemedText style={styles.error}>
                  {errors.fields.code.message}
                </ThemedText>
              )}
            </View>
          )}

          {step === "password" && (
            <View style={styles.field}>
              <ThemedText style={styles.label}>New password</ThemedText>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                placeholderTextColor="#9CA3AF"
                autoFocus
              />
              {errors?.fields?.password && (
                <ThemedText style={styles.error}>
                  {errors.fields.password.message}
                </ThemedText>
              )}
            </View>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.cta,
            (step === "email" && (!email || isLoading)) && styles.ctaDisabled,
            (step === "code" && (code.length < 6 || isLoading)) &&
              styles.ctaDisabled,
            (step === "password" && (!password || isLoading)) &&
              styles.ctaDisabled,
            pressed && styles.ctaPressed,
          ]}
          onPress={
            step === "email"
              ? handleSendCode
              : step === "code"
                ? handleVerifyCode
                : handleSetPassword
          }
          disabled={
            isLoading ||
            (step === "email" && !email) ||
            (step === "code" && code.length < 6) ||
            (step === "password" && !password)
          }
        >
          {isLoading ? (
            <ActivityIndicator color={theme.colors.text} />
          ) : (
            <ThemedText style={styles.ctaText}>
              {step === "email"
                ? "Send reset code"
                : step === "code"
                  ? "Verify code"
                  : "Set new password"}
            </ThemedText>
          )}
        </Pressable>

        {step === "code" && (
          <View style={styles.resendRow}>
            <ThemedText style={styles.footerText}>Didn't get it? </ThemedText>
            <Pressable
              onPress={() => signIn.resetPasswordEmailCode.sendCode()}
            >
              <ThemedText style={styles.link}>Resend code</ThemedText>
            </Pressable>
          </View>
        )}

        <View style={styles.footer}>
          <Pressable
            onPress={() => navigation.navigate("Auth", { screen: "Login" })}
          >
            <ThemedText style={styles.link}>Back to sign in</ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 36,
    gap: 20,
    maxWidth: "auto",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    // flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  stepDotActive: {
    backgroundColor: theme.colors.primary,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
  },
  stepNumberActive: {
    color: "#FFFFFF",
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.text,
  },
  stepLabelActive: {
    color: theme.colors.text,
    fontWeight: "600",
  },
  stepLine: {
    flex: 1,
    maxWidth: 50,
    height: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: 6,
  },
  stepLineActive: {
    backgroundColor: theme.colors.text,
  },
  header: {
    gap: 10,
    marginBottom: 4,
  },
  brand: {
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
    opacity: 0.75,
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 42,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.75,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.colors.text,
  },
  codeInput: {
    textAlign: "center",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 10,
  },
  error: {
    fontSize: 13,
    color: theme.colors.notification,
  },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaPressed: {
    opacity: 0.84,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  footerText: {
    fontSize: 15,
    opacity: 0.75,
  },
  link: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.primary,
  },
});