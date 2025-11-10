import React from "react";
import { View, ScrollView } from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { ThemedText } from "@components/ThemedText";
import ThemedButton from "@components/ThemedButton";
import { Form, FormField, FormInput, FormItem, FormLabel, FormMessage } from "@components/form";
import DatePicker from "@components/DatePicker";
import ThemedPicker from "@components/ThemedPicker";

import { StepRenderProps } from "@components/MultiStepFormV2";
import {
  AddPatientFormData,
  PersonalInfoStep,
  personalInfoStepSchema,
} from "../../schemas/add-patient-form.schema";

type PersonalInfoStepProps = Omit<
  StepRenderProps<AddPatientFormData, "personalInfo">,
  "currentStepKey" | "stepData"
> & {
  currentStepKey?: keyof AddPatientFormData;
  stepData: Partial<PersonalInfoStep>;
};

const PersonalInfoStepForm: React.FC<PersonalInfoStepProps> = ({
  stepData,
  goToNextStep,
  updateStepData,
  mergeStepData,
}) => {
  const methods = useForm<PersonalInfoStep>({
    resolver: zodResolver(personalInfoStepSchema),
    mode: "onChange",
    defaultValues: stepData,
  });

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = methods;

  const onSubmit = (data: PersonalInfoStep) => {
    updateStepData(data);
    goToNextStep();
  };

  // Auto-save on field blur
  const handleFieldBlur = (field: keyof PersonalInfoStep, value: string | Date | undefined) => {
    if (value !== undefined) {
      // Convert Date to string if needed
      const stringValue = value instanceof Date
        ? value.toISOString().split('T')[0]
        : value;
      mergeStepData({ [field]: stringValue } as Partial<PersonalInfoStep>);
    }
  };

  const genderOptions = [
    { label: "Select gender", value: "" },
    { label: "Male", value: "MALE" },
    { label: "Female", value: "FEMALE" },
  ];

  return (
    <Form {...methods}>
      <ScrollView className="flex-1 bg-background dark:bg-background-dark">
        <View className="px-6 py-8">
          <ThemedText className="text-2xl font-bold mb-2">
            Personal Information
          </ThemedText>
          <ThemedText className="text-muted-foreground dark:text-muted-foreground-dark mb-6">
            Let's start with basic personal details
          </ThemedText>

          <View className="gap-4">
            {/* First Name */}
            <FormField
              control={control}
              name="firstName"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel required>First Name</FormLabel>
                  <FormInput
                    placeholder="Enter first name"
                    value={value || ""}
                    onChangeText={onChange}
                    onBlur={() => {
                      onBlur();
                      handleFieldBlur("firstName", value);
                    }}
                    variant="outlined"
                    size="md"
                    autoCapitalize="words"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Middle Name */}
            <FormField
              control={control}
              name="middleName"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel>Middle Name</FormLabel>
                  <FormInput
                    placeholder="Enter middle name (optional)"
                    value={value || ""}
                    onChangeText={onChange}
                    onBlur={() => {
                      onBlur();
                      handleFieldBlur("middleName", value);
                    }}
                    variant="outlined"
                    size="md"
                    autoCapitalize="words"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Last Name */}
            <FormField
              control={control}
              name="lastName"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel required>Last Name</FormLabel>
                  <FormInput
                    placeholder="Enter last name"
                    value={value || ""}
                    onChangeText={onChange}
                    onBlur={() => {
                      onBlur();
                      handleFieldBlur("lastName", value);
                    }}
                    variant="outlined"
                    size="md"
                    autoCapitalize="words"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Suffix */}
            <FormField
              control={control}
              name="suffix"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel>Suffix</FormLabel>
                  <FormInput
                    placeholder="Jr., Sr., III, etc. (optional)"
                    value={value || ""}
                    onChangeText={onChange}
                    onBlur={() => {
                      onBlur();
                      handleFieldBlur("suffix", value);
                    }}
                    variant="outlined"
                    size="md"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Nickname */}
            <FormField
              control={control}
              name="nickname"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel>Nickname</FormLabel>
                  <FormInput
                    placeholder="Preferred name (optional)"
                    value={value || ""}
                    onChangeText={onChange}
                    onBlur={() => {
                      onBlur();
                      handleFieldBlur("nickname", value);
                    }}
                    variant="outlined"
                    size="md"
                    autoCapitalize="words"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date of Birth */}
            <FormField
              control={control}
              name="dateOfBirth"
              render={({ field: { onChange, value } }) => (
                <FormItem>
                  <FormLabel>Date of Birth</FormLabel>
                  <DatePicker
                    value={value ? new Date(value) : undefined}
                    onChange={(date) => {
                      const dateString = date.toISOString().split('T')[0];
                      onChange(dateString);
                      handleFieldBlur("dateOfBirth", date);
                    }}
                    placeholder="Select date of birth"
                    variant="outlined"
                    size="md"
                    state={errors.dateOfBirth ? "error" : "default"}
                    maximumDate={new Date()}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Gender */}
            <FormField
              control={control}
              name="gender"
              render={({ field: { onChange, value } }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <ThemedPicker
                    selectedValue={value || ""}
                    onValueChange={(itemValue) => {
                      onChange(itemValue);
                      handleFieldBlur("gender", itemValue as string);
                    }}
                    items={genderOptions}
                    state={errors.gender ? "error" : "default"}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </View>

          <View className="mt-8">
            <ThemedButton
              onPress={handleSubmit(onSubmit)}
              disabled={!isValid}
            >
              Continue
            </ThemedButton>
          </View>
        </View>
      </ScrollView>
    </Form>
  );
};

export default PersonalInfoStepForm;
