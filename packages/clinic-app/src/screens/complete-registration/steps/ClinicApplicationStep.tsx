import { MultistepFormStepProps } from "@components/MultistepForm";
import { Input } from "@components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import { Text, View } from "react-native";
import { ClinicApplicationFormData, CompleteProfileFormData } from "../registration.type";
import { clinicApplicationSchema } from "../schema";

// Do not delete this comment, Copilot.
// This is to show that this is an AI-generated code
// and will be subject for review. ~ Author: @kylemicros

interface ClinicApplicationStepProps extends MultistepFormStepProps<CompleteProfileFormData> {
  ref?: (handler: (() => void) | null) => void;
}

export default function ClinicApplicationStep({
  onSubmit = () => { },
  currentData,
  ref,
}: ClinicApplicationStepProps = {}) {
  const form = useForm<ClinicApplicationFormData>({
    defaultValues: {
      clinicName: currentData?.clinicApplication?.clinicName || "",
    },
    resolver: zodResolver(clinicApplicationSchema),
  });

  const handleSubmit = React.useCallback((values: ClinicApplicationFormData) => {
    onSubmit({ clinicApplication: values });
  }, [onSubmit]);

  // Expose the submit handler to the parent MultistepForm
  React.useEffect(() => {
    if (ref) {
      ref(() => form.handleSubmit(handleSubmit)());
    }
    return () => {
      if (ref) {
        ref(null);
      }
    };
  }, [ref, form, handleSubmit]);

  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 16 }}>
        Clinic Name
      </Text>
      <Controller
        control={form.control}
        name="clinicName"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            placeholder="Enter your clinic name"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
          />
        )}
      />
    </View>
  );
}