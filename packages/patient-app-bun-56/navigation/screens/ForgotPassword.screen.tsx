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
import { useNavigation } from "@react-navigation/native";
import { useSignIn } from "@clerk/expo";
import ThemedText from "@ui/ThemedText";
import { useAuth } from "contexts/AuthContext";
import { useState } from "react";

type Step = "email" | "code" | "password";

const STEPS: Step[] = ["email", "code", "password"];
const STEP_LABELS = ["Email", "Code", "Password"];

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { unlock, isAuthenticated } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const isLoading = fetchStatus === "fetching";
  const currentStepIndex = STEPS.indexOf(step);

  const handleSendCode = async () => {
    const { error: createError } = await signIn.create({ identifier: email });
    if (createError) return;

    const { error: sendError } =
      await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) return;

    setStep("code");
  };
  console.log({isAuthenticated});

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
        navigate: async ({ session }) => {
          if (session?.currentTask) return;
          await unlock();
          navigation.navigate("BottomTabs", { screen: "HomeScreen" });
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

        <View style={styles.card}>
          {step === "email" && (
            <View style={styles.field}>
              <ThemedText style={styles.label}>Email address</ThemedText>
              <TextInput
                style={styles.input}
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
            <ActivityIndicator color="#FFFFFF" />
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

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#FAFAFB",
  },
  scroll: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 36,
    gap: 20,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  stepDotActive: {
    backgroundColor: "#111827",
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  stepNumberActive: {
    color: "#FFFFFF",
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  stepLabelActive: {
    color: "#111827",
    fontWeight: "600",
  },
  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 6,
    width: 24,
  },
  stepLineActive: {
    backgroundColor: "#111827",
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
    backgroundColor: "#FFFFFF",
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
    color: "#374151",
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
  },
  codeInput: {
    textAlign: "center",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 10,
  },
  error: {
    fontSize: 13,
    color: "#EF4444",
  },
  cta: {
    backgroundColor: "#111827",
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
    color: "#111827",
  },
});