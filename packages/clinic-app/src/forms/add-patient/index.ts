/**
 * Multi-Step Form for Adding Patients
 * 
 * This module exports all components and utilities for the patient creation form.
 * The form demonstrates best practices including:
 * - Type-safe multi-step form with Jotai state management
 * - localStorage persistence for draft saving
 * - Zod validation with zod.pick() for step-specific schemas  
 * - zodResolver integration with react-hook-form
 * - Partial types for incomplete form data
 */

export { default as AddPatientForm } from "./AddPatientForm";
export { default as PersonalInfoStepForm } from "./PersonalInfoStep";
export { default as ContactInfoStepForm } from "./ContactInfoStep";
export { default as AdditionalInfoStepForm } from "./AdditionalInfoStep";

export type {
  AddPatientFormData,
  PersonalInfoStep,
  ContactInfoStep,
  AdditionalInfoStep,
} from "../../schemas/add-patient-form.schema";
