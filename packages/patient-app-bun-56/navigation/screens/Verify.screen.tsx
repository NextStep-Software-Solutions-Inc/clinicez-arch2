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
import { useSignUp } from "@clerk/expo";
import ThemedText from "@ui/ThemedText";
import { useAuth } from "contexts/AuthContext";
import { useState } from "react";

export default function VerifyScreen() {
  const navigation = useNavigation();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { unlock } = useAuth();
  const [code, setCode] = useState("");
  const isLoading = fetchStatus === "fetching";

  const handleVerify = async () => {
    const { error } = await signUp.verifications.verifyEmailCode({ code });
    if (error) return;

    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: async ({ session }) => {
          if (session?.currentTask) return;
          await unlock();
          navigation.navigate("BottomTabs", { screen: "HomeScreen" });
        },
      });
    }
  };

  const handleResend = async () => {
    await signUp.verifications.sendEmailCode();
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
        <View style={styles.header}>
          <ThemedText style={styles.brand}>Clinic EZ</ThemedText>
          <ThemedText style={styles.title}>Check your email</ThemedText>
          <ThemedText style={styles.subtitle}>
            We sent a 6-digit verification code to your email address. Enter it
            below to confirm your account.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <View style={styles.iconArea}>
            <ThemedText style={styles.iconText}>📬</ThemedText>
          </View>
          <View style={styles.field}>
            <ThemedText style={styles.label}>Verification code</ThemedText>
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
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.cta,
            (code.length < 6 || isLoading) && styles.ctaDisabled,
            pressed && styles.ctaPressed,
          ]}
          onPress={handleVerify}
          disabled={code.length < 6 || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <ThemedText style={styles.ctaText}>Verify email</ThemedText>
          )}
        </Pressable>

        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>Didn't receive it? </ThemedText>
          <Pressable onPress={handleResend}>
            <ThemedText style={styles.link}>Resend code</ThemedText>
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
    maxWidth: 340,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    gap: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
    alignItems: "center",
  },
  iconArea: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  iconText: {
    fontSize: 36,
  },
  field: {
    gap: 8,
    width: "100%",
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
  link: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
});