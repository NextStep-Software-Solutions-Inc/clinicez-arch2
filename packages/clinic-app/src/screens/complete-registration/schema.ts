import { z } from "zod";

// Just one field for the first step form for now.
// First Step: Personal Information
export const personalInformationSchema = z.object({
  firstName: z.string()
    .min(1, "First name is required")
});

// Second Step: Basic Information
export const basicInformationSchema = z.object({
  religion: z.string().optional()
});

// Third Step: Clinic Application
export const clinicApplicationSchema = z.object({
  clinicName: z.string().optional()
});

export const completeProfileSchema = z.object({
  personalInformation: personalInformationSchema,
  basicInformation: basicInformationSchema,
  clinicApplication: clinicApplicationSchema
});
