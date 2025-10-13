import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Form, FormField, FormInput, FormItem, FormLabel, FormMessage } from "@components/form";
import DatePicker from "@components/DatePicker";
import ThemedPicker from "@components/ThemedPicker";
import ThemedButton from "@components/ThemedButton";
import ThemedText from "@components/ThemedText";
import { familySuffix } from "@lib/utils";

const newPatientSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  middleName: z.string().optional(),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  suffix: z.string().optional(),
  gender: z.enum(["male", "female"], "Gender is required"),
  birthdate: z
    .custom<Date>((value) => value instanceof Date, {
      message: "Birthdate is required",
    })
    .refine((value) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const candidate = new Date(value);
      candidate.setHours(0, 0, 0, 0);
      return candidate <= today;
    }, "Birthdate cannot be in the future"),
});

type NewPatientFormData = z.infer<typeof newPatientSchema>;

type AddNewPatientFormProps = {
  onSubmit: (data: NewPatientFormData) => void | Promise<void>;
  onCancel: () => void;
};

const AddNewPatientForm: React.FC<AddNewPatientFormProps> = ({ onSubmit, onCancel }) => {
  const methods = useForm<NewPatientFormData>({
    defaultValues: {
      firstName: "",
      middleName: "",
      lastName: "",
      suffix: "",
      gender: undefined,
      birthdate: undefined,
    },
    resolver: zodResolver(newPatientSchema),
    mode: "onChange",
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const genderOptions = [
    { label: "Male", value: "male" },
    { label: "Female", value: "female" },
  ];

  const handleFormSubmit = async (data: NewPatientFormData) => {
    await onSubmit(data);
  };

  return (
    <Form {...methods}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4 pb-4">
            <FormField
              control={control}
              name="firstName"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel required>First Name</FormLabel>
                  <FormInput
                    placeholder="Enter first name"
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
              name="middleName"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel>Middle Name (Optional)</FormLabel>
                  <FormInput
                    placeholder="Enter middle name"
                    value={value || ""}
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
                    placeholder="Enter last name"
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
                  <FormLabel>Suffix (Optional)</FormLabel>
                  <ThemedPicker
                    items={familySuffix.map((suffix) => ({ label: suffix, value: suffix }))}
                    placeholder="Select suffix"
                    selectedValue={value || ""}
                    onValueChange={onChange}
                    variant="outlined"
                    size="md"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="gender"
              render={({ field: { onChange, value } }) => (
                <FormItem>
                  <FormLabel required>Gender</FormLabel>
                  <ThemedPicker
                    items={genderOptions}
                    placeholder="Select gender"
                    selectedValue={value}
                    onValueChange={onChange}
                    variant="outlined"
                    size="md"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="birthdate"
              render={({ field: { onChange, value } }) => (
                <FormItem>
                  <FormLabel required>Birthdate</FormLabel>
                  <DatePicker
                    value={value}
                    onChange={onChange}
                    placeholder="Select birthdate"
                    variant="outlined"
                    size="md"
                    maximumDate={new Date()}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </View>
        </ScrollView>

        <View className="flex-row gap-3 pt-4 border-t border-border dark:border-border-dark">
          <ThemedButton
            variant="outline"
            size="lg"
            className="flex-1"
            onPress={onCancel}
            disabled={isSubmitting}
          >
            <ThemedText className="font-semibold">Cancel</ThemedText>
          </ThemedButton>
          <ThemedButton
            variant="default"
            size="lg"
            className="flex-1"
            onPress={handleSubmit(handleFormSubmit)}
            disabled={isSubmitting}
          >
            <ThemedText variant="button" className="text-primary-foreground dark:text-primary-contrast font-semibold">
              {isSubmitting ? "Adding..." : "Add Patient"}
            </ThemedText>
          </ThemedButton>
        </View>
      </KeyboardAvoidingView>
    </Form>
  );
};

AddNewPatientForm.displayName = "AddNewPatientForm";

export default AddNewPatientForm;
export type { NewPatientFormData };