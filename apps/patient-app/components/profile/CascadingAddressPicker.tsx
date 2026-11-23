import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  const [barangays, setBarangays] = useState<PsgcLocationDto[]>([]);

  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  const [activeModal, setActiveModal] = useState<'region' | 'province' | 'city' | 'barangay' | null>(null);

  const isKnownNcr = isNcrRegion(value.regionPsgc, value.regionName);
  const isNcrWithoutProvinces = shouldBypassProvinceTier({
    regionPsgc: value.regionPsgc,
    regionName: value.regionName,
    provincesCount: provinces.length,
    provincesLoadedForRegion,
  });

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
    if (!value.regionPsgc) {
      setProvinces([]);
      setProvincesLoadedForRegion(null);
      setCities([]);
      setBarangays([]);
      setLoadingProvinces(false);
      setLoadingCities(false);
      return;
    }

    let active = true;
    const regionCode = value.regionPsgc;

    setProvinces([]);
    setProvincesLoadedForRegion(null);
    if (isKnownNcr) {
      setCities([]);
      setLoadingProvinces(false);
      setLoadingCities(true);
    } else {
      setLoadingProvinces(true);
    }

    fetchRegionDependentLocations(regionCode, value.regionName, locationService)
      .then((result) => {
        if (!active) return;
        setProvinces(result.provinces);
        setProvincesLoadedForRegion(regionCode);
        if (result.cities !== null) {
          setCities(result.cities);
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
  }, [value.regionPsgc, isKnownNcr]);

  // Cascading: Load Cities when Province changes (non-NCR regions only)
  useEffect(() => {
    if (isNcrWithoutProvinces) {
      return;
    }

    if (!value.provincePsgc) {
      setCities([]);
      setLoadingCities(false);
      return;
    }

    let active = true;
    setLoadingCities(true);
    fetchProvinceDependentCities(
      {
        regionPsgc: value.regionPsgc,
        provincePsgc: value.provincePsgc,
        bypassProvince: isNcrWithoutProvinces,
      },
      locationService,
    )
      .then((result) => {
        if (active && !result.preserveCities && result.cities !== null) {
          setCities(result.cities);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingCities(false);
      });

    return () => {
      active = false;
    };
  }, [value.provincePsgc, value.regionPsgc, isNcrWithoutProvinces]);

  // Cascading: Load Barangays when City changes
  useEffect(() => {
    if (!value.cityMunicipalityPsgc) {
      setBarangays([]);
      setLoadingBarangays(false);
      return;
    }

    let active = true;
    setLoadingBarangays(true);
    locationService
      .getBarangays(value.cityMunicipalityPsgc)
      .then((data) => {
        if (active) setBarangays(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingBarangays(false);
      });

    return () => {
      active = false;
    };
  }, [value.cityMunicipalityPsgc]);

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
      const found = provinces.find((p) => (p.psgcCode || p.code || p.name) === code);
      onChange({
        ...value,
        provincePsgc: code,
        provinceName: found?.name ?? code,
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
      });
      setActiveModal(null);
    },
    [provinces, value, onChange]
  );

  const handleSelectCity = useCallback(
    (code: string) => {
      const found = cities.find((c) => (c.psgcCode || c.code || c.name) === code);
      onChange({
        ...value,
        cityMunicipalityPsgc: code,
        cityMunicipalityName: found?.name ?? code,
        barangayPsgc: null,
        barangayName: null,
        postalCode: found?.zipCode ?? value.postalCode ?? value.zipCode ?? null,
        zipCode: found?.zipCode ?? value.postalCode ?? value.zipCode ?? null,
      });
      setActiveModal(null);
    },
    [cities, value, onChange]
  );

  const handleSelectBarangay = useCallback(
    (code: string) => {
      const found = barangays.find((b) => (b.psgcCode || b.code || b.name) === code);
      onChange({
        ...value,
        barangayPsgc: code,
        barangayName: found?.name ?? code,
      });
      setActiveModal(null);
    },
    [barangays, value, onChange]
  );

  const isLocked = disabled || Boolean(value.isSameAsPermanent);
  const showRequired = required && !value.isSameAsPermanent;
  const activeErrors = value.isSameAsPermanent ? undefined : errors;
  const canSelectCity = isNcrWithoutProvinces
    ? Boolean(value.regionPsgc)
    : Boolean(value.provincePsgc);

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
        value={value.regionName || (value.regionPsgc ? `Region (${value.regionPsgc})` : '')}
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
          value={value.provinceName || (value.provincePsgc ? `Province (${value.provincePsgc})` : '')}
          placeholder={
            !value.regionPsgc
              ? 'Select Region first'
              : loadingProvinces
                ? 'Loading provinces...'
                : 'Select Province'
          }
          picker
          required={showRequired}
          error={activeErrors?.province}
          editable={!isLocked && Boolean(value.regionPsgc)}
          onPressIn={() => !isLocked && Boolean(value.regionPsgc) && setActiveModal('province')}
        />
      )}

      {/* City / Municipality Picker */}
      <ProfileFormField
        label="City / Municipality"
        value={value.cityMunicipalityName || (value.cityMunicipalityPsgc ? `City (${value.cityMunicipalityPsgc})` : '')}
        placeholder={
          !canSelectCity
            ? isNcrWithoutProvinces
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
        value={value.barangayName || (value.barangayPsgc ? `Barangay (${value.barangayPsgc})` : '')}
        placeholder={
          !value.cityMunicipalityPsgc
            ? 'Select City first'
            : loadingBarangays
              ? 'Loading barangays...'
              : 'Select Barangay'
        }
        picker
        required={showRequired}
        error={activeErrors?.barangay}
        editable={!isLocked && Boolean(value.cityMunicipalityPsgc)}
        onPressIn={() => !isLocked && Boolean(value.cityMunicipalityPsgc) && setActiveModal('barangay')}
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
        selected={value.regionPsgc}
        loading={loadingRegions}
        emptyText="No regions available"
        onSelect={handleSelectRegion}
        onClose={() => setActiveModal(null)}
      />

      <ProfileSelectModal
        visible={activeModal === 'province'}
        title="Select Province"
        options={provinceOptions}
        selected={value.provincePsgc}
        loading={loadingProvinces}
        emptyText="No provinces available"
        onSelect={handleSelectProvince}
        onClose={() => setActiveModal(null)}
      />

      <ProfileSelectModal
        visible={activeModal === 'city'}
        title="Select City / Municipality"
        options={cityOptions}
        selected={value.cityMunicipalityPsgc}
        loading={loadingCities}
        emptyText="No cities or municipalities available"
        onSelect={handleSelectCity}
        onClose={() => setActiveModal(null)}
      />

      <ProfileSelectModal
        visible={activeModal === 'barangay'}
        title="Select Barangay"
        options={barangayOptions}
        selected={value.barangayPsgc}
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
