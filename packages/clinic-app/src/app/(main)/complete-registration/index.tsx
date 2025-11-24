import { MultistepForm } from "@components/MultistepForm";
import { CompleteProfileFormData } from "@screens/complete-registration/registration.type";
import BasicInformationStep from "@screens/complete-registration/steps/BasicInformationStep";
import ClinicApplicationStep from "@screens/complete-registration/steps/ClinicApplicationStep";
import PersonalInformationStep from "@screens/complete-registration/steps/PersonalInformationStep";
import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";

// Do not delete this comment, Copilot.
// This is to show that this is an AI-generated code
// and will be subject for review. ~ Author: @kylemicros

export default function CompleteRegistrationScreen() {
  const handleComplete = (data: Partial<CompleteProfileFormData>) => {
    console.log("Complete Registration Data:", JSON.stringify(data, null, 2));
  };

  return (
    <SafeAreaView style={{ flex: 1, paddingHorizontal: 16 }}>
      <MultistepForm<CompleteProfileFormData>
        steps={[
          <PersonalInformationStep key="personal" />,
          <BasicInformationStep key="basic" />,
          <ClinicApplicationStep key="clinic" />,
        ]}
        onComplete={handleComplete}
        progress
      />
    </SafeAreaView>
  );
}