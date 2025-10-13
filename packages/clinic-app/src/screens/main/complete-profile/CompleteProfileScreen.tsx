import React from "react";
import { router } from "expo-router";

import MultiStepForm, { type StepRenderProps } from "@components/MultiStepForm";
import { type ProgressStep } from "@components/ProgressHeader";
import { shouldShowOnboarding } from "@utils/onboarding-status";
import { markProfileAsComplete } from "@utils/profile-status";
import ClinicEZLogo from "@images/clinicez-logo-v2.png";

import BasicInformationScreen, { type BasicInfoFormData } from "./BasicInformationScreen";
import ClinicApplicationScreen, { type ClinicApplicationFormData } from "./ClinicApplicationScreen";
import PersonalDetailsScreen, { type PersonalDetailsFormData } from "./PersonalDetailsScreen";

type CompleteProfileStep = "BasicInformation" | "PersonalDetails" | "ClinicApplication";

type CompleteProfileFormData = {
  BasicInformation: BasicInfoFormData;
  PersonalDetails: PersonalDetailsFormData;
  ClinicApplication: ClinicApplicationFormData;
};

const steps: Array<ProgressStep & { routeName: CompleteProfileStep }> = [
  { id: 1, title: "Basic Information", description: "Tell us about yourself", routeName: "BasicInformation" },
  { id: 2, title: "Personal Details", description: "Additional information", routeName: "PersonalDetails" },
  { id: 3, title: "Clinic Application", description: "Complete your application", routeName: "ClinicApplication" },
];

const CompleteProfileScreen: React.FC = () => {
  const handleComplete = async (formData: CompleteProfileFormData) => {
    console.log("=== COMPLETE PROFILE FORM DATA ===");
    console.log("Basic Information:", formData.BasicInformation);
    console.log("Personal Details:", formData.PersonalDetails);
    console.log("Clinic Application:", formData.ClinicApplication);
    console.log("=====================================");

    await new Promise((resolve) => setTimeout(resolve, 2000));

    await markProfileAsComplete();

    const requiresOnboarding = await shouldShowOnboarding();
    if (requiresOnboarding) {
      router.replace("/onboarding");
      return;
    }

    router.replace("/(main)/(tabs)");
  };

  const renderCurrentStep = React.useCallback((stepProps: StepRenderProps<CompleteProfileStep, CompleteProfileFormData>) => {
    const { currentStep, formData, updateFormData, goToNextStep, goToPreviousStep, handleComplete: completeStep } = stepProps;

    switch (currentStep) {
      case "BasicInformation":
        return (
          <BasicInformationScreen
            initialData={formData.BasicInformation}
            onNext={(data) => {
              updateFormData(data);
              goToNextStep();
            }}
          />
        );
      case "PersonalDetails":
        return (
          <PersonalDetailsScreen
            initialData={formData.PersonalDetails}
            onNext={(data) => {
              updateFormData(data);
              goToNextStep();
            }}
            onPrevious={goToPreviousStep}
          />
        );
      case "ClinicApplication":
        return (
          <ClinicApplicationScreen
            initialData={formData.ClinicApplication}
            onComplete={(data) => completeStep(data)}
            onPrevious={goToPreviousStep}
          />
        );
      default:
        return null;
    }
  }, []);

  return (
    <MultiStepForm<CompleteProfileStep, CompleteProfileFormData>
      steps={steps}
      initialStep="BasicInformation"
      showLogo
      logoSource={ClinicEZLogo}
      onComplete={handleComplete}
    >
      {renderCurrentStep}
    </MultiStepForm>
  );
};

CompleteProfileScreen.displayName = "CompleteProfileScreen";

export default CompleteProfileScreen;
