import React from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, View } from "react-native";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import ThemedView from "@components/ThemedView";
import { ThemedText } from "@components/ThemedText";
import { ThemedButton } from "@components/ThemedButton";
import { Form, FormDescription, FormField, FormInput, FormItem, FormLabel, FormMessage } from "@components/form";
import PhoneInput from "@components/PhoneInput";
import ThemedPicker from "@components/ThemedPicker";
import { type CountryCode, defaultCountry } from "@lib/country-codes";
import { familySuffix, cn } from "@lib/utils";
import { validatePhoneNumber } from "@lib/phone-validation";

const basicInfoSchema = z
  .object({
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(2, "Last name must be at least 2 characters"),
    suffix: z.string().default(""),
    nickname: z
      .string()
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
    countryCode: z.string().default(defaultCountry.code),
    mobile: z.string().min(1, "Mobile number is required"),
  })
  .refine((data) => {
    const validation = validatePhoneNumber(data.mobile, data.countryCode);
    return validation.isValid;
  }, {
    message: "Please enter a valid mobile number",
    path: ["mobile"],
  });

type BasicInfoFormInput = z.input<typeof basicInfoSchema>;
export type BasicInfoFormData = z.output<typeof basicInfoSchema>;

export interface BasicInformationScreenProps {
  initialData?: BasicInfoFormData;
  onNext: (data: BasicInfoFormData) => void;
}

const BasicInformationScreen: React.FC<BasicInformationScreenProps> = ({ initialData, onNext }) => {
  const methods = useForm<BasicInfoFormInput, unknown, BasicInfoFormData>({
    defaultValues: {
      firstName: initialData?.firstName ?? "",
      lastName: initialData?.lastName ?? "",
      suffix: initialData?.suffix ?? "",
      nickname: initialData?.nickname ?? "",
      countryCode: initialData?.countryCode ?? defaultCountry.code,
      mobile: initialData?.mobile ?? "",
    },
    resolver: zodResolver(basicInfoSchema),
    mode: "onChange",
  });

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = methods;

  const onSubmit = (data: BasicInfoFormData) => {
    onNext(data);
  };

  return (
    <Form {...methods}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ThemedView className="flex-1 items-center px-6 pt-6">
            <View className="w-full max-w-md">
              <ScrollView>
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
                          items={familySuffix.map((suffix) => ({ label: suffix, value: suffix }))}
                          placeholder="Select suffix"
                          selectedValue={value}
                          onValueChange={onChange}
                          variant="outlined"
                          size="md"
                          key={value}
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
                              onCountryChange={(country: CountryCode) => setValue("countryCode", country.code)}
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
                <ThemedButton variant="default" size="lg" className="w-full" disabled={isSubmitting} onPress={handleSubmit(onSubmit)}>
                  <ThemedText variant="button" className="text-primary-foreground dark:text-primary-contrast font-semibold">
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

BasicInformationScreen.displayName = "BasicInformationScreen";

export default BasicInformationScreen;
