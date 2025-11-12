import { format } from "date-fns";
import type {
  CompleteProfileFormData,
  CreateHealthcareProviderInput,
} from "../schemas/healthcare-provider.schema";

/**
 * Formats a Date object to YYYY-MM-DD string
 */
export const formatDateToISO = (date: Date): string => {
  return format(date, "yyyy-MM-dd");
};

/**
 * Transforms complete profile form data into the format required for database insertion
 * 
 * @param formData - The complete profile form data from MultiStepFormV2
 * @param userId - The authenticated user's ID
 * @param tenantId - The tenant ID for multi-tenant isolation
 * @returns Flattened data ready for database insertion
 */
export const flattenCompleteProfileFormData = (
  formData: CompleteProfileFormData,
  userId: string,
  tenantId: string
): Omit<CreateHealthcareProviderInput, "userId" | "tenantId"> & {
  userId: string;
  tenantId: string;
} => {
  const { basicInformation, personalDetails, clinicApplication } = formData;

  return {
    // Basic Information
    firstName: basicInformation.firstName,
    lastName: basicInformation.lastName,
    suffix: basicInformation.suffix || undefined,
    nickname: basicInformation.nickname,
    phoneNumber: basicInformation.mobile,

    // Personal Details
    gender: personalDetails.gender,
    civilStatus: personalDetails.civilStatus,
    religion: personalDetails.religion,
    nationality: personalDetails.nationality,
    dateOfBirth: formatDateToISO(personalDetails.dateOfBirth),
    bloodType: personalDetails.bloodType,

    // Clinic Application
    clinicId: clinicApplication.clinicId,
    type: clinicApplication.type,
    licenseNumber: clinicApplication.licenseNumber,
    licenseIssuedDate: formatDateToISO(clinicApplication.licenseIssuedDate),
    licenseExpiryDate: formatDateToISO(clinicApplication.licenseExpiryDate),
    ptrNumber: clinicApplication.ptrNumber,
    taxNumber: clinicApplication.taxNumber,
    fieldOfStudy: clinicApplication.fieldOfStudy,
    about: clinicApplication.about,
    specialties: clinicApplication.specialties,

    // System fields
    userId,
    tenantId,
  };
};

/**
 * Helper function to create email from name
 * This is a placeholder until email is added to the form
 */
export const generateEmailPlaceholder = (
  firstName: string,
  lastName: string
): string => {
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@temp.clinicez.com`;
};
