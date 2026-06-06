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
import { useSignUp } from "@clerk/expo";
import ThemedText from "@ui/ThemedText";
import { useState } from "react";

export default function SignupScreen() {
  const navigation = useNavigation();
  const { signUp, errors, fetchStatus } = useSignUp();
  const theme = useTheme();
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isLoading = fetchStatus === "fetching";
  const styles = createStyles(theme);

  const handleSignUp = async () => {
    const { error } = await signUp.password({
      emailAddress: email,
      password,
      ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
    });
    if (error) return;

    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) return;

    navigation.navigate("Auth", { screen: "Verify" });
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
          <ThemedText style={styles.title}>Create account</ThemedText>
          <ThemedText style={styles.subtitle}>
            Join to access secure healthcare management from your phone.
          </ThemedText>
        </View>

        <View style={styles.card}>
          <View style={styles.field}>
            <ThemedText style={styles.label}>First name</ThemedText>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoComplete="given-name"
              placeholder="John"
              placeholderTextColor="#9CA3AF"
            />
          </View>

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
            {errors?.fields?.emailAddress && (
              <ThemedText style={styles.error}>
                {errors.fields.emailAddress.message}
              </ThemedText>
            )}
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>Password</ThemedText>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              placeholderTextColor="#9CA3AF"
            />
            {errors?.fields?.password && (
              <ThemedText style={styles.error}>
                {errors.fields.password.message}
              </ThemedText>
            )}
          </View>
        </View>

        {/* Required for Clerk's bot sign-up protection */}
        <View nativeID="clerk-captcha" />

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
            <ActivityIndicator color={theme.colors.text} />
          ) : (
            <ThemedText style={styles.ctaText}>Create account</ThemedText>
          )}
        </Pressable>

        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>
            Already have an account?{" "}
          </ThemedText>
          <Pressable
            onPress={() => navigation.navigate("Auth", { screen: "Login" })}
          >
            <ThemedText style={styles.link}>Sign in</ThemedText>
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
    color: theme.colors.primary,
  },
});