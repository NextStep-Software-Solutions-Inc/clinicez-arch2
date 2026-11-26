import React from 'react';
import {
  IconArrowsTransferDown,
  IconDatabaseImport,
  IconEye,
  IconLock,
  IconLockOpen,
  IconPlayerPlay,
  IconRefresh,
  IconShieldCheck,
} from '@tabler/icons-react';
import { Button, Chip, SelectField, Text } from '@/components/ui';
import type {
  StorageProviderFilter,
  StorageTargetPlaneFilter,
  SyncBindingDto,
  V1CatalogResponseDto,
} from '@/services/v1Sync.service';
import {
  BATCH_SIZE_OPTIONS,
  STORAGE_SOURCE_FILTER_OPTIONS,
  STORAGE_TARGET_PLANE_OPTIONS,
} from './v1SyncHelpers';

export interface ConnectionActionDeckProps {
  binding: SyncBindingDto;
  catalog: V1CatalogResponseDto | null;
  busyAction: string | null;
  hasRunningRun?: boolean;
  prerequisiteLocked?: boolean;
  hasCompletedSamplePreview?: boolean;
  hasCompletedSampleMigration?: boolean;
  batchSize: number;
  onChangeBatchSize: (batchSize: number) => void;
  storageTargetPlane?: StorageTargetPlaneFilter;
  onChangeStorageTargetPlane?: (value: StorageTargetPlaneFilter) => void;
  storageSourceFilter?: StorageProviderFilter;
  onChangeStorageSourceFilter?: (value: StorageProviderFilter) => void;
  onToggleCohortMode: () => void;
  onToggleAutoSync: () => void;
  onRunDryRun: (limit: number | null) => void;
  onRunBackfill: (limit: number | null) => void;
  onPullNow: () => void;
  onRunFinalSweep: () => void;
  onUnfreeze: () => void;
  onRequestFreeze: () => void;
}

export function ConnectionActionDeck({
  binding,
  catalog,
  busyAction,
  hasRunningRun = false,
  prerequisiteLocked = false,
  hasCompletedSamplePreview,
  hasCompletedSampleMigration,
  batchSize,
  onChangeBatchSize,
  storageTargetPlane = 'BOTH',
  onChangeStorageTargetPlane,
  storageSourceFilter = 'ALL',
  onChangeStorageSourceFilter,
  onToggleCohortMode,
  onToggleAutoSync,
  onRunDryRun,
  onRunBackfill,
  onPullNow,
  onRunFinalSweep,
  onUnfreeze,
  onRequestFreeze,
}: ConnectionActionDeckProps) {
  const actionsLocked = Boolean(busyAction) || hasRunningRun || prerequisiteLocked;
  const previewSampleDone =
    hasCompletedSamplePreview ??
    Boolean(binding.hasCompletedPreview || binding.hasSyncHistory || binding.lastChangelogSeq > 0);
  const migrationSampleDone =
    hasCompletedSampleMigration ??
    Boolean(binding.hasCompletedMigration || binding.hasSyncHistory || binding.lastChangelogSeq > 0);
  const batchSelectOptions = BATCH_SIZE_OPTIONS.some((o) => o.value === String(batchSize))
    ? BATCH_SIZE_OPTIONS
    : [
        {
          value: String(batchSize),
          label: `${batchSize.toLocaleString()} / batch`,
          description: 'Custom connection batch size',
        },
        ...BATCH_SIZE_OPTIONS,
      ];
  const migrateAllLabel =
    binding.track === 'TRACK3_STORAGE' ? 'Migrate All Files' : 'Migrate All Records';
  const trackTitle =
    binding.track === 'TRACK1_CLINIC'
      ? 'Clinic Sync'
      : binding.track === 'TRACK2_PATIENT'
        ? 'Patient Accounts'
        : 'File Storage';

  return (
    <div className="p-5 rounded-2xl bg-surface border border-border space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold text-text">{trackTitle}</h2>
            {binding.isFrozen && (
              <Chip tone="warning" size="xs">
                Frozen
              </Chip>
            )}
          </div>
          <Text as="div" truncate={false} className="text-[11px] text-text-muted">
            {binding.track === 'TRACK3_STORAGE'
              ? 'Follow 1 → 2 → 3 sequentially once Clinic or Patient records are migrated. Safe to run alongside active Auto-Sync.'
              : 'Follow 1 → 2 → 3 sequentially per track. Clinic Sync and Patient Accounts can run in parallel.'}
          </Text>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {binding.track === 'TRACK2_PATIENT' && !binding.isFrozen && (
            <Button
              variant="subtle"
              size="sm"
              disabled={!!busyAction || hasRunningRun}
              onClick={onToggleCohortMode}
              className="rounded-xl font-semibold border border-border hover:bg-background"
            >
              {binding.patientCohortMode === 'SCOPED'
                ? catalog?.totalActiveV1Users
                  ? `Switch to All Accounts (${catalog.totalActiveV1Users.toLocaleString()})`
                  : 'Switch to All Accounts'
                : 'Switch to Selected Clinic & Org'}
            </Button>
          )}

          {!binding.isFrozen && (
            <Button
              variant="unstyled"
              size="sm"
              disabled={!!busyAction || hasRunningRun || prerequisiteLocked}
              onClick={onToggleAutoSync}
              className={`rounded-xl font-semibold border ${
                binding.autoSyncEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-surface-muted border-border text-text-secondary hover:text-text'
              }`}
            >
              Auto-Sync: {binding.autoSyncEnabled ? 'On' : 'Off'}
            </Button>
          )}
        </div>
      </div>

      {binding.track === 'TRACK3_STORAGE' && (
        <div className="rounded-xl bg-surface-muted/40 border border-border px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <Text className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">
              Transfer Scope
            </Text>
            <Text as="div" className="text-[11px] text-text-muted">
              Available source files are encrypted and saved; external or unavailable links remain untouched.
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="w-44">
              <SelectField
                ariaLabel="Target file scope"
                size="sm"
                align="right"
                disabled={actionsLocked || binding.isFrozen}
                value={storageTargetPlane}
                onValueChange={(val) =>
                  onChangeStorageTargetPlane?.(val as StorageTargetPlaneFilter)
                }
                options={STORAGE_TARGET_PLANE_OPTIONS}
                searchable={false}
              />
            </div>
            <div className="w-44">
              <SelectField
                ariaLabel="Source file filter"
                size="sm"
                align="right"
                disabled={actionsLocked || binding.isFrozen}
                value={storageSourceFilter}
                onValueChange={(val) =>
                  onChangeStorageSourceFilter?.(val as StorageProviderFilter)
                }
                options={STORAGE_SOURCE_FILTER_OPTIONS}
                searchable={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Grouped Workflow Action Deck — responsive 3-stage grid, uniform single-line buttons */}
      <div className="rounded-xl bg-surface-muted/40 border border-border grid grid-cols-1 xl:grid-cols-3 divide-y xl:divide-y-0 xl:divide-x divide-border">
        {/* Stage 1: Preview */}
        <div className="p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <Text className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">
              1. Preview
            </Text>
            <Text className="text-[11px] text-text-muted">Read-only check before writing</Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!previewSampleDone ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={actionsLocked}
                title="Preview Sample (25)"
                leadingIcon={<IconEye className="h-3.5 w-3.5 text-text-muted" />}
                onClick={() => onRunDryRun(25)}
                className="rounded-xl font-semibold text-text"
              >
                Preview Sample (25)
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={actionsLocked}
                title="Full Preview"
                leadingIcon={<IconEye className="h-3.5 w-3.5 text-text-muted" />}
                onClick={() => onRunDryRun(null)}
                className="rounded-xl font-semibold text-text"
              >
                Full Preview
              </Button>
            )}
          </div>
        </div>

        {/* Stage 2: Migrate & Sync */}
        <div className="p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">
              2. Migrate &amp; Sync
            </Text>
            <div className="w-36 shrink-0">
              <SelectField
                ariaLabel="Migration batch size"
                size="sm"
                align="right"
                disabled={actionsLocked || binding.isFrozen}
                value={String(batchSize)}
                onValueChange={(val) => {
                  const parsed = Number(val);
                  if (Number.isInteger(parsed) && parsed >= 10 && parsed <= 1000) {
                    onChangeBatchSize(parsed);
                  }
                }}
                options={batchSelectOptions}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!migrationSampleDone ? (
              <Button
                variant="unstyled"
                size="sm"
                disabled={actionsLocked || binding.isFrozen}
                title="Migrate Sample (25)"
                leadingIcon={<IconPlayerPlay className="h-3.5 w-3.5" />}
                onClick={() => onRunBackfill(25)}
                className="rounded-xl font-semibold bg-primary-subtle border border-primary/25 text-primary hover:bg-primary/15"
              >
                Migrate Sample (25)
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={actionsLocked || binding.isFrozen}
                title={migrateAllLabel}
                leadingIcon={<IconDatabaseImport className="h-3.5 w-3.5" />}
                onClick={() => onRunBackfill(null)}
                className="rounded-xl"
              >
                {migrateAllLabel}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={actionsLocked || binding.isFrozen}
              title="Sync Latest Changes"
              leadingIcon={<IconArrowsTransferDown className="h-3.5 w-3.5 text-text-muted" />}
              onClick={onPullNow}
              className="rounded-xl font-semibold text-text"
            >
              Sync Latest Changes
            </Button>
          </div>
        </div>

        {/* Stage 3: Verify & Retire */}
        <div className="p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <Text className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">
              3. Verify &amp; Retire
            </Text>
            <Text className="text-[11px] text-text-muted">Final check &amp; freeze connection</Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={actionsLocked || binding.isFrozen}
              title="Final Verification Sweep"
              leadingIcon={<IconShieldCheck className="h-3.5 w-3.5 text-primary" />}
              onClick={onRunFinalSweep}
              className="rounded-xl font-semibold text-text"
            >
              Final Verification Sweep
            </Button>
            {binding.isFrozen ? (
              <Button
                variant="unstyled"
                size="sm"
                disabled={!!busyAction}
                title="Unfreeze Connection"
                leadingIcon={<IconLockOpen className="h-3.5 w-3.5" />}
                onClick={onUnfreeze}
                className="rounded-xl font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
              >
                Unfreeze Connection
              </Button>
            ) : (
              <Button
                variant="dangerSubtle"
                size="sm"
                disabled={!!busyAction || hasRunningRun || prerequisiteLocked}
                title="Freeze & Retire"
                leadingIcon={<IconLock className="h-3.5 w-3.5" />}
                onClick={onRequestFreeze}
                className="rounded-xl"
              >
                Freeze &amp; Retire
              </Button>
            )}
          </div>
        </div>
      </div>

      {busyAction && (
        <div className="text-xs text-primary font-semibold flex items-center gap-2">
          <IconRefresh className="h-4 w-4 animate-spin" />
          <span>Running {busyAction}...</span>
        </div>
      )}
    </div>
  );
}
