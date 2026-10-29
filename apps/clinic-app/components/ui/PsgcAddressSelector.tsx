import React, { useMemo } from 'react';
import { View, StyleSheet, Switch } from 'react-native';
import ThemedText from './ThemedText';
import Select, { type SelectOption } from './Select';
import Input from './Input';
import { theme } from '../../constants/theme';
import type { PatientAddressDto } from '../../services/clinicService';
import { usePsgcLocations } from '../../hooks/usePsgcLocations';

export interface PsgcAddressSelectorProps {
  value?: PatientAddressDto | null;
  onChange: (address: PatientAddressDto) => void;
  label?: string;
  disabled?: boolean;
  showSameAsPermanent?: boolean;
}

export default function PsgcAddressSelector({
  value,
  onChange,
  label = 'Philippine Standard Geographic Code (PSGC) Address',
  disabled = false,
  showSameAsPermanent = false,
}: PsgcAddressSelectorProps) {
  const address = useMemo<PatientAddressDto>(() => {
    return {
      addressType: value?.addressType || 'Permanent',
      isSameAsPermanent: Boolean(value?.isSameAsPermanent),
      regionPsgc: value?.regionPsgc ?? null,
      provincePsgc: value?.provincePsgc ?? null,
      cityMunicipalityPsgc: value?.cityMunicipalityPsgc ?? null,
      barangayPsgc: value?.barangayPsgc ?? null,
      regionName: value?.regionName ?? null,
      provinceName: value?.provinceName ?? null,
      cityMunicipalityName: value?.cityMunicipalityName ?? null,
      barangayName: value?.barangayName ?? null,
      streetAddress: value?.streetAddress ?? '',
      zipCode: value?.zipCode ?? null,
    };
  }, [value]);

  const {
    regions,
    provinces,
    cities,
    barangays,
    loadingRegions,
    loadingProvinces,
    loadingCities,
    loadingBarangays,
  } = usePsgcLocations(address.regionPsgc, address.provincePsgc, address.cityMunicipalityPsgc);

  const isNcr = useMemo(() => {
    const reg = regions.find((r) => r.psgcCode === address.regionPsgc || r.code === address.regionPsgc);
    return reg?.name?.toUpperCase().includes('NCR') || reg?.name?.toUpperCase().includes('NATIONAL CAPITAL');
  }, [regions, address.regionPsgc]);

  const regionOptions: SelectOption[] = useMemo(
    () => regions.map((r) => ({ label: r.name, value: r.psgcCode || r.code || '' })),
    [regions],
  );

  const provinceOptions: SelectOption[] = useMemo(
    () => provinces.map((p) => ({ label: p.name, value: p.psgcCode || p.code || '' })),
    [provinces],
  );

  const cityOptions: SelectOption[] = useMemo(
    () => cities.map((c) => ({ label: c.name, value: c.psgcCode || c.code || '' })),
    [cities],
  );

  const barangayOptions: SelectOption[] = useMemo(
    () => barangays.map((b) => ({ label: b.name, value: b.psgcCode || b.code || '' })),
    [barangays],
  );

  const handleRegionChange = (code: string) => {
    const found = regions.find((r) => (r.psgcCode || r.code) === code);
    onChange({
      ...address,
      regionPsgc: code,
      regionName: found?.name ?? null,
      provincePsgc: null,
      provinceName: null,
      cityMunicipalityPsgc: null,
      cityMunicipalityName: null,
      barangayPsgc: null,
      barangayName: null,
    });
  };

  const handleProvinceChange = (code: string) => {
    const found = provinces.find((p) => (p.psgcCode || p.code) === code);
    onChange({
      ...address,
      provincePsgc: code,
      provinceName: found?.name ?? null,
      cityMunicipalityPsgc: null,
      cityMunicipalityName: null,
      barangayPsgc: null,
      barangayName: null,
    });
  };

  const handleCityChange = (code: string) => {
    const found = cities.find((c) => (c.psgcCode || c.code) === code);
    onChange({
      ...address,
      cityMunicipalityPsgc: code,
      cityMunicipalityName: found?.name ?? null,
      barangayPsgc: null,
      barangayName: null,
      zipCode: found?.zipCode || address.zipCode,
    });
  };

  const handleBarangayChange = (code: string) => {
    const found = barangays.find((b) => (b.psgcCode || b.code) === code);
    onChange({
      ...address,
      barangayPsgc: code,
      barangayName: found?.name ?? null,
    });
  };

  const handleStreetChange = (text: string) => {
    onChange({
      ...address,
      streetAddress: text,
    });
  };

  const handleZipChange = (text: string) => {
    onChange({
      ...address,
      zipCode: text,
    });
  };

  const handleSameAsPermanentToggle = (val: boolean) => {
    onChange({
      ...address,
      isSameAsPermanent: val,
    });
  };

  return (
    <View style={styles.container}>
      {label ? (
        <ThemedText variant="bodyBold" style={{ marginBottom: theme.spacing.sm }}>
          {label}
        </ThemedText>
      ) : null}

      {showSameAsPermanent ? (
        <View style={styles.sameRow}>
          <ThemedText variant="small">Same as Permanent Address</ThemedText>
          <Switch
            value={address.isSameAsPermanent}
            onValueChange={handleSameAsPermanentToggle}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          />
        </View>
      ) : null}

      {!address.isSameAsPermanent && (
        <View style={{ gap: theme.spacing.md }}>
          {/* Level 1: Region */}
          <Select
            label="Region"
            value={address.regionPsgc}
            options={regionOptions}
            onSelect={handleRegionChange}
            placeholder={loadingRegions ? 'Loading regions...' : 'Select Region'}
            disabled={disabled}
            allowClear
          />

          {/* Level 2: Province (Bypassed if NCR) */}
          {!isNcr ? (
            <Select
              label="Province"
              value={address.provincePsgc}
              options={provinceOptions}
              onSelect={handleProvinceChange}
              placeholder={
                !address.regionPsgc
                  ? 'Select Region first'
                  : loadingProvinces
                  ? 'Loading provinces...'
                  : 'Select Province'
              }
              disabled={disabled || !address.regionPsgc}
              allowClear
            />
          ) : (
            <View style={[styles.ncrNotice, { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radii.md, padding: theme.spacing.sm }]}>
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                National Capital Region (NCR) has no provinces. Cascaded directly to Cities/Municipalities.
              </ThemedText>
            </View>
          )}

          {/* Level 3: City / Municipality */}
          <Select
            label="City / Municipality"
            value={address.cityMunicipalityPsgc}
            options={cityOptions}
            onSelect={handleCityChange}
            placeholder={
              !address.regionPsgc && !address.provincePsgc
                ? 'Select Region/Province first'
                : loadingCities
                ? 'Loading cities...'
                : 'Select City / Municipality'
            }
            disabled={disabled || (!address.provincePsgc && !isNcr)}
            allowClear
          />

          {/* Level 4: Barangay */}
          <Select
            label="Barangay"
            value={address.barangayPsgc}
            options={barangayOptions}
            onSelect={handleBarangayChange}
            placeholder={
              !address.cityMunicipalityPsgc
                ? 'Select City/Municipality first'
                : loadingBarangays
                ? 'Loading barangays...'
                : 'Select Barangay'
            }
            disabled={disabled || !address.cityMunicipalityPsgc}
            allowClear
          />

          {/* Street Address */}
          <Input
            label="Street Address / Building / Unit No."
            value={address.streetAddress}
            onChangeText={handleStreetChange}
            placeholder="e.g. 123 Rizal Ave, Bldg A, Unit 4B"
            editable={!disabled}
          />

          {/* Postal / ZIP Code */}
          <Input
            label="Postal / ZIP Code"
            value={address.zipCode || ''}
            onChangeText={handleZipChange}
            placeholder="e.g. 1000"
            keyboardType="numeric"
            editable={!disabled}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  sameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ncrNotice: {},
});
