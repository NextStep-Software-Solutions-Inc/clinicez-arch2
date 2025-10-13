import React from "react";
import { Keyboard, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import DatePicker from "@components/DatePicker";
import ThemedPicker from "@components/ThemedPicker";
import { ThemedButton } from "@components/ThemedButton";
import { ThemedText } from "@components/ThemedText";
import ThemedView from "@components/ThemedView";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@components/form";
import { getNationalities, popularNationalities, type Nationality } from "@lib/nationality";

const gender = {
  male: "Male",
  female: "Female",
  other: "Other",
} as const;

const civilStatus = {
  single: "Single",
  married: "Married",
  divorced: "Divorced",
  widowed: "Widowed",
  separated: "Separated",
} as const;

const religion = {
  christianity: "Christianity",
  islam: "Islam",
  hinduism: "Hinduism",
  buddhism: "Buddhism",
  judaism: "Judaism",
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

const MINIMUM_AGE_YEARS = 13;

const createAgeCutoffDate = () => {
  const today = new Date();
  return new Date(today.getFullYear() - MINIMUM_AGE_YEARS, today.getMonth(), today.getDate());
};

const dateOfBirthSchema = z
  .custom<Date>((value) => value instanceof Date, {
    message: "Date of birth is required",
  })
  .refine((value) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const candidate = new Date(value);
    candidate.setHours(0, 0, 0, 0);
    return candidate <= today;
  }, "Date of birth cannot be in the future")
  .refine((value) => {
    const cutoff = createAgeCutoffDate();
    cutoff.setHours(0, 0, 0, 0);
    const candidate = new Date(value);
    candidate.setHours(0, 0, 0, 0);
    return candidate <= cutoff;
  }, `You must be at least ${MINIMUM_AGE_YEARS} years old`);

const personalDetailsSchema = z.object({
  gender: z.string().min(1, "Gender is required"),
  civilStatus: z.string().min(1, "Civil status is required"),
  religion: z.string().min(1, "Religion is required"),
  nationality: z.string().min(1, "Nationality is required"),
  dateOfBirth: dateOfBirthSchema,
  bloodType: z.string().min(1, "Blood type is required"),
});

export type PersonalDetailsFormData = z.infer<typeof personalDetailsSchema>;

export interface PersonalDetailsScreenProps {
  initialData?: PersonalDetailsFormData;
  onNext: (data: PersonalDetailsFormData) => void;
  onPrevious: () => void;
}

const PersonalDetailsScreen: React.FC<PersonalDetailsScreenProps> = ({ initialData, onNext, onPrevious }) => {
  const nationalities = getNationalities();

  const methods = useForm<PersonalDetailsFormData>({
    defaultValues: {
      gender: initialData?.gender ?? "",
      civilStatus: initialData?.civilStatus ?? "",
      religion: initialData?.religion ?? "",
      nationality: initialData?.nationality ?? "",
      dateOfBirth: initialData?.dateOfBirth,
      bloodType: initialData?.bloodType ?? "",
    },
    resolver: zodResolver(personalDetailsSchema),
    mode: "onChange",
  });

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = methods;

  const genderOptions = React.useMemo(() => Object.entries(gender).map(([key, value]) => ({ label: value, value: key })), []);
  const civilStatusOptions = React.useMemo(() => Object.entries(civilStatus).map(([key, value]) => ({ label: value, value: key })), []);
  const religionOptions = React.useMemo(() => Object.entries(religion).map(([key, value]) => ({ label: value, value: key })), []);

  const getNationalityOptions = React.useCallback(() => {
    const popular = popularNationalities
      .map((name) => nationalities.find((nat) => nat.name === name))
      .filter((nat): nat is Nationality => nat !== undefined);

    const remaining = nationalities.filter((nat) => !popularNationalities.includes(nat.name));

    const sorted = [...popular, ...remaining];
    return sorted.map((nat) => ({ label: nat.name, value: nat.name }));
  }, [nationalities]);

  const nationalityOptions = React.useMemo(() => getNationalityOptions(), [getNationalityOptions]);
  const bloodTypeOptions = React.useMemo(() => Object.entries(bloodType).map(([key, value]) => ({ label: value, value: key })), []);

  const getMaximumDate = React.useCallback(() => createAgeCutoffDate(), []);

  const getMinimumDate = React.useCallback(() => {
    const today = new Date();
    return new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
  }, []);

  const onSubmit = (data: PersonalDetailsFormData) => {
    onNext(data);
  };

  return (
    <Form {...methods}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ThemedView className="flex-1 items-center px-6 pt-6">
            <View className="w-full max-w-md">
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

                <FormItem>
                  <FormLabel required>Date of Birth</FormLabel>
                  <Controller
                    control={control}
                    name="dateOfBirth"
                    render={({ field: { onChange, value }, fieldState: { error } }) => (
                      <DatePicker
                        value={value}
                        onChange={onChange}
                        placeholder="Select your date of birth"
                        variant="outlined"
                        size="md"
                        state={error ? "error" : "default"}
                        maximumDate={getMaximumDate()}
                        minimumDate={getMinimumDate()}
                      />
                    )}
                  />
                  <FormMessage>{errors.dateOfBirth?.message}</FormMessage>
                </FormItem>

                <FormItem>
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

              <View className="flex-row gap-4 mt-8">
                <ThemedButton variant="outline" size="lg" className="flex-1" onPress={onPrevious}>
                  <ThemedText className="font-semibold">Previous</ThemedText>
                </ThemedButton>

                <ThemedButton variant="default" size="lg" className="flex-1" disabled={isSubmitting} onPress={handleSubmit(onSubmit)}>
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

PersonalDetailsScreen.displayName = "PersonalDetailsScreen";

export default PersonalDetailsScreen;
