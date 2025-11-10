import React from "react";
import MultiStepFormV2, { MultiStepConfig } from "@components/MultiStepFormV2";
import PersonalInfoStepForm from "./PersonalInfoStep";
import ContactInfoStepForm from "./ContactInfoStep";
import AdditionalInfoStepForm from "./AdditionalInfoStep";
import {
  AddPatientFormData,
  PersonalInfoStep,
  ContactInfoStep,
  AdditionalInfoStep,
  flattenPatientFormData,
} from "../../schemas/add-patient-form.schema";
import type { CreateBasicInfoInput } from "../../schemas/patient.schema";

interface AddPatientFormProps {
  onComplete: (data: Partial<CreateBasicInfoInput>) => void | Promise<void>;
  onStepChange?: (stepIndex: number, stepKey: keyof AddPatientFormData) => void;
  isSubmitting?: boolean;
}

const STORAGE_KEY = "add_patient_form";

/**
 * Complete multi-step form for adding a new patient
 * 
 * This form demonstrates the usage of:
 * - MultiStepFormV2 with Jotai state management
 * - localStorage persistence for draft saving
 * - Zod validation with zod.pick() for step-specific schemas
 * - Type-safe step data handling with Partial types
 * - zodResolver integration with react-hook-form
 */
const AddPatientForm: React.FC<AddPatientFormProps> = ({
  onComplete,
  onStepChange,
  isSubmitting = false,
}) => {
  const steps: MultiStepConfig<AddPatientFormData, keyof AddPatientFormData>[] = React.useMemo(
    () => [
      {
        id: 1,
        title: "Personal Info",
        description: "",
        routeName: "personalInfo",
        stepKey: "personalInfo",
        component: (props) => (
          <PersonalInfoStepForm {...props} stepData={props.stepData as Partial<PersonalInfoStep>} />
        ),
      },
      {
        id: 2,
        title: "Contact Info",
        description: "",
        routeName: "contactInfo",
        stepKey: "contactInfo",
        component: (props) => (
          <ContactInfoStepForm {...props} stepData={props.stepData as Partial<ContactInfoStep>} />
        ),
      },
      {
        id: 3,
        title: "Additional Info",
        description: "",
        routeName: "additionalInfo",
        stepKey: "additionalInfo",
        component: (props) => (
          <AdditionalInfoStepForm {...props} stepData={props.stepData as Partial<AdditionalInfoStep>} />
        ),
      },
    ],
    []
  );

  const handleComplete = React.useCallback(
    async (formData: Partial<AddPatientFormData>) => {
      // Flatten the multi-step form data back to BasicInfo format
      const flattenedData = flattenPatientFormData(formData);

      await onComplete(flattenedData);
    },
    [onComplete]
  );

  return (
    <MultiStepFormV2<AddPatientFormData>
      steps={steps}
      storageKey={STORAGE_KEY}
      onComplete={handleComplete}
      onStepChange={onStepChange}
      isSubmitting={isSubmitting}
    />
  );
};

export default AddPatientForm;
