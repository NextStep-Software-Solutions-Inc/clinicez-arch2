import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ApiError, EhrOptionDescriptor } from '@shared/safe';
import { calculateChronologicalAge } from '../../utils/age';
import { useEhrOptions } from '../../hooks/useEhrOptions';
import { usePhilHealthCatalog } from '../../utils/usePhilHealthCatalog';
import {
  philHealthCatalogService,
  type PhilHealthCatalogItem,
} from '../../services/philHealthCatalogService';
import type { ClinicPatient, PatientDemographics } from '../../services/clinicService';

export type StatutoryImmLibraryName =
  | 'lib_immchild'
  | 'lib_immyoungw'
  | 'lib_immpregw'
  | 'lib_immelderly';

export type VaccineCohortKey = StatutoryImmLibraryName | 'OtherImm';

export interface ImmunizationCohortDescriptor {
  key: VaccineCohortKey;
  tabLabel: string;
  modalLabel: string;
  badgeLabel: string;
  philHealthLibrary?: StatutoryImmLibraryName;
  optionSet?: string;
}

export interface BackendVaccineOption {
  code: string;
  name: string;
  philHealthLibrary: string;
  requiresSpecifyText?: boolean;
}

export const CUSTOM_VACCINE_CODE = 'OTH';

const STATUTORY_IMM_LIBRARIES: ReadonlySet<string> = new Set<StatutoryImmLibraryName>([
  'lib_immchild',
  'lib_immyoungw',
  'lib_immpregw',
  'lib_immelderly',
]);

/**
 * Schema-only category routing pointers linking each cohort key to its live server
 * PhilHealth Catalog (`lib_imm*`) or EHR Option Set (`adult_other_vaccine`).
 * Zero vaccine entries, routes, or sites are hardcoded in the frontend.
 */
const DEFAULT_COHORT_SCHEMA: readonly ImmunizationCohortDescriptor[] = [
  {
    key: 'lib_immchild',
    tabLabel: 'Child Schedule (0–17y)',
    modalLabel: 'Child (0–17y)',
    badgeLabel: 'Childhood',
    philHealthLibrary: 'lib_immchild',
  },
  {
    key: 'lib_immyoungw',
    tabLabel: 'Young Women (HPV)',
    modalLabel: 'Young Women',
    badgeLabel: 'Young Women',
    philHealthLibrary: 'lib_immyoungw',
  },
  {
    key: 'lib_immpregw',
    tabLabel: 'Maternal (Td / Tdap)',
    modalLabel: 'Maternal (Td)',
    badgeLabel: 'Maternal',
    philHealthLibrary: 'lib_immpregw',
  },
  {
    key: 'lib_immelderly',
    tabLabel: 'Senior Citizens (60+)',
    modalLabel: 'Senior (60+)',
    badgeLabel: 'Senior Citizen',
    philHealthLibrary: 'lib_immelderly',
  },
  {
    key: 'OtherImm',
    tabLabel: 'Adult / Other',
    modalLabel: 'Adult / Other',
    badgeLabel: 'Adult / Other',
    optionSet: 'adult_other_vaccine',
  },
];

export function isStatutoryImmLibrary(value?: string | null): value is StatutoryImmLibraryName {
  return Boolean(value && STATUTORY_IMM_LIBRARIES.has(value));
}

export function isValidVaccineCohortKey(
  value?: string | null,
  cohorts: readonly ImmunizationCohortDescriptor[] = DEFAULT_COHORT_SCHEMA
): value is VaccineCohortKey {
  if (!value) return false;
  return cohorts.some((c) => c.key === value);
}

function mapDescriptorToCohort(desc: EhrOptionDescriptor): ImmunizationCohortDescriptor | null {
  const fallback = DEFAULT_COHORT_SCHEMA.find(
    (s) => s.key.toLowerCase() === desc.code.trim().toLowerCase()
  );
  const key = (fallback?.key ?? desc.code.trim()) as VaccineCohortKey;
  if (!key) return null;

  const meta = desc.metadata ?? {};
  const rawLib = desc.philHealthLibrary ?? fallback?.philHealthLibrary;
  const philHealthLibrary = isStatutoryImmLibrary(rawLib) ? rawLib : undefined;
  const optionSet = meta.optionSet ?? (!philHealthLibrary ? fallback?.optionSet ?? 'adult_other_vaccine' : undefined);

  return {
    key,
    tabLabel: desc.label || fallback?.tabLabel || key,
    modalLabel: meta.modalLabel || desc.label || fallback?.modalLabel || key,
    badgeLabel: meta.badgeLabel || desc.label || fallback?.badgeLabel || key,
    philHealthLibrary,
    optionSet,
  };
}

/**
 * Loads immunization cohort categories from BE Tier A (`GET /api/v1/options/immunization_cohort`).
 */
export function useImmunizationCohorts(enabled = true) {
  const { options, loading, error, reload } = useEhrOptions('immunization_cohort', { enabled });

  const cohorts = useMemo<readonly ImmunizationCohortDescriptor[]>(() => {
    if (options.length > 0) {
      const mapped = options
        .filter((d) => d.isActive !== false)
        .map(mapDescriptorToCohort)
        .filter((item): item is ImmunizationCohortDescriptor => item !== null);
      if (mapped.length > 0) {
        return mapped;
      }
    }
    return DEFAULT_COHORT_SCHEMA;
  }, [options]);

  return { cohorts, loading, error, reload };
}

function isNoneCatalogEntry(code: string, label: string): boolean {
  const normalizedCode = code.trim().toUpperCase();
  const normalizedLabel = label.trim().toLowerCase();
  return normalizedCode === '999' || normalizedLabel === 'none';
}

/**
 * Loads vaccines for the selected cohort 100% from the backend:
 * - Statutory cohorts (`lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly`):
 *   served from BE Tier B PhilHealth Catalog (`GET /api/v1/philhealth/catalog/{library}`).
 * - Adult / Other (`OtherImm`):
 *   served from BE Tier A Options (`GET /api/v1/options/adult_other_vaccine`), with live
 *   BE Tier B generic formulary search (`lib_medicine_generic`) if Tier A set is empty.
 */
export function useCohortVaccines(cohort: VaccineCohortKey, enabled = true) {
  const isStatutory = isStatutoryImmLibrary(cohort);
  const statutoryLibrary: StatutoryImmLibraryName = isStatutory ? cohort : 'lib_immchild';

  const {
    items: statutoryItems,
    loading: statutoryLoading,
    error: statutoryError,
    reload: reloadStatutory,
  } = usePhilHealthCatalog(statutoryLibrary, enabled && isStatutory);

  const {
    options: adultDescriptors,
    loading: adultLoading,
    error: adultError,
    reload: reloadAdult,
  } = useEhrOptions('adult_other_vaccine', {
    enabled: enabled && !isStatutory,
  });

  const [genericFallbackItems, setGenericFallbackItems] = useState<PhilHealthCatalogItem[]>([]);
  const [genericLoading, setGenericLoading] = useState(false);
  const [genericError, setGenericError] = useState<ApiError | null>(null);
  const [genericNonce, setGenericNonce] = useState(0);

  const shouldQueryGenericCatalog =
    enabled && !isStatutory && !adultLoading && adultDescriptors.length === 0;

  useEffect(() => {
    if (!shouldQueryGenericCatalog) {
      setGenericLoading(false);
      return undefined;
    }

    let cancelled = false;
    setGenericLoading(true);
    setGenericError(null);

    Promise.all([
      philHealthCatalogService.search('lib_medicine_generic', 'vaccine', 50),
      philHealthCatalogService.search('lib_medicine_generic', 'toxoid', 20),
    ])
      .then(([[vaxRows, vaxErr], [toxRows, toxErr]]) => {
        if (cancelled) return;
        const combined = [...(vaxRows ?? []), ...(toxRows ?? [])];
        const seen = new Set<string>();
        const deduped: PhilHealthCatalogItem[] = [];
        for (const row of combined) {
          if (!row.isActive || seen.has(row.code)) continue;
          seen.add(row.code);
          deduped.push(row);
        }
        setGenericFallbackItems(deduped);
        setGenericError(deduped.length === 0 ? vaxErr ?? toxErr : null);
        setGenericLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setGenericFallbackItems([]);
        setGenericError(
          err instanceof Error
            ? ({ message: err.message, status: 0 } as ApiError)
            : ({ message: 'Unable to load vaccines from server.', status: 0 } as ApiError)
        );
        setGenericLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [shouldQueryGenericCatalog, genericNonce]);

  const vaccines = useMemo<readonly BackendVaccineOption[]>(() => {
    if (isStatutory) {
      return statutoryItems
        .filter((item) => item.isActive && !isNoneCatalogEntry(item.code, item.description))
        .map((item) => ({
          code: item.code,
          name: item.description,
          philHealthLibrary: cohort,
          requiresSpecifyText: false,
        }));
    }

    const activeAdult = adultDescriptors.filter(
      (opt) => opt.isActive !== false && !isNoneCatalogEntry(opt.code, opt.label)
    );
    if (activeAdult.length > 0) {
      return activeAdult
        .filter((opt) => !opt.requiresSpecifyText && opt.code.toUpperCase() !== CUSTOM_VACCINE_CODE)
        .map((opt) => ({
          code: opt.philHealthCode || opt.code,
          name: opt.label,
          philHealthLibrary: opt.philHealthLibrary || 'OtherImm',
          requiresSpecifyText: Boolean(opt.requiresSpecifyText),
        }));
    }

    return genericFallbackItems
      .filter((item) => item.isActive && !isNoneCatalogEntry(item.code, item.description))
      .map((item) => ({
        code: item.code,
        name: item.description,
        philHealthLibrary: 'OtherImm',
        requiresSpecifyText: false,
      }));
  }, [isStatutory, statutoryItems, cohort, adultDescriptors, genericFallbackItems]);

  const loading = isStatutory ? statutoryLoading : adultLoading || genericLoading;
  const errorMessage = isStatutory
    ? statutoryError?.message ?? null
    : adultDescriptors.length === 0 && genericFallbackItems.length === 0
      ? genericError?.message ?? adultError?.message ?? null
      : null;

  const reload = useCallback(() => {
    if (isStatutory) {
      reloadStatutory();
    } else {
      reloadAdult();
      setGenericNonce((n) => n + 1);
    }
  }, [isStatutory, reloadStatutory, reloadAdult]);

  return {
    vaccines,
    loading,
    errorMessage,
    reload,
  };
}

function vaccineMedicineRoutePriority(desc: EhrOptionDescriptor): number | null {
  const code = desc.code.trim().toUpperCase();
  const phCode = (desc.philHealthCode ?? '').trim().toUpperCase();

  if (code === 'INTRAMUSCULAR' || phCode === 'IM') return 1;
  if (code === 'SUBCUTANEOUS' || phCode === 'SC') return 2;
  if (code === 'INTRADERMAL' || phCode === 'ID') return 3;
  if (code === 'ORAL' || phCode === 'PO') return 4;
  return null;
}

function isAnatomicalInjectionSiteDescriptor(desc: EhrOptionDescriptor): boolean {
  const code = desc.code.trim().toUpperCase();
  const label = desc.label.trim().toLowerCase();
  return code !== 'ORAL' && label !== 'oral';
}

export function doesVaccineRouteRequireInjectionSite(
  routeLabel?: string | null,
  routeDescriptors?: readonly EhrOptionDescriptor[]
): boolean {
  if (!routeLabel || !routeLabel.trim()) return true;
  const trimmed = routeLabel.trim();

  if (routeDescriptors && routeDescriptors.length > 0) {
    const matched = routeDescriptors.find(
      (d) =>
        d.label.trim().toLowerCase() === trimmed.toLowerCase() ||
        d.code.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (matched) {
      if (matched.metadata?.requiresInjectionSite === 'false') return false;
      if (matched.metadata?.requiresInjectionSite === 'true') return true;
      const code = matched.code.trim().toUpperCase();
      const phCode = (matched.philHealthCode ?? '').trim().toUpperCase();
      if (code === 'ORAL' || phCode === 'PO') return false;
    }
  }

  return !/\boral\b|\(po\)|^po$|\bnasal\b|\bintranasal\b/i.test(trimmed);
}

export function shouldDisplayImmunizationInjectionSite(
  route?: string | null,
  injectionSite?: string | null
): boolean {
  if (!injectionSite || !injectionSite.trim()) return false;
  if (!doesVaccineRouteRequireInjectionSite(route)) return false;
  return !/^(n\/a|not applicable|not specified|none|oral)$/i.test(injectionSite.trim());
}

export function inferPreferredVaccineRoute(
  vaccineCode: string,
  vaccineName: string,
  availableRoutes: readonly string[],
  routeDescriptors?: readonly EhrOptionDescriptor[]
): string {
  if (availableRoutes.length === 0) return '';

  const normalizedName = vaccineName.trim();
  const normalizedCode = vaccineCode.trim().toUpperCase();

  const isOralVaccine =
    /\b(opv\d*|oral polio|rotavirus|oral cholera)\b/i.test(normalizedName) ||
    normalizedCode === 'C02' ||
    normalizedCode === 'C03' ||
    normalizedCode === 'C04';

  if (isOralVaccine) {
    const oralFromDesc = routeDescriptors?.find(
      (d) =>
        d.metadata?.requiresInjectionSite === 'false' ||
        d.code.trim().toUpperCase() === 'ORAL' ||
        (d.philHealthCode ?? '').trim().toUpperCase() === 'PO'
    )?.label;
    if (oralFromDesc && availableRoutes.includes(oralFromDesc)) return oralFromDesc;
    const oralMatch = availableRoutes.find(
      (r) => !doesVaccineRouteRequireInjectionSite(r, routeDescriptors)
    );
    if (oralMatch) return oralMatch;
  }

  const isIntradermalVaccine = /\bbcg\b/i.test(normalizedName) || normalizedCode === 'C01';
  if (isIntradermalVaccine) {
    const idFromDesc = routeDescriptors?.find(
      (d) =>
        d.code.trim().toUpperCase() === 'INTRADERMAL' ||
        (d.philHealthCode ?? '').trim().toUpperCase() === 'ID'
    )?.label;
    if (idFromDesc && availableRoutes.includes(idFromDesc)) return idFromDesc;
    const idMatch = availableRoutes.find((r) => /\bintradermal\b|\(id\)/i.test(r));
    if (idMatch) return idMatch;
  }

  const imFromDesc = routeDescriptors?.find(
    (d) =>
      d.code.trim().toUpperCase() === 'INTRAMUSCULAR' ||
      (d.philHealthCode ?? '').trim().toUpperCase() === 'IM'
  )?.label;
  if (imFromDesc && availableRoutes.includes(imFromDesc)) return imFromDesc;

  const imMatch = availableRoutes.find((r) => /\bintramuscular\b|\(im\)/i.test(r));
  if (imMatch) return imMatch;

  return (
    availableRoutes.find((r) => doesVaccineRouteRequireInjectionSite(r, routeDescriptors)) ??
    availableRoutes[0]
  );
}

/**
 * Loads vaccine administration routes and anatomical injection sites 100% from the backend
 * (`vaccine_route` / filtered `medicine_route` and `vaccine_injection_site`).
 */
export function useImmunizationAdministrationOptions(enabled = true) {
  const {
    options: vaccineRouteDescriptors,
    loading: vaccineRouteLoading,
  } = useEhrOptions('vaccine_route', { enabled });

  const {
    options: medicineRouteDescriptors,
    loading: medicineRouteLoading,
  } = useEhrOptions('medicine_route', {
    enabled: enabled && !vaccineRouteLoading && vaccineRouteDescriptors.length === 0,
  });

  const {
    options: siteDescriptors,
    loading: siteLoading,
  } = useEhrOptions('vaccine_injection_site', { enabled });

  const routeDescriptors = useMemo<readonly EhrOptionDescriptor[]>(() => {
    const activeVaccineRoutes = vaccineRouteDescriptors.filter((r) => r.isActive !== false);
    if (activeVaccineRoutes.length > 0) {
      return activeVaccineRoutes;
    }

    return medicineRouteDescriptors
      .filter((r) => r.isActive !== false && vaccineMedicineRoutePriority(r) !== null)
      .slice()
      .sort((a, b) => (vaccineMedicineRoutePriority(a) ?? 99) - (vaccineMedicineRoutePriority(b) ?? 99));
  }, [vaccineRouteDescriptors, medicineRouteDescriptors]);

  const routes = useMemo<readonly string[]>(() => {
    return routeDescriptors.map((r) => r.label);
  }, [routeDescriptors]);

  const injectionSites = useMemo<readonly string[]>(() => {
    return siteDescriptors
      .filter((s) => s.isActive !== false && isAnatomicalInjectionSiteDescriptor(s))
      .map((s) => s.label);
  }, [siteDescriptors]);

  return {
    routes,
    injectionSites,
    routeDescriptors,
    loadingRoutes: vaccineRouteLoading || medicineRouteLoading,
    loadingSites: siteLoading,
  };
}

export function resolveCohortCategoryLabel(
  philHealthLibrary?: string | null,
  cohorts: readonly ImmunizationCohortDescriptor[] = DEFAULT_COHORT_SCHEMA
): string {
  const fallbackOther =
    cohorts.find((c) => c.key === 'OtherImm')?.badgeLabel ?? 'Adult / Other';
  if (!philHealthLibrary) return fallbackOther;

  const trimmed = philHealthLibrary.trim().toLowerCase();
  const matched = cohorts.find((c) => c.key.toLowerCase() === trimmed);
  if (matched) return matched.badgeLabel;

  return fallbackOther;
}

export function resolvePatientAgeYears(
  demographics?: PatientDemographics | null,
  patient?: ClinicPatient | null
): number | undefined {
  if (typeof demographics?.age === 'number' && !Number.isNaN(demographics.age)) {
    return demographics.age;
  }
  if (typeof patient?.age === 'number' && !Number.isNaN(patient.age)) {
    return patient.age;
  }
  const rawDob = demographics?.dateOfBirth || demographics?.dob || patient?.dateOfBirth;
  const computed = calculateChronologicalAge(rawDob);
  return computed ? computed.years : undefined;
}

export function resolveInitialVaccineCohort(
  demographics?: PatientDemographics | null,
  patient?: ClinicPatient | null,
  preferredCohort?: string | null
): VaccineCohortKey {
  if (isValidVaccineCohortKey(preferredCohort)) {
    return preferredCohort;
  }

  const age = resolvePatientAgeYears(demographics, patient);
  const sex = (demographics?.sex || patient?.sex || '').toLowerCase();

  if (age === undefined || age < 18) return 'lib_immchild';
  if (sex === 'female' && age >= 9 && age <= 49) return 'lib_immyoungw';
  if (age >= 60 || demographics?.isSenior) return 'lib_immelderly';
  return 'OtherImm';
}

export function resolveVaccineSelection(params: {
  cohort: VaccineCohortKey;
  vaccineCode: string;
  customVaccineName: string;
  availableVaccines: readonly BackendVaccineOption[];
}):
  | { valid: true; philHealthLibrary: string; philHealthCode: string; vaccineName: string }
  | { valid: false; error: string } {
  if (params.vaccineCode === CUSTOM_VACCINE_CODE) {
    const trimmedName = params.customVaccineName.trim();
    if (!trimmedName) {
      return { valid: false, error: 'Custom vaccine name is required.' };
    }
    return {
      valid: true,
      philHealthLibrary: 'OtherImm',
      philHealthCode: CUSTOM_VACCINE_CODE,
      vaccineName: trimmedName,
    };
  }

  const selected = params.availableVaccines.find((v) => v.code === params.vaccineCode);
  if (!selected) {
    return {
      valid: false,
      error: 'Please select a vaccine from the category list or enter a custom vaccine name.',
    };
  }

  if (selected.requiresSpecifyText) {
    const trimmedName = params.customVaccineName.trim();
    if (!trimmedName) {
      return { valid: false, error: 'Custom vaccine name is required.' };
    }
    return {
      valid: true,
      philHealthLibrary: selected.philHealthLibrary || 'OtherImm',
      philHealthCode: selected.code,
      vaccineName: trimmedName,
    };
  }

  return {
    valid: true,
    philHealthLibrary: selected.philHealthLibrary || params.cohort,
    philHealthCode: selected.code,
    vaccineName: selected.name,
  };
}
