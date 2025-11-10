import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useMemo, useCallback } from "react";
import { createMultiStepFormAtoms } from "../state/multi-step-form.atoms";

/**
 * Custom hook to manage multi-step form state with Jotai
 * 
 * @param storageKey - Unique key for localStorage persistence
 * @param initialData - Initial form data (optional)
 * @returns Object containing form state and control functions
 * 
 * @example
 * ```tsx
 * const {
 *   formData,
 *   currentStepIndex,
 *   hasUnsavedChanges,
 *   updateStepData,
 *   goToNextStep,
 *   goToPreviousStep,
 *   clearForm,
 * } = useMultiStepForm<MyFormData>("my-form-key");
 * ```
 */
export function useMultiStepForm<T extends Record<string, unknown>>(
  storageKey: string,
  initialData: Partial<T> = {}
) {
  const atoms = useMemo(
    () => createMultiStepFormAtoms<T>(storageKey, initialData),
    [storageKey, initialData]
  );

  const [formData, setFormData] = useAtom(atoms.formDataAtom);
  const [currentStepIndex, setCurrentStepIndex] = useAtom(atoms.currentStepIndexAtom);
  const [isFormCompleted, setIsFormCompleted] = useAtom(atoms.isFormCompletedAtom);
  const hasUnsavedChanges = useAtomValue(atoms.hasUnsavedChangesAtom);

  const updateStepData = useSetAtom(atoms.updateStepDataAtom);
  const mergeStepData = useSetAtom(atoms.mergeStepDataAtom);
  const clearFormData = useSetAtom(atoms.clearFormDataAtom);
  const goToNextStep = useSetAtom(atoms.goToNextStepAtom);
  const goToPreviousStep = useSetAtom(atoms.goToPreviousStepAtom);
  const goToStep = useSetAtom(atoms.goToStepAtom);

  const updateStep = useCallback(
    <K extends keyof T>(stepKey: K, data: T[K]) => {
      updateStepData({ stepKey, data });
    },
    [updateStepData]
  );

  const mergeStep = useCallback(
    <K extends keyof T>(stepKey: K, data: Partial<T[K]>) => {
      mergeStepData({ stepKey, data });
    },
    [mergeStepData]
  );

  const clearForm = useCallback(() => {
    clearFormData();
  }, [clearFormData]);

  const completeForm = useCallback(() => {
    setIsFormCompleted(true);
  }, [setIsFormCompleted]);

  return {
    // State
    formData,
    setFormData,
    currentStepIndex,
    setCurrentStepIndex,
    isFormCompleted,
    hasUnsavedChanges,

    // Step navigation
    goToNextStep,
    goToPreviousStep,
    goToStep,

    // Data management
    updateStepData: updateStep,
    mergeStepData: mergeStep,
    clearForm,
    completeForm,
  };
}
