import React, { useMemo, useState } from 'react';
import {
  IconAlertTriangle,
  IconBuildingHospital,
  IconCloudLock,
  IconLock,
  IconLockOpen,
  IconTrash,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { Button, Chip, SelectField, Text, type SelectFieldOption } from '@/components/ui';
import type { AdminTenantDto } from '@/services/admin.service';
import {
  isValidUuid,
  type SyncCohortMode,
  type V1CatalogResponseDto,
  type V2ClinicOptionDto,
} from '@/services/v1Sync.service';
import {
  BATCH_SIZE_MODAL_OPTIONS,
  BATCH_SIZE_PRESETS,
  filterV1ClinicsForTenant,
  filterV1OrgsForTenant,
  filterV2ClinicsForTenant,
  POLL_INTERVAL_OPTIONS,
  POLL_INTERVAL_PRESET_SECONDS,
  resolveV1TenantIdForSource,
  shortUuid,
  type UnifiedSyncConnection,
  type V2TenantOption,
} from './v1SyncHelpers';

export interface EditConnectionSavePayload {
  name: string;
  pollIntervalSeconds: number;
  batchSize: number;
  clinicAutoSyncEnabled?: boolean;
  patientAutoSyncEnabled?: boolean;
  storageAutoSyncEnabled?: boolean;
  patientCohortMode?: SyncCohortMode;
  updateMapping: boolean;
  v1ClinicId: number | null;
  v1OrgId: number | null;
  v2TenantId: string | null;
  v2ClinicId: string | null;
  forceMappingChange: boolean;
}

export interface EditConnectionModalProps {
  connection: UnifiedSyncConnection;
  catalog: V1CatalogResponseDto | null;
  tenants: readonly AdminTenantDto[];
  v2TenantOptions: readonly V2TenantOption[];
  v2ClinicOptions: readonly V2ClinicOptionDto[];
  busyAction: string | null;
  onClose: () => void;
  onSave: (payload: EditConnectionSavePayload) => Promise<void>;
  onDelete: (force: boolean) => Promise<void>;
}

export function EditConnectionModal({
  connection,
  catalog,
  tenants,
  v2TenantOptions,
  v2ClinicOptions,
  busyAction,
  onClose,
  onSave,
  onDelete,
}: EditConnectionModalProps) {
  const isPresetPoll = (POLL_INTERVAL_PRESET_SECONDS as readonly number[]).includes(
    connection.pollIntervalSeconds
  );
  const initialBatchSize = connection.batchSize ?? 200;
  const isPresetBatch = (BATCH_SIZE_PRESETS as readonly number[]).includes(initialBatchSize);

  const [name, setName] = useState(connection.name);
  const [pollPreset, setPollPreset] = useState<string>(
    isPresetPoll ? String(connection.pollIntervalSeconds) : '__custom__'
  );
  const [customPollSeconds, setCustomPollSeconds] = useState<string>(
    String(connection.pollIntervalSeconds)
  );
  const [batchPreset, setBatchPreset] = useState<string>(
    isPresetBatch ? String(initialBatchSize) : '__custom__'
  );
  const [customBatchSize, setCustomBatchSize] = useState<string>(String(initialBatchSize));
  const [clinicAutoSync, setClinicAutoSync] = useState<boolean>(
    connection.clinicBinding?.autoSyncEnabled ?? false
  );
  const [patientAutoSync, setPatientAutoSync] = useState<boolean>(
    connection.patientBinding?.autoSyncEnabled ?? false
  );
  const [storageAutoSync, setStorageAutoSync] = useState<boolean>(
    connection.storageBinding?.autoSyncEnabled ?? false
  );
  const [patientCohortMode, setPatientCohortMode] = useState<SyncCohortMode>(
    connection.patientBinding?.patientCohortMode ?? 'SCOPED'
  );

  const [v1TenantId, setV1TenantId] = useState<number | ''>(() =>
    resolveV1TenantIdForSource(catalog, connection.v1ClinicId, connection.v1OrgId)
  );
  const [v1OrgId, setV1OrgId] = useState<number | ''>(connection.v1OrgId ?? '');
  const [v1ClinicId, setV1ClinicId] = useState<number | ''>(connection.v1ClinicId ?? '');
  const [v2TenantId, setV2TenantId] = useState<string>(connection.v2TenantId ?? '');
  const [v2TenantManualMode, setV2TenantManualMode] = useState<boolean>(
    Boolean(
      connection.v2TenantId &&
        v2TenantOptions.length > 0 &&
        !v2TenantOptions.some(
          (t) => t.slug.toLowerCase() === connection.v2TenantId!.trim().toLowerCase()
        )
    )
  );
  const [v2ClinicId, setV2ClinicId] = useState<string>(connection.v2ClinicId ?? '');
  const [v2ClinicManualMode, setV2ClinicManualMode] = useState<boolean>(false);
  const [mappingUnlocked, setMappingUnlocked] = useState<boolean>(!connection.hasSyncHistory);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmToken, setDeleteConfirmToken] = useState('');

  const isBusy = Boolean(busyAction);

  const resolvedPollSeconds =
    pollPreset === '__custom__' ? Number(customPollSeconds) : Number(pollPreset);
  const pollError =
    !Number.isFinite(resolvedPollSeconds) ||
    !Number.isInteger(resolvedPollSeconds) ||
    resolvedPollSeconds < 10 ||
    resolvedPollSeconds > 3600
      ? 'Poll interval must be a whole number between 10 and 3,600 seconds.'
      : null;

  const resolvedBatchSize =
    batchPreset === '__custom__' ? Number(customBatchSize) : Number(batchPreset);
  const batchError =
    !Number.isFinite(resolvedBatchSize) ||
    !Number.isInteger(resolvedBatchSize) ||
    resolvedBatchSize < 10 ||
    resolvedBatchSize > 1000
      ? 'Batch size must be a whole number between 10 and 1,000 items.'
      : null;

  const tenantScopedV2Clinics = useMemo(
    () => filterV2ClinicsForTenant(v2ClinicOptions, v2TenantId, tenants),
    [v2ClinicOptions, v2TenantId, tenants]
  );

  const normalizedNextV1ClinicId = v1ClinicId === '' ? null : Number(v1ClinicId);
  const normalizedNextV1OrgId = v1OrgId === '' ? null : Number(v1OrgId);
  const normalizedNextV2TenantId = v2TenantId.trim() || null;
  const normalizedNextV2ClinicId = v2ClinicId.trim() || null;

  const mappingChanged =
    normalizedNextV1ClinicId !== connection.v1ClinicId ||
    normalizedNextV1OrgId !== connection.v1OrgId ||
    (normalizedNextV2TenantId?.toLowerCase() ?? null) !==
      (connection.v2TenantId?.toLowerCase() ?? null) ||
    (normalizedNextV2ClinicId?.toLowerCase() ?? null) !==
      (connection.v2ClinicId?.toLowerCase() ?? null);

  const requiresClinicMapping = Boolean(connection.clinicBinding);
  const needsManualClinicInput =
    v2ClinicManualMode ||
    v2ClinicOptions.length === 0 ||
    (Boolean(v2TenantId.trim()) && tenantScopedV2Clinics.length === 0);

  const v2ClinicUuidError = useMemo(() => {
    if (!mappingUnlocked || !mappingChanged) return null;
    const trimmed = v2ClinicId.trim();
    if (!trimmed) {
      return requiresClinicMapping
        ? 'Target Clinic ID is required for Clinic Sync connections.'
        : null;
    }
    if (!isValidUuid(trimmed)) {
      return 'Enter a valid clinic ID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).';
    }
    return null;
  }, [v2ClinicId, mappingUnlocked, mappingChanged, requiresClinicMapping]);

  const mappingValidationError = useMemo(() => {
    if (!mappingUnlocked || !mappingChanged) return null;
    if (requiresClinicMapping) {
      if (normalizedNextV1ClinicId === null) {
        return 'Select a Classic (v1) source clinic.';
      }
      if (!normalizedNextV2TenantId) {
        return 'Select or enter a target Clinic EZ v2 tenant.';
      }
      if (!normalizedNextV2ClinicId) {
        return 'Target Clinic ID is required for Clinic Sync connections.';
      }
    }
    return v2ClinicUuidError;
  }, [
    mappingUnlocked,
    mappingChanged,
    requiresClinicMapping,
    normalizedNextV1ClinicId,
    normalizedNextV2TenantId,
    normalizedNextV2ClinicId,
    v2ClinicUuidError,
  ]);

  const hasV1Tenants = (catalog?.tenants?.length ?? 0) > 0;
  const scopedV1Orgs = useMemo(
    () => filterV1OrgsForTenant(catalog, v1TenantId),
    [catalog, v1TenantId]
  );
  const scopedV1Clinics = useMemo(
    () => filterV1ClinicsForTenant(catalog, v1TenantId),
    [catalog, v1TenantId]
  );

  const v1TenantSelectOptions = useMemo<SelectFieldOption[]>(
    () =>
      (catalog?.tenants ?? []).map((t) => ({
        value: String(t.id),
        label: t.name,
        description: `${t.clinicCount} clinic${t.clinicCount === 1 ? '' : 's'} · ${t.organizationCount} org${t.organizationCount === 1 ? '' : 's'}`,
        badge: `#${t.id}`,
      })),
    [catalog]
  );

  const v1OrgSelectOptions = useMemo<SelectFieldOption[]>(
    () => [
      {
        value: '',
        label: 'None (Clinic only)',
        description: 'Skip institutional member profile fields',
      },
      ...scopedV1Orgs.map((o) => ({
        value: String(o.id),
        label: o.name,
        description: `${o.memberCount.toLocaleString()} members · ${o.studentCount.toLocaleString()} students`,
        badge: `#${o.id}`,
      })),
    ],
    [scopedV1Orgs]
  );

  const v1ClinicSelectOptions = useMemo<SelectFieldOption[]>(() => {
    const items: SelectFieldOption[] = [
      {
        value: '',
        label: requiresClinicMapping
          ? 'Select a Classic (v1) clinic...'
          : 'All clinics (No clinic filter)',
        disabled: requiresClinicMapping,
      },
      ...scopedV1Clinics.map((c) => ({
        value: String(c.id),
        label: c.name,
        description: `${c.clinicPatientCount.toLocaleString()} patients · ${c.consultationCount.toLocaleString()} consultations`,
        badge: `#${c.id}`,
      })),
    ];
    if (
      connection.v1ClinicId !== null &&
      !hasV1Tenants &&
      !scopedV1Clinics.some((c) => c.id === connection.v1ClinicId)
    ) {
      items.push({
        value: String(connection.v1ClinicId),
        label: `Classic Clinic #${connection.v1ClinicId}`,
        badge: `#${connection.v1ClinicId}`,
      });
    }
    return items;
  }, [scopedV1Clinics, requiresClinicMapping, connection.v1ClinicId, hasV1Tenants]);

  const v2TenantSelectOptions = useMemo<SelectFieldOption[]>(
    () => [
      ...v2TenantOptions.map((t) => ({
        value: t.slug,
        label: t.name,
        description: t.slug,
        badge: t.badge,
        group: 'Clinic EZ v2 Tenants',
      })),
      {
        value: '__manual__',
        label: 'Enter custom tenant slug...',
        description: 'Type a tenant slug not shown above',
        group: 'Other',
      },
    ],
    [v2TenantOptions]
  );

  const handleSelectV1Tenant = (val: string) => {
    const parsed = val ? Number(val) : '';
    setV1TenantId(parsed);
    const matchingOrgs = filterV1OrgsForTenant(catalog, parsed);
    const matchingClinics = filterV1ClinicsForTenant(catalog, parsed);
    if (v1OrgId !== '' && !matchingOrgs.some((o) => o.id === v1OrgId)) {
      setV1OrgId(matchingOrgs.length === 1 ? matchingOrgs[0].id : '');
    } else if (v1OrgId === '' && matchingOrgs.length === 1) {
      setV1OrgId(matchingOrgs[0].id);
    }
    if (v1ClinicId !== '' && !matchingClinics.some((c) => c.id === v1ClinicId)) {
      setV1ClinicId(matchingClinics.length === 1 ? matchingClinics[0].id : '');
    } else if (v1ClinicId === '' && matchingClinics.length === 1) {
      setV1ClinicId(matchingClinics[0].id);
    }
  };

  const v2ClinicSelectOptions = useMemo<SelectFieldOption[]>(
    () => [
      ...tenantScopedV2Clinics.map((c) => ({
        value: c.id,
        label: c.name,
        description: `${c.tenantSlug ? `${c.tenantSlug} · ` : ''}${shortUuid(c.id)}`,
        group: v2TenantId.trim() ? `Clinics in ${v2TenantId.trim()}` : 'Available Clinics',
      })),
      {
        value: '__manual__',
        label: 'Enter clinic ID manually...',
        description: 'Paste a Clinic EZ v2 clinic UUID directly',
        group: 'Other',
      },
    ],
    [tenantScopedV2Clinics, v2TenantId]
  );

  const cohortSelectOptions = useMemo<SelectFieldOption[]>(() => {
    const globalCount = catalog?.totalActiveV1Users;
    return [
      {
        value: 'SCOPED',
        label: 'Selected Clinic & Organization',
        description: 'Sync patients belonging to the chosen Classic (v1) clinic or organization',
      },
      {
        value: 'GLOBAL',
        label: globalCount
          ? `All Active Classic Accounts (${globalCount.toLocaleString()})`
          : 'All Active Classic Accounts (Global)',
        description: 'Sync every active user profile across Classic Clinic EZ',
      },
    ];
  }, [catalog]);

  const handleSelectTargetTenant = (val: string) => {
    if (val === '__manual__') {
      setV2TenantManualMode(true);
      setV2TenantId('');
      setV2ClinicId('');
      return;
    }
    setV2TenantManualMode(false);
    setV2TenantId(val);
    const matchingClinics = filterV2ClinicsForTenant(v2ClinicOptions, val, tenants);
    if (!v2ClinicManualMode) {
      const stillValid = matchingClinics.some((c) => c.id === v2ClinicId);
      if (!stillValid) {
        if (matchingClinics.length === 1) {
          setV2ClinicId(matchingClinics[0].id);
        } else {
          setV2ClinicId('');
        }
      }
    }
  };

  const handleSelectTargetClinic = (val: string) => {
    if (val === '__manual__') {
      setV2ClinicManualMode(true);
      if (v2ClinicOptions.some((c) => c.id === v2ClinicId)) setV2ClinicId('');
      return;
    }
    setV2ClinicManualMode(false);
    setV2ClinicId(val);
    const matched = v2ClinicOptions.find((c) => c.id === val);
    if (matched?.tenantSlug && !v2TenantId) setV2TenantId(matched.tenantSlug);
  };

  const canSubmit =
    !isBusy && Boolean(name.trim()) && !pollError && !batchError && !mappingValidationError;

  const canConfirmDelete =
    !isBusy && (!connection.hasSyncHistory || deleteConfirmToken.trim() === 'DELETE');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await onSave({
      name: name.trim(),
      pollIntervalSeconds: resolvedPollSeconds,
      batchSize: resolvedBatchSize,
      clinicAutoSyncEnabled:
        connection.clinicBinding && !connection.clinicBinding.isFrozen
          ? clinicAutoSync
          : undefined,
      patientAutoSyncEnabled:
        connection.patientBinding && !connection.patientBinding.isFrozen
          ? patientAutoSync
          : undefined,
      storageAutoSyncEnabled:
        connection.storageBinding && !connection.storageBinding.isFrozen
          ? storageAutoSync
          : undefined,
      patientCohortMode: connection.patientBinding ? patientCohortMode : undefined,
      updateMapping: mappingUnlocked && mappingChanged,
      v1ClinicId: normalizedNextV1ClinicId,
      v1OrgId: normalizedNextV1OrgId,
      v2TenantId: normalizedNextV2TenantId,
      v2ClinicId: normalizedNextV2ClinicId,
      forceMappingChange: Boolean(mappingUnlocked && mappingChanged && connection.hasSyncHistory),
    });
  };

  const sourceChildrenDisabled = !mappingUnlocked || (hasV1Tenants && v1TenantId === '');
  const targetClinicDisabled =
    !mappingUnlocked || (!v2TenantId.trim() && !v2ClinicManualMode);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={() => {
        if (!isBusy) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Edit Sync Connection"
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="max-w-2xl w-full max-h-[90vh] flex flex-col rounded-2xl bg-surface border border-border shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-text">Edit Sync Connection</h3>
              {connection.clinicBinding && (
                <Chip
                  tone="primary"
                  size="xs"
                  leadingIcon={<IconBuildingHospital className="h-3 w-3" />}
                >
                  Clinic Sync
                </Chip>
              )}
              {connection.patientBinding && (
                <Chip tone="info" size="xs" leadingIcon={<IconUsers className="h-3 w-3" />}>
                  Patient Accounts
                </Chip>
              )}
              {connection.storageBinding && (
                <Chip tone="purple" size="xs" leadingIcon={<IconCloudLock className="h-3 w-3" />}>
                  File Storage
                </Chip>
              )}
            </div>
            <p className="text-xs text-text-muted">
              Update connection name, polling cadence, track settings, or source and destination
              mapping across linked tracks.
            </p>
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            disabled={isBusy}
            onClick={onClose}
            aria-label="Close edit connection modal"
            className="shrink-0"
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto space-y-5 flex-1">
          {/* General Settings */}
          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <Text as="label" htmlFor="edit-connection-name" variant="label" className="text-xs">
                Connection Name
              </Text>
              <input
                id="edit-connection-name"
                aria-label="Edit Connection Name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Main Campus Clinic — Sync"
                className="w-full h-9 px-3.5 rounded-xl bg-surface border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Text as="span" variant="label" className="block text-xs">
                  Auto-Sync Poll Interval
                </Text>
                <SelectField
                  ariaLabel="Edit Poll Interval"
                  value={pollPreset}
                  onValueChange={(val) => {
                    setPollPreset(val);
                    if (val !== '__custom__') setCustomPollSeconds(val);
                  }}
                  options={POLL_INTERVAL_OPTIONS}
                />
                {pollPreset === '__custom__' && (
                  <div className="space-y-1 pt-1">
                    <input
                      type="number"
                      aria-label="Custom Poll Interval Seconds"
                      min={10}
                      max={3600}
                      step={1}
                      value={customPollSeconds}
                      onChange={(e) => setCustomPollSeconds(e.target.value)}
                      placeholder="Seconds (10 - 3600)"
                      className={`w-full h-9 px-3 rounded-xl bg-surface border text-xs text-text tabular-nums focus:outline-none focus:ring-2 ${
                        pollError
                          ? 'border-red-500 focus:ring-red-500/20'
                          : 'border-border focus:border-primary focus:ring-primary/20'
                      }`}
                    />
                    {pollError && (
                      <div className="text-[11px] text-red-600 dark:text-red-400">{pollError}</div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Text as="span" variant="label" className="block text-xs">
                  Migration Batch Size
                </Text>
                <SelectField
                  ariaLabel="Edit Migration Batch Size"
                  value={batchPreset}
                  onValueChange={(val) => {
                    setBatchPreset(val);
                    if (val !== '__custom__') setCustomBatchSize(val);
                  }}
                  options={BATCH_SIZE_MODAL_OPTIONS}
                />
                {batchPreset === '__custom__' && (
                  <div className="space-y-1 pt-1">
                    <input
                      type="number"
                      aria-label="Custom Migration Batch Size"
                      min={10}
                      max={1000}
                      step={1}
                      value={customBatchSize}
                      onChange={(e) => setCustomBatchSize(e.target.value)}
                      placeholder="Items per batch (10 - 1000)"
                      className={`w-full h-9 px-3 rounded-xl bg-surface border text-xs text-text tabular-nums focus:outline-none focus:ring-2 ${
                        batchError
                          ? 'border-red-500 focus:ring-red-500/20'
                          : 'border-border focus:border-primary focus:ring-primary/20'
                      }`}
                    />
                    {batchError && (
                      <div className="text-[11px] text-red-600 dark:text-red-400">{batchError}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Per-Track Operational Settings */}
          <div className="p-4 rounded-2xl bg-surface-muted/45 border border-border space-y-3 text-xs">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Track Behavior
            </Text>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Track 1 Auto-Sync */}
              <div className="p-3 rounded-xl bg-surface border border-border flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Text as="div" className="text-xs font-semibold text-text">
                    Clinic Sync
                  </Text>
                  <Text as="div" className="text-[11px] text-text-muted">
                    {!connection.clinicBinding
                      ? 'Track not configured'
                      : connection.clinicBinding.isFrozen
                        ? 'Frozen — unfreeze to enable'
                        : clinicAutoSync
                          ? 'Background polling active'
                          : 'Manual sync only'}
                  </Text>
                </div>
                {connection.clinicBinding && !connection.clinicBinding.isFrozen ? (
                  <Button
                    variant="unstyled"
                    size="xs"
                    disabled={isBusy}
                    aria-label="Toggle Clinic Sync Auto-Sync"
                    onClick={() => setClinicAutoSync((prev) => !prev)}
                    className={`rounded-lg font-semibold border shrink-0 ${
                      clinicAutoSync
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-surface-muted border-border text-text-secondary'
                    }`}
                  >
                    {clinicAutoSync ? 'On' : 'Off'}
                  </Button>
                ) : (
                  <Chip tone={connection.clinicBinding?.isFrozen ? 'warning' : 'neutral'} size="xs">
                    {connection.clinicBinding?.isFrozen ? 'Frozen' : 'Off'}
                  </Chip>
                )}
              </div>

              {/* Track 2 Auto-Sync */}
              <div className="p-3 rounded-xl bg-surface border border-border flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Text as="div" className="text-xs font-semibold text-text">
                    Patient Accounts
                  </Text>
                  <Text as="div" className="text-[11px] text-text-muted">
                    {!connection.patientBinding
                      ? 'Track not enabled'
                      : connection.patientBinding.isFrozen
                        ? 'Frozen — unfreeze to enable'
                        : patientAutoSync
                          ? 'Background polling active'
                          : 'Manual sync only'}
                  </Text>
                </div>
                {connection.patientBinding && !connection.patientBinding.isFrozen ? (
                  <Button
                    variant="unstyled"
                    size="xs"
                    disabled={isBusy}
                    aria-label="Toggle Patient Accounts Auto-Sync"
                    onClick={() => setPatientAutoSync((prev) => !prev)}
                    className={`rounded-lg font-semibold border shrink-0 ${
                      patientAutoSync
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-surface-muted border-border text-text-secondary'
                    }`}
                  >
                    {patientAutoSync ? 'On' : 'Off'}
                  </Button>
                ) : (
                  <Chip
                    tone={connection.patientBinding?.isFrozen ? 'warning' : 'neutral'}
                    size="xs"
                  >
                    {connection.patientBinding?.isFrozen ? 'Frozen' : 'Off'}
                  </Chip>
                )}
              </div>

              {/* Track 3 Auto-Sync */}
              <div className="p-3 rounded-xl bg-surface border border-border flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Text as="div" className="text-xs font-semibold text-text">
                    File Storage
                  </Text>
                  <Text as="div" className="text-[11px] text-text-muted">
                    {!connection.storageBinding
                      ? 'Track not enabled'
                      : connection.storageBinding.isFrozen
                        ? 'Frozen — unfreeze to enable'
                        : storageAutoSync
                          ? 'Background polling active'
                          : 'Manual sync only'}
                  </Text>
                </div>
                {connection.storageBinding && !connection.storageBinding.isFrozen ? (
                  <Button
                    variant="unstyled"
                    size="xs"
                    disabled={isBusy}
                    aria-label="Toggle File Storage Auto-Sync"
                    onClick={() => setStorageAutoSync((prev) => !prev)}
                    className={`rounded-lg font-semibold border shrink-0 ${
                      storageAutoSync
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-surface-muted border-border text-text-secondary'
                    }`}
                  >
                    {storageAutoSync ? 'On' : 'Off'}
                  </Button>
                ) : (
                  <Chip
                    tone={connection.storageBinding?.isFrozen ? 'warning' : 'neutral'}
                    size="xs"
                  >
                    {connection.storageBinding?.isFrozen ? 'Frozen' : 'Off'}
                  </Chip>
                )}
              </div>
            </div>

            {connection.patientBinding && (
              <div className="space-y-1.5 pt-1">
                <Text as="span" variant="label" className="block text-xs">
                  Patient Accounts Scope
                </Text>
                <SelectField
                  ariaLabel="Edit Patient Accounts Scope"
                  disabled={connection.patientBinding.isFrozen}
                  value={patientCohortMode}
                  onValueChange={(val) => setPatientCohortMode(val as SyncCohortMode)}
                  options={cohortSelectOptions}
                />
              </div>
            )}
          </div>

          {/* Source & Destination Mapping */}
          <div className="p-4 rounded-2xl bg-surface-muted/45 border border-border space-y-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Text className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                  Source &amp; Destination Mapping
                </Text>
                {connection.hasSyncHistory ? (
                  <Chip
                    tone={mappingUnlocked ? 'warning' : 'neutral'}
                    size="xs"
                    leadingIcon={
                      mappingUnlocked ? (
                        <IconLockOpen className="h-3 w-3" />
                      ) : (
                        <IconLock className="h-3 w-3" />
                      )
                    }
                  >
                    {mappingUnlocked ? 'Unlocked (Resets Ledger)' : 'Locked · Sync History'}
                  </Chip>
                ) : (
                  <Chip tone="success" size="xs">
                    Editable
                  </Chip>
                )}
              </div>

              {connection.hasSyncHistory && (
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={isBusy}
                  onClick={() => {
                    if (mappingUnlocked) {
                      setV1TenantId(
                        resolveV1TenantIdForSource(
                          catalog,
                          connection.v1ClinicId,
                          connection.v1OrgId
                        )
                      );
                      setV1OrgId(connection.v1OrgId ?? '');
                      setV1ClinicId(connection.v1ClinicId ?? '');
                      setV2TenantId(connection.v2TenantId ?? '');
                      setV2ClinicId(connection.v2ClinicId ?? '');
                      setV2ClinicManualMode(false);
                      setMappingUnlocked(false);
                    } else {
                      setMappingUnlocked(true);
                    }
                  }}
                  leadingIcon={
                    mappingUnlocked ? (
                      <IconLock className="h-3 w-3" />
                    ) : (
                      <IconLockOpen className="h-3 w-3" />
                    )
                  }
                >
                  {mappingUnlocked ? 'Re-Lock Mapping' : 'Unlock Mapping'}
                </Button>
              )}
            </div>

            {connection.hasSyncHistory && mappingUnlocked && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2 leading-relaxed">
                <IconAlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  This connection already has synced history. Saving a different source or
                  destination will reset this connection&apos;s sync cursor, ID map, and open
                  conflict queue so records do not cross-contaminate. Previously migrated Clinic EZ
                  v2 records are never deleted.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Step 1: Source */}
              <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3">
                <Text className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                  1 · Source (Classic v1)
                </Text>

                <div className="space-y-1.5">
                  <Text as="span" variant="label" className="block text-xs">
                    Source Tenant
                  </Text>
                  <SelectField
                    ariaLabel="Edit Source v1 Tenant"
                    disabled={!mappingUnlocked}
                    value={v1TenantId === '' ? '' : String(v1TenantId)}
                    onValueChange={handleSelectV1Tenant}
                    options={v1TenantSelectOptions}
                    placeholder={
                      hasV1Tenants
                        ? 'Select a Classic (v1) tenant...'
                        : 'No Classic (v1) tenants loaded'
                    }
                    searchable={v1TenantSelectOptions.length > 6}
                    searchPlaceholder="Search Classic tenants..."
                  />
                </div>

                <div className="space-y-3 pl-3 border-l-2 border-border">
                  <div className="space-y-1.5">
                    <Text as="span" variant="label" className="block text-xs">
                      Source Organization
                    </Text>
                    <SelectField
                      ariaLabel="Edit Source v1 Organization"
                      disabled={sourceChildrenDisabled}
                      value={v1OrgId === '' ? '' : String(v1OrgId)}
                      onValueChange={(val) => setV1OrgId(val ? Number(val) : '')}
                      options={v1OrgSelectOptions}
                      placeholder={
                        sourceChildrenDisabled && mappingUnlocked
                          ? 'Select a source tenant first...'
                          : 'Select an organization...'
                      }
                      searchPlaceholder="Search Classic organizations..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Text as="span" variant="label" className="block text-xs">
                      Source Clinic
                    </Text>
                    <SelectField
                      ariaLabel="Edit Source v1 Clinic"
                      disabled={sourceChildrenDisabled}
                      value={v1ClinicId === '' ? '' : String(v1ClinicId)}
                      onValueChange={(val) => setV1ClinicId(val ? Number(val) : '')}
                      options={v1ClinicSelectOptions}
                      placeholder={
                        sourceChildrenDisabled && mappingUnlocked
                          ? 'Select a source tenant first...'
                          : 'Select a Classic (v1) clinic...'
                      }
                      searchPlaceholder="Search Classic clinics..."
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Destination */}
              <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3">
                <Text className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                  2 · Destination (Clinic EZ v2)
                </Text>

                <div className="space-y-1.5">
                  <Text as="span" variant="label" className="block text-xs">
                    Target Tenant
                  </Text>
                  {!v2TenantManualMode ? (
                    <SelectField
                      ariaLabel="Edit Target v2 Tenant"
                      disabled={!mappingUnlocked}
                      value={v2TenantId}
                      onValueChange={handleSelectTargetTenant}
                      options={v2TenantSelectOptions}
                      placeholder="Select a Clinic EZ v2 tenant..."
                      searchable
                      searchPlaceholder="Search tenants..."
                    />
                  ) : (
                    <div className="space-y-1">
                      <input
                        type="text"
                        aria-label="Edit Custom Target v2 Tenant Slug"
                        disabled={!mappingUnlocked}
                        value={v2TenantId}
                        onChange={(e) => setV2TenantId(e.target.value)}
                        placeholder="e.g. main-campus-clinic"
                        className="w-full h-9 px-3 rounded-xl bg-surface border border-border text-xs text-text disabled:opacity-60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                      {mappingUnlocked && (
                        <Button
                          variant="unstyled"
                          size="custom"
                          onClick={() => setV2TenantManualMode(false)}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          Choose from tenant list instead
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 pl-3 border-l-2 border-primary/30">
                  <Text as="span" variant="label" className="block text-xs">
                    Target Clinic
                  </Text>
                  <SelectField
                    ariaLabel="Edit Target v2 Clinic"
                    disabled={targetClinicDisabled}
                    value={
                      v2ClinicManualMode ||
                      (tenantScopedV2Clinics.length === 0 && v2ClinicId !== '')
                        ? '__manual__'
                        : v2ClinicId
                    }
                    onValueChange={handleSelectTargetClinic}
                    options={v2ClinicSelectOptions}
                    placeholder={
                      targetClinicDisabled && mappingUnlocked
                        ? 'Select a target tenant first...'
                        : 'Select a clinic in this tenant...'
                    }
                    searchPlaceholder="Search clinics..."
                    error={Boolean(v2ClinicUuidError)}
                  />

                  {mappingUnlocked && needsManualClinicInput && (
                    <div className="space-y-1 pt-1">
                      <input
                        type="text"
                        aria-label="Edit Manual Target v2 Clinic UUID"
                        value={v2ClinicId}
                        onChange={(e) => setV2ClinicId(e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className={`w-full h-9 px-3 rounded-xl bg-surface border text-xs text-text font-mono focus:outline-none focus:ring-2 ${
                          v2ClinicUuidError
                            ? 'border-red-500 focus:ring-red-500/20'
                            : 'border-border focus:border-primary focus:ring-primary/20'
                        }`}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {mappingValidationError && (
              <div className="text-[11px] text-red-600 dark:text-red-400">
                {mappingValidationError}
              </div>
            )}
          </div>

          {/* Danger Zone: Delete Connection */}
          <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/25 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0 flex-1">
                <Text as="div" className="text-xs font-bold text-red-700 dark:text-red-300">
                  Delete Connection
                </Text>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Permanently removes this sync connection and its migration ledger across all
                  linked tracks. Existing clinical and patient records in Clinic EZ v2 are never
                  deleted.
                </p>
              </div>
              {!showDeleteConfirm && (
                <Button
                  variant="dangerSubtle"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => setShowDeleteConfirm(true)}
                  leadingIcon={<IconTrash className="h-3.5 w-3.5" />}
                  className="shrink-0"
                >
                  Delete Connection
                </Button>
              )}
            </div>

            {showDeleteConfirm && (
              <div className="p-3.5 rounded-xl bg-surface border border-red-500/30 space-y-3">
                {connection.hasSyncHistory ? (
                  <div className="space-y-1.5">
                    <Text
                      as="label"
                      htmlFor="delete-connection-token"
                      variant="label"
                      className="text-xs text-red-700 dark:text-red-300"
                    >
                      This connection has sync history. Type{' '}
                      <code className="font-mono font-bold">DELETE</code> to confirm removing its
                      sync ledger:
                    </Text>
                    <input
                      id="delete-connection-token"
                      aria-label="Confirm Delete Connection Token"
                      type="text"
                      value={deleteConfirmToken}
                      onChange={(e) => setDeleteConfirmToken(e.target.value)}
                      placeholder="DELETE"
                      className="w-full h-9 px-3 rounded-xl bg-surface border border-border text-xs text-text font-mono focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                    />
                  </div>
                ) : (
                  <p className="text-[11px] text-text-secondary">
                    Are you sure you want to permanently delete{' '}
                    <strong className="text-text">{connection.name}</strong>?
                  </p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="subtle"
                    size="xs"
                    disabled={isBusy}
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmToken('');
                    }}
                  >
                    Keep Connection
                  </Button>
                  <Button
                    variant="danger"
                    size="xs"
                    disabled={!canConfirmDelete}
                    onClick={() => void onDelete(connection.hasSyncHistory)}
                    leadingIcon={<IconTrash className="h-3.5 w-3.5" />}
                  >
                    {busyAction === 'delete' ? 'Deleting...' : 'Confirm Delete'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-surface-muted/30 flex items-center justify-end gap-2 shrink-0">
          <Button variant="subtle" size="md" disabled={isBusy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={!canSubmit}>
            {busyAction === 'edit' ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
