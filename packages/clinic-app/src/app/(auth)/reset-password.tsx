import React, { useState, useEffect } from "react";
import { useUser } from "@clerk/clerk-expo";
import ThemedButton from "@components/ThemedButton";
import { ThemedInput } from "@components/ThemedInput";
import ThemedText from "@components/ThemedText";
import ThemedView from "@components/ThemedView";
import Spacer from "@components/ui/Spacer";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { z } from "zod";
import { handleAuthError, logAuthError, type AuthErrorResult } from "@utils/auth-error-handler";
import ThemedIcon from "@components/ThemedIcon";

const passwordRequirements = [
  { regex: /.{8,}/, text: "At least 8 characters long" },
  { regex: /[A-Z]/, text: "At least one uppercase letter (A-Z)" },
  { regex: /[a-z]/, text: "At least one lowercase letter (a-z)" },
  { regex: /[0-9]/, text: "At least one number (0-9)" },
  { regex: /[^A-Za-z0-9]/, text: "At least one special character (!@#$%^&*)" },
];

const setPasswordSchema = z.object({
  password: z.string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type SetPasswordFormData = z.infer<typeof setPasswordSchema>;

const ResetPasswordScreen = () => {
  const { user } = useUser();
  const router = useRouter();
  const [authError, setAuthError] = useState<AuthErrorResult | null>(null);
  const [passwordStrength, setPasswordStrength] = useState<boolean[]>([]);

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
    const strength = passwordRequirements.map(req => req.regex.test(password));
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

      router.replace("/(main)");
    } catch (error: unknown) {
      const authErrorResult = handleAuthError(error);
      setAuthError(authErrorResult);
      logAuthError(error, "Password update failed");
    }
  };

  const getPasswordStrengthColor = (isValid: boolean): string => {
    return isValid ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400";
  };

  const getPasswordStrengthIcon = (isValid: boolean): "check" | "x" => {
    return isValid ? "check" : "x";
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedView className="flex-1 justify-center items-center px-6 py-8 bg-transparent">
          <View className="w-full max-w-md mx-auto bg-white/80 dark:bg-gray-900/80 rounded-2xl p-6 backdrop-blur-sm">
            {/* Header Section */}
            <View className="items-center mb-8">
              <ThemedText
                variant="header"
                className="text-center mb-3 text-blue-600 dark:text-blue-400"
              >
                Set Your Password
              </ThemedText>
              <ThemedText
                variant="body"
                className="text-center text-gray-600 dark:text-gray-400"
              >
                Create a secure password for your account
              </ThemedText>
            </View>

            {/* Error Display */}
            {authError?.hasError && (
              <View className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <ThemedText
                  variant="body"
                  className="text-red-700 dark:text-red-300 text-center"
                >
                  {authError.errorMessage}
                </ThemedText>
              </View>
            )}

            {/* Form Section */}
            <View className="space-y-4">
              {/* New Password Input */}
              <View>
                <ThemedText
                  variant="label"
                  className="mb-2 font-medium text-primary"
                >
                  New Password
                </ThemedText>
                <Controller
                  control={form.control}
                  name="password"
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => (
                    <ThemedInput
                      variant="outlined"
                      size="md"
                      state={error ? "error" : "default"}
                      secureTextEntry
                      placeholder="Create a strong password"
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
                  <ThemedText
                    variant="caption"
                    className="mt-1 text-error dark:text-error"
                  >
                    {form.formState.errors.password.message}
                  </ThemedText>
                )}
              </View>

              {/* Password Requirements */}
              <View className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
                <ThemedText
                  variant="label"
                  className="mb-3 font-medium text-primary"
                >
                  Password Requirements:
                </ThemedText>
                <View className="space-y-2">
                  {passwordRequirements.map((req, index) => (
                    <View key={index} className="flex-row items-center space-x-2">
                      <ThemedIcon
                        icon={getPasswordStrengthIcon(passwordStrength[index])}
                        size="sm"
                        color={passwordStrength[index] ? "success" : "error"}
                      />
                      <ThemedText
                        variant="caption"
                        className={`flex-1 ${getPasswordStrengthColor(passwordStrength[index])}`}
                      >
                        {req.text}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>

              <Spacer size={8} />

              {/* Confirm Password Input */}
              <View>
                <ThemedText
                  variant="label"
                  className="mb-2 font-medium text-primary"
                >
                  Confirm Password
                </ThemedText>
                <Controller
                  control={form.control}
                  name="confirmPassword"
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => (
                    <ThemedInput
                      variant="outlined"
                      size="md"
                      state={error ? "error" : "default"}
                      secureTextEntry
                      placeholder="Re-enter your password"
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
                  <ThemedText
                    variant="caption"
                    className="mt-1 text-error dark:text-error"
                  >
                    {form.formState.errors.confirmPassword.message}
                  </ThemedText>
                )}
              </View>
            </View>

            <Spacer size={24} />

            {/* Submit Button */}
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

            {/* Back Button */}
            <View className="items-center mt-4">
              <ThemedButton
                variant="ghost"
                size="sm"
                onPress={() => router.back()}
                disabled={form.formState.isSubmitting}
              >
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