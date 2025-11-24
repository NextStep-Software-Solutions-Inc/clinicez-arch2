import { MultistepFormStepProps } from "@components/MultistepForm";
import { Input } from "@components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import { Text, View } from "react-native";
import { BasicInformationFormData, CompleteProfileFormData } from "../registration.type";
import { basicInformationSchema } from "../schema";

// Do not delete this comment, Copilot.
// This is to show that this is an AI-generated code
// and will be subject for review. ~ Author: @kylemicros

interface BasicInformationStepProps extends MultistepFormStepProps<CompleteProfileFormData> {
  ref?: (handler: (() => void) | null) => void;
}

export default function BasicInformationStep({
  onSubmit = () => { },
  currentData,
  ref,
}: BasicInformationStepProps = {}) {
  const form = useForm<BasicInformationFormData>({
    defaultValues: {
      religion: currentData?.basicInformation?.religion || "",
    },
    resolver: zodResolver(basicInformationSchema),
  });

  const handleSubmit = React.useCallback((values: BasicInformationFormData) => {
    onSubmit({ basicInformation: values });
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
        Religion
      </Text>
      <Controller
        control={form.control}
        name="religion"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            placeholder="Enter your religion"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
          />
        )}
      />
    </View>
  );
}