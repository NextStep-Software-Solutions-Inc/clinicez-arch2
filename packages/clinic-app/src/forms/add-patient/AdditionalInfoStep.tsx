import React from "react";
import { View, ScrollView } from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { ThemedText } from "@components/ThemedText";
import ThemedButton from "@components/ThemedButton";
import { Form, FormField, FormInput, FormItem, FormLabel, FormMessage } from "@components/form";
import ThemedPicker from "@components/ThemedPicker";

import { StepRenderProps } from "@components/MultiStepFormV2";
import {
  AddPatientFormData,
  AdditionalInfoStep,
  additionalInfoStepSchema,
  flattenPatientFormData,
} from "../../schemas/add-patient-form.schema";

type AdditionalInfoStepProps = Omit<
  StepRenderProps<AddPatientFormData, "additionalInfo">,
  "currentStepKey" | "stepData"
> & {
  currentStepKey?: keyof AddPatientFormData;
  stepData: Partial<AdditionalInfoStep>;
};

const AdditionalInfoStepForm: React.FC<AdditionalInfoStepProps> = ({
  stepData,
  goToPreviousStep,
  updateStepData,
  mergeStepData,
  handleComplete,
  allFormData,
  isSubmitting = false,
}) => {
  const methods = useForm<AdditionalInfoStep>({
    resolver: zodResolver(additionalInfoStepSchema),
    mode: "onChange",
    defaultValues: stepData,
  });

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = methods;

  const onSubmit = async (data: AdditionalInfoStep) => {
    updateStepData(data);
    // Combine all steps and complete
    const completeData = flattenPatientFormData({
      ...allFormData,
      additionalInfo: data,
    });
    await handleComplete(data);
  };

  // Auto-save on field blur
  const handleFieldBlur = (field: keyof AdditionalInfoStep, value: string | undefined) => {
    if (value !== undefined) {
      mergeStepData({ [field]: value } as Partial<AdditionalInfoStep>);
    }
  };

  const civilStatusOptions = [
    { label: "Select civil status", value: "" },
    { label: "Single", value: "SINGLE" },
    { label: "Married", value: "MARRIED" },
    { label: "Divorced", value: "DIVORCED" },
    { label: "Widowed", value: "WIDOWED" },
    { label: "Separated", value: "SEPARATED" },
  ];

  const bloodTypeOptions = [
    { label: "Select blood type", value: "" },
    { label: "A+", value: "A+" },
    { label: "A-", value: "A-" },
    { label: "B+", value: "B+" },
    { label: "B-", value: "B-" },
    { label: "AB+", value: "AB+" },
    { label: "AB-", value: "AB-" },
    { label: "O+", value: "O+" },
    { label: "O-", value: "O-" },
  ];

  return (
    <Form {...methods}>
      <ScrollView className="flex-1 bg-background dark:bg-background-dark">
        <View className="px-6 py-8">
          <ThemedText className="text-2xl font-bold mb-2">
            Additional Information
          </ThemedText>
          <ThemedText className="text-muted-foreground dark:text-muted-foreground-dark mb-6">
            Just a few more details (all optional)
          </ThemedText>

          <View className="gap-4">
            {/* Civil Status */}
            <FormField
              control={control}
              name="civilStatus"
              render={({ field: { onChange, value } }) => (
                <FormItem>
                  <FormLabel>Civil Status</FormLabel>
                  <ThemedPicker
                    selectedValue={value || ""}
                    onValueChange={(itemValue) => {
                      onChange(itemValue);
                      handleFieldBlur("civilStatus", itemValue as string);
                    }}
                    items={civilStatusOptions}
                    state={errors.civilStatus ? "error" : "default"}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Nationality */}
            <FormField
              control={control}
              name="nationality"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel>Nationality</FormLabel>
                  <FormInput
                    placeholder="Enter nationality (optional)"
                    value={value || ""}
                    onChangeText={onChange}
                    onBlur={() => {
                      onBlur();
                      handleFieldBlur("nationality", value);
                    }}
                    variant="outlined"
                    size="md"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Religion */}
            <FormField
              control={control}
              name="religion"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel>Religion</FormLabel>
                  <FormInput
                    placeholder="Enter religion (optional)"
                    value={value || ""}
                    onChangeText={onChange}
                    onBlur={() => {
                      onBlur();
                      handleFieldBlur("religion", value);
                    }}
                    variant="outlined"
                    size="md"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Blood Type */}
            <FormField
              control={control}
              name="bloodType"
              render={({ field: { onChange, value } }) => (
                <FormItem>
                  <FormLabel>Blood Type</FormLabel>
                  <ThemedPicker
                    selectedValue={value || ""}
                    onValueChange={(itemValue) => {
                      onChange(itemValue);
                      handleFieldBlur("bloodType", itemValue as string);
                    }}
                    items={bloodTypeOptions}
                    state={errors.bloodType ? "error" : "default"}
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
                disabled={isSubmitting}
              >
                Back
              </ThemedButton>
            </View>
            <View className="flex-1">
              <ThemedButton
                onPress={handleSubmit(onSubmit)}
                disabled={!isValid || isSubmitting}
                loading={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Complete"}
              </ThemedButton>
            </View>
          </View>
        </View>
      </ScrollView>
    </Form>
  );
};

export default AdditionalInfoStepForm;
