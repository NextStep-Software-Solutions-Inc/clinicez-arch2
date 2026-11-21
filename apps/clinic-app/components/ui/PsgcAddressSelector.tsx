import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Switch } from 'react-native';
import ThemedText from './ThemedText';
import Select, { type SelectOption } from './Select';
import Input from './Input';
import Icon from './Icon';
import Button from './Button';
import Badge from './Badge';
import { theme } from '../../constants/theme';
import type { PatientAddressDto } from '../../services/clinicService';
import { usePsgcLocations } from '../../hooks/usePsgcLocations';

export interface PsgcAddressSelectorProps {
  value?: PatientAddressDto | null;
  onChange: (address: PatientAddressDto) => void;
  label?: string;
  disabled?: boolean;
  showSameAsPermanent?: boolean;
  collapsible?: boolean;
}

export function hasAnyAddressInput(address?: PatientAddressDto | null): boolean {
  if (!address) return false;
  return Boolean(
    address.streetAddress?.trim() ||
      address.barangayPsgc?.trim() ||
      address.barangayName?.trim() ||
      address.cityMunicipalityPsgc?.trim() ||
      address.cityMunicipalityName?.trim() ||
      address.provincePsgc?.trim() ||
      address.provinceName?.trim() ||
      address.regionPsgc?.trim() ||
      address.regionName?.trim() ||
      address.zipCode?.trim()
  );
}

export function createEmptyAddressDraft(addressType = 'Permanent'): PatientAddressDto {
  return {
    addressType,
    isSameAsPermanent: false,
    regionPsgc: null,
    provincePsgc: null,
    cityMunicipalityPsgc: null,
    barangayPsgc: null,
    regionName: null,
    provinceName: null,
    cityMunicipalityName: null,
    barangayName: null,
    streetAddress: '',
    zipCode: null,
  };
}

export default function PsgcAddressSelector({
  value,
  onChange,
  label = 'Home Address',
  disabled = false,
  showSameAsPermanent = false,
  collapsible = true,
}: PsgcAddressSelectorProps) {
  const hasInput = hasAnyAddressInput(value);
  const [isExpanded, setIsExpanded] = useState<boolean>(() => hasInput);
  const expanded = !collapsible || isExpanded || hasInput;

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
    <View style={collapsible ? styles.card : styles.container}>
      {collapsible ? (
        <View style={styles.headerRow}>
          <View style={styles.headerTitleRow}>
            <Icon name="mapPin" size={theme.sizes.iconSm} color={theme.colors.primary} />
            <ThemedText variant="smallBold" color={theme.colors.text}>
              {label}
            </ThemedText>
            <Badge
              label={hasInput ? 'Recorded' : 'Optional'}
              variant={hasInput ? 'info' : 'neutral'}
            />
          </View>
          {expanded ? (
            <Button
              title="Remove"
              variant="ghost"
              size="sm"
              onPress={() => {
                setIsExpanded(false);
                onChange(createEmptyAddressDraft(address.addressType));
              }}
            />
          ) : (
            <Button
              title="+ Add Address"
              variant="outline"
              size="sm"
              onPress={() => setIsExpanded(true)}
            />
          )}
        </View>
      ) : label ? (
        <ThemedText variant="bodyBold" style={{ marginBottom: theme.spacing.sm }}>
          {label}
        </ThemedText>
      ) : null}

      {!expanded ? (
        <ThemedText variant="caption" color={theme.colors.textMuted}>
          Capture residential and Philippine Standard Geographic Code (PSGC) address details (optional during quick intake).
        </ThemedText>
      ) : (
        <View style={styles.fieldsStack}>
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
                    Metro Manila (NCR) has no provinces — select your city or municipality below.
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  card: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  fieldsStack: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  sameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  ncrNotice: {},
});
