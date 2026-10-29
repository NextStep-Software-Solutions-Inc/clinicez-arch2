export interface EhrOptionDescriptor {
  code: string;
  label: string;
  philHealthCode?: string | null;
  philHealthLibrary?: string | null;
  requiresSpecifyText?: boolean;
}

export interface OptionsManifestResponse {
  manifestVersion: string;
  optionSets: Record<string, string>;
}

export interface PsgcLocationDto {
  psgcCode: string;
  code?: string;
  name: string;
  level:
    | 'Region'
    | 'Province'
    | 'City'
    | 'Municipality'
    | 'SubMunicipality'
    | 'Barangay'
    | 'region'
    | 'province'
    | 'city'
    | 'municipality'
    | 'sub-municipality'
    | 'barangay'
    | string;
  parentPsgcCode?: string | null;
  regionPsgc?: string | null;
  provincePsgc?: string | null;
  cityMunicipalityPsgc?: string | null;
  barangayPsgc?: string | null;
  zipCode?: string | null;
}

export interface StructuredPsgcAddress {
  id?: string | null;
  addressType?: 'Permanent' | 'Current' | 'Billing' | string | null;
  houseNo?: string | null;
  houseStreet?: string | null;
  streetBarangay?: string | null;
  streetAddress?: string | null;
  barangayPsgc?: string | null;
  barangayName?: string | null;
  cityMunicipalityPsgc?: string | null;
  cityMunicipalityName?: string | null;
  provincePsgc?: string | null;
  provinceName?: string | null;
  regionPsgc?: string | null;
  regionName?: string | null;
  postalCode?: string | null;
  zipCode?: string | null;
  country?: string | null;
  isSameAsPermanent?: boolean;
  isPrimary?: boolean;
}
