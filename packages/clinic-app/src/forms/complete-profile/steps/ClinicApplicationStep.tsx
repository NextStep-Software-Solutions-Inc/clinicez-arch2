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
import { ThemedButton } from "@components/ThemedButton";
import { ThemedText } from "@components/ThemedText";
import ThemedPicker, { type PickerItem } from "@components/ThemedPicker";
import ThemedView from "@components/ThemedView";
import { Form, FormField, FormInput, FormItem, FormLabel, FormMessage } from "@components/form";
import type { StepRenderProps } from "@components/MultiStepFormV2";
import type { CompleteProfileFormData } from "../CompleteProfileForm";
import {
  clinicApplicationSchema,
  type ClinicApplicationData,
} from "../../../schemas/healthcare-provider.schema";

const CLINIC_OPTIONS: PickerItem[] = [
  { label: "Sunrise Health Center", value: "sunrise_health_center" },
  { label: "Evergreen Medical Group", value: "evergreen_medical_group" },
  { label: "MetroCare Specialty Clinic", value: "metrocare_specialty_clinic" },
  { label: "Harborview Family Practice", value: "harborview_family_practice" },
  { label: "Lakeside Wellness Hub", value: "lakeside_wellness_hub" },
];

const ROLE_OPTIONS: PickerItem[] = [
  { label: "Doctor", value: "doctor" },
  { label: "Nurse", value: "nurse" },
  { label: "Physician Assistant", value: "physician_assistant" },
  { label: "Medical Technologist", value: "medical_technologist" },
  { label: "Therapist", value: "therapist" },
  { label: "Administrative Staff", value: "administrative_staff" },
];

const FIELD_OF_STUDY_OPTIONS: PickerItem[] = [
  { label: "General Medicine", value: "general_medicine" },
  { label: "Pediatrics", value: "pediatrics" },
  { label: "Internal Medicine", value: "internal_medicine" },
  { label: "Surgery", value: "surgery" },
  { label: "Nursing", value: "nursing" },
  { label: "Physical Therapy", value: "physical_therapy" },
  { label: "Radiology", value: "radiology" },
  { label: "Pharmacy", value: "pharmacy" },
];

import { getTodayStartOfDay } from "../../../utils/date-helpers";

type ClinicApplicationStepProps = Omit<
  StepRenderProps<CompleteProfileFormData, "clinicApplication">,
  "currentStepKey" | "stepData"
> & {
  currentStepKey?: keyof CompleteProfileFormData;
  stepData: Partial<ClinicApplicationData>;
};

const ClinicApplicationStep: React.FC<ClinicApplicationStepProps> = ({ stepData, handleComplete, goToPreviousStep, isSubmitting }) => {
  const methods = useForm<ClinicApplicationData>({
    defaultValues: {
      clinicId: stepData?.clinicId ?? "",
      type: stepData?.type ?? "",
      licenseNumber: stepData?.licenseNumber ?? "",
      licenseIssuedDate: stepData?.licenseIssuedDate,
      licenseExpiryDate: stepData?.licenseExpiryDate,
      ptrNumber: stepData?.ptrNumber ?? "",
      taxNumber: stepData?.taxNumber ?? "",
      fieldOfStudy: stepData?.fieldOfStudy ?? "",
      about: stepData?.about ?? "",
      specialties: stepData?.specialties ?? "",
    },
    resolver: zodResolver(clinicApplicationSchema),
    mode: "onChange",
  });

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = methods;

  const today = React.useMemo(() => getTodayStartOfDay(), []);

  const onSubmit = async (data: ClinicApplicationData) => {
    await handleComplete(data);
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
                      <FormLabel required>Clinic</FormLabel>
                      <Controller
                        control={control}
                        name="clinicId"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <ThemedPicker
                            items={CLINIC_OPTIONS}
                            selectedValue={value}
                            onValueChange={onChange}
                            placeholder="Select clinic"
                            variant="outlined"
                            size="md"
                            state={error ? "error" : "default"}
                          />
                        )}
                      />
                      <FormMessage>{errors.clinicId?.message}</FormMessage>
                    </FormItem>

                    <FormItem className="flex-1">
                      <FormLabel required>Role</FormLabel>
                      <Controller
                        control={control}
                        name="type"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <ThemedPicker
                            items={ROLE_OPTIONS}
                            selectedValue={value}
                            onValueChange={onChange}
                            placeholder="Select role"
                            variant="outlined"
                            size="md"
                            state={error ? "error" : "default"}
                          />
                        )}
                      />
                      <FormMessage>{errors.type?.message}</FormMessage>
                    </FormItem>
                  </View>

                  <FormItem>
                    <FormLabel required>License Number</FormLabel>
                    <Controller
                      control={control}
                      name="licenseNumber"
                      render={({ field: { onChange, value }, fieldState: { error } }) => (
                        <FormInput
                          value={value}
                          onChangeText={onChange}
                          placeholder="Enter license number"
                          autoCapitalize="characters"
                          error={!!error}
                        />
                      )}
                    />
                    <FormMessage>{errors.licenseNumber?.message}</FormMessage>
                  </FormItem>

                  <View className="flex-row gap-4">
                    <FormItem className="flex-1">
                      <FormLabel required>Issued Date</FormLabel>
                      <Controller
                        control={control}
                        name="licenseIssuedDate"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <DatePicker
                            placeholder="Select date"
                            value={value}
                            onChange={onChange}
                            maximumDate={today}
                            state={error ? "error" : "default"}
                          />
                        )}
                      />
                      <FormMessage>{errors.licenseIssuedDate?.message}</FormMessage>
                    </FormItem>

                    <FormItem className="flex-1">
                      <FormLabel required>Expiry Date</FormLabel>
                      <Controller
                        control={control}
                        name="licenseExpiryDate"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <DatePicker
                            placeholder="Select date"
                            value={value}
                            onChange={onChange}
                            minimumDate={today}
                            state={error ? "error" : "default"}
                          />
                        )}
                      />
                      <FormMessage>{errors.licenseExpiryDate?.message}</FormMessage>
                    </FormItem>
                  </View>

                  <View className="flex-row gap-4">
                    <FormItem className="flex-1">
                      <FormLabel required>PTR Number</FormLabel>
                      <Controller
                        control={control}
                        name="ptrNumber"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <FormInput
                            value={value}
                            onChangeText={onChange}
                            placeholder="PTR number"
                            error={!!error}
                            autoCapitalize="characters"
                          />
                        )}
                      />
                      <FormMessage>{errors.ptrNumber?.message}</FormMessage>
                    </FormItem>

                    <FormItem className="flex-1">
                      <FormLabel required>TIN Number</FormLabel>
                      <Controller
                        control={control}
                        name="taxNumber"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <FormInput
                            value={value}
                            onChangeText={onChange}
                            placeholder="TIN number"
                            error={!!error}
                            keyboardType="number-pad"
                          />
                        )}
                      />
                      <FormMessage>{errors.taxNumber?.message}</FormMessage>
                    </FormItem>
                  </View>

                  <FormItem>
                    <FormLabel>Field of Study</FormLabel>
                    <Controller
                      control={control}
                      name="fieldOfStudy"
                      render={({ field: { onChange, value }, fieldState: { error } }) => (
                        <ThemedPicker
                          items={FIELD_OF_STUDY_OPTIONS}
                          selectedValue={value}
                          onValueChange={onChange}
                          placeholder="Select field"
                          variant="outlined"
                          size="md"
                          state={error ? "error" : "default"}
                        />
                      )}
                    />
                    <FormMessage>{errors.fieldOfStudy?.message}</FormMessage>
                  </FormItem>
                </View>
              </ScrollView>

              <View className="flex-row gap-4 mt-8 pb-8">
                <ThemedButton
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onPress={goToPreviousStep}
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
                >
                  <ThemedText
                    variant="button"
                    className="text-primary-foreground dark:text-primary-contrast font-semibold"
                  >
                    {isSubmitting ? "Submitting..." : "Complete"}
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

export default ClinicApplicationStep;
