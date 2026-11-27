import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import ProfileFormField from './ProfileFormField';
import ProfileToggle from './ProfileToggle';
import ProfileSelectModal, { SelectOption } from './ProfileSelectModal';
import { locationService } from '../../services/api/locationService';
import {
  isNcrRegion,
  shouldBypassProvinceTier,
  fetchRegionDependentLocations,
  fetchProvinceDependentCities,
  resolveRegionPsgc,
  resolveLocationPsgc,
  type AddressValidationErrors,
} from '../../utils/addressValidation';
import type { StructuredPsgcAddress, PsgcLocationDto } from '@shared/safe';

export interface CascadingAddressPickerProps {
  value: StructuredPsgcAddress;
  onChange: (next: StructuredPsgcAddress) => void;
  disabled?: boolean;
  showSameAsPermanentToggle?: boolean;
  required?: boolean;
  errors?: AddressValidationErrors;
}

export default function CascadingAddressPicker({
  value,
  onChange,
  disabled = false,
  showSameAsPermanentToggle = false,
  required = false,
  errors,
}: CascadingAddressPickerProps) {
  const [regions, setRegions] = useState<PsgcLocationDto[]>([]);
  const [provinces, setProvinces] = useState<PsgcLocationDto[]>([]);
  const [provincesLoadedForRegion, setProvincesLoadedForRegion] = useState<string | null>(null);
  const [cities, setCities] = useState<PsgcLocationDto[]>([]);
  const [citiesLoadedForKey, setCitiesLoadedForKey] = useState<string | null>(null);
  const [barangays, setBarangays] = useState<PsgcLocationDto[]>([]);
  const [barangaysLoadedForCity, setBarangaysLoadedForCity] = useState<string | null>(null);

  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  const [activeModal, setActiveModal] = useState<'region' | 'province' | 'city' | 'barangay' | null>(null);

  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastBackfillSignatureRef = useRef<string | null>(null);

  const effectiveRegionPsgc = useMemo(
    () =>
      resolveRegionPsgc(
        { regionPsgc: value.regionPsgc, regionName: value.regionName },
        regions,
      ),
    [value.regionPsgc, value.regionName, regions],
  );

  const isKnownNcr = isNcrRegion(effectiveRegionPsgc, value.regionName);
  const isNcrWithoutProvinces = shouldBypassProvinceTier({
    regionPsgc: effectiveRegionPsgc,
    regionName: value.regionName,
    provincesCount: provinces.length,
    provincesLoadedForRegion,
  });

  const effectiveProvinceMatch = useMemo(() => {
    if (isNcrWithoutProvinces) {
      return null;
    }
    const existing = value.provincePsgc?.trim();
    if (existing) {
      return { code: existing, matched: null };
    }
    if (!effectiveRegionPsgc || provincesLoadedForRegion !== effectiveRegionPsgc) {
      return null;
    }
    return resolveLocationPsgc(null, value.provinceName, provinces);
  }, [
    isNcrWithoutProvinces,
    value.provincePsgc,
    value.provinceName,
    effectiveRegionPsgc,
    provincesLoadedForRegion,
    provinces,
  ]);
  const effectiveProvincePsgc = effectiveProvinceMatch?.code ?? null;

  const expectedCitiesKey = isNcrWithoutProvinces
    ? effectiveRegionPsgc
      ? `region:${effectiveRegionPsgc}`
      : null
    : effectiveProvincePsgc
      ? `province:${effectiveRegionPsgc ?? ''}:${effectiveProvincePsgc}`
      : null;

  const effectiveCityMatch = useMemo(() => {
    const existing = value.cityMunicipalityPsgc?.trim();
    if (existing) {
      return { code: existing, matched: null };
    }
    if (!expectedCitiesKey || citiesLoadedForKey !== expectedCitiesKey) {
      return null;
    }
    return resolveLocationPsgc(null, value.cityMunicipalityName, cities);
  }, [
    value.cityMunicipalityPsgc,
    value.cityMunicipalityName,
    expectedCitiesKey,
    citiesLoadedForKey,
    cities,
  ]);
  const effectiveCityPsgc = effectiveCityMatch?.code ?? null;

  const effectiveBarangayMatch = useMemo(() => {
    const existing = value.barangayPsgc?.trim();
    if (existing) {
      return { code: existing, matched: null };
    }
    if (!effectiveCityPsgc || barangaysLoadedForCity !== effectiveCityPsgc) {
      return null;
    }
    return resolveLocationPsgc(null, value.barangayName, barangays);
  }, [
    value.barangayPsgc,
    value.barangayName,
    effectiveCityPsgc,
    barangaysLoadedForCity,
    barangays,
  ]);
  const effectiveBarangayPsgc = effectiveBarangayMatch?.code ?? null;

  // Backfill resolved PSGC codes for hydrated/legacy addresses that only persisted location names
  useEffect(() => {
    const current = valueRef.current;
    const patch: Partial<StructuredPsgcAddress> = {};
    let hasPatch = false;

    if (!current.regionPsgc?.trim() && effectiveRegionPsgc) {
      patch.regionPsgc = effectiveRegionPsgc;
      hasPatch = true;
    }

    if (!isNcrWithoutProvinces && !current.provincePsgc?.trim() && effectiveProvincePsgc) {
      patch.provincePsgc = effectiveProvincePsgc;
      hasPatch = true;
    }

    if (!current.cityMunicipalityPsgc?.trim() && effectiveCityPsgc) {
      patch.cityMunicipalityPsgc = effectiveCityPsgc;
      const existingZip = (current.postalCode ?? current.zipCode ?? '').trim();
      if (!existingZip && effectiveCityMatch?.matched?.zipCode) {
        patch.postalCode = effectiveCityMatch.matched.zipCode;
        patch.zipCode = effectiveCityMatch.matched.zipCode;
      }
      hasPatch = true;
    }

    if (!current.barangayPsgc?.trim() && effectiveBarangayPsgc) {
      patch.barangayPsgc = effectiveBarangayPsgc;
      hasPatch = true;
    }

    if (!hasPatch) {
      lastBackfillSignatureRef.current = null;
      return;
    }

    const signature = JSON.stringify({
      regionName: current.regionName ?? '',
      provinceName: current.provinceName ?? '',
      cityMunicipalityName: current.cityMunicipalityName ?? '',
      barangayName: current.barangayName ?? '',
      patch,
    });

    if (lastBackfillSignatureRef.current === signature) {
      return;
    }

    lastBackfillSignatureRef.current = signature;
    onChangeRef.current({
      ...current,
      ...patch,
    });
  }, [
    effectiveRegionPsgc,
    effectiveProvincePsgc,
    effectiveCityPsgc,
    effectiveCityMatch,
    effectiveBarangayPsgc,
    isNcrWithoutProvinces,
    value.regionPsgc,
    value.provincePsgc,
    value.cityMunicipalityPsgc,
    value.barangayPsgc,
    value.regionName,
    value.provinceName,
    value.cityMunicipalityName,
    value.barangayName,
  ]);

  // Load Regions on mount
  useEffect(() => {
    let active = true;
    setLoadingRegions(true);
    locationService
      .getRegions()
      .then((data) => {
        if (active && data) {
          setRegions(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingRegions(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Cascading: Load Provinces (non-NCR) or direct Cities (NCR / zero-province regions) when Region changes
  useEffect(() => {
    if (!effectiveRegionPsgc) {
      setProvinces([]);
      setProvincesLoadedForRegion(null);
      setCities([]);
      setCitiesLoadedForKey(null);
      setBarangays([]);
      setBarangaysLoadedForCity(null);
      setLoadingProvinces(false);
      setLoadingCities(false);
      return;
    }

    let active = true;
    const regionCode = effectiveRegionPsgc;

    setProvinces([]);
    setProvincesLoadedForRegion(null);
    if (isKnownNcr) {
      setCities([]);
      setCitiesLoadedForKey(null);
      setLoadingProvinces(false);
      setLoadingCities(true);
    } else {
      setLoadingProvinces(true);
    }

    fetchRegionDependentLocations(regionCode, valueRef.current.regionName, locationService)
      .then((result) => {
        if (!active) return;
        setProvinces(result.provinces);
        setProvincesLoadedForRegion(regionCode);
        if (result.cities !== null) {
          setCities(result.cities);
          setCitiesLoadedForKey(`region:${regionCode}`);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setLoadingProvinces(false);
          if (isKnownNcr) {
            setLoadingCities(false);
          }
        }
      });

    return () => {
      active = false;
    };
  }, [effectiveRegionPsgc, isKnownNcr]);

  // Cascading: Load Cities when Province changes (non-NCR regions only)
  useEffect(() => {
    if (isNcrWithoutProvinces) {
      return;
    }

    if (!effectiveProvincePsgc) {
      setCities([]);
      setCitiesLoadedForKey(null);
      setLoadingCities(false);
      return;
    }

    let active = true;
    const provinceCode = effectiveProvincePsgc;
    const regionCode = effectiveRegionPsgc;
    const citiesKey = `province:${regionCode ?? ''}:${provinceCode}`;

    setCities([]);
    setCitiesLoadedForKey(null);
    setLoadingCities(true);
    fetchProvinceDependentCities(
      {
        regionPsgc: regionCode,
        provincePsgc: provinceCode,
        bypassProvince: isNcrWithoutProvinces,
      },
      locationService,
    )
      .then((result) => {
        if (active && !result.preserveCities && result.cities !== null) {
          setCities(result.cities);
          setCitiesLoadedForKey(citiesKey);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingCities(false);
      });

    return () => {
      active = false;
    };
  }, [effectiveProvincePsgc, effectiveRegionPsgc, isNcrWithoutProvinces]);

  // Cascading: Load Barangays when City changes
  useEffect(() => {
    if (!effectiveCityPsgc) {
      setBarangays([]);
      setBarangaysLoadedForCity(null);
      setLoadingBarangays(false);
      return;
    }

    let active = true;
    const cityCode = effectiveCityPsgc;

    setBarangays([]);
    setBarangaysLoadedForCity(null);
    setLoadingBarangays(true);
    locationService
      .getBarangays(cityCode)
      .then((data) => {
        if (active) {
          setBarangays(data);
          setBarangaysLoadedForCity(cityCode);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingBarangays(false);
      });

    return () => {
      active = false;
    };
  }, [effectiveCityPsgc]);

  const regionOptions: SelectOption[] = useMemo(
    () => regions.map((r) => ({ label: r.name, value: r.psgcCode || r.code || r.name })),
    [regions]
  );

  const provinceOptions: SelectOption[] = useMemo(
    () => provinces.map((p) => ({ label: p.name, value: p.psgcCode || p.code || p.name })),
    [provinces]
  );

  const cityOptions: SelectOption[] = useMemo(
    () => cities.map((c) => ({ label: c.name, value: c.psgcCode || c.code || c.name })),
    [cities]
  );

  const barangayOptions: SelectOption[] = useMemo(
    () => barangays.map((b) => ({ label: b.name, value: b.psgcCode || b.code || b.name })),
    [barangays]
  );

  const handleSelectRegion = useCallback(
    (code: string) => {
      lastBackfillSignatureRef.current = null;
      const found = regions.find((r) => (r.psgcCode || r.code || r.name) === code);
      onChange({
        ...value,
        regionPsgc: code,
        regionName: found?.name ?? code,
        provincePsgc: null,
        provinceName: null,
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
      });
      setActiveModal(null);
    },
    [regions, value, onChange]
  );

  const handleSelectProvince = useCallback(
    (code: string) => {
      lastBackfillSignatureRef.current = null;
      const found = provinces.find((p) => (p.psgcCode || p.code || p.name) === code);
      onChange({
        ...value,
        regionPsgc: value.regionPsgc?.trim() || effectiveRegionPsgc || null,
        provincePsgc: code,
        provinceName: found?.name ?? code,
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
      });
      setActiveModal(null);
    },
    [provinces, value, effectiveRegionPsgc, onChange]
  );

  const handleSelectCity = useCallback(
    (code: string) => {
      lastBackfillSignatureRef.current = null;
      const found = cities.find((c) => (c.psgcCode || c.code || c.name) === code);
      onChange({
        ...value,
        regionPsgc: value.regionPsgc?.trim() || effectiveRegionPsgc || null,
        provincePsgc: isNcrWithoutProvinces
          ? null
          : (value.provincePsgc?.trim() || effectiveProvincePsgc || null),
        cityMunicipalityPsgc: code,
        cityMunicipalityName: found?.name ?? code,
        barangayPsgc: null,
        barangayName: null,
        postalCode: found?.zipCode ?? value.postalCode ?? value.zipCode ?? null,
        zipCode: found?.zipCode ?? value.postalCode ?? value.zipCode ?? null,
      });
      setActiveModal(null);
    },
    [cities, value, effectiveRegionPsgc, effectiveProvincePsgc, isNcrWithoutProvinces, onChange]
  );

  const handleSelectBarangay = useCallback(
    (code: string) => {
      lastBackfillSignatureRef.current = null;
      const found = barangays.find((b) => (b.psgcCode || b.code || b.name) === code);
      onChange({
        ...value,
        regionPsgc: value.regionPsgc?.trim() || effectiveRegionPsgc || null,
        provincePsgc: isNcrWithoutProvinces
          ? null
          : (value.provincePsgc?.trim() || effectiveProvincePsgc || null),
        cityMunicipalityPsgc: value.cityMunicipalityPsgc?.trim() || effectiveCityPsgc || null,
        barangayPsgc: code,
        barangayName: found?.name ?? code,
      });
      setActiveModal(null);
    },
    [barangays, value, effectiveRegionPsgc, effectiveProvincePsgc, effectiveCityPsgc, isNcrWithoutProvinces, onChange]
  );

  const isLocked = disabled || Boolean(value.isSameAsPermanent);
  const showRequired = required && !value.isSameAsPermanent;
  const activeErrors = value.isSameAsPermanent ? undefined : errors;
  const canSelectProvince = Boolean(effectiveRegionPsgc);
  const canSelectCity = isNcrWithoutProvinces
    ? Boolean(effectiveRegionPsgc)
    : Boolean(effectiveProvincePsgc);
  const canSelectBarangay = Boolean(effectiveCityPsgc);
  const isResolvingRegion = !effectiveRegionPsgc && loadingRegions && Boolean(value.regionName?.trim());
  const isResolvingProvince =
    !isNcrWithoutProvinces &&
    !effectiveProvincePsgc &&
    (loadingRegions || loadingProvinces) &&
    Boolean(value.provinceName?.trim());
  const isResolvingCity =
    !effectiveCityPsgc &&
    (loadingRegions || loadingProvinces || loadingCities) &&
    Boolean(value.cityMunicipalityName?.trim());

  return (
    <View style={styles.container}>
      {showSameAsPermanentToggle && (
        <ProfileToggle
          label="Same as Permanent Address"
          description="Copy full PSGC address and synchronize with permanent residence"
          value={Boolean(value.isSameAsPermanent)}
          onValueChange={(checked) => {
            onChange({
              ...value,
              isSameAsPermanent: checked,
            });
          }}
        />
      )}

      {/* Region Picker */}
      <ProfileFormField
        label="Region"
        value={value.regionName || (effectiveRegionPsgc ? `Region (${effectiveRegionPsgc})` : '')}
        placeholder={loadingRegions ? 'Loading regions...' : 'Select Region'}
        picker
        required={showRequired}
        error={activeErrors?.region}
        editable={!isLocked}
        onPressIn={() => !isLocked && setActiveModal('region')}
      />

      {/* Province Picker (Optional / Skipped for NCR) */}
      {!isNcrWithoutProvinces && (
        <ProfileFormField
          label="Province"
          value={value.provinceName || (effectiveProvincePsgc ? `Province (${effectiveProvincePsgc})` : '')}
          placeholder={
            !canSelectProvince
              ? isResolvingRegion
                ? 'Loading provinces...'
                : 'Select Region first'
              : loadingProvinces
                ? 'Loading provinces...'
                : 'Select Province'
          }
          picker
          required={showRequired}
          error={activeErrors?.province}
          editable={!isLocked && canSelectProvince}
          onPressIn={() => !isLocked && canSelectProvince && setActiveModal('province')}
        />
      )}

      {/* City / Municipality Picker */}
      <ProfileFormField
        label="City / Municipality"
        value={value.cityMunicipalityName || (effectiveCityPsgc ? `City (${effectiveCityPsgc})` : '')}
        placeholder={
          !canSelectCity
            ? isResolvingProvince
              ? 'Loading cities...'
              : isNcrWithoutProvinces
                ? 'Select Region first'
                : 'Select Province first'
            : loadingCities
              ? 'Loading cities...'
              : 'Select City / Municipality'
        }
        picker
        required={showRequired}
        error={activeErrors?.cityMunicipality}
        editable={!isLocked && canSelectCity}
        onPressIn={() => !isLocked && canSelectCity && setActiveModal('city')}
      />

      {/* Barangay Picker */}
      <ProfileFormField
        label="Barangay"
        value={value.barangayName || (effectiveBarangayPsgc ? `Barangay (${effectiveBarangayPsgc})` : '')}
        placeholder={
          !canSelectBarangay
            ? isResolvingCity
              ? 'Loading barangays...'
              : 'Select City first'
            : loadingBarangays
              ? 'Loading barangays...'
              : 'Select Barangay'
        }
        picker
        required={showRequired}
        error={activeErrors?.barangay}
        editable={!isLocked && canSelectBarangay}
        onPressIn={() => !isLocked && canSelectBarangay && setActiveModal('barangay')}
      />

      {/* Street Address / House / Unit / Building */}
      <ProfileFormField
        label="House / Unit / Building / Street"
        value={value.houseStreet ?? value.streetAddress ?? value.streetBarangay ?? ''}
        placeholder="e.g. Unit 402, 123 Ayala Avenue"
        editable={!isLocked}
        onChangeText={(text) => {
          onChange({
            ...value,
            houseStreet: text,
            streetAddress: text,
            streetBarangay: text,
          });
        }}
      />

      {/* Postal Code / ZIP */}
      <ProfileFormField
        label="Postal Code / ZIP"
        value={value.postalCode ?? value.zipCode ?? ''}
        placeholder="e.g. 1223"
        keyboardType="numeric"
        editable={!isLocked}
        onChangeText={(text) => {
          onChange({
            ...value,
            postalCode: text,
            zipCode: text,
          });
        }}
      />

      {/* Modals */}
      <ProfileSelectModal
        visible={activeModal === 'region'}
        title="Select Region"
        options={regionOptions}
        selected={effectiveRegionPsgc}
        loading={loadingRegions}
        emptyText="No regions available"
        onSelect={handleSelectRegion}
        onClose={() => setActiveModal(null)}
      />

      <ProfileSelectModal
        visible={activeModal === 'province'}
        title="Select Province"
        options={provinceOptions}
        selected={effectiveProvincePsgc}
        loading={loadingProvinces}
        emptyText="No provinces available"
        onSelect={handleSelectProvince}
        onClose={() => setActiveModal(null)}
      />

      <ProfileSelectModal
        visible={activeModal === 'city'}
        title="Select City / Municipality"
        options={cityOptions}
        selected={effectiveCityPsgc}
        loading={loadingCities}
        emptyText="No cities or municipalities available"
        onSelect={handleSelectCity}
        onClose={() => setActiveModal(null)}
      />

      <ProfileSelectModal
        visible={activeModal === 'barangay'}
        title="Select Barangay"
        options={barangayOptions}
        selected={effectiveBarangayPsgc}
        loading={loadingBarangays}
        emptyText="No barangays available"
        onSelect={handleSelectBarangay}
        onClose={() => setActiveModal(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
