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

export default function LoginScreen() {
  const navigation = useNavigation();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { unlock } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const isLoading = fetchStatus === "fetching";
  const needsMfa = signIn.status === "needs_client_trust";

  const handleSignIn = async () => {
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) return;

    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: async ({ session }) => {
          if (session?.currentTask) return;
          await unlock();
          navigation.navigate("BottomTabs", { screen: "HomeScreen" });
        },
      });
    } else if (signIn.status === "needs_client_trust") {
      const emailFactor = signIn.supportedSecondFactors?.find(
        (f) => f.strategy === "email_code",
      );
      if (emailFactor) await signIn.mfa.sendEmailCode();
    }
  };

  const handleVerifyMfa = async () => {
    await signIn.mfa.verifyEmailCode({ code: mfaCode });
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ session }) => {
            if (session?.currentTask) return;
            unlock();
            navigation.navigate("BottomTabs", { screen: "HomeScreen" });
        },
      });
    }
  };

  if (needsMfa) {
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
          <View style={styles.header}>
            <ThemedText style={styles.brand}>Clinic EZ</ThemedText>
            <ThemedText style={styles.title}>Check your email</ThemedText>
            <ThemedText style={styles.subtitle}>
              We sent a verification code to your email. Enter it below to
              continue.
            </ThemedText>
          </View>

          <View style={styles.card}>
            <View style={styles.field}>
              <ThemedText style={styles.label}>Verification code</ThemedText>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={mfaCode}
                onChangeText={setMfaCode}
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
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.cta,
              (mfaCode.length < 6 || isLoading) && styles.ctaDisabled,
              pressed && styles.ctaPressed,
            ]}
            onPress={handleVerifyMfa}
            disabled={mfaCode.length < 6 || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.ctaText}>Verify</ThemedText>
            )}
          </Pressable>

          <View style={styles.footer}>
            <Pressable onPress={() => signIn.mfa.sendEmailCode()}>
              <ThemedText style={styles.link}>Resend code</ThemedText>
            </Pressable>
            <ThemedText style={styles.separator}> · </ThemedText>
            <Pressable onPress={() => signIn.reset()}>
              <ThemedText style={styles.link}>Start over</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

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
        <View style={styles.header}>
          <ThemedText style={styles.brand}>Clinic EZ</ThemedText>
          <ThemedText style={styles.title}>Welcome back</ThemedText>
          <ThemedText style={styles.subtitle}>
            Sign in to manage your appointments and health records.
          </ThemedText>
        </View>

        <View style={styles.card}>
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
            />
            {errors?.fields?.identifier && (
              <ThemedText style={styles.error}>
                {errors.fields.identifier.message}
              </ThemedText>
            )}
          </View>

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <ThemedText style={styles.label}>Password</ThemedText>
              <Pressable
                onPress={() =>
                  navigation.navigate("Auth", { screen: "ForgotPassword" })
                }
              >
                <ThemedText style={styles.link}>Forgot password?</ThemedText>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              placeholder="••••••••"
              placeholderTextColor="#9CA3AF"
            />
            {errors?.fields?.password && (
              <ThemedText style={styles.error}>
                {errors.fields.password.message}
              </ThemedText>
            )}
          </View>
        </View>

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
            <ThemedText style={styles.ctaText}>Sign in</ThemedText>
          )}
        </Pressable>

        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>
            Don't have an account?{" "}
          </ThemedText>
          <Pressable
            onPress={() => navigation.navigate("Auth", { screen: "Signup" })}
          >
            <ThemedText style={styles.link}>Create account</ThemedText>
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
    paddingTop: 40,
    paddingBottom: 36,
    gap: 20,
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
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 8,
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
  },
  footerText: {
    fontSize: 15,
    opacity: 0.75,
  },
  separator: {
    fontSize: 15,
    opacity: 0.4,
  },
  link: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
});