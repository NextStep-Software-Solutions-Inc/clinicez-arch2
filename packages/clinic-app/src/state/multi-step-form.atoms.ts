import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/**
 * Generic type for multi-step form data
 * Each step name maps to its partial data
 */
export type MultiStepFormData<T> = Partial<T>;

/**
 * Generic type for form step configuration
 */
export interface FormStep {
  id: string;
  title: string;
  description?: string;
}

/**
 * Create atoms for multi-step form state management
 * @param storageKey - Unique key for localStorage persistence
 * @param initialData - Initial form data (default: empty object)
 */
export function createMultiStepFormAtoms<T extends Record<string, unknown>>(
  storageKey: string,
  initialData: Partial<T> = {}
) {
  // Atom for storing form data with localStorage persistence
  const formDataAtom = atomWithStorage<Partial<T>>(
    storageKey,
    initialData,
    undefined,
    { getOnInit: true }
  );

  // Atom for current step index
  const currentStepIndexAtom = atomWithStorage<number>(
    `${storageKey}_step`,
    0,
    undefined,
    { getOnInit: true }
  );

  // Atom for form completion status
  const isFormCompletedAtom = atom<boolean>(false);

  // Derived atom to check if form has unsaved changes
  const hasUnsavedChangesAtom = atom((get) => {
    const data = get(formDataAtom);
    return Object.keys(data).length > 0;
  });

  // Write-only atom to update specific step data
  const updateStepDataAtom = atom(
    null,
    (get, set, update: { stepKey: keyof T; data: T[keyof T] }) => {
      const currentData = get(formDataAtom);
      set(formDataAtom, {
        ...currentData,
        [update.stepKey]: update.data,
      });
    }
  );

  // Write-only atom to merge data into a specific step
  const mergeStepDataAtom = atom(
    null,
    (get, set, update: { stepKey: keyof T; data: Partial<T[keyof T]> }) => {
      const currentData = get(formDataAtom);
      const existingStepData = currentData[update.stepKey] || {};
      set(formDataAtom, {
        ...currentData,
        [update.stepKey]: {
          ...(existingStepData as Record<string, unknown>),
          ...(update.data as Record<string, unknown>),
        },
      });
    }
  );

  // Write-only atom to clear form data
  const clearFormDataAtom = atom(null, (get, set) => {
    set(formDataAtom, {});
    set(currentStepIndexAtom, 0);
    set(isFormCompletedAtom, false);
  });

  // Write-only atom to go to next step
  const goToNextStepAtom = atom(null, (get, set) => {
    const currentStep = get(currentStepIndexAtom);
    set(currentStepIndexAtom, currentStep + 1);
  });

  // Write-only atom to go to previous step
  const goToPreviousStepAtom = atom(null, (get, set) => {
    const currentStep = get(currentStepIndexAtom);
    if (currentStep > 0) {
      set(currentStepIndexAtom, currentStep - 1);
    }
  });

  // Write-only atom to go to specific step
  const goToStepAtom = atom(null, (get, set, stepIndex: number) => {
    set(currentStepIndexAtom, stepIndex);
  });

  return {
    formDataAtom,
    currentStepIndexAtom,
    isFormCompletedAtom,
    hasUnsavedChangesAtom,
    updateStepDataAtom,
    mergeStepDataAtom,
    clearFormDataAtom,
    goToNextStepAtom,
    goToPreviousStepAtom,
    goToStepAtom,
  };
}
