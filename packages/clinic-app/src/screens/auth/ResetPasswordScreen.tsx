import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { z } from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import ThemedButton from "@components/ThemedButton";
import { ThemedInput } from "@components/ThemedInput";
import ThemedText, { type ThemedTextProps } from "@components/ThemedText";
import ThemedView from "@components/ThemedView";
import Spacer from "@components/ui/Spacer";
import ThemedIcon from "@components/ThemedIcon";
import { handleAuthError, logAuthError, type AuthErrorResult } from "@utils/auth-error-handler";

const passwordRequirements = [
  { regex: /.{8,}/, text: "At least 8 characters long" },
  { regex: /[A-Z]/, text: "At least one uppercase letter (A-Z)" },
  { regex: /[a-z]/, text: "At least one lowercase letter (a-z)" },
  { regex: /[0-9]/, text: "At least one number (0-9)" },
  { regex: /[^A-Za-z0-9]/, text: "At least one special character (!@#$%^&*)" },
];

const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SetPasswordFormData = z.infer<typeof setPasswordSchema>;

const ResetPasswordScreen: React.FC = () => {
  const { user } = useUser();
  const router = useRouter();
  const [authError, setAuthError] = useState<AuthErrorResult | null>(null);
  const [passwordStrength, setPasswordStrength] = useState<boolean[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<SetPasswordFormData>({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    resolver: zodResolver(setPasswordSchema),
    mode: "onChange",
  });

  const password = form.watch("password");

  useEffect(() => {
    const strength = passwordRequirements.map((req) => req.regex.test(password));
    setPasswordStrength(strength);
  }, [password]);

  const onSetPasswordPress = async (data: SetPasswordFormData) => {
    if (!user) {
      setAuthError({
        hasError: true,
        errorMessage: "User not found. Please sign in again.",
        errorCode: "user_not_found",
      });
      return;
    }

    setAuthError(null);

    try {
      await user.updatePassword({
        newPassword: data.password,
      });

      router.replace("/(main)/(tabs)");
    } catch (error: unknown) {
      const authErrorResult = handleAuthError(error);
      setAuthError(authErrorResult);
      logAuthError(error, "Password update failed");
    }
  };

  const getPasswordStrengthColor = (isValid: boolean): NonNullable<ThemedTextProps["color"]> => {
    return isValid ? "success" : "error";
  };

  const getPasswordStrengthIcon = (isValid: boolean): "check" | "x" => {
    return isValid ? "check" : "x";
  };

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <ThemedView className="flex-1 justify-center items-center px-6 py-8 bg-transparent">
          <View className="w-full max-w-md mx-auto bg-background/80 dark:bg-background-dark/80 rounded-2xl p-6 backdrop-blur-sm">
            <View className="items-center mb-8">
              <ThemedText variant="header" className="text-center mb-3">
                Set Your Password
              </ThemedText>
              <ThemedText variant="body" color="secondary" className="text-center">
                Create a secure password for your account
              </ThemedText>
            </View>

            {authError?.hasError && (
              <View className="mb-6 p-4 rounded-lg bg-error/10 dark:bg-error/20 border border-error/30 dark:border-error/40">
                <ThemedText variant="body" color="error" className="text-center">
                  {authError.errorMessage}
                </ThemedText>
              </View>
            )}

            <View className="space-y-4">
              <View>
                <ThemedText variant="label" className="mb-2 font-medium text-primary">
                  New Password
                </ThemedText>
                <Controller
                  control={form.control}
                  name="password"
                  render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                    <ThemedInput
                      variant="outlined"
                      size="md"
                      state={error ? "error" : "default"}
                      secureTextEntry={!showPassword}
                      placeholder="Create a strong password"
                      rightIcon={
                        <Pressable onPress={() => setShowPassword(!showPassword)}>
                          <ThemedIcon icon={showPassword ? "eye" : "eye-off"} />
                        </Pressable>
                      }
                      value={value}
                      onChangeText={(text) => {
                        onChange(text);
                        if (authError?.hasError) {
                          setAuthError(null);
                        }
                      }}
                      onBlur={onBlur}
                    />
                  )}
                />
                {form.formState.errors.password && (
                  <ThemedText variant="caption" color="error" className="mt-1">
                    {form.formState.errors.password.message}
                  </ThemedText>
                )}
              </View>

              <View className="p-4 rounded-lg bg-surface dark:bg-surface-dark border border-border dark:border-border-dark">
                <ThemedText variant="label" color="primary" className="mb-3">
                  Password Requirements:
                </ThemedText>
                <View className="space-y-2">
                  {passwordRequirements.map((req, index) => (
                    <View key={req.text} className="flex-row items-center space-x-2">
                      <ThemedIcon icon={getPasswordStrengthIcon(passwordStrength[index])} size="sm" color={passwordStrength[index] ? "success" : "error"} />
                      <ThemedText variant="caption" color={getPasswordStrengthColor(passwordStrength[index])} className="flex-1">
                        {req.text}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>

              <Spacer size={8} />

              <View>
                <ThemedText variant="label" color="primary" className="mb-2">
                  Confirm Password
                </ThemedText>
                <Controller
                  control={form.control}
                  name="confirmPassword"
                  render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                    <ThemedInput
                      variant="outlined"
                      size="md"
                      state={error ? "error" : "default"}
                      secureTextEntry={!showPassword}
                      placeholder="Re-enter your password"
                      rightIcon={
                        <Pressable onPress={() => setShowPassword(!showPassword)}>
                          <ThemedIcon icon={showPassword ? "eye" : "eye-off"} />
                        </Pressable>
                      }
                      value={value}
                      onChangeText={(text) => {
                        onChange(text);
                        if (authError?.hasError) {
                          setAuthError(null);
                        }
                      }}
                      onBlur={onBlur}
                    />
                  )}
                />
                {form.formState.errors.confirmPassword && (
                  <ThemedText variant="caption" color="error" className="mt-1">
                    {form.formState.errors.confirmPassword.message}
                  </ThemedText>
                )}
              </View>
            </View>

            <Spacer size={24} />

            <ThemedButton
              size="lg"
              onPress={form.handleSubmit(onSetPasswordPress)}
              disabled={!form.formState.isValid || form.formState.isSubmitting}
              loading={form.formState.isSubmitting}
              className="w-full"
            >
              <ThemedText variant="button" className="text-primary-foreground">
                {form.formState.isSubmitting ? "Setting Password..." : "Set Password"}
              </ThemedText>
            </ThemedButton>

            <View className="items-center mt-4">
              <ThemedButton variant="ghost" size="sm" onPress={() => router.back()} disabled={form.formState.isSubmitting}>
                <ThemedText variant="button" className="text-primary">
                  ← Back
                </ThemedText>
              </ThemedButton>
            </View>
          </View>
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

ResetPasswordScreen.displayName = "ResetPasswordScreen";

export default ResetPasswordScreen;
