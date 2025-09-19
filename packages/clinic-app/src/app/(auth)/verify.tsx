import React, { useState, useEffect } from "react";
import { useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { View, Alert, KeyboardAvoidingView, ScrollView, Platform, Image } from "react-native";
import { OtpInput } from "react-native-otp-entry";
import { useColorScheme } from "nativewind";

import ThemedButton from "@components/ThemedButton";
import ThemedText from "@components/ThemedText";
import ThemedView from "@components/ThemedView";
import Spacer from "@components/ui/Spacer";
import { handleAuthError, logAuthError, type AuthErrorResult } from "@utils/auth-error-handler";

const VerifyScreen = () => {
  const { colorScheme } = useColorScheme();
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState<AuthErrorResult | null>(null);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    if (signIn?.identifier) {
      setUserEmail(signIn.identifier);
    }
  }, [signIn]);

  const otpTheme = {
    containerStyle: {
      marginVertical: 16,
    },
    pinCodeContainerStyle: {
      borderWidth: 2,
      borderRadius: 12,
      borderColor: authError?.hasError
        ? (colorScheme === 'dark' ? '#DC2626' : '#EF4444')
        : (colorScheme === 'dark' ? '#374151' : '#D1D5DB'),
      backgroundColor: colorScheme === 'dark' ? '#1F2937' : '#FFFFFF',
      width: 50,
      height: 50,
    },
    focusedPinCodeContainerStyle: {
      borderColor: authError?.hasError
        ? (colorScheme === 'dark' ? '#DC2626' : '#EF4444')
        : (colorScheme === 'dark' ? '#3B82F6' : '#2563EB'),
    },
    pinCodeTextStyle: {
      color: colorScheme === 'dark' ? '#F9FAFB' : '#111827',
      fontSize: 20,
      fontWeight: '600' as const,
    },
    focusStickStyle: {
      backgroundColor: colorScheme === 'dark' ? '#3B82F6' : '#2563EB',
    },
  };

  const onVerifyPress = async () => {
    if (!isLoaded || !signIn || code.length !== 6 || isVerifying) return;

    setIsVerifying(true);
    setAuthError(null);

    try {
      const completeSignIn = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code: code,
      });

      if (completeSignIn.status === "complete") {
        await setActive({ session: completeSignIn.createdSessionId });

        // For first-time users or users requiring password reset, redirect to reset-password
        // In a real app, you might check user metadata or other indicators from your backend
        // For this implementation, we'll redirect to password reset for new users
        // You can customize this logic based on your requirements
        router.push("/(auth)/reset-password");
      } else if (completeSignIn.status === "needs_second_factor") {
        setAuthError({
          hasError: true,
          errorMessage: "Two-factor authentication is required but not yet implemented.",
          errorCode: "needs_second_factor",
        });
      } else {
        logAuthError(completeSignIn, "Incomplete verification attempt");
        setAuthError({
          hasError: true,
          errorMessage: "Verification process is incomplete. Please try again.",
          errorCode: "incomplete_verification",
        });
      }
    } catch (error: unknown) {
      const authErrorResult = handleAuthError(error);
      setAuthError(authErrorResult);

      logAuthError(error, "Email verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const onResendPress = async () => {
    if (!isLoaded || !signIn) return;

    try {
      const emailAddressId = signIn.supportedFirstFactors?.find(
        (factor) => factor.strategy === "email_code"
      )?.emailAddressId;

      if (emailAddressId) {
        await signIn.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: emailAddressId,
        });
        Alert.alert("Code Sent", "A new verification code has been sent to your email.");
        setCode("");
        setAuthError(null);
      } else {
        throw new Error("Email address not found for resend");
      }
    } catch (error) {
      const authErrorResult = handleAuthError(error);
      setAuthError(authErrorResult);
      logAuthError(error, "Resend code failed");
    }
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ThemedView className="flex-1 justify-center items-center px-6 py-8 bg-transparent">
          <View className="w-full max-w-md mx-auto bg-white/80 dark:bg-gray-900/80 rounded-2xl p-6 backdrop-blur-sm">
            {/* Nurse Image */}
            <View className="items-center mb-6">
              <Image
                source={require("../../../assets/public/image/nurse-3d.png")}
                className="w-32 h-32"
                resizeMode="contain"
              />
            </View>

            {/* Header Section */}
            <View className="items-center mb-8">
              <ThemedText
                variant="header"
                className="text-center mb-3 text-blue-600 dark:text-blue-400"
              >
                Verify Your Email
              </ThemedText>
              <ThemedText className="text-center text-gray-600 dark:text-gray-400">
                We've sent a 6-digit code to{" "}
                <ThemedText className="font-semibold text-primary">
                  {userEmail}
                </ThemedText>
              </ThemedText>
              <ThemedText
                variant="caption"
                className="text-center text-gray-500 dark:text-gray-500 mt-2"
              >
                Please enter the code to continue
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

            {/* OTP Input */}
            <OtpInput
              numberOfDigits={6}
              onTextChange={(text) => {
                setCode(text);
                if (authError?.hasError) {
                  setAuthError(null);
                }
              }}
              onFilled={onVerifyPress}
              theme={otpTheme}
              focusColor={colorScheme === 'dark' ? '#3B82F6' : '#2563EB'}
              autoFocus
            />

            {/* Resend Link */}
            <View className="items-center mt-6">
              <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
                Didn't receive the code?{" "}
                <ThemedText
                  className="text-blue-600 dark:text-blue-400 font-medium"
                  onPress={onResendPress}
                >
                  Resend
                </ThemedText>
              </ThemedText>
            </View>

            <Spacer size={24} />

            {/* Continue Button */}
            <ThemedButton
              onPress={onVerifyPress}
              disabled={code.length !== 6 || isVerifying}
              loading={isVerifying}
              size="lg"
              className="w-full"
            >
              <ThemedText variant="button" className="text-primary-foreground">
                {isVerifying ? "Verifying..." : "Continue"}
              </ThemedText>
            </ThemedButton>
          </View>
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

VerifyScreen.displayName = "VerifyScreen";

export default VerifyScreen;