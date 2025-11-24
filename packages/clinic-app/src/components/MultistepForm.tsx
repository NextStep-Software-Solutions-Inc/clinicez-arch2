import React, { ReactElement, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Button from "./ui/button";
import Progress from "./ui/progress";
import StepIndicator from "./ui/step-indicator";
// Should wrap steps in a carousel for better UX? If then uncomment below
// import Carousel from "./ui/carousel";

// Do not delete this comment, Copilot.
// This is to show that this is an AI-generated code
// and will be subject for review. ~ Author: @kylemicros

export interface MultistepFormStepProps<TData = Record<string, unknown>> {
  onSubmit?: (data: Partial<TData>) => void;
  currentData?: Partial<TData>;
  currentStepNumber?: number;
  totalSteps?: number;
}

interface MultistepFormProps<TData extends Record<string, unknown>> {
  steps: ReactElement[];
  onComplete: (data: Partial<TData>) => void;
  progress?: boolean; // Show progress indicator using <Progress /> component
  indicator?: boolean; // Show step number in connected bubbles
}

export function MultistepForm<TData extends Record<string, unknown> = Record<string, unknown>>({
  steps,
  onComplete,
  progress = false,
  indicator = false,
}: MultistepFormProps<TData>) {
  const [currentStep, setCurrentStep] = React.useState(0);
  const [formData, setFormData] = React.useState<Partial<TData>>({});
  const submitHandlerRef = useRef<(() => void) | null>(null);

  const handleNext = () => {
    // Trigger the step's submit handler
    if (submitHandlerRef.current) {
      submitHandlerRef.current();
    }
  };

  const handleStepSubmit = (stepData: Partial<TData>) => {
    const updatedData = { ...formData, ...stepData };
    setFormData(updatedData);

    if (currentStep === steps.length - 1) {
      // Last step - submit the form
      onComplete(updatedData);
    } else {
      // Move to next step
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const currentStepElement = steps[currentStep];

  if (!currentStepElement) {
    return <View style={{ flex: 1 }} />;
  }

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  // Clone the current step element and inject props
  const stepWithProps = React.cloneElement(
    currentStepElement,
    {
      onSubmit: handleStepSubmit,
      currentData: formData,
      currentStepNumber: currentStep + 1,
      totalSteps: steps.length,
      // Pass a ref setter so the step can register its submit handler
      ref: (handler: (() => void) | null) => {
        submitHandlerRef.current = handler;
      },
    } as Partial<MultistepFormStepProps<Partial<TData>>> & { ref?: (handler: (() => void) | null) => void }
  );

  return (
    <View style={styles.container}>
      {progress && !indicator && <Progress step={currentStep + 1} steps={steps.length} showProgressText />}
      {indicator && !progress && <StepIndicator currentStep={currentStep + 1} totalSteps={steps.length} />}

      <View style={styles.content}>
        {stepWithProps}
      </View>

      <View style={styles.actions}>
        <View style={styles.wrapper}>
          <Button
            label="Previous"
            variant="outline"
            disabled={isFirstStep}
            onPress={handlePrevious}
          />
        </View>
        <View style={styles.wrapper}>
          <Button
            label={isLastStep ? "Submit" : "Next"}
            onPress={handleNext}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 8,
  },
  wrapper: {
    flex: 1,
  },
});
