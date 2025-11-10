import { z } from "zod";
import { createBasicInfoInputSchema } from "./patient.schema";

/**
 * Step 1: Personal Information
 * Picks essential personal fields from the full schema
 */
export const personalInfoStepSchema = createBasicInfoInputSchema.pick({
  firstName: true,
  middleName: true,
  lastName: true,
  suffix: true,
  nickname: true,
  dateOfBirth: true,
  gender: true,
});

/**
 * Step 2: Contact Information
 * Picks contact-related fields from the full schema
 */
export const contactInfoStepSchema = createBasicInfoInputSchema.pick({
  email: true,
  phoneNumber: true,
});

/**
 * Step 3: Additional Information
 * Picks remaining optional fields from the full schema
 */
export const additionalInfoStepSchema = createBasicInfoInputSchema.pick({
  civilStatus: true,
  nationality: true,
  religion: true,
  bloodType: true,
});

/**
 * Complete multi-step patient form data type
 */
export const addPatientFormSchema = z.object({
  personalInfo: personalInfoStepSchema,
  contactInfo: contactInfoStepSchema,
  additionalInfo: additionalInfoStepSchema,
});

// Type exports for each step
export type PersonalInfoStep = z.infer<typeof personalInfoStepSchema>;
export type ContactInfoStep = z.infer<typeof contactInfoStepSchema>;
export type AdditionalInfoStep = z.infer<typeof additionalInfoStepSchema>;
export type AddPatientFormData = z.infer<typeof addPatientFormSchema>;

/**
 * Helper function to flatten the multi-step form data back to BasicInfo format
 */
export function flattenPatientFormData(
  formData: Partial<AddPatientFormData>
): Partial<z.infer<typeof createBasicInfoInputSchema>> {
  return {
    ...formData.personalInfo,
    ...formData.contactInfo,
    ...formData.additionalInfo,
  };
}
