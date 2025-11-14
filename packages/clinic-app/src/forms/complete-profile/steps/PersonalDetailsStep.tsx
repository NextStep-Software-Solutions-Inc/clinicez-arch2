import React from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  View,
  ScrollView,
} from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import DatePicker from "@components/DatePicker";
import ThemedPicker from "@components/ThemedPicker";
import { ThemedButton } from "@components/ThemedButton";
import { ThemedText } from "@components/ThemedText";
import ThemedView from "@components/ThemedView";
import { Form, FormItem, FormLabel, FormMessage } from "@components/form";
import { getNationalities, popularNationalities, type Nationality } from "@lib/nationality";
import type { StepRenderProps } from "@components/MultiStepFormV2";
import type { CompleteProfileFormData } from "../CompleteProfileForm";
import {
  personalDetailsSchema,
  type PersonalDetailsData,
} from "../../../schemas/healthcare-provider.schema";
import { createAgeCutoffDate } from "../../../utils/date-helpers";

const gender = {
  MALE: "Male",
  FEMALE: "Female",
} as const;

const civilStatus = {
  SINGLE: "Single",
  MARRIED: "Married",
  DIVORCED: "Divorced",
  WIDOWED: "Widowed",
  SEPARATED: "Separated",
} as const;

const religion = {
  christianity: "Christianity",
  islam: "Islam",
  hinduism: "Hinduism",
  buddhism: "Buddhism",
  judaism: "Judaism",
  other: "Other",
} as const;

const bloodType = {
  a_positive: "A+",
  a_negative: "A-",
  b_positive: "B+",
  b_negative: "B-",
  ab_positive: "AB+",
  ab_negative: "AB-",
  o_positive: "O+",
  o_negative: "O-",
  unknown: "Unknown",
} as const;

type PersonalDetailsStepProps = Omit<
  StepRenderProps<CompleteProfileFormData, "personalDetails">,
  "currentStepKey" | "stepData"
> & {
  currentStepKey?: keyof CompleteProfileFormData;
  stepData: Partial<PersonalDetailsData>;
};

const PersonalDetailsStep: React.FC<PersonalDetailsStepProps> = ({ stepData, updateStepData, goToNextStep, goToPreviousStep }) => {
  const nationalities = getNationalities();

  const methods = useForm<PersonalDetailsData>({
    defaultValues: {
      gender: stepData?.gender ?? undefined,
      civilStatus: stepData?.civilStatus ?? undefined,
      religion: stepData?.religion ?? "",
      nationality: stepData?.nationality ?? "",
      dateOfBirth: stepData?.dateOfBirth,
      bloodType: stepData?.bloodType ?? "",
    },
    resolver: zodResolver(personalDetailsSchema),
    mode: "onChange",
  });

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = methods;

  const genderOptions = React.useMemo(
    () => Object.entries(gender).map(([key, value]) => ({ label: value, value: key })),
    []
  );
  const civilStatusOptions = React.useMemo(
    () => Object.entries(civilStatus).map(([key, value]) => ({ label: value, value: key })),
    []
  );
  const religionOptions = React.useMemo(
    () => Object.entries(religion).map(([key, value]) => ({ label: value, value: key })),
    []
  );

  const getNationalityOptions = React.useCallback(() => {
    const popular = popularNationalities
      .map((name) => nationalities.find((nat) => nat.name === name))
      .filter((nat): nat is Nationality => nat !== undefined);

    const remaining = nationalities.filter((nat) => !popularNationalities.includes(nat.name));

    const sorted = [...popular, ...remaining];
    return sorted.map((nat) => ({ label: nat.name, value: nat.name }));
  }, [nationalities]);

  const nationalityOptions = React.useMemo(() => getNationalityOptions(), [getNationalityOptions]);
  const bloodTypeOptions = React.useMemo(
    () => Object.entries(bloodType).map(([key, value]) => ({ label: value, value: key })),
    []
  );

  const getMaximumDate = React.useCallback(() => createAgeCutoffDate(18), []);

  const getMinimumDate = React.useCallback(() => {
    const today = new Date();
    return new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
  }, []);

  const onSubmit = (data: PersonalDetailsData) => {
    updateStepData(data);
    goToNextStep();
  };

  return (
    <Form {...methods}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ThemedView className="flex-1 items-center px-6 pt-6">
            <View className="w-full max-w-md lg:max-w-2xl flex-1">
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="gap-6">
                  <View className="flex-row gap-4">
                    <FormItem className="flex-1">
                      <FormLabel required>Gender</FormLabel>
                      <Controller
                        control={control}
                        name="gender"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <ThemedPicker
                            items={genderOptions}
                            placeholder="Select gender"
                            selectedValue={value}
                            onValueChange={onChange}
                            variant="outlined"
                            size="md"
                            state={error ? "error" : "default"}
                          />
                        )}
                      />
                      <FormMessage>{errors.gender?.message}</FormMessage>
                    </FormItem>

                    <FormItem className="flex-1">
                      <FormLabel required>Civil Status</FormLabel>
                      <Controller
                        control={control}
                        name="civilStatus"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <ThemedPicker
                            items={civilStatusOptions}
                            placeholder="Select status"
                            selectedValue={value}
                            onValueChange={onChange}
                            variant="outlined"
                            size="md"
                            state={error ? "error" : "default"}
                          />
                        )}
                      />
                      <FormMessage>{errors.civilStatus?.message}</FormMessage>
                    </FormItem>
                  </View>

                  <View className="flex-row gap-4">
                    <FormItem className="flex-1">
                      <FormLabel required>Religion</FormLabel>
                      <Controller
                        control={control}
                        name="religion"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <ThemedPicker
                            items={religionOptions}
                            placeholder="Select religion"
                            selectedValue={value}
                            onValueChange={onChange}
                            variant="outlined"
                            size="md"
                            state={error ? "error" : "default"}
                          />
                        )}
                      />
                      <FormMessage>{errors.religion?.message}</FormMessage>
                    </FormItem>

                    <FormItem className="flex-1">
                      <FormLabel required>Nationality</FormLabel>
                      <Controller
                        control={control}
                        name="nationality"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <ThemedPicker
                            items={nationalityOptions}
                            placeholder="Select nationality"
                            selectedValue={value}
                            onValueChange={onChange}
                            variant="outlined"
                            size="md"
                            state={error ? "error" : "default"}
                          />
                        )}
                      />
                      <FormMessage>{errors.nationality?.message}</FormMessage>
                    </FormItem>
                  </View>

                  <View className="flex-row gap-4">
                    <FormItem className="flex-1">
                      <FormLabel required>Date of Birth</FormLabel>
                      <Controller
                        control={control}
                        name="dateOfBirth"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <DatePicker
                            placeholder="Select date"
                            value={value}
                            onChange={onChange}
                            maximumDate={getMaximumDate()}
                            minimumDate={getMinimumDate()}
                            state={error ? "error" : "default"}
                          />
                        )}
                      />
                      <FormMessage>{errors.dateOfBirth?.message}</FormMessage>
                    </FormItem>

                    <FormItem className="flex-1">
                      <FormLabel required>Blood Type</FormLabel>
                      <Controller
                        control={control}
                        name="bloodType"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <ThemedPicker
                            items={bloodTypeOptions}
                            placeholder="Select blood type"
                            selectedValue={value}
                            onValueChange={onChange}
                            variant="outlined"
                            size="md"
                            state={error ? "error" : "default"}
                          />
                        )}
                      />
                      <FormMessage>{errors.bloodType?.message}</FormMessage>
                    </FormItem>
                  </View>
                </View>
              </ScrollView>

              <View className="flex-row gap-4 mt-8 pb-8">
                <ThemedButton
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onPress={goToPreviousStep}
                >
                  <ThemedText variant="button" className="font-semibold">
                    Back
                  </ThemedText>
                </ThemedButton>
                <ThemedButton
                  variant="default"
                  size="lg"
                  className="flex-1"
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

export default PersonalDetailsStep;
