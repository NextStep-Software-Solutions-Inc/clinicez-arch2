import { HealthcareProviderReference } from "@app-types/healthcare-provider-common";

export type HealthcareProvider = HealthcareProviderReference;

/**
 * Formats a healthcare provider's name with optional prefix and postfix
 * @param hp - Healthcare provider object
 * @param includeSpecialization - Whether to include specialization in parentheses
 * @returns Formatted healthcare provider name
 * 
 * @example
 * formatHealthcareProvider({ prefix: "Dr.", name: "John Smith", postfix: "MD" })
 * // Returns: "Dr. John Smith, MD"
 * 
 * @example
 * formatHealthcareProvider({ prefix: "Dr.", name: "Jane Doe", specialization: "Cardiologist" }, true)
 * // Returns: "Dr. Jane Doe (Cardiologist)"
 */
export const formatHealthcareProvider = (
  hp: HealthcareProvider,
  includeSpecialization: boolean = false
): string => {
  let formatted = "";

  if (hp.prefix) {
    formatted += `${hp.prefix} `;
  }

  formatted += hp.name;

  if (includeSpecialization && hp.specialization) {
    formatted += ` (${hp.specialization})`;
  }

  if (hp.postfix) {
    formatted += `, ${hp.postfix}`;
  }

  return formatted;
};

/**
 * Formats healthcare provider with date prefix
 * @param date - Date string to format
 * @param hp - Healthcare provider object
 * @param dateSeparator - Separator between date and provider (default: " - ")
 * @returns Formatted string with date and provider
 * 
 * @example
 * formatDateWithProvider("2025-10-14", { prefix: "Dr.", name: "Smith", postfix: "MD" })
 * // Returns: "2025-10-14 - Dr. Smith, MD"
 */
export const formatDateWithProvider = (
  date: string,
  hp: HealthcareProvider,
  dateSeparator: string = " - "
): string => {
  return `${date}${dateSeparator}${formatHealthcareProvider(hp)}`;
};
