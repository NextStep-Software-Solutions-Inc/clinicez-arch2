import { z } from "zod";

/**
 * Zod schema for basic_info table
 * Corresponds to the basicInfo table in the Drizzle schema
 */
export const basicInfoSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "Last name is required"),
  suffix: z.string().optional(),
  nickname: z.string().optional(),
  email: z.email("Invalid email address"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  civilStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "SEPARATED"]).optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional(),
  nationality: z.string().optional(),
  religion: z.string().optional(),
  bloodType: z.string().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().optional(),
});

/**
 * Zod schema for patients table
 * Corresponds to the patients table in the Drizzle schema
 */
export const patientSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  basicInfo: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().optional(),
});

/**
 * Zod schema for emergency_contacts table
 */
export const emergencyContactSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  patientId: z.uuid(),
  name: z.string().min(1, "Contact name is required"),
  relationship: z.string().min(1, "Relationship is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  type: z.enum(["PRIMARY", "SECONDARY"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().optional(),
});

/**
 * Input schema for creating a new patient (without generated fields)
 * This is what the form will use
 */
export const createBasicInfoInputSchema = basicInfoSchema.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export const createPatientInputSchema = patientSchema.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export const createEmergencyContactInputSchema = emergencyContactSchema.omit({
  id: true,
  tenantId: true,
  patientId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

/**
 * Combined schema for the complete patient creation flow
 */
export const createPatientFlowSchema = z.object({
  basicInfo: createBasicInfoInputSchema,
  emergencyContacts: z.array(createEmergencyContactInputSchema).optional(),
});

// Type exports
export type BasicInfo = z.infer<typeof basicInfoSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;
export type CreateBasicInfoInput = z.infer<typeof createBasicInfoInputSchema>;
export type CreatePatientInput = z.infer<typeof createPatientInputSchema>;
export type CreateEmergencyContactInput = z.infer<typeof createEmergencyContactInputSchema>;
export type CreatePatientFlow = z.infer<typeof createPatientFlowSchema>;
