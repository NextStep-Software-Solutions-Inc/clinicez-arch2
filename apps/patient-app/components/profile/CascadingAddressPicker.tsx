import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';
import ProfileFormField from './ProfileFormField';
import ProfileToggle from './ProfileToggle';
import ProfileSelectModal, { SelectOption } from './ProfileSelectModal';
import { locationService } from '../../services/api/locationService';
import type { StructuredPsgcAddress, PsgcLocationDto } from '@shared/safe';

export interface CascadingAddressPickerProps {
  value: StructuredPsgcAddress;
  onChange: (next: StructuredPsgcAddress) => void;
  disabled?: boolean;
  showSameAsPermanentToggle?: boolean;
}

export default function CascadingAddressPicker({
  value,
  onChange,
  disabled = false,
  showSameAsPermanentToggle = false,
}: CascadingAddressPickerProps) {
  const { colors, radii } = useAppTheme();

  const [regions, setRegions] = useState<PsgcLocationDto[]>([]);
  const [provinces, setProvinces] = useState<PsgcLocationDto[]>([]);
  const [cities, setCities] = useState<PsgcLocationDto[]>([]);
  const [barangays, setBarangays] = useState<PsgcLocationDto[]>([]);

  const [activeModal, setActiveModal] = useState<'region' | 'province' | 'city' | 'barangay' | null>(null);

  // Load Regions on mount
  useEffect(() => {
    let active = true;
    locationService.getRegions().then((data) => {
      if (active && data) {
        setRegions(data);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Cascading: Load Provinces / NCR Cities when Region changes
  useEffect(() => {
    if (!value.regionPsgc) {
      setProvinces([]);
      return;
    }
    let active = true;
    locationService.getProvinces(value.regionPsgc).then((provs) => {
      if (!active) return;
      setProvinces(provs);
      if (provs.length === 0) {
        // Single-tier region like NCR: directly load cities
        locationService.getCities(undefined, value.regionPsgc || undefined).then((cList) => {
          if (active) setCities(cList);
        });
      }
    });
    return () => {
      active = false;
    };
  }, [value.regionPsgc]);

  // Cascading: Load Cities when Province changes
  useEffect(() => {
    if (!value.provincePsgc) {
      if (!value.regionPsgc || provinces.length > 0) {
        setCities([]);
      }
      return;
    }
    let active = true;
    locationService.getCities(value.provincePsgc, value.regionPsgc || undefined).then((data) => {
      if (active) setCities(data);
    });
    return () => {
      active = false;
    };
  }, [value.provincePsgc, value.regionPsgc, provinces.length]);

  // Cascading: Load Barangays when City changes
  useEffect(() => {
    if (!value.cityMunicipalityPsgc) {
      setBarangays([]);
      return;
    }
    let active = true;
    locationService.getBarangays(value.cityMunicipalityPsgc).then((data) => {
      if (active) setBarangays(data);
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

  const isNcrWithoutProvinces = Boolean(
    value.regionName?.toLowerCase().includes('ncr') ||
    value.regionName?.toLowerCase().includes('national capital') ||
    (value.regionPsgc && provinces.length === 0)
  );

  const isLocked = disabled || Boolean(value.isSameAsPermanent);

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
        placeholder="Select Region"
        picker
        editable={!isLocked}
        onPressIn={() => !isLocked && setActiveModal('region')}
      />

      {/* Province Picker (Optional / Skipped for NCR) */}
      {!isNcrWithoutProvinces && (
        <ProfileFormField
          label="Province"
          value={value.provinceName || (value.provincePsgc ? `Province (${value.provincePsgc})` : '')}
          placeholder={value.regionPsgc ? 'Select Province' : 'Select Region first'}
          picker
          editable={!isLocked && Boolean(value.regionPsgc)}
          onPressIn={() => !isLocked && Boolean(value.regionPsgc) && setActiveModal('province')}
        />
      )}

      {/* City / Municipality Picker */}
      <ProfileFormField
        label="City / Municipality"
        value={value.cityMunicipalityName || (value.cityMunicipalityPsgc ? `City (${value.cityMunicipalityPsgc})` : '')}
        placeholder={
          isNcrWithoutProvinces
            ? value.regionPsgc ? 'Select City / Municipality' : 'Select Region first'
            : value.provincePsgc ? 'Select City / Municipality' : 'Select Province first'
        }
        picker
        editable={!isLocked && (isNcrWithoutProvinces ? Boolean(value.regionPsgc) : Boolean(value.provincePsgc))}
        onPressIn={() =>
          !isLocked &&
          (isNcrWithoutProvinces ? Boolean(value.regionPsgc) : Boolean(value.provincePsgc)) &&
          setActiveModal('city')
        }
      />

      {/* Barangay Picker */}
      <ProfileFormField
        label="Barangay"
        value={value.barangayName || (value.barangayPsgc ? `Barangay (${value.barangayPsgc})` : '')}
        placeholder={value.cityMunicipalityPsgc ? 'Select Barangay' : 'Select City first'}
        picker
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
        onSelect={handleSelectRegion}
        onClose={() => setActiveModal(null)}
      />

      <ProfileSelectModal
        visible={activeModal === 'province'}
        title="Select Province"
        options={provinceOptions}
        selected={value.provincePsgc}
        onSelect={handleSelectProvince}
        onClose={() => setActiveModal(null)}
      />

      <ProfileSelectModal
        visible={activeModal === 'city'}
        title="Select City / Municipality"
        options={cityOptions}
        selected={value.cityMunicipalityPsgc}
        onSelect={handleSelectCity}
        onClose={() => setActiveModal(null)}
      />

      <ProfileSelectModal
        visible={activeModal === 'barangay'}
        title="Select Barangay"
        options={barangayOptions}
        selected={value.barangayPsgc}
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
