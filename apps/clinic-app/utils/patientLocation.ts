/**
 * apps/clinic-app/utils/patientLocation.ts
 *
 * Resolves a patient's locality display string from the official 1NF `addresses`
 * collection (`Permanent` home address first), falling back to `customFields`
 * (`primary_*` or `secondary_*`) when no structured address is populated.
 *
 * Formats standard Philippine administrative hierarchy:
 * 1. "Barangay, City, Province" (if all three exist)
 * 2. "Barangay, City" (if barangay and city exist, no province)
 * 3. "City, Province" (if city and province exist, no barangay)
 * 4. "City" (if only city exists)
 * 5. "Barangay, Province" (if barangay and province exist, no city)
 * 6. "Barangay" (if only barangay exists)
 * 7. "Province" (if only province exists)
 * 8. "Address Line" (if only address line exists)
 * 9. "" (empty string fallback)
 */

export interface PatientLocationFields {
  primary_address_line?: string | null;
  primary_barangay?: string | null;
  primary_city?: string | null;
  primary_province?: string | null;
  secondary_address_line?: string | null;
  secondary_barangay?: string | null;
  secondary_city?: string | null;
  secondary_province?: string | null;
  [key: string]: any;
}

function formatLocalityHierarchy(
  barangay: string,
  city: string,
  province: string,
  addressLine: string
): string {
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

export function computePatientLocation(
  patientOrCustomFields?: {
    addresses?: Array<{
      addressType?: string | null;
      barangayName?: string | null;
      cityMunicipalityName?: string | null;
      provinceName?: string | null;
      regionName?: string | null;
      streetAddress?: string | null;
    }> | null;
    customFields?: Record<string, any> | null;
    [key: string]: any;
  } | null
): string {
  if (!patientOrCustomFields) {
    return '';
  }

  const getField = (val: any): string => (val != null ? String(val).trim() : '');

  // 1. Prefer official 1NF Home Address (`PatientAddress` entity)
  if (Array.isArray(patientOrCustomFields.addresses) && patientOrCustomFields.addresses.length > 0) {
    const perm =
      patientOrCustomFields.addresses.find((a) => a && a.addressType === 'Permanent') ||
      patientOrCustomFields.addresses[0];
    if (perm) {
      const fromEntity = formatLocalityHierarchy(
        getField(perm.barangayName),
        getField(perm.cityMunicipalityName),
        getField(perm.provinceName) || getField(perm.regionName),
        getField(perm.streetAddress)
      );
      if (fromEntity) {
        return fromEntity;
      }
    }
  }

  // 2. Fallback to customFields (legacy primary_* or secondary_*)
  let cf: Record<string, any> | null | undefined = null;
  if ('customFields' in patientOrCustomFields) {
    cf = patientOrCustomFields.customFields;
  } else if (
    patientOrCustomFields.primary_barangay !== undefined ||
    patientOrCustomFields.primary_city !== undefined ||
    patientOrCustomFields.primary_province !== undefined ||
    patientOrCustomFields.primary_address_line !== undefined ||
    patientOrCustomFields.secondary_barangay !== undefined ||
    patientOrCustomFields.secondary_city !== undefined ||
    patientOrCustomFields.secondary_province !== undefined ||
    patientOrCustomFields.secondary_address_line !== undefined
  ) {
    cf = patientOrCustomFields;
  }

  if (!cf) {
    return '';
  }

  const primaryFormatted = formatLocalityHierarchy(
    getField(cf.primary_barangay),
    getField(cf.primary_city),
    getField(cf.primary_province),
    getField(cf.primary_address_line)
  );
  if (primaryFormatted) {
    return primaryFormatted;
  }

  return formatLocalityHierarchy(
    getField(cf.secondary_barangay),
    getField(cf.secondary_city),
    getField(cf.secondary_province),
    getField(cf.secondary_address_line)
  );
}
