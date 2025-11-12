import React, { useState } from "react";
import { router } from "expo-router";
import { useUser } from "@clerk/clerk-expo";

import MultiStepFormV2, {
  type MultiStepConfig,
} from "@components/MultiStepFormV2";
import { shouldShowOnboarding } from "@utils/onboarding-status";
import { markProfileAsComplete, shouldCompleteProfile } from "@utils/profile-status";
import ClinicEZLogo from "@images/clinicez-logo-v2.png";

import BasicInformationStep from "./steps/BasicInformationStep";
import PersonalDetailsStep from "./steps/PersonalDetailsStep";
import ClinicApplicationStep from "./steps/ClinicApplicationStep";

import { useCreateHealthcareProvider } from "@hooks/useCreateHealthcareProvider";
import {
  flattenCompleteProfileFormData,
  generateEmailPlaceholder,
} from "@lib/healthcare-provider-transform";
import type {
  BasicInformationData,
  PersonalDetailsData,
  ClinicApplicationData,
} from "../../schemas/healthcare-provider.schema";

/**
 * Complete profile form data structure
 */
export interface CompleteProfileFormData extends Record<string, unknown> {
  basicInformation: BasicInformationData;
  personalDetails: PersonalDetailsData;
  clinicApplication: ClinicApplicationData;
}

/**
 * Form steps configuration
 */
const steps: MultiStepConfig<CompleteProfileFormData, keyof CompleteProfileFormData>[] = [
  {
    id: 1,
    title: "Basic Information",
    description: "Tell us about yourself",
    routeName: "basic-information",
    stepKey: "basicInformation",
    component: (props) => (
      <BasicInformationStep {...props} stepData={props.stepData as Partial<BasicInformationData>} />
    ),
  },
  {
    id: 2,
    title: "Personal Details",
    description: "Additional information",
    routeName: "personal-details",
    stepKey: "personalDetails",
    component: (props) => (
      <PersonalDetailsStep {...props} stepData={props.stepData as Partial<PersonalDetailsData>} />
    ),
  },
  {
    id: 3,
    title: "Clinic Application",
    description: "Complete your application",
    routeName: "clinic-application",
    stepKey: "clinicApplication",
    component: (props) => (
      <ClinicApplicationStep {...props} stepData={props.stepData as Partial<ClinicApplicationData>} />
    ),
  },
];

const TENANT_ID = "default-tenant"; // TODO: Get from context or auth

const CompleteProfileScreen: React.FC = () => {
  const { user } = useUser();
  const { createProvider, isCreating } = useCreateHealthcareProvider();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleComplete = async (formData: Partial<CompleteProfileFormData>) => {
    if (!user?.id) {
      setSubmitError("User not authenticated");
      return;
    }

    if (
      !formData.basicInformation ||
      !formData.personalDetails ||
      !formData.clinicApplication
    ) {
      setSubmitError("Please complete all form steps");
      return;
    }

    setSubmitError(null);

    // Check if profile already exists in database to prevent duplicate submissions
    const existingProfile = await shouldCompleteProfile(user.id);
    if (!existingProfile) {
      console.log("=== PROFILE ALREADY EXISTS ===");
      console.log("Redirecting to onboarding or main app...");

      // Mark as complete in SecureStore if not already
      await markProfileAsComplete();

      // Check if onboarding is required
      const requiresOnboarding = await shouldShowOnboarding();
      if (requiresOnboarding) {
        router.replace("/onboarding");
        return;
      }

      // Navigate to main app
      router.replace("/(main)/(tabs)");
      return;
    }

    // Transform the form data
    const transformedData = flattenCompleteProfileFormData(
      formData as CompleteProfileFormData,
      user.id,
      TENANT_ID
    );

    // Generate placeholder email until we add email field
    const email = generateEmailPlaceholder(
      transformedData.firstName,
      transformedData.lastName
    );

    // Create the healthcare provider with basic info
    const result = await createProvider({
      basicInfo: {
        firstName: transformedData.firstName,
        lastName: transformedData.lastName,
        suffix: transformedData.suffix,
        nickname: transformedData.nickname,
        email,
        phoneNumber: transformedData.phoneNumber,
        gender: transformedData.gender,
        civilStatus: transformedData.civilStatus,
        dateOfBirth: transformedData.dateOfBirth,
        nationality: transformedData.nationality,
        religion: transformedData.religion,
        bloodType: transformedData.bloodType,
        tenantId: TENANT_ID,
      },
      provider: {
        userId: user.id,
        type: transformedData.type,
        about: transformedData.about,
        specialties: transformedData.specialties,
        licenseNumber: transformedData.licenseNumber,
        licenseIssuedDate: transformedData.licenseIssuedDate,
        licenseExpiryDate: transformedData.licenseExpiryDate,
        ptrNumber: transformedData.ptrNumber,
        taxNumber: transformedData.taxNumber,
        fieldOfStudy: transformedData.fieldOfStudy,
        tenantId: TENANT_ID,
      },
    });

    if (!result.ok) {
      setSubmitError(result.error.userMessage);
      return;
    }

    console.log("=== HEALTHCARE PROVIDER CREATED ===");
    console.log("Provider ID:", result.data.providerId);
    console.log("Basic Info ID:", result.data.basicInfoId);
    console.log("=====================================");

    // Mark profile as complete
    await markProfileAsComplete();

    // Check if onboarding is required
    const requiresOnboarding = await shouldShowOnboarding();
    if (requiresOnboarding) {
      router.replace("/onboarding");
      return;
    }

    // Navigate to main app
    router.replace("/(main)/(tabs)");
  };

  return (
    <MultiStepFormV2<CompleteProfileFormData>
      steps={steps}
      storageKey="complete-profile-v2"
      showLogo
      logoSource={ClinicEZLogo}
      onComplete={handleComplete}
      isSubmitting={isCreating}
    />
  );
};

CompleteProfileScreen.displayName = "CompleteProfileScreen";

export default CompleteProfileScreen;
