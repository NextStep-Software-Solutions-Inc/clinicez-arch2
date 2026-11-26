import React from 'react';
import { IconX } from '@tabler/icons-react';
import { Button, SelectField, Text, type SelectFieldOption } from '@/components/ui';

export interface CreateConnectionFormProps {
  newName: string;
  onChangeName: (value: string) => void;
  newV1TenantId: number | '';
  onSelectV1Tenant: (value: string) => void;
  hasV1Tenants: boolean;
  sourceChildrenDisabled: boolean;
  tenantScopedV1OrgsCount: number;
  tenantScopedV1ClinicsCount: number;
  newV1OrgId: number | '';
  onChangeV1OrgId: (value: number | '') => void;
  newV1ClinicId: number | '';
  onSelectV1Clinic: (value: string) => void;
  newV2TenantId: string;
  onChangeV2TenantId: (value: string) => void;
  onSelectTargetTenant: (value: string) => void;
  v2TenantManualMode: boolean;
  onExitTenantManualMode: () => void;
  newV2ClinicId: string;
  onChangeV2ClinicId: (value: string) => void;
  onSelectTargetClinic: (value: string) => void;
  v2ClinicManualMode: boolean;
  tenantScopedV2ClinicsCount: number;
  targetClinicDisabled: boolean;
  needsManualClinicInput: boolean;
  v2ClinicUuidError: string | null;
  v1TenantSelectOptions: readonly SelectFieldOption[];
  v1OrgSelectOptions: readonly SelectFieldOption[];
  v1ClinicSelectOptions: readonly SelectFieldOption[];
  v2TenantSelectOptions: readonly SelectFieldOption[];
  v2ClinicSelectOptions: readonly SelectFieldOption[];
  canSaveConnection: boolean;
  isCreating: boolean;
  enableStorageTrack?: boolean;
  onToggleStorageTrack?: (next: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

/**
 * Unified New Connection form.
 * Maps a Classic Clinic EZ (v1) Tenant -> Organization & Clinic source to a Clinic EZ v2
 * Tenant -> Clinic destination. Clinic Sync and Patient Accounts are provisioned together,
 * and File Storage can optionally be included during creation or enabled later.
 */
export function CreateConnectionForm({
  newName,
  onChangeName,
  newV1TenantId,
  onSelectV1Tenant,
  hasV1Tenants,
  sourceChildrenDisabled,
  tenantScopedV1OrgsCount,
  tenantScopedV1ClinicsCount,
  newV1OrgId,
  onChangeV1OrgId,
  newV1ClinicId,
  onSelectV1Clinic,
  newV2TenantId,
  onChangeV2TenantId,
  onSelectTargetTenant,
  v2TenantManualMode,
  onExitTenantManualMode,
  newV2ClinicId,
  onChangeV2ClinicId,
  onSelectTargetClinic,
  v2ClinicManualMode,
  tenantScopedV2ClinicsCount,
  targetClinicDisabled,
  needsManualClinicInput,
  v2ClinicUuidError,
  v1TenantSelectOptions,
  v1OrgSelectOptions,
  v1ClinicSelectOptions,
  v2TenantSelectOptions,
  v2ClinicSelectOptions,
  canSaveConnection,
  isCreating,
  enableStorageTrack = false,
  onToggleStorageTrack,
  onSubmit,
  onClose,
}: CreateConnectionFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="p-6 rounded-2xl bg-surface border border-border shadow-xs space-y-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-text">New Sync Connection</h2>
          <p className="text-xs text-text-muted">
            Select a Classic Clinic EZ (v1) source tenant, organization, and clinic, then map it to
            its Clinic EZ v2 destination tenant and clinic. Clinic Sync and Patient Accounts are
            provisioned together, and File Storage can be included now or enabled later.
          </p>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={onClose}
          aria-label="Close connection form"
          className="shrink-0"
        >
          <IconX className="h-4 w-4" />
        </Button>
      </div>

      {/* Connection Name */}
      <div className="max-w-md space-y-1.5 text-xs">
        <Text as="label" htmlFor="sync-connection-name" variant="label" className="text-xs">
          Connection Name
        </Text>
        <input
          id="sync-connection-name"
          aria-label="Connection Name"
          type="text"
          required
          value={newName}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder="e.g. Main Campus Clinic — Sync"
          className="w-full h-9 px-3.5 rounded-xl bg-surface border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Symmetrical Two-Step Hierarchical Mapping Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Step 1: Source (Classic Clinic EZ v1) — Tenant -> Organization & Clinic */}
        <div className="p-4 rounded-2xl bg-surface-muted/45 border border-border space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              <span className="h-5 w-5 rounded-full bg-surface border border-border text-text inline-flex items-center justify-center text-[10px]">
                1
              </span>
              Source · Classic Clinic EZ (v1)
            </span>
            <Text className="text-[11px] text-text-muted">Read-only source</Text>
          </div>

          <div className="space-y-3 text-xs">
            {/* Source Tenant (always step 1a) */}
            <div className="space-y-1.5">
              <Text as="span" variant="label" className="block text-xs">
                Source Tenant
              </Text>
              <SelectField
                ariaLabel="Source v1 Tenant"
                value={newV1TenantId === '' ? '' : String(newV1TenantId)}
                onValueChange={onSelectV1Tenant}
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

            {/* Source Organization & Source Clinic nested strictly inside Source Tenant */}
            <div className="space-y-3 pl-3.5 border-l-2 border-border">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Text as="span" variant="label" className="text-xs">
                    Source Organization
                  </Text>
                  <Text className="text-[10px] text-text-muted">
                    {hasV1Tenants
                      ? newV1TenantId !== ''
                        ? `${tenantScopedV1OrgsCount} org${tenantScopedV1OrgsCount === 1 ? '' : 's'} in tenant`
                        : 'Inside selected tenant'
                      : 'Optional institutional scope'}
                  </Text>
                </div>
                <SelectField
                  ariaLabel="Source v1 Organization"
                  disabled={sourceChildrenDisabled}
                  value={newV1OrgId === '' ? '' : String(newV1OrgId)}
                  onValueChange={(val) => onChangeV1OrgId(val ? Number(val) : '')}
                  options={v1OrgSelectOptions}
                  placeholder={
                    sourceChildrenDisabled
                      ? 'Select a source tenant first...'
                      : 'Select an organization...'
                  }
                  searchable={v1OrgSelectOptions.length > 6}
                  searchPlaceholder="Search Classic organizations..."
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Text as="span" variant="label" className="text-xs">
                    Source Clinic
                  </Text>
                  <Text className="text-[10px] text-text-muted">
                    {hasV1Tenants
                      ? newV1TenantId !== ''
                        ? `${tenantScopedV1ClinicsCount} clinic${tenantScopedV1ClinicsCount === 1 ? '' : 's'} in tenant`
                        : 'Inside selected tenant'
                      : 'Records & patient cohort'}
                  </Text>
                </div>
                <SelectField
                  ariaLabel="Source v1 Clinic"
                  disabled={sourceChildrenDisabled}
                  value={newV1ClinicId === '' ? '' : String(newV1ClinicId)}
                  onValueChange={onSelectV1Clinic}
                  options={v1ClinicSelectOptions}
                  placeholder={
                    sourceChildrenDisabled
                      ? 'Select a source tenant first...'
                      : 'Select a Classic (v1) clinic...'
                  }
                  searchable={v1ClinicSelectOptions.length > 6}
                  searchPlaceholder="Search Classic clinics..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Destination (Clinic EZ v2) — Tenant -> Clinic */}
        <div className="p-4 rounded-2xl bg-surface-muted/45 border border-border space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              <span className="h-5 w-5 rounded-full bg-primary-subtle border border-primary/25 text-primary inline-flex items-center justify-center text-[10px]">
                2
              </span>
              Destination · Clinic EZ v2
            </span>
            <Text className="text-[11px] text-text-muted">Clinic &amp; shared patients</Text>
          </div>

          <div className="space-y-3 text-xs">
            {/* Target Tenant — always a dropdown unless custom slug mode selected */}
            <div className="space-y-1.5">
              <Text as="span" variant="label" className="block text-xs">
                Target Tenant
              </Text>
              {!v2TenantManualMode ? (
                <SelectField
                  ariaLabel="Target v2 Tenant"
                  value={newV2TenantId}
                  onValueChange={onSelectTargetTenant}
                  options={v2TenantSelectOptions}
                  placeholder="Select a Clinic EZ v2 tenant..."
                  searchable
                  searchPlaceholder="Search tenants by name or slug..."
                />
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    aria-label="Custom Target v2 Tenant Slug"
                    required
                    value={newV2TenantId}
                    onChange={(e) => onChangeV2TenantId(e.target.value)}
                    placeholder="e.g. main-campus-clinic"
                    className="w-full h-9 px-3 rounded-xl bg-surface border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <Button
                    variant="unstyled"
                    size="custom"
                    onClick={onExitTenantManualMode}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Choose from tenant list instead
                  </Button>
                </div>
              )}
            </div>

            {/* Target Clinic nested strictly inside Target Tenant */}
            <div className="space-y-1.5 pl-3.5 border-l-2 border-primary/30">
              <div className="flex items-center justify-between gap-2">
                <Text as="span" variant="label" className="text-xs">
                  Target Clinic
                </Text>
                <Text className="text-[10px] text-text-muted">
                  {newV2TenantId.trim()
                    ? tenantScopedV2ClinicsCount > 0
                      ? `${tenantScopedV2ClinicsCount} clinic${tenantScopedV2ClinicsCount === 1 ? '' : 's'} in tenant`
                      : 'No registered clinics in tenant'
                    : 'Inside selected tenant'}
                </Text>
              </div>

              <SelectField
                ariaLabel="Target v2 Clinic"
                disabled={targetClinicDisabled}
                value={
                  v2ClinicManualMode ||
                  (tenantScopedV2ClinicsCount === 0 && newV2ClinicId !== '')
                    ? '__manual__'
                    : newV2ClinicId
                }
                onValueChange={onSelectTargetClinic}
                options={v2ClinicSelectOptions}
                placeholder={
                  targetClinicDisabled
                    ? 'Select a target tenant first...'
                    : 'Select a clinic in this tenant...'
                }
                searchable={v2ClinicSelectOptions.length > 6}
                searchPlaceholder="Search clinics..."
                error={Boolean(v2ClinicUuidError)}
              />

              {needsManualClinicInput && (
                <div className="space-y-1 pt-1">
                  <input
                    type="text"
                    aria-label="Manual Target v2 Clinic UUID"
                    required
                    value={newV2ClinicId}
                    onChange={(e) => onChangeV2ClinicId(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className={`w-full h-9 px-3 rounded-xl bg-surface border text-xs text-text font-mono focus:outline-none focus:ring-2 ${
                      v2ClinicUuidError
                        ? 'border-red-500 focus:ring-red-500/20'
                        : 'border-border focus:border-primary focus:ring-primary/20'
                    }`}
                  />
                  {v2ClinicUuidError && (
                    <div className="text-[11px] text-red-600 dark:text-red-400">
                      {v2ClinicUuidError}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {onToggleStorageTrack && (
        <div className="p-3.5 rounded-xl bg-surface-muted/45 border border-border flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <Text as="div" className="text-xs font-semibold text-text">
              Include File Storage Track
            </Text>
            <Text as="div" className="text-[11px] text-text-muted">
              Pre-create the File Storage track so encrypted cloud file transfers can run once records are migrated.
            </Text>
          </div>
          <Button
            variant="unstyled"
            size="xs"
            disabled={isCreating}
            aria-label="Toggle File Storage Track on Create"
            aria-pressed={enableStorageTrack}
            onClick={() => onToggleStorageTrack(!enableStorageTrack)}
            className={`rounded-lg font-semibold border shrink-0 ${
              enableStorageTrack
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-surface border-border text-text-secondary'
            }`}
          >
            {enableStorageTrack ? 'Included' : 'Enable Later'}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="subtle" size="md" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="md" disabled={!canSaveConnection}>
          {isCreating ? 'Creating...' : 'Create Connection'}
        </Button>
      </div>
    </form>
  );
}
