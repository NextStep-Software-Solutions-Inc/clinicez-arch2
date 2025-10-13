import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { OtpInput } from "react-native-otp-entry";

import ThemedButton from "@components/ThemedButton";
import ThemedText from "@components/ThemedText";
import ThemedView from "@components/ThemedView";
import Spacer from "@components/ui/Spacer";
import { handleAuthError, logAuthError, type AuthErrorResult } from "@utils/auth-error-handler";
import Nurse3D from "@images/nurse-3d.png";

const VerifyScreen: React.FC = () => {
  const { colorScheme } = useColorScheme();
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState<AuthErrorResult | null>(null);
  const [userEmail, setUserEmail] = useState("");

  const isFirstTimeUser = true;

  useEffect(() => {
    if (signIn?.identifier) {
      setUserEmail(signIn.identifier);
    }
  }, [signIn]);

  const otpTheme = useMemo(
    () => ({
      containerStyle: {
        marginVertical: 16,
      },
      pinCodeContainerStyle: {
        borderWidth: 2,
        borderRadius: 12,
        borderColor: authError?.hasError ? (colorScheme === "dark" ? "#DC2626" : "#EF4444") : (colorScheme === "dark" ? "#374151" : "#D1D5DB"),
        backgroundColor: colorScheme === "dark" ? "#1F2937" : "#FFFFFF",
        width: 50,
        height: 50,
      },
      focusedPinCodeContainerStyle: {
        borderColor: authError?.hasError ? (colorScheme === "dark" ? "#DC2626" : "#EF4444") : (colorScheme === "dark" ? "#3B82F6" : "#2563EB"),
      },
      pinCodeTextStyle: {
        color: colorScheme === "dark" ? "#F9FAFB" : "#111827",
        fontSize: 20,
        fontWeight: "600" as const,
      },
      focusStickStyle: {
        backgroundColor: colorScheme === "dark" ? "#3B82F6" : "#2563EB",
      },
    }),
    [authError?.hasError, colorScheme]
  );

  const onVerifyPress = async () => {
    if (!isLoaded || !signIn || code.length !== 6 || isVerifying) {
      return;
    }

    setIsVerifying(true);
    setAuthError(null);

    try {
      const completeSignIn = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code,
      });

      if (completeSignIn.status === "complete") {
        await setActive({ session: completeSignIn.createdSessionId });

        if (isFirstTimeUser) {
          router.push("/(main)/complete-profile");
          return;
        }

        router.push("/(auth)/reset-password");
        return;
      }

      if (completeSignIn.status === "needs_second_factor") {
        setAuthError({
          hasError: true,
          errorMessage: "Two-factor authentication is required but not yet implemented.",
          errorCode: "needs_second_factor",
        });
        return;
      }

      logAuthError(completeSignIn, "Incomplete verification attempt");
      setAuthError({
        hasError: true,
        errorMessage: "Verification process is incomplete. Please try again.",
        errorCode: "incomplete_verification",
      });
    } catch (error: unknown) {
      const authErrorResult = handleAuthError(error);
      setAuthError(authErrorResult);
      logAuthError(error, "Email verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const onResendPress = async () => {
    if (!isLoaded || !signIn) {
      return;
    }

    try {
      const emailAddressId = signIn.supportedFirstFactors?.find((factor) => factor.strategy === "email_code")?.emailAddressId;

      if (!emailAddressId) {
        throw new Error("Email address not found for resend");
      }

      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId,
      });
      Alert.alert("Code Sent", "A new verification code has been sent to your email.");
      setCode("");
      setAuthError(null);
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
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ThemedView className="flex-1 justify-center items-center px-6 py-8 bg-transparent">
          <View className="w-full max-w-md mx-auto bg-background/80 dark:bg-background-dark/80 rounded-2xl p-6 backdrop-blur-sm">
            <View className="items-center mb-6">
              <Image source={Nurse3D} className="w-32 h-32" resizeMode="contain" />
            </View>

            <View className="items-center mb-8">
              <ThemedText variant="header" className="text-center mb-3 text-primary dark:text-primary-dark">
                Verify Your Email
              </ThemedText>
              <ThemedText className="text-center text-muted dark:text-muted-dark">
                We've sent a 6-digit code to <ThemedText className="font-semibold text-primary">{userEmail}</ThemedText>
              </ThemedText>
              <ThemedText variant="caption" className="text-center text-muted dark:text-muted-dark mt-2">
                Please enter the code to continue
              </ThemedText>
            </View>

            {authError?.hasError && (
              <View className="mb-6 p-4 rounded-lg bg-error/10 dark:bg-error/20 border border-error/30 dark:border-error/40">
                <ThemedText variant="body" className="text-error dark:text-error text-center">
                  {authError.errorMessage}
                </ThemedText>
              </View>
            )}

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
              focusColor={colorScheme === "dark" ? "#3B82F6" : "#2563EB"}
              autoFocus
            />

            <View className="items-center mt-6">
              <ThemedText className="text-sm text-muted dark:text-muted-dark">
                Didn't receive the code?{' '}
                <ThemedText className="text-primary dark:text-primary-dark font-medium" onPress={onResendPress}>
                  Resend
                </ThemedText>
              </ThemedText>
            </View>

            <Spacer size={24} />

            <ThemedButton onPress={onVerifyPress} disabled={code.length !== 6 || isVerifying} loading={isVerifying} size="lg" className="w-full">
              <ThemedText variant="button" className="text-primary-foreground">
                {isVerifying ? "Verifying..." : "Continue"}
              </ThemedText>
            </ThemedButton>
          </View>
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

VerifyScreen.displayName = "VerifyScreen";

export default VerifyScreen;
