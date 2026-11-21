import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import type { PsgcLocationDto } from '@shared/safe';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  SegmentedControl,
  Select,
  SkeletonList,
  ThemedText,
} from '@ui';
import { theme } from '@constants/theme';
import { notify } from '@utils/feedback';
import { useBreakpoint } from '@utils/useBreakpoint';
import {
  clinicService,
  type ClinicServiceItem,
  type Icd10Code,
} from '../../services/clinicService';
import { locationService } from '../../services/locationService';
import type { LookupSubTool } from './toolsCatalog';
import { FilterChip } from './ToolsUiHelpers';

export interface MedicalLookupsSectionProps {
  activeTool: LookupSubTool;
  onSelectTool: (tool: LookupSubTool) => void;
  canAccessIcd10: boolean;
  canAccessServices: boolean;
  refreshSignal?: number;
}

const QUICK_ICD10_TERMS = [
  { code: 'I10', label: 'I10 Hypertension' },
  { code: 'E11', label: 'E11 Type 2 DM' },
  { code: 'J06', label: 'J06 Acute URI' },
  { code: 'J45', label: 'J45 Asthma' },
  { code: 'N39', label: 'N39 UTI' },
];

function formatPeso(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function copyText(text: string, label: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      notify.success(`${label} copied to clipboard.`);
    } else {
      notify.info(`Copy unavailable on this device. Value: ${text}`);
    }
  } catch {
    notify.error(`Could not copy ${label.toLowerCase()}.`);
  }
}

export default function MedicalLookupsSection({
  activeTool,
  onSelectTool,
  canAccessIcd10,
  canAccessServices,
  refreshSignal = 0,
}: MedicalLookupsSectionProps) {
  const { isCompact } = useBreakpoint();
  const rowStyle = isCompact ? styles.inputCol : styles.inputRow;

  const subToolOptions = useMemo(() => {
    const items: Array<{ value: LookupSubTool; label: string; icon: 'search' | 'tag' | 'mapPin' }> = [];
    if (canAccessIcd10) items.push({ value: 'icd10', label: 'ICD-10', icon: 'search' });
    if (canAccessServices) items.push({ value: 'services', label: 'Services & Pricing', icon: 'tag' });
    items.push({ value: 'psgc', label: 'PSGC Address', icon: 'mapPin' });
    return items;
  }, [canAccessIcd10, canAccessServices]);

  // ── 1. ICD-10 Lookup State ────────────────────────────────────────────────
  const [icdQuery, setIcdQuery] = useState('');
  const [icdResults, setIcdResults] = useState<Icd10Code[]>([]);
  const [icdLoading, setIcdLoading] = useState(false);
  const [icdError, setIcdError] = useState<string | null>(null);
  const [icdSearched, setIcdSearched] = useState(false);

  const runIcdSearch = useCallback(
    async (rawQuery: string) => {
      if (!canAccessIcd10) return;
      const trimmed = rawQuery.trim();
      if (trimmed.length < 2) {
        setIcdResults([]);
        setIcdSearched(false);
        setIcdError(null);
        return;
      }
      setIcdLoading(true);
      setIcdError(null);
      const [data, err] = await clinicService.searchIcd10(trimmed);
      if (err) {
        setIcdResults([]);
        setIcdError(err.message || 'Unable to search ICD-10 codes.');
      } else {
        setIcdResults(data ?? []);
      }
      setIcdSearched(true);
      setIcdLoading(false);
    },
    [canAccessIcd10],
  );

  useEffect(() => {
    if (activeTool !== 'icd10' || !canAccessIcd10) return undefined;
    const trimmed = icdQuery.trim();
    if (trimmed.length < 2) {
      setIcdResults([]);
      setIcdSearched(false);
      setIcdError(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      void runIcdSearch(trimmed);
    }, 260);
    return () => clearTimeout(timer);
  }, [activeTool, canAccessIcd10, icdQuery, runIcdSearch]);

  // ── 2. Clinic Services & Pricing State ────────────────────────────────────
  const [services, setServices] = useState<ClinicServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesLoadedOnce, setServicesLoadedOnce] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceCategory, setServiceCategory] = useState('all');

  const loadServices = useCallback(async () => {
    if (!canAccessServices) return;
    setServicesLoading(true);
    const [data, err] = await clinicService.getServices(undefined, true);
    if (err) {
      setServicesError(err.message || 'Unable to load clinic services catalog.');
    } else {
      setServices((data ?? []).filter((s) => s.isActive !== false));
      setServicesError(null);
    }
    setServicesLoadedOnce(true);
    setServicesLoading(false);
  }, [canAccessServices]);

  useEffect(() => {
    if (activeTool === 'services' && canAccessServices && !servicesLoadedOnce) {
      void loadServices();
    }
  }, [activeTool, canAccessServices, servicesLoadedOnce, loadServices]);

  useEffect(() => {
    if (!refreshSignal) return;
    if (activeTool === 'services' && canAccessServices) {
      void loadServices();
    } else if (activeTool === 'icd10' && canAccessIcd10 && icdQuery.trim().length >= 2) {
      void runIcdSearch(icdQuery);
    }
  }, [refreshSignal, activeTool, canAccessServices, canAccessIcd10, loadServices, runIcdSearch, icdQuery]);

  const serviceCategories = useMemo(
    () => ['all', ...Array.from(new Set(services.map((s) => s.category || 'Other'))).sort()],
    [services],
  );

  const filteredServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    return services.filter((item) => {
      const cat = item.category || 'Other';
      const matchesCat = serviceCategory === 'all' || cat.toLowerCase() === serviceCategory.toLowerCase();
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q) ||
        (item.philHealthCode || '').toLowerCase().includes(q)
      );
    });
  }, [services, serviceSearch, serviceCategory]);

  // ── 3. PSGC Philippine Address Lookup State ───────────────────────────────
  const [psgcMode, setPsgcMode] = useState<'search' | 'browse'>('search');
  const [psgcQuery, setPsgcQuery] = useState('');
  const [psgcResults, setPsgcResults] = useState<PsgcLocationDto[]>([]);
  const [psgcLoading, setPsgcLoading] = useState(false);
  const [psgcSearched, setPsgcSearched] = useState(false);

  const [regions, setRegions] = useState<PsgcLocationDto[]>([]);
  const [provinces, setProvinces] = useState<PsgcLocationDto[]>([]);
  const [cities, setCities] = useState<PsgcLocationDto[]>([]);
  const [barangays, setBarangays] = useState<PsgcLocationDto[]>([]);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState('');
  const [regionsLoaded, setRegionsLoaded] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);

  useEffect(() => {
    if (activeTool !== 'psgc' || psgcMode !== 'search') return undefined;
    const trimmed = psgcQuery.trim();
    if (trimmed.length < 2) {
      setPsgcResults([]);
      setPsgcSearched(false);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPsgcLoading(true);
      const list = await locationService.searchLocations(trimmed, 40);
      if (!cancelled) {
        setPsgcResults(list);
        setPsgcSearched(true);
        setPsgcLoading(false);
      }
    }, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTool, psgcMode, psgcQuery]);

  useEffect(() => {
    if (activeTool !== 'psgc' || psgcMode !== 'browse' || regionsLoaded) return;
    let cancelled = false;
    setBrowseLoading(true);
    void locationService.getRegions().then((list) => {
      if (!cancelled) {
        setRegions(list);
        setRegionsLoaded(true);
        setBrowseLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeTool, psgcMode, regionsLoaded]);

  const handleSelectRegion = useCallback(async (regionCode: string) => {
    setSelectedRegion(regionCode);
    setSelectedProvince('');
    setSelectedCity('');
    setSelectedBarangay('');
    setProvinces([]);
    setCities([]);
    setBarangays([]);
    if (!regionCode) return;
    setBrowseLoading(true);
    const provs = await locationService.getProvinces(regionCode);
    setProvinces(provs);
    if (provs.length === 0) {
      // NCR / independent regions without provinces
      const regionCities = await locationService.getCities(null, regionCode);
      setCities(regionCities);
    }
    setBrowseLoading(false);
  }, []);

  const handleSelectProvince = useCallback(
    async (provinceCode: string) => {
      setSelectedProvince(provinceCode);
      setSelectedCity('');
      setSelectedBarangay('');
      setCities([]);
      setBarangays([]);
      if (!provinceCode) return;
      setBrowseLoading(true);
      const nextCities = await locationService.getCities(provinceCode, selectedRegion || null);
      setCities(nextCities);
      setBrowseLoading(false);
    },
    [selectedRegion],
  );

  const handleSelectCity = useCallback(async (cityCode: string) => {
    setSelectedCity(cityCode);
    setSelectedBarangay('');
    setBarangays([]);
    if (!cityCode) return;
    setBrowseLoading(true);
    const nextBarangays = await locationService.getBarangays(cityCode);
    setBarangays(nextBarangays);
    setBrowseLoading(false);
  }, []);

  const activeBrowseItem = useMemo(() => {
    if (selectedBarangay) return barangays.find((b) => b.psgcCode === selectedBarangay) ?? null;
    if (selectedCity) return cities.find((c) => c.psgcCode === selectedCity) ?? null;
    if (selectedProvince) return provinces.find((p) => p.psgcCode === selectedProvince) ?? null;
    if (selectedRegion) return regions.find((r) => r.psgcCode === selectedRegion) ?? null;
    return null;
  }, [
    selectedBarangay,
    selectedCity,
    selectedProvince,
    selectedRegion,
    barangays,
    cities,
    provinces,
    regions,
  ]);

  // ── Renderers ─────────────────────────────────────────────────────────────

  const renderIcd10 = () => {
    if (!canAccessIcd10) {
      return (
        <Card>
          <EmptyState
            icon="lock"
            title="Access restricted"
            description="Ask a clinic administrator to enable diagnosis lookup access for your account."
          />
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader
          title="ICD-10 Diagnosis Lookup"
          subtitle="Search official ICD-10 diagnosis codes and descriptions."
          icon="search"
          rightAction={
            icdResults.length > 0 ? (
              <Badge label={`${icdResults.length} matches`} variant="neutral" size="sm" />
            ) : undefined
          }
        />

        <View style={rowStyle}>
          <View style={styles.flexFill}>
            <Input
              leftIcon="search"
              placeholder="Search code or condition (e.g. I10, diabetes, pneumonia)..."
              value={icdQuery}
              onChangeText={setIcdQuery}
              autoCapitalize="none"
              onSubmitEditing={() => void runIcdSearch(icdQuery)}
            />
          </View>
          <Button
            title="Search"
            variant="primary"
            loading={icdLoading}
            disabled={icdQuery.trim().length < 2}
            onPress={() => void runIcdSearch(icdQuery)}
          />
        </View>

        <View style={styles.chipRow}>
          {QUICK_ICD10_TERMS.map((item) => (
            <FilterChip
              key={item.code}
              label={item.label}
              active={icdQuery.trim().toUpperCase().startsWith(item.code)}
              onPress={() => setIcdQuery(item.code)}
            />
          ))}
        </View>

        {icdLoading ? (
          <SkeletonList rows={4} rowHeight={theme.sizes.controlMd} />
        ) : icdError ? (
          <ErrorState
            compact
            title="Unable to search ICD-10"
            message={icdError}
            onRetry={() => void runIcdSearch(icdQuery)}
          />
        ) : icdResults.length > 0 ? (
          <View>
            {icdResults.map((item) => (
              <View key={item.code} style={styles.listRow}>
                <View style={styles.flexFill}>
                  <View style={styles.codeHeaderRow}>
                    <Badge label={item.code} variant="primary" size="sm" />
                    <ThemedText variant="bodyBold" style={styles.flexFill}>
                      {item.description}
                    </ThemedText>
                  </View>
                </View>
                <Button
                  title="Copy"
                  size="sm"
                  variant="ghost"
                  icon="copy"
                  onPress={() => void copyText(`${item.code} - ${item.description}`, `ICD-10 ${item.code}`)}
                />
              </View>
            ))}
          </View>
        ) : icdSearched ? (
          <EmptyState
            icon="search"
            title="No matching ICD-10 codes"
            description="Try a broader clinical term or a 3-character ICD-10 prefix (e.g. I10, E11, J06)."
          />
        ) : (
          <EmptyState
            icon="search"
            title="Start typing an ICD-10 code or diagnosis"
            description="Enter at least 2 characters or choose a common primary-care code above."
          />
        )}
      </Card>
    );
  };

  const renderServices = () => {
    if (!canAccessServices) {
      return (
        <Card>
          <EmptyState
            icon="lock"
            title="Access restricted"
            description="Ask a clinic administrator to enable service pricing access for your account."
          />
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader
          title="Clinic Services & Pricing"
          subtitle="Read-only fee list for consultations, lab tests, procedures, and PhilHealth coverage."
          icon="tag"
          rightAction={
            servicesLoading || servicesError ? undefined : (
              <Badge label={`${filteredServices.length} items`} variant="neutral" size="sm" />
            )
          }
        />

        {servicesLoading ? (
          <SkeletonList rows={5} rowHeight={theme.sizes.controlLg} />
        ) : servicesError ? (
          <ErrorState
            compact
            title="Unable to load clinic services"
            message={servicesError}
            onRetry={() => void loadServices()}
          />
        ) : services.length === 0 ? (
          <EmptyState
            icon="tag"
            title="No active clinic services"
            description="Configure services and fees under Settings → Services & Pricing."
          />
        ) : (
          <>
            <Input
              leftIcon="search"
              placeholder="Search service name, code, category, or PhilHealth code..."
              value={serviceSearch}
              onChangeText={setServiceSearch}
              autoCapitalize="none"
            />

            <View style={styles.chipRow}>
              {serviceCategories.map((cat) => (
                <FilterChip
                  key={cat}
                  label={cat === 'all' ? 'All' : cat}
                  active={serviceCategory === cat}
                  onPress={() => setServiceCategory(cat)}
                />
              ))}
            </View>

            {filteredServices.length === 0 ? (
              <EmptyState
                icon="search"
                title="No matching services"
                description="Try another search query or reset the category filter."
              />
            ) : (
              <View>
                {filteredServices.map((svc) => (
                  <View key={svc.id} style={styles.listRow}>
                    <View style={styles.flexFill}>
                      <View style={styles.codeHeaderRow}>
                        <Badge label={svc.code} variant="neutral" size="sm" />
                        <ThemedText variant="bodyBold" style={styles.flexFill}>
                          {svc.name}
                        </ThemedText>
                      </View>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {svc.category || 'General'}
                        {svc.philHealthCode ? ` · PhilHealth: ${svc.philHealthCode}` : ''}
                      </ThemedText>
                    </View>
                    <View style={styles.rowEnd}>
                      <ThemedText variant="bodyBold" color={theme.colors.primary}>
                        {formatPeso(svc.standardPrice ?? 0)}
                      </ThemedText>
                      <View style={styles.badgeRow}>
                        {svc.isPhilHealthFormulary ? (
                          <Badge label="Yakap Formulary" variant="success" size="xs" />
                        ) : null}
                        {svc.isNurseOrderable ? (
                          <Badge label="Nurse Orderable" variant="info" size="xs" />
                        ) : null}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </Card>
    );
  };

  const renderPsgc = () => (
    <Card>
      <CardHeader
        title="Philippine Address & PSGC Lookup"
        subtitle="Find official 10-digit Philippine address codes (Region, Province, City/Municipality, Barangay)."
        icon="mapPin"
      />

      <SegmentedControl
        options={[
          { value: 'search', label: 'Quick Search', icon: 'search' },
          { value: 'browse', label: 'Browse Hierarchy', icon: 'list' },
        ]}
        value={psgcMode}
        onChange={setPsgcMode}
      />

      {psgcMode === 'search' ? (
        <>
          <Input
            leftIcon="search"
            placeholder="Search barangay, city, municipality, or province (e.g. Makati, Lahug, Baguio)..."
            value={psgcQuery}
            onChangeText={setPsgcQuery}
            autoCapitalize="none"
          />

          {psgcLoading ? (
            <SkeletonList rows={4} rowHeight={theme.sizes.controlMd} />
          ) : psgcResults.length > 0 ? (
            <View>
              {psgcResults.map((loc) => (
                <View key={`${loc.psgcCode}-${loc.level}`} style={styles.listRow}>
                  <View style={styles.flexFill}>
                    <View style={styles.codeHeaderRow}>
                      <ThemedText variant="bodyBold">{loc.name}</ThemedText>
                      {loc.level ? <Badge label={loc.level} variant="info" size="xs" /> : null}
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      PSGC {loc.psgcCode}
                      {loc.zipCode ? ` · ZIP ${loc.zipCode}` : ''}
                    </ThemedText>
                  </View>
                  <Button
                    title="Copy code"
                    size="sm"
                    variant="ghost"
                    icon="copy"
                    onPress={() => void copyText(loc.psgcCode, `PSGC ${loc.psgcCode}`)}
                  />
                </View>
              ))}
            </View>
          ) : psgcSearched ? (
            <EmptyState
              icon="mapPin"
              title="No matching Philippine locations"
              description="Check the spelling or switch to Browse Hierarchy to navigate by Region and Province."
            />
          ) : (
            <EmptyState
              icon="mapPin"
              title="Search Philippine locations by name"
              description="Type at least 2 characters to find barangays, cities, provinces, and their 10-digit PSGC codes."
            />
          )}
        </>
      ) : (
        <View style={styles.browseStack}>
          {browseLoading && regions.length === 0 ? (
            <SkeletonList rows={3} rowHeight={theme.sizes.controlMd} />
          ) : (
            <>
              <View style={rowStyle}>
                <View style={styles.flexFill}>
                  <Select
                    label="Region"
                    placeholder="Select region..."
                    value={selectedRegion}
                    onSelect={(v) => void handleSelectRegion(v)}
                    options={regions.map((r) => ({ value: r.psgcCode, label: r.name }))}
                  />
                </View>
                {provinces.length > 0 ? (
                  <View style={styles.flexFill}>
                    <Select
                      label="Province"
                      placeholder="Select province..."
                      value={selectedProvince}
                      onSelect={(v) => void handleSelectProvince(v)}
                      options={provinces.map((p) => ({ value: p.psgcCode, label: p.name }))}
                    />
                  </View>
                ) : null}
              </View>

              <View style={rowStyle}>
                {cities.length > 0 ? (
                  <View style={styles.flexFill}>
                    <Select
                      label="City / Municipality"
                      placeholder="Select city or municipality..."
                      value={selectedCity}
                      onSelect={(v) => void handleSelectCity(v)}
                      options={cities.map((c) => ({ value: c.psgcCode, label: c.name }))}
                    />
                  </View>
                ) : null}
                {barangays.length > 0 ? (
                  <View style={styles.flexFill}>
                    <Select
                      label="Barangay"
                      placeholder="Select barangay..."
                      value={selectedBarangay}
                      onSelect={setSelectedBarangay}
                      options={barangays.map((b) => ({ value: b.psgcCode, label: b.name }))}
                    />
                  </View>
                ) : null}
              </View>

              {activeBrowseItem ? (
                <View style={styles.psgcSummaryBox}>
                  <View style={styles.flexFill}>
                    <ThemedText variant="bodyBold">{activeBrowseItem.name}</ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Official PSGC Code: {activeBrowseItem.psgcCode}
                      {activeBrowseItem.level ? ` · ${activeBrowseItem.level}` : ''}
                      {activeBrowseItem.zipCode ? ` · ZIP ${activeBrowseItem.zipCode}` : ''}
                    </ThemedText>
                  </View>
                  <Button
                    title="Copy PSGC"
                    size="sm"
                    variant="outline"
                    icon="copy"
                    onPress={() =>
                      void copyText(activeBrowseItem.psgcCode, `PSGC ${activeBrowseItem.psgcCode}`)
                    }
                  />
                </View>
              ) : null}
            </>
          )}
        </View>
      )}
    </Card>
  );

  return (
    <View style={styles.container}>
      <SegmentedControl
        options={subToolOptions}
        value={activeTool}
        onChange={onSelectTool}
      />

      {activeTool === 'icd10' ? renderIcd10() : null}
      {activeTool === 'services' ? renderServices() : null}
      {activeTool === 'psgc' ? renderPsgc() : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  flexFill: {
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-end',
  },
  inputCol: {
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  codeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  rowEnd: {
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing.xs,
  },
  browseStack: {
    gap: theme.spacing.md,
  },
  psgcSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.primarySubtle,
  },
});
