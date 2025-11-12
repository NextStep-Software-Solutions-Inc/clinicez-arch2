import { z } from "zod";
import { validatePhoneNumber } from "@lib/phone-validation";
import { defaultCountry } from "@lib/country-codes";
import {
  isPastOrToday,
  isTodayOrFuture,
  createAgeCutoffDate,
  meetsMinimumAge,
} from "@utils/date-helpers";

/**
 * Schema for Basic Information step
 */
export const basicInformationSchema = z
  .object({
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(2, "Last name must be at least 2 characters"),
    suffix: z.string().default(""),
    nickname: z
      .string()
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
    countryCode: z.string().default(defaultCountry.code),
    mobile: z.string().min(1, "Mobile number is required"),
  })
  .refine(
    (data) => {
      const validation = validatePhoneNumber(data.mobile, data.countryCode);
      return validation.isValid;
    },
    {
      message: "Please enter a valid mobile number",
      path: ["mobile"],
    }
  );

export type BasicInformationInput = z.input<typeof basicInformationSchema>;
export type BasicInformationData = z.output<typeof basicInformationSchema>;

/**
 * Schema for Personal Details step
 */
const MINIMUM_AGE_YEARS = 18;

const dateOfBirthSchema = z
  .custom<Date>((value) => value instanceof Date, {
    message: "Date of birth is required",
  })
  .refine(isPastOrToday, "Date of birth cannot be in the future")
  .refine(
    (value) => meetsMinimumAge(value, MINIMUM_AGE_YEARS),
    `You must be at least ${MINIMUM_AGE_YEARS} years old`
  );

export const personalDetailsSchema = z.object({
  gender: z.enum(["MALE", "FEMALE"], {
    message: "Gender is required",
  }),
  civilStatus: z.enum(
    ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "SEPARATED"],
    {
      message: "Civil status is required",
    }
  ),
  religion: z.string().min(1, "Religion is required"),
  nationality: z.string().min(1, "Nationality is required"),
  dateOfBirth: dateOfBirthSchema,
  bloodType: z.string().min(1, "Blood type is required"),
});

export type PersonalDetailsData = z.infer<typeof personalDetailsSchema>;

/**
 * Schema for Clinic Application step
 */
const createPastDateSchema = (label: string) =>
  z
    .custom<Date>((value) => value instanceof Date, {
      message: `${label} is required`,
    })
    .refine(isPastOrToday, `${label} cannot be in the future`);

const createFutureDateSchema = (label: string) =>
  z
    .custom<Date>((value) => value instanceof Date, {
      message: `${label} is required`,
    })
    .refine(isTodayOrFuture, `${label} must be today or a future date`);

export const clinicApplicationSchema = z
  .object({
    clinicId: z.string().min(1, "Clinic is required"),
    type: z.string().min(1, "Role is required"),
    licenseNumber: z.string().min(1, "License number is required"),
    licenseIssuedDate: createPastDateSchema("Issued date"),
    licenseExpiryDate: createFutureDateSchema("Expiry date"),
    ptrNumber: z.string().min(1, "PTR number is required"),
    taxNumber: z.string().min(1, "TIN number is required"),
    fieldOfStudy: z.string().optional(),
    about: z.string().optional(),
    specialties: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.licenseIssuedDate &&
      data.licenseExpiryDate &&
      data.licenseExpiryDate < data.licenseIssuedDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expiry date must be on or after the issued date",
        path: ["licenseExpiryDate"],
      });
    }
  });

export type ClinicApplicationData = z.infer<typeof clinicApplicationSchema>;

/**
 * Combined schema for all form steps
 */
export const completeProfileFormSchema = z.object({
  basicInformation: basicInformationSchema,
  personalDetails: personalDetailsSchema,
  clinicApplication: clinicApplicationSchema,
});

export type CompleteProfileFormData = z.infer<typeof completeProfileFormSchema>;

/**
 * Schema for creating a healthcare provider in the database
 */
export const createHealthcareProviderSchema = z.object({
  // From basic information
  firstName: z.string(),
  lastName: z.string(),
  suffix: z.string().optional(),
  nickname: z.string().optional(),
  phoneNumber: z.string(),

  // From personal details
  gender: z.enum(["MALE", "FEMALE"]),
  civilStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "SEPARATED"]),
  religion: z.string(),
  nationality: z.string(),
  dateOfBirth: z.string(), // ISO date string YYYY-MM-DD
  bloodType: z.string(),

  // From clinic application
  clinicId: z.string(),
  type: z.string(),
  licenseNumber: z.string(),
  licenseIssuedDate: z.string(), // YYYY-MM-DD
  licenseExpiryDate: z.string(), // YYYY-MM-DD
  ptrNumber: z.string(),
  taxNumber: z.string(),
  fieldOfStudy: z.string().optional(),
  about: z.string().optional(),
  specialties: z.string().optional(),

  // System fields
  userId: z.string(),
  tenantId: z.string(),
});

export type CreateHealthcareProviderInput = z.infer<typeof createHealthcareProviderSchema>;

/**
 * Helper schemas for step-specific validation
 */
export const basicInformationStepSchema = completeProfileFormSchema.pick({
  basicInformation: true,
});

export const personalDetailsStepSchema = completeProfileFormSchema.pick({
  personalDetails: true,
});

export const clinicApplicationStepSchema = completeProfileFormSchema.pick({
  clinicApplication: true,
});
