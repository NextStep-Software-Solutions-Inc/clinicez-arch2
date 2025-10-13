import React, { useState } from "react";
import { View, Image, ImageSourcePropType } from "react-native";

import ThemedView from "@components/ThemedView";
import ProgressHeader, { ProgressStep } from "@components/ProgressHeader";

export interface MultiStepFormData {
  [stepName: string]: Record<string, unknown>;
}

export interface StepRenderProps<
  TStep extends string,
  TData extends Record<TStep, Record<string, unknown>>
> {
  currentStep: TStep;
  formData: Partial<TData>;
  updateFormData: (stepData: TData[TStep]) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  handleComplete: (finalData: TData[TStep]) => void;
}

interface MultiStepFormProps<
  TStep extends string,
  TData extends Record<TStep, Record<string, unknown>>
> {
  steps: Array<ProgressStep & { routeName: TStep }>;
  initialStep: TStep;
  showLogo?: boolean;
  logoSource?: ImageSourcePropType;
  children: (props: StepRenderProps<TStep, TData>) => React.ReactNode;
  onComplete: (data: TData) => void | Promise<void>;
}

const MultiStepForm = <
  TStep extends string,
  TData extends Record<TStep, Record<string, unknown>>
>({
  steps,
  initialStep,
  showLogo = false,
  logoSource,
  children,
  onComplete
}: MultiStepFormProps<TStep, TData>) => {
  const [currentStep, setCurrentStep] = useState<TStep>(initialStep);
  const [formData, setFormData] = useState<Partial<TData>>({});

  const currentStepIndex = steps.findIndex(step => step.routeName === currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const updateFormData = (stepData: TData[TStep]) => {
    setFormData(prevData => ({
      ...prevData,
      [currentStep]: stepData
    }));
  };

  const goToNextStep = () => {
    if (!isLastStep) {
      const nextStepIndex = currentStepIndex + 1;
      setCurrentStep(steps[nextStepIndex].routeName);
    }
  };

  const goToPreviousStep = () => {
    if (!isFirstStep) {
      const previousStepIndex = currentStepIndex - 1;
      setCurrentStep(steps[previousStepIndex].routeName);
    }
  };

  const completeCurrentStep = (finalStepData: TData[TStep]) => {
    const finalData = {
      ...formData,
      [currentStep]: finalStepData
    } as Partial<TData>;
    setFormData(finalData);
    void onComplete(finalData as TData);
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
        steps={steps}
        currentStep={currentStep}
      />

      <View className="flex-1">
        {children({
          currentStep,
          formData: formData as Partial<TData>,
          updateFormData,
          goToNextStep,
          goToPreviousStep,
          isFirstStep,
          isLastStep,
          handleComplete: completeCurrentStep
        })}
      </View>
    </ThemedView>
  );
};

export default MultiStepForm;