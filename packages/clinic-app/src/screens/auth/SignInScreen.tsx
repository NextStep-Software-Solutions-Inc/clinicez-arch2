import React, { useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, TouchableWithoutFeedback, View, Image, ScrollView } from "react-native";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import ThemedView from "@components/ThemedView";
import ThemedText from "@components/ThemedText";
import ThemedButton from "@components/ThemedButton";
import ThemedIcon from "@components/ThemedIcon";
import Spacer from "@components/ui/Spacer";
import { FormItem, FormLabel, FormInput, FormMessage } from "@components/form";
import { useAuthFlow } from "@hooks/useAuthFlow";
import ClinicEZLogo from "@images/clinicez-logo-v2.png";

const signInSchema = z.object({
  email: z.email("Please enter a valid email address"),
  password: z.string().optional(),
});

export type SignInFormData = z.infer<typeof signInSchema>;

const SignInScreen: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);

  const { isLoading, authError, needsPassword, signInWithEmail, signInWithPassword, clearError } = useAuthFlow({
    preferPasswordless: true,
  });

  const form = useForm<SignInFormData>({
    defaultValues: {
      email: "",
      password: "",
    },
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInFormData) => {
    if (needsPassword) {
      await signInWithPassword(data.email, data.password || "");
    } else {
      await signInWithEmail(data.email);
    }
  };

  const handleInputChange = () => {
    if (authError?.hasError) {
      clearError();
    }
  };

  const keyboardVerticalOffset = Platform.select({ ios: 80, android: 0, default: 0 }) ?? 0;

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ThemedView variant="default" className="flex-1 justify-center items-center px-6 py-6 bg-transparent">
            <View className="w-full max-w-md mx-auto bg-background/90 dark:bg-background-dark/80 rounded-2xl p-6 backdrop-blur-sm border-border dark:border-none">
              {/** Clinic EZ Logo */}

              <View className="items-center">
                <Image source={ClinicEZLogo} style={{ width: 160, height: 160, resizeMode: "contain" }} />
              </View>

              {authError?.hasError && (
                <View className="mb-6 p-4 rounded-lg bg-error/10 dark:bg-error/20 border border-error/30 dark:border-error/40">
                  <ThemedText variant="body" className="text-error dark:text-error text-center">
                    {authError.errorMessage}
                  </ThemedText>
                  {authError.isUserLocked && authError.lockoutExpiresInSeconds && (
                    <ThemedText variant="caption" className="text-error dark:text-error text-center mt-2">
                      You can try again in {Math.ceil(authError.lockoutExpiresInSeconds / 60)} minute(s).
                    </ThemedText>
                  )}
                </View>
              )}

              <View className="space-y-4">
                <FormItem>
                  <FormLabel error={!!form.formState.errors.email}>Email Address</FormLabel>
                  <FormInput
                    value={form.watch("email")}
                    onChangeText={(text) => {
                      form.setValue("email", text);
                      handleInputChange();
                    }}
                    variant="outlined"
                    size="md"
                    error={!!form.formState.errors.email}
                    leftIcon="user"
                    leftIconColor={form.formState.errors.email ? "error" : "muted"}
                    inputMode="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    placeholder="Enter your email address"
                    placeholderTextColor={Platform.OS === "ios" ? "#6B7280" : "#9CA3AF"}
                    editable={!needsPassword}
                  />
                  <FormMessage>{form.formState.errors.email?.message}</FormMessage>
                </FormItem>
                <Spacer />

                {needsPassword && (
                  <FormItem>
                    <FormLabel error={!!form.formState.errors.password}>Password</FormLabel>
                    <FormInput
                      value={form.watch("password") || ""}
                      onChangeText={(text) => {
                        form.setValue("password", text);
                        handleInputChange();
                      }}
                      variant="outlined"
                      size="md"
                      error={!!form.formState.errors.password}
                      leftIcon="lock"
                      leftIconColor={form.formState.errors.password ? "error" : "muted"}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      rightIcon={
                        <Pressable onPress={() => setShowPassword(!showPassword)}>
                          <ThemedIcon icon={showPassword ? "eye-off" : "eye"} color={form.formState.errors.password ? "error" : "muted"} />
                        </Pressable>
                      }
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      placeholderTextColor={Platform.OS === "ios" ? "#6B7280" : "#9CA3AF"}
                    />
                    <FormMessage>{form.formState.errors.password?.message}</FormMessage>
                  </FormItem>
                )}

                <View>
                  {needsPassword && (
                    <View className="flex-row justify-between items-center mt-6 mb-4">
                      <Pressable onPress={() => console.log("Switch to email code")}>
                        <ThemedText variant="caption" color="primary" className="underline">
                          Use email code instead
                        </ThemedText>
                      </Pressable>
                      <Pressable onPress={() => console.log("Forgot password")}>
                        <ThemedText variant="caption" color="primary" className="underline">
                          Forgot password?
                        </ThemedText>
                      </Pressable>
                    </View>
                  )}

                  <ThemedButton
                    variant="default"
                    size="lg"
                    className="w-full mb-4"
                    disabled={isLoading}
                    onPress={form.handleSubmit(onSubmit)}
                  >
                    <ThemedText variant="button" className="text-primary-foreground dark:text-primary-contrast font-semibold">
                      {isLoading ? "Signing In..." : needsPassword ? "Sign In" : "Continue"}
                    </ThemedText>
                  </ThemedButton>
                </View>
              </View>
            </View>
          </ThemedView>
        </TouchableWithoutFeedback>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

SignInScreen.displayName = "SignInScreen";

export default SignInScreen;
