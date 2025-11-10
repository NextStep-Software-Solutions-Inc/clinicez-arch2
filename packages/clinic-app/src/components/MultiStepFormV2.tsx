import React, { ReactNode } from "react";
import { View, Image, ImageSourcePropType } from "react-native";
import { useAtom, useSetAtom } from "jotai";

import ThemedView from "@components/ThemedView";
import ProgressHeader, { ProgressStep } from "@components/ProgressHeader";
import { createMultiStepFormAtoms } from "../state/multi-step-form.atoms";

/**
 * Props for render function of each step
 */
export interface StepRenderProps<T, TStepKey extends keyof T> {
  currentStepKey: TStepKey;
  stepData: Partial<T[TStepKey]>;
  allFormData: Partial<T>;
  updateStepData: (data: T[TStepKey]) => void;
  mergeStepData: (data: Partial<T[TStepKey]>) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  goToStep: (stepIndex: number) => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  currentStepIndex: number;
  totalSteps: number;
  clearForm: () => void;
  handleComplete: (finalStepData: T[TStepKey]) => Promise<void>;
  isSubmitting: boolean;
}

/**
 * Configuration for each step in the form
 */
export interface MultiStepConfig<T, TStepKey extends keyof T> extends ProgressStep {
  stepKey: TStepKey;
  component: (props: StepRenderProps<T, TStepKey>) => ReactNode;
}

/**
 * Props for the MultiStepForm component
 */
interface MultiStepFormProps<T extends Record<string, unknown>> {
  steps: MultiStepConfig<T, keyof T>[];
  storageKey: string;
  initialData?: Partial<T>;
  showLogo?: boolean;
  logoSource?: ImageSourcePropType;
  onComplete: (data: Partial<T>) => void | Promise<void>;
  onStepChange?: (stepIndex: number, stepKey: keyof T) => void;
  isSubmitting?: boolean;
}

/**
 * A fully type-safe, multi-step form component with Jotai state management
 * and localStorage persistence.
 *
 * Features:
 * - Type-safe step data management
 * - Automatic localStorage persistence
 * - Partial data support for incomplete forms
 * - Step navigation with validation support
 * - Progress tracking
 *
 * @example
 * ```tsx
 * interface MyFormData {
 *   personal: { name: string; email: string };
 *   address: { street: string; city: string };
 * }
 *
 * <MultiStepFormV2<MyFormData>
 *   storageKey="my-form"
 *   steps={[
 *     {
 *       id: "personal",
 *       stepKey: "personal",
 *       title: "Personal Info",
 *       component: (props) => <PersonalStep {...props} />
 *     },
 *     {
 *       id: "address",
 *       stepKey: "address",
 *       title: "Address",
 *       component: (props) => <AddressStep {...props} />
 *     }
 *   ]}
 *   onComplete={(data) => console.log(data)}
 * />
 * ```
 */
const MultiStepFormV2 = <T extends Record<string, unknown>>({
  steps,
  storageKey,
  initialData,
  showLogo = false,
  logoSource,
  onComplete,
  onStepChange,
  isSubmitting = false,
}: MultiStepFormProps<T>) => {
  // Create or retrieve atoms for this form instance
  // Only create atoms once based on storageKey
  const atoms = React.useMemo(
    () => createMultiStepFormAtoms<T>(storageKey, initialData || {}),
    [storageKey]
    // Don't include initialData in deps to avoid recreating atoms
  );

  // Subscribe to atoms
  const [formData, setFormData] = useAtom(atoms.formDataAtom);
  const [currentStepIndex, setCurrentStepIndex] = useAtom(atoms.currentStepIndexAtom);
  const updateStepData = useSetAtom(atoms.updateStepDataAtom);
  const mergeStepData = useSetAtom(atoms.mergeStepDataAtom);
  const clearFormData = useSetAtom(atoms.clearFormDataAtom);
  const goToNextStep = useSetAtom(atoms.goToNextStepAtom);
  const goToPreviousStep = useSetAtom(atoms.goToPreviousStepAtom);
  const goToStep = useSetAtom(atoms.goToStepAtom);

  // Derived values
  const currentStep = steps[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  // Call onStepChange when step changes
  React.useEffect(() => {
    if (onStepChange && currentStep) {
      onStepChange(currentStepIndex, currentStep.stepKey);
    }
    // Only depend on currentStepIndex, not currentStep object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepIndex, onStepChange]);

  // Handlers
  const handleUpdateStepData = React.useCallback(
    (data: T[keyof T]) => {
      updateStepData({ stepKey: currentStep.stepKey, data });
    },
    [currentStep.stepKey, updateStepData]
  );

  const handleMergeStepData = React.useCallback(
    (data: Partial<T[keyof T]>) => {
      mergeStepData({ stepKey: currentStep.stepKey, data });
    },
    [currentStep.stepKey, mergeStepData]
  );

  const handleComplete = React.useCallback(
    async (finalStepData: T[keyof T]) => {
      const finalData: Partial<T> = {
        ...formData,
        [currentStep.stepKey]: finalStepData,
      };
      setFormData(finalData);
      await onComplete(finalData);
    },
    [formData, currentStep.stepKey, setFormData, onComplete]
  );

  const handleClearForm = React.useCallback(() => {
    clearFormData();
  }, [clearFormData]);

  // Progress steps for header
  const progressSteps: ProgressStep[] = steps.map((step, index) => ({
    id: index + 1,
    title: step.title,
    description: "",
    routeName: String(step.stepKey),
  }));

  if (!currentStep) {
    return null;
  }

  const stepData = (formData[currentStep.stepKey] || {}) as Partial<T[keyof T]>;

  const stepRenderProps: StepRenderProps<T, typeof currentStep.stepKey> = {
    currentStepKey: currentStep.stepKey,
    stepData,
    allFormData: formData,
    updateStepData: handleUpdateStepData,
    mergeStepData: handleMergeStepData,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    isFirstStep,
    isLastStep,
    currentStepIndex,
    totalSteps: steps.length,
    clearForm: handleClearForm,
    handleComplete,
    isSubmitting,
  };

  return (
    <ThemedView className="flex-1">
      {showLogo && logoSource && (
        <View className="bg-background dark:bg-background-dark px-6 pt-16">
          <View className="w-full items-center">
            <Image
              source={logoSource}
              className="w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36 lg:w-40 lg:h-40"
              resizeMode="contain"
            />
          </View>
        </View>
      )}

      <ProgressHeader
        steps={progressSteps}
        currentStep={String(currentStep.stepKey)}
      />

      <View className="flex-1">
        {currentStep.component(stepRenderProps)}
      </View>
    </ThemedView>
  );
};

export default MultiStepFormV2;
