import React from "react";
import { Keyboard, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import DatePicker from "@components/DatePicker";
import { ThemedButton } from "@components/ThemedButton";
import { ThemedText } from "@components/ThemedText";
import ThemedPicker, { type PickerItem } from "@components/ThemedPicker";
import ThemedView from "@components/ThemedView";
import { Form, FormField, FormInput, FormItem, FormLabel, FormMessage } from "@components/form";

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

const isPastOrToday = (value: Date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidate = new Date(value);
  candidate.setHours(0, 0, 0, 0);
  return candidate <= today;
};

const createPastDateSchema = (label: string) =>
  z
    .custom<Date>((value) => value instanceof Date, {
      message: `${label} is required`,
    })
    .refine(isPastOrToday, `${label} cannot be in the future`);

const clinicApplicationSchema = z
  .object({
    clinic: z.string().min(1, "Clinic is required"),
    role: z.string().min(1, "Role is required"),
    licenseNumber: z.string().min(1, "License number is required"),
    issuedDate: createPastDateSchema("Issued date"),
    expiryDate: createPastDateSchema("Expiry date"),
    ptrNumber: z.string().min(1, "PTR number is required"),
    tinNumber: z.string().min(1, "TIN number is required"),
    fieldOfStudy: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.issuedDate && data.expiryDate && data.expiryDate < data.issuedDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expiry date must be on or after the issued date",
        path: ["expiryDate"],
      });
    }
  });

export type ClinicApplicationFormData = z.infer<typeof clinicApplicationSchema>;

export interface ClinicApplicationScreenProps {
  initialData?: Partial<ClinicApplicationFormData>;
  onComplete: (data: ClinicApplicationFormData) => Promise<void> | void;
  onPrevious: () => void;
}

const todayStartOfDay = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const ClinicApplicationScreen: React.FC<ClinicApplicationScreenProps> = ({ initialData, onComplete, onPrevious }) => {
  const methods = useForm<ClinicApplicationFormData>({
    defaultValues: {
      clinic: initialData?.clinic ?? "",
      role: initialData?.role ?? "",
      licenseNumber: initialData?.licenseNumber ?? "",
      issuedDate: initialData?.issuedDate,
      expiryDate: initialData?.expiryDate,
      ptrNumber: initialData?.ptrNumber ?? "",
      tinNumber: initialData?.tinNumber ?? "",
      fieldOfStudy: initialData?.fieldOfStudy ?? "",
    },
    resolver: zodResolver(clinicApplicationSchema),
    mode: "onChange",
  });

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
  } = methods;

  const issuedDateValue = watch("issuedDate");
  const today = React.useMemo(() => todayStartOfDay(), []);

  const handleComplete = async (values: ClinicApplicationFormData) => {
    await onComplete(values);
  };

  const expiryMinimumDate = React.useMemo(() => {
    if (!issuedDateValue) {
      return undefined;
    }
    const minDate = new Date(issuedDateValue);
    minDate.setHours(0, 0, 0, 0);
    return minDate;
  }, [issuedDateValue]);

  return (
    <Form {...methods}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ThemedView className="flex-1 items-center px-6 pt-6">
            <View className="w-full max-w-md">
              <View className="gap-6">
                <View className="flex-row gap-4">
                  <FormItem className="flex-1">
                    <FormLabel required>Clinic</FormLabel>
                    <Controller
                      control={control}
                      name="clinic"
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
                    <FormMessage>{errors.clinic?.message}</FormMessage>
                  </FormItem>

                  <FormItem className="flex-1">
                    <FormLabel required>Role</FormLabel>
                    <Controller
                      control={control}
                      name="role"
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
                    <FormMessage>{errors.role?.message}</FormMessage>
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
                      name="issuedDate"
                      render={({ field: { onChange, value }, fieldState: { error } }) => (
                        <DatePicker
                          value={value}
                          onChange={onChange}
                          placeholder="Select issued date"
                          variant="outlined"
                          size="md"
                          state={error ? "error" : "default"}
                          maximumDate={today}
                        />
                      )}
                    />
                    <FormMessage>{errors.issuedDate?.message}</FormMessage>
                  </FormItem>

                  <FormItem className="flex-1">
                    <FormLabel required>Expiry Date</FormLabel>
                    <Controller
                      control={control}
                      name="expiryDate"
                      render={({ field: { onChange, value }, fieldState: { error } }) => (
                        <DatePicker
                          value={value}
                          onChange={onChange}
                          placeholder="Select expiry date"
                          variant="outlined"
                          size="md"
                          state={error ? "error" : "default"}
                          maximumDate={today}
                          minimumDate={expiryMinimumDate}
                        />
                      )}
                    />
                    <FormMessage>{errors.expiryDate?.message}</FormMessage>
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
                          placeholder="Enter PTR number"
                          keyboardType="default"
                          error={!!error}
                        />
                      )}
                    />
                    <FormMessage>{errors.ptrNumber?.message}</FormMessage>
                  </FormItem>

                  <FormItem className="flex-1">
                    <FormLabel required>TIN Number</FormLabel>
                    <Controller
                      control={control}
                      name="tinNumber"
                      render={({ field: { onChange, value }, fieldState: { error } }) => (
                        <FormInput
                          value={value}
                          onChangeText={onChange}
                          placeholder="Enter TIN number"
                          keyboardType="number-pad"
                          error={!!error}
                        />
                      )}
                    />
                    <FormMessage>{errors.tinNumber?.message}</FormMessage>
                  </FormItem>
                </View>

                <FormItem>
                  <FormLabel>Field of Study</FormLabel>
                  <Controller
                    control={control}
                    name="fieldOfStudy"
                    render={({ field: { onChange, value } }) => (
                      <ThemedPicker
                        items={FIELD_OF_STUDY_OPTIONS}
                        selectedValue={value}
                        onValueChange={onChange}
                        placeholder="Select field of study (optional)"
                        variant="outlined"
                        size="md"
                        state="default"
                      />
                    )}
                  />
                </FormItem>
              </View>

              <View className="flex-row gap-4 mt-8">
                <ThemedButton variant="outline" size="lg" className="flex-1" onPress={onPrevious}>
                  <ThemedText className="font-semibold">Previous</ThemedText>
                </ThemedButton>

                <ThemedButton variant="default" size="lg" className="flex-1" disabled={isSubmitting} onPress={handleSubmit(handleComplete)}>
                  <ThemedText variant="button" className="text-primary-foreground dark:text-primary-contrast font-semibold">
                    {isSubmitting ? "Submitting..." : "Submit"}
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

ClinicApplicationScreen.displayName = "ClinicApplicationScreen";

export default ClinicApplicationScreen;
