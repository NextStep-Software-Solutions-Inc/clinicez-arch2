import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { ThemedText } from "@components/ThemedText";
import ThemedButton from "@components/ThemedButton";
import { Form, FormField, FormInput, FormItem, FormLabel, FormMessage } from "@components/form";
import PhoneInput from "@components/PhoneInput";
import { defaultCountry } from "@lib/country-codes";

import { StepRenderProps } from "@components/MultiStepFormV2";
import {
  AddPatientFormData,
  ContactInfoStep,
  contactInfoStepSchema,
} from "../../schemas/add-patient-form.schema";

type ContactInfoStepProps = Omit<
  StepRenderProps<AddPatientFormData, "contactInfo">,
  "currentStepKey" | "stepData"
> & {
  currentStepKey?: keyof AddPatientFormData;
  stepData: Partial<ContactInfoStep>;
};

const ContactInfoStepForm: React.FC<ContactInfoStepProps> = ({
  stepData,
  goToNextStep,
  goToPreviousStep,
  updateStepData,
  mergeStepData,
}) => {
  const [countryCode, setCountryCode] = useState(defaultCountry.code);

  const methods = useForm<ContactInfoStep>({
    resolver: zodResolver(contactInfoStepSchema),
    mode: "onChange",
    defaultValues: stepData,
  });

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = methods;

  const onSubmit = (data: ContactInfoStep) => {
    updateStepData(data);
    goToNextStep();
  };

  // Auto-save on field blur
  const handleFieldBlur = (field: keyof ContactInfoStep, value: string | undefined) => {
    if (value !== undefined) {
      mergeStepData({ [field]: value } as Partial<ContactInfoStep>);
    }
  };

  return (
    <Form {...methods}>
      <ScrollView className="flex-1 bg-background dark:bg-background-dark">
        <View className="px-6 py-8">
          <ThemedText className="text-2xl font-bold mb-2">
            Contact Information
          </ThemedText>
          <ThemedText className="text-muted-foreground dark:text-muted-foreground-dark mb-6">
            How can we reach you?
          </ThemedText>

          <View className="gap-4">
            {/* Email */}
            <FormField
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel required>Email Address</FormLabel>
                  <FormInput
                    placeholder="Enter email address"
                    value={value || ""}
                    onChangeText={onChange}
                    onBlur={() => {
                      onBlur();
                      handleFieldBlur("email", value);
                    }}
                    variant="outlined"
                    size="md"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Phone Number */}
            <FormField
              control={control}
              name="phoneNumber"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel required>Phone Number</FormLabel>
                  <PhoneInput
                    value={value || ""}
                    countryCode={countryCode}
                    onCountryChange={(country) => setCountryCode(country.code)}
                    onChangeText={(phone) => {
                      onChange(phone);
                    }}
                    onBlur={() => {
                      onBlur();
                      handleFieldBlur("phoneNumber", value);
                    }}
                    variant="outlined"
                    size="md"
                    state={errors.phoneNumber ? "error" : "default"}
                    autoFormat={true}
                    placeholder="Enter phone number"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </View>

          <View className="flex-row gap-4 mt-8">
            <View className="flex-1">
              <ThemedButton
                onPress={goToPreviousStep}
                variant="outline"
              >
                Back
              </ThemedButton>
            </View>
            <View className="flex-1">
              <ThemedButton
                onPress={handleSubmit(onSubmit)}
                disabled={!isValid}
              >
                Continue
              </ThemedButton>
            </View>
          </View>
        </View>
      </ScrollView>
    </Form>
  );
};

export default ContactInfoStepForm;
