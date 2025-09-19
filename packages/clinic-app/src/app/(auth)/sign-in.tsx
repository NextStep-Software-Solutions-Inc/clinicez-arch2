import React, { useState } from "react";
import { z } from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import ThemedView from "@components/ThemedView";
import { ThemedInput } from "@components/ThemedInput";
import ThemedText from "@components/ThemedText";
import ThemedButton from "@components/ThemedButton";
import Spacer from "@components/ui/Spacer";
import { handleAuthError, logAuthError, type AuthErrorResult } from "@utils/auth-error-handler";

const signInSchema = z.object({
  email: z.email("Please enter a valid email address"),
  password: z.string().optional(),
});

type SignInFormData = z.infer<typeof signInSchema>;

export function SignInScreen() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const [authError, setAuthError] = useState<AuthErrorResult | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch
  } = useForm<SignInFormData>({
    defaultValues: {
      email: "",
      password: "",
    },
    resolver: zodResolver(signInSchema),
  });

  const email = watch("email");

  const onContinuePress = async (data: SignInFormData) => {
    if (!isLoaded || isSubmitting) return;

    // Clear any previous errors
    setAuthError(null);
    setUserEmail(data.email);

    try {
      // If we don't need a password yet, try to create sign-in with just email
      if (!needsPassword) {
        const signInAttempt = await signIn.create({
          identifier: data.email,
        });

        if (signInAttempt.status === "complete") {
          // User signed in successfully without additional steps
          await setActive({ session: signInAttempt.createdSessionId });
          router.replace("/(main)");
          return;
        }

        if (signInAttempt.status === "needs_first_factor") {
          // Check what verification methods are supported
          const supportedFactors = signInAttempt.supportedFirstFactors;

          const emailCodeFactor = supportedFactors?.find(
            (factor) => factor.strategy === "email_code"
          );

          const passwordFactor = supportedFactors?.find(
            (factor) => factor.strategy === "password"
          );

          if (emailCodeFactor && !passwordFactor) {
            // Only email code is available, proceed with OTP
            await signIn.prepareFirstFactor({
              strategy: "email_code",
              emailAddressId: emailCodeFactor.emailAddressId,
            });
            router.push("/(auth)/verify");
            return;
          } else if (passwordFactor && !emailCodeFactor) {
            // Only password is available, show password field
            setNeedsPassword(true);
            return;
          } else if (emailCodeFactor && passwordFactor) {
            // Both options available, default to OTP for passwordless flow
            await signIn.prepareFirstFactor({
              strategy: "email_code",
              emailAddressId: emailCodeFactor.emailAddressId,
            });
            router.push("/(auth)/verify");
            return;
          } else {
            // No supported factors
            setAuthError({
              hasError: true,
              errorMessage: "No supported authentication methods available for this account.",
              errorCode: "no_supported_factors",
            });
          }
        } else {
          logAuthError(signInAttempt, "Unexpected sign-in status");
          setAuthError({
            hasError: true,
            errorMessage: "Unable to proceed with sign-in. Please try again.",
            errorCode: "unexpected_status",
          });
        }
      } else {
        // Password is needed and provided
        if (!data.password || data.password.trim() === "") {
          setAuthError({
            hasError: true,
            errorMessage: "Password is required.",
            errorCode: "password_required",
          });
          return;
        }

        const signInAttempt = await signIn.create({
          identifier: data.email,
          password: data.password,
        });

        if (signInAttempt.status === "complete") {
          await setActive({ session: signInAttempt.createdSessionId });
          router.replace("/(main)");
        } else if (signInAttempt.status === "needs_first_factor") {
          const emailCodeFactor = signInAttempt.supportedFirstFactors?.find(
            (factor) => factor.strategy === "email_code"
          );

          if (emailCodeFactor) {
            await signIn.prepareFirstFactor({
              strategy: "email_code",
              emailAddressId: emailCodeFactor.emailAddressId,
            });
            router.push("/(auth)/verify");
          } else {
            setAuthError({
              hasError: true,
              errorMessage: "Additional verification required but not available.",
              errorCode: "verification_unavailable",
            });
          }
        } else {
          logAuthError(signInAttempt, "Password sign-in incomplete");
          setAuthError({
            hasError: true,
            errorMessage: "Sign-in incomplete. Please try again.",
            errorCode: "signin_incomplete",
          });
        }
      }
    } catch (error: unknown) {
      // Use our enhanced error handler
      const authErrorResult = handleAuthError(error);
      setAuthError(authErrorResult);

      // Log error for debugging (only in development)
      logAuthError(error, "Sign-in failed");
    }
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
        <ThemedView
          variant="default"
          className="flex-1 justify-center items-center px-6 py-6 bg-transparent"
        >
          <View className="w-full max-w-md mx-auto bg-white/90 dark:bg-gray-900/80 rounded-2xl p-6 backdrop-blur-sm border-gray-300 dark:border-none">
            {/* Header Section */}
            <View className="mb-8 items-center">
              {/* <Image
                source={require("../../../assets/public/image/clinicez-logo.png")}
                className="w-60 h-60 mb-6"
                resizeMode="contain"
              /> */}
              <ThemedText
                variant="header"
                className="text-center mb-2 text-gray-600 dark:text-blue-400"
              >
                Sign in to Clinic EZ
              </ThemedText>
              <ThemedText
                variant="body"
                className="text-center text-gray-600 dark:text-gray-400 mb-2"
              >
                {needsPassword
                  ? `Welcome back! Please enter your password to continue`
                  : `Welcome back! Please enter your email to continue`
                }
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
                {authError.isUserLocked && authError.lockoutExpiresInSeconds && (
                  <ThemedText
                    variant="caption"
                    className="text-red-600 dark:text-red-400 text-center mt-2"
                  >
                    You can try again in {Math.ceil(authError.lockoutExpiresInSeconds / 60)} minute(s).
                  </ThemedText>
                )}
              </View>
            )}

            {/* Form Section */}
            <View className="space-y-2">
              {/* Email Input */}
              <View>
                <ThemedText
                  variant="label"
                  className="mb-2 font-medium text-gray-600 dark:text-primary"
                >
                  Email Address
                </ThemedText>
                <Controller
                  control={control}
                  name="email"
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => (
                    <ThemedInput
                      variant="outlined"
                      size="md"
                      state={error ? "error" : "default"}
                      leftIcon="user"
                      leftIconColor={error ? "error" : "muted"}
                      inputMode="email"
                      autoCapitalize="none"
                      autoComplete="email"
                      className="border border-gray-600 dark:border-primary"
                      placeholder="Enter your email address"
                      placeholderTextColor={error ? undefined : (Platform.OS === 'ios' ? '#6B7280' : '#9CA3AF')}
                      value={value}
                      onChangeText={(text) => {
                        onChange(text);
                        // Clear auth error when user starts typing
                        if (authError?.hasError) {
                          setAuthError(null);
                        }
                      }}
                      onBlur={onBlur}
                      editable={!needsPassword}
                    />
                  )}
                />
                {errors.email && (
                  <ThemedText
                    variant="caption"
                    className="mt-1 text-error dark:text-error"
                  >
                    {errors.email.message}
                  </ThemedText>
                )}
              </View>

              <Spacer />

              {/* Password Input - Only shown when needed */}
              {needsPassword && (
                <View>
                  <ThemedText
                    variant="label"
                    className="mb-2 font-medium text-gray-600 dark:text-primary"
                  >
                    Password
                  </ThemedText>
                  <Controller
                    control={control}
                    name="password"
                    render={({
                      field: { onChange, onBlur, value },
                      fieldState: { error },
                    }) => (
                      <ThemedInput
                        variant="outlined"
                        size="md"
                        state={error ? "error" : "default"}
                        leftIcon="lock"
                        leftIconColor={error ? "error" : "muted"}
                        secureTextEntry
                        autoCapitalize="none"
                        autoComplete="current-password"
                        className="border border-gray-600 dark:border-primary"
                        placeholder="Enter your password"
                        placeholderTextColor={error ? undefined : (Platform.OS === 'ios' ? '#6B7280' : '#9CA3AF')}
                        value={value}
                        onChangeText={(text) => {
                          onChange(text);
                          // Clear auth error when user starts typing
                          if (authError?.hasError) {
                            setAuthError(null);
                          }
                        }}
                        onBlur={onBlur}
                      />
                    )}
                  />
                  {errors.password && (
                    <ThemedText
                      variant="caption"
                      className="mt-1 text-error dark:text-error"
                    >
                      {errors.password.message}
                    </ThemedText>
                  )}
                </View>
              )}

              {/* Additional Options */}
              <View className="mt-4">
                {needsPassword ? (
                  <View className="flex-row justify-between items-center">
                    <ThemedButton
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        setNeedsPassword(false);
                        setAuthError(null);
                      }}
                    >
                      <ThemedText variant="caption" className="text-blue-600 dark:text-blue-400">
                        ← Use email verification instead
                      </ThemedText>
                    </ThemedButton>

                    <ThemedButton
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        console.log("Navigate to forgot password");
                      }}
                    >
                      <ThemedText variant="caption" className="text-blue-600 dark:text-blue-400">
                        Forgot password?
                      </ThemedText>
                    </ThemedButton>
                  </View>
                ) : (
                  <View className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <ThemedText
                      variant="caption"
                      className="text-blue-600 dark:text-blue-300 text-center"
                    >
                      💡 We'll check if your account exists and send you a verification code or prompt for your password
                    </ThemedText>
                  </View>
                )}
              </View>

              {/* Continue Button */}
              <View className="mt-6">
                <ThemedButton
                  size="lg"
                  onPress={handleSubmit(onContinuePress)}
                  disabled={isSubmitting || authError?.isUserLocked}
                  className="w-full"
                  loading={isSubmitting}
                >
                  <ThemedText variant="button" className="text-primary-foreground">
                    {isSubmitting ? (needsPassword ? "Signing In..." : "Checking...") : authError?.isUserLocked ? "Account Locked" : "Continue"}
                  </ThemedText>
                </ThemedButton>
              </View>
            </View>
          </View>
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default SignInScreen;