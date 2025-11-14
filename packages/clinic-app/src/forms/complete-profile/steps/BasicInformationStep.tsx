import React, { useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import ThemedView from "@components/ThemedView";
import { ThemedText } from "@components/ThemedText";
import { ThemedButton } from "@components/ThemedButton";
import {
  Form,
  FormDescription,
  FormField,
  FormInput,
  FormItem,
  FormLabel,
  FormMessage,
} from "@components/form";
import PhoneInput from "@components/PhoneInput";
import ThemedPicker from "@components/ThemedPicker";
import type { StepRenderProps } from "@components/MultiStepFormV2";
import type { CompleteProfileFormData } from "../CompleteProfileForm";
import {
  basicInformationSchema,
  type BasicInformationInput,
  type BasicInformationData,
} from "../../../schemas/healthcare-provider.schema";
import { type CountryCode, defaultCountry } from "@lib/country-codes";
import { familySuffix } from "@lib/utils";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type BasicInformationStepProps = Omit<
  StepRenderProps<CompleteProfileFormData, "basicInformation">,
  "currentStepKey" | "stepData"
> & {
  currentStepKey?: keyof CompleteProfileFormData;
  stepData: Partial<BasicInformationData>;
};

const BasicInformationStep: React.FC<BasicInformationStepProps> = ({ stepData, updateStepData, goToNextStep }) => {
  const insets = useSafeAreaInsets();

  const methods = useForm<BasicInformationInput, unknown, BasicInformationData>({
    defaultValues: {
      firstName: stepData?.firstName ?? "",
      lastName: stepData?.lastName ?? "",
      suffix: stepData?.suffix ?? "",
      nickname: stepData?.nickname ?? "",
      countryCode: stepData?.countryCode ?? defaultCountry.code,
      mobile: stepData?.mobile ?? "",
    },
    resolver: zodResolver(basicInformationSchema),
    mode: "onChange",
  });

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = methods;

  const onSubmit = (data: BasicInformationData) => {
    updateStepData(data);
    goToNextStep();
  };

  return (
    <Form {...methods}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ThemedView className="flex-1 items-center px-6 pt-6" style={{ paddingBottom: insets.bottom }}>
            <View className="w-full max-w-md lg:max-w-2xl flex-1">
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="gap-6">
                  <FormField
                    control={control}
                    name="firstName"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <FormItem>
                        <FormLabel required>First Name</FormLabel>
                        <FormInput
                          placeholder="Enter your first name"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          variant="outlined"
                          size="md"
                          autoCapitalize="words"
                          returnKeyType="next"
                          error={!!errors.firstName}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="lastName"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <FormItem>
                        <FormLabel required>Last Name</FormLabel>
                        <FormInput
                          placeholder="Enter your last name"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          variant="outlined"
                          size="md"
                          autoCapitalize="words"
                          returnKeyType="next"
                          error={!!errors.lastName}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="suffix"
                    render={({ field: { onChange, value } }) => (
                      <FormItem>
                        <FormLabel>Suffix</FormLabel>
                        <ThemedPicker
                          items={familySuffix.map((suffix) => ({
                            label: suffix,
                            value: suffix,
                          }))}
                          placeholder="Select suffix"
                          selectedValue={value}
                          onValueChange={onChange}
                          variant="outlined"
                          size="md"
                          state={errors.suffix ? "error" : "default"}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="nickname"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <FormItem>
                        <FormLabel>Nickname</FormLabel>
                        <FormInput
                          placeholder="Enter your nickname"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          leftIcon="user"
                          leftIconColor="muted"
                          variant="outlined"
                          size="md"
                          autoCapitalize="words"
                          returnKeyType="next"
                          error={!!errors.nickname}
                        />
                        <FormDescription>How should we call you?</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="mobile"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <FormItem>
                        <FormLabel required>Mobile Number</FormLabel>
                        <FormField
                          control={control}
                          name="countryCode"
                          render={({ field: { value: countryValue } }) => (
                            <PhoneInput
                              placeholder="Enter your mobile number"
                              value={value}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              countryCode={countryValue}
                              onCountryChange={(country: CountryCode) =>
                                setValue("countryCode", country.code)
                              }
                              variant="outlined"
                              size="md"
                              returnKeyType="done"
                            />
                          )}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </View>
              </ScrollView>

              <View className="mt-8">
                <ThemedButton
                  variant="default"
                  size="lg"
                  className="w-full"
                  onPress={handleSubmit(onSubmit)}
                >
                  <ThemedText
                    variant="button"
                    className="text-primary-foreground dark:text-primary-contrast font-semibold"
                  >
                    Next
                  </ThemedText>
                </ThemedButton>
              </View>
            </View>
          </ThemedView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Form>
  );
};

export default BasicInformationStep;
