/**
 * apps/clinic-app/utils/patientLocation.ts
 *
 * Resolves a patient's locality display string dynamically from customFields.
 * Formats standard Philippine administrative hierarchy:
 * 1. "Barangay, City, Province" (if all three exist)
 * 2. "Barangay, City" (if barangay and city exist, no province)
 * 3. "City, Province" (if city and province exist, no barangay)
 * 4. "City" (if only city exists)
 * 5. "Barangay, Province" (if barangay and province exist, no city)
 * 6. "Barangay" (if only barangay exists)
 * 7. "Province" (if only province exists)
 * 8. "Address Line" (if only address line exists)
 * 9. "" (empty string fallback if absent, empty, or customFields is null/undefined)
 *
 * Strictly does NOT read deleted top-level entity properties (patient.barangay, patient.city, etc.).
 */

export interface PatientLocationFields {
  primary_address_line?: string | null;
  primary_barangay?: string | null;
  primary_city?: string | null;
  primary_province?: string | null;
  [key: string]: any;
}

export function computePatientLocation(
  patientOrCustomFields?: { customFields?: Record<string, any> | null; [key: string]: any } | null
): string {
  if (!patientOrCustomFields) {
    return '';
  }

  let cf: Record<string, any> | null | undefined = null;
  if ('customFields' in patientOrCustomFields) {
    cf = patientOrCustomFields.customFields;
  } else if (
    patientOrCustomFields.primary_barangay !== undefined ||
    patientOrCustomFields.primary_city !== undefined ||
    patientOrCustomFields.primary_province !== undefined ||
    patientOrCustomFields.primary_address_line !== undefined
  ) {
    cf = patientOrCustomFields;
  }

  if (!cf) {
    return '';
  }

  const getField = (val: any): string => (val != null ? String(val).trim() : '');

  const barangay = getField(cf.primary_barangay);
  const city = getField(cf.primary_city);
  const province = getField(cf.primary_province);
  const addressLine = getField(cf.primary_address_line);

  if (barangay && city && province) {
    return `${barangay}, ${city}, ${province}`;
  }
  if (barangay && city) {
    return `${barangay}, ${city}`;
  }
  if (city && province) {
    return `${city}, ${province}`;
  }
  if (city) {
    return city;
  }
  if (barangay && province) {
    return `${barangay}, ${province}`;
  }
  if (barangay) {
    return barangay;
  }
  if (province) {
    return province;
  }
  if (addressLine) {
    return addressLine;
  }

  return '';
}
