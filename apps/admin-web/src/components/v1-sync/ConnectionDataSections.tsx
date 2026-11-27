import React, { useState } from 'react';
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconGitCompare,
  IconRefresh,
  IconRotateClockwise,
  IconSparkles,
  IconTerminal2,
  IconX,
} from '@tabler/icons-react';
import { Button, Chip, SelectField, Text } from '@/components/ui';
import { AnimatedNumber } from './AnimatedNumber';
import type {
  ConflictResolution,
  ParityReportDto,
  StorageObjectItemDto,
  SyncConflictDto,
  SyncRunRecordDto,
  SyncTrack,
  V1CatalogResponseDto,
} from '@/services/v1Sync.service';
import {
  CONFLICTS_PAGE_SIZE,
  CONFLICT_STATUS_OPTIONS,
  DIFFS_PAGE_SIZE,
  formatBytes,
  formatConflictStatus,
  formatConflictType,
  formatDiffAction,
  formatDurationMs,
  formatParityEntityLabel,
  formatRunStatus,
  formatRunTimestamp,
  formatStorageErrorSummary,
  formatStorageLocationPreview,
  formatStorageObjectStatus,
  formatStoragePlane,
  formatStorageProvider,
  formatSyncRunMode,
  formatTransferRate,
  RUN_MODE_FILTER_OPTIONS,
  sanitizeStorageDisplayText,
  shortUuid,
  STORAGE_ATTENTION_STATUS_OPTIONS,
  STORAGE_LOG_SOURCE_FILTER_OPTIONS,
  STORAGE_PAGE_SIZE,
  STORAGE_PLANE_FILTER_OPTIONS,
  type SyncDiffsState,
} from './v1SyncHelpers';

const STORAGE_JARGON_HINT_REGEX =
  /RecordAttachments|record_attachments|file_records|FileRecords|sync_storage_objects|EncryptionAlgorithm|CMK|PMK|DEK|\.cez|SKIPPED_|FAILED_|NXDOMAIN|Azure\s*Blob|Track3Storage|ClinicR2|PatientR2|HTML[\s_]+Interstitial|(?<![a-z0-9])r2(?![a-z0-9])/i;

export function RecordVerificationCard({
  parity,
  track,
}: {
  parity: ParityReportDto;
  track?: SyncTrack;
}) {
  const isStorage = track === 'TRACK3_STORAGE' || parity.track === 'TRACK3_STORAGE';

  return (
    <div className="rounded-2xl bg-surface border border-border overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold text-text">Record Verification Summary</div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="text-text-muted">
            Pending Changes:{' '}
            <strong className="text-text tabular-nums">
              <AnimatedNumber value={parity.changelogLag} />
            </strong>
          </span>
          <span className="text-text-muted">
            Items to Review:{' '}
            <strong className="text-text tabular-nums">
              <AnimatedNumber value={parity.openConflictsCount} />
            </strong>
          </span>
          <Chip tone={parity.readyToFreeze ? 'success' : 'warning'} size="sm">
            {parity.readyToFreeze ? 'Ready to Freeze' : 'Sync Active'}
          </Chip>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-muted border-b border-border text-[11px] uppercase tracking-wider text-text-muted font-semibold">
            <tr>
              <th className="px-4 py-2.5">Record Type</th>
              <th className="px-4 py-2.5 text-right">Classic (v1)</th>
              <th className="px-4 py-2.5 text-right">Clinic EZ v2</th>
              <th className="px-4 py-2.5 text-right">Mapped</th>
              <th className="px-4 py-2.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {parity.checks.map((chk) => {
              const shouldSanitizeNotes =
                isStorage ||
                STORAGE_JARGON_HINT_REGEX.test(chk.entityType) ||
                STORAGE_JARGON_HINT_REGEX.test(chk.notes ?? '');
              const displayNotes = chk.notes
                ? shouldSanitizeNotes
                  ? sanitizeStorageDisplayText(chk.notes)
                  : chk.notes
                : null;
              return (
                <tr key={chk.entityType} className="hover:bg-surface-muted/40">
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-text">
                      {formatParityEntityLabel(chk.entityType)}
                    </div>
                    {displayNotes && (
                      <div className="text-[11px] text-text-muted">{displayNotes}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-secondary">
                    <AnimatedNumber value={chk.v1ExpectedCount} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-secondary">
                    <AnimatedNumber value={chk.v2ActualCount} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-secondary">
                    <AnimatedNumber value={chk.mappedLedgerCount} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {chk.isMatched ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <IconCheck className="h-3.5 w-3.5" /> Matched
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">Pending</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface ConflictsReviewCardProps {
  conflicts: readonly SyncConflictDto[];
  conflictsTotal: number | null;
  conflictsOffset: number;
  conflictsHasMore: boolean;
  conflictStatusFilter: string;
  busyAction: string | null;
  exportingFormat?: 'csv' | 'json' | null;
  onChangeStatusFilter: (nextStatus: string) => void;
  onResolve: (conflict: SyncConflictDto, resolution: ConflictResolution) => void;
  onRequestForceV1: (conflict: SyncConflictDto) => void;
  onInspectDiff?: (conflict: SyncConflictDto) => void;
  onExportReport?: (format: 'csv' | 'json') => void;
  onChangeOffset: (nextOffset: number) => void;
}

export function ConflictsReviewCard({
  conflicts,
  conflictsTotal,
  conflictsOffset,
  conflictsHasMore,
  conflictStatusFilter,
  busyAction,
  exportingFormat = null,
  onChangeStatusFilter,
  onResolve,
  onRequestForceV1,
  onInspectDiff,
  onExportReport,
  onChangeOffset,
}: ConflictsReviewCardProps) {
  const canExport = Boolean(onExportReport) && !exportingFormat && (conflicts.length > 0 || (conflictsTotal ?? 0) > 0);

  return (
    <div className="rounded-2xl bg-surface border border-border">
      <div className="px-5 py-3.5 border-b border-border rounded-t-2xl flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-text">
            Items Needing Review ({conflicts.filter((c) => c.status === 'OPEN').length} open
            {conflictsTotal !== null ? ` · ${conflictsTotal} total` : ''})
          </div>
          <div className="text-[11px] text-text-muted">
            Records edited in Clinic EZ v2 or protected from deletion in Classic v1.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onExportReport && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                disabled={!canExport}
                onClick={() => onExportReport('csv')}
                leadingIcon={<IconDownload className="h-3.5 w-3.5" />}
                tooltip="Export Zero-PHI conflict review report as CSV"
              >
                {exportingFormat === 'csv' ? 'Exporting CSV...' : 'Export CSV'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canExport}
                onClick={() => onExportReport('json')}
                leadingIcon={<IconDownload className="h-3.5 w-3.5" />}
                tooltip="Export Zero-PHI conflict review report as JSON"
              >
                {exportingFormat === 'json' ? 'Exporting JSON...' : 'Export JSON'}
              </Button>
            </div>
          )}
          <div className="w-44 shrink-0">
            <SelectField
              ariaLabel="Filter review items by status"
              size="sm"
              align="right"
              value={conflictStatusFilter}
              onValueChange={onChangeStatusFilter}
              options={CONFLICT_STATUS_OPTIONS}
              searchable={false}
            />
          </div>
        </div>
      </div>
      <div className="divide-y divide-border text-xs">
        {conflicts.length === 0 ? (
          <div className="p-6 text-center text-text-muted">
            No review items match the selected filter.
          </div>
        ) : (
          conflicts.map((cf) => (
            <div
              key={cf.id}
              className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-surface-muted/40 transition-colors"
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Text className="font-semibold text-text">
                    {cf.entityType} #{cf.v1Id}
                  </Text>
                  <Chip tone="warning" size="xs">
                    {formatConflictType(cf.conflictType)}
                  </Chip>
                  <Chip tone="neutral" size="xs" className="font-medium">
                    {formatConflictStatus(cf.status)}
                  </Chip>
                </div>
                <Text
                  as="div"
                  className="text-[11px] text-text-muted"
                  title={cf.changedFields.join(', ') || undefined}
                >
                  Updated fields:{' '}
                  <span className="text-text-secondary">{cf.changedFields.join(', ') || '—'}</span>
                </Text>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {onInspectDiff && (
                  <Button
                    variant="secondary"
                    size="xs"
                    disabled={!!busyAction}
                    onClick={() => onInspectDiff(cf)}
                    leadingIcon={<IconGitCompare className="h-3.5 w-3.5" />}
                  >
                    Review Diff
                  </Button>
                )}
                {cf.status === 'OPEN' && (
                  <>
                    <Button
                      variant="unstyled"
                      size="xs"
                      disabled={!!busyAction}
                      onClick={() => onResolve(cf, 'KEEP_V2')}
                      className="font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20"
                    >
                      Keep v2
                    </Button>
                    <Button
                      variant="unstyled"
                      size="xs"
                      disabled={!!busyAction}
                      onClick={() => onRequestForceV1(cf)}
                      className="font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 hover:bg-amber-500/20"
                    >
                      Use Classic (v1)
                    </Button>
                    <Button
                      variant="subtle"
                      size="xs"
                      disabled={!!busyAction}
                      onClick={() => onResolve(cf, 'IGNORE')}
                      className="border border-border text-text-secondary hover:text-text font-semibold"
                    >
                      Dismiss
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="px-5 py-2.5 border-t border-border bg-surface-muted/40 rounded-b-2xl flex items-center justify-between text-[11px] text-text-muted">
        <span>
          Page {Math.floor(conflictsOffset / CONFLICTS_PAGE_SIZE) + 1}
          {conflictsTotal !== null
            ? ` · ${Math.min(conflictsOffset + conflicts.length, conflictsTotal)} of ${conflictsTotal}`
            : ''}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="xs"
            disabled={conflictsOffset === 0}
            leadingIcon={<IconChevronLeft className="h-3.5 w-3.5" />}
            onClick={() => onChangeOffset(Math.max(0, conflictsOffset - CONFLICTS_PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="xs"
            disabled={!conflictsHasMore}
            trailingIcon={<IconChevronRight className="h-3.5 w-3.5" />}
            onClick={() => onChangeOffset(conflictsOffset + CONFLICTS_PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface SyncActivityCardProps {
  runs: readonly SyncRunRecordDto[];
  track?: SyncTrack;
  hasRunningRun: boolean;
  modeFilter?: string;
  onChangeModeFilter?: (nextMode: string) => void;
  onBrowseAllChanges: () => void;
  onInspectRunChanges: (runId: string) => void;
}

export function SyncActivityCard({
  runs,
  track,
  hasRunningRun,
  modeFilter = '',
  onChangeModeFilter,
  onBrowseAllChanges,
  onInspectRunChanges,
}: SyncActivityCardProps) {
  const [expandedLogRunId, setExpandedLogRunId] = useState<string | null>(null);
  const isStorageTrack = track === 'TRACK3_STORAGE';

  return (
    <div className="rounded-2xl bg-surface border border-border overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 font-bold text-text">
          <span>Migration &amp; Sync Activity</span>
          {hasRunningRun && (
            <Chip
              tone="primary"
              size="xs"
              leadingIcon={<IconRefresh className="h-3 w-3 animate-spin" />}
            >
              Live updating
            </Chip>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onChangeModeFilter && (
            <div className="w-44">
              <SelectField
                ariaLabel="Filter activity by type"
                size="sm"
                align="right"
                value={modeFilter}
                onValueChange={onChangeModeFilter}
                options={RUN_MODE_FILTER_OPTIONS}
                searchable={false}
              />
            </div>
          )}
          {!isStorageTrack && (
            <Button
              variant="subtle"
              size="xs"
              onClick={onBrowseAllChanges}
              className="border border-border hover:bg-background font-semibold shrink-0"
            >
              Browse All Changes
            </Button>
          )}
        </div>
      </div>
      <div className="divide-y divide-border text-xs">
        {runs.length === 0 ? (
          <div className="p-8 text-center text-text-muted space-y-1">
            <div className="font-semibold text-text">
              {modeFilter ? 'No matching activity' : 'No migration or sync runs yet'}
            </div>
            <p className="text-[11px]">
              {modeFilter ? (
                'Switch the filter back to All Activity to view other run types.'
              ) : (
                <>
                  Run <strong className="text-text">Preview Sample (25)</strong> first to verify{' '}
                  {isStorageTrack ? 'files' : 'records'} without writing changes.
                </>
              )}
            </p>
          </div>
        ) : (
          runs.map((run) => {
            const isLogExpanded = expandedLogRunId === run.id;
            const isStorageRun = isStorageTrack || run.summary?.track === 'TRACK3_STORAGE';
            const verboseLogs = (run.summary?.verboseLogs ?? []).map((line) =>
              isStorageRun ? sanitizeStorageDisplayText(line) : line
            );
            const displayErrorMessage = run.errorMessage
              ? isStorageRun
                ? sanitizeStorageDisplayText(run.errorMessage)
                : run.errorMessage
              : null;
            const itemCount = isStorageRun
              ? (run.summary?.totalItems ?? run.summary?.cohortPatientCount ?? 0)
              : (run.summary?.cohortPatientCount ?? 0);
            const transferredBytes = run.summary?.bytesUploaded ?? run.summary?.bytesDownloaded ?? 0;
            const rateMbps = run.summary?.transferRateMbps ?? 0;
            const ts = formatRunTimestamp(run.startedAt);
            const subtitleParts = [
              ...(ts ? [ts.short] : []),
              `${itemCount.toLocaleString()} ${isStorageRun ? 'files' : 'patients'}`,
              ...(isStorageRun && transferredBytes > 0 ? [formatBytes(transferredBytes)] : []),
              ...(isStorageRun && rateMbps > 0 ? [formatTransferRate(rateMbps)] : []),
              formatDurationMs(run.summary?.durationMs),
              `Triggered by ${run.triggeredBy}`,
            ];
            const subtitleText = subtitleParts.join(' · ');
            const subtitleTitle = ts
              ? `${ts.full} · ${subtitleParts.slice(1).join(' · ')}`
              : subtitleText;

            return (
              <div key={run.id} className="hover:bg-surface-muted/40 transition-colors">
                <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Text className="font-bold text-text">
                        {formatSyncRunMode(run.mode, run.sampleLimit)}
                      </Text>
                      {run.sampleLimit ? (
                        <Chip tone="neutral" size="xs" className="rounded-md text-text-muted">
                          Sample · {run.sampleLimit}
                        </Chip>
                      ) : null}
                      {itemCount > 0 && run.summary?.batchSize ? (
                        <Chip tone="neutral" size="xs" className="rounded-md text-text-muted tabular-nums">
                          Batch · {run.summary.batchSize}
                        </Chip>
                      ) : null}
                      <Chip
                        tone={
                          run.status === 'COMPLETED'
                            ? 'success'
                            : run.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                        }
                        size="xs"
                      >
                        {formatRunStatus(run.status)}
                      </Chip>
                    </div>
                    <Text as="div" className="text-[11px] text-text-muted" title={subtitleTitle}>
                      {subtitleText}
                    </Text>
                    {displayErrorMessage && (
                      <Text as="div" className="text-[11px] text-red-600 dark:text-red-400">
                        {displayErrorMessage}
                      </Text>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {verboseLogs.length > 0 && (
                      <Button
                        variant={isLogExpanded ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setExpandedLogRunId(isLogExpanded ? null : run.id)}
                        leadingIcon={<IconTerminal2 className="h-3.5 w-3.5" />}
                        className="rounded-xl text-[11px] font-semibold"
                      >
                        {isLogExpanded ? 'Hide Log' : 'Verbose Log'}
                      </Button>
                    )}
                    {!isStorageRun && (
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => onInspectRunChanges(run.id)}
                        className="shrink-0 rounded-xl text-[11px] font-semibold border border-border hover:bg-background"
                      >
                        Inspect Changes
                      </Button>
                    )}
                  </div>
                </div>

                {isLogExpanded && verboseLogs.length > 0 && (
                  <div className="px-5 pb-4">
                    <div className="rounded-xl bg-surface-muted/80 border border-border p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-text-muted">
                        <span>Verbose Migration Log (Zero PHI)</span>
                        <span className="tabular-nums">{verboseLogs.length} events</span>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-1 font-mono text-[11px] text-text-secondary">
                        {verboseLogs.map((line, idx) => (
                          <div key={`${idx}-${line.slice(0, 12)}`} className="leading-relaxed">
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export interface ChangeDetailsCardProps {
  diffsState: SyncDiffsState;
  onClose: () => void;
  onChangeOffset: (nextOffset: number) => void;
}

export function ChangeDetailsCard({ diffsState, onClose, onChangeOffset }: ChangeDetailsCardProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
      data-testid="change-details-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Change Details"
        className="max-w-3xl w-full max-h-[85vh] flex flex-col rounded-2xl bg-surface border border-border shadow-xl overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-2 text-xs">
          <div>
            <div className="font-bold text-text">
              Change Details ({diffsState.diffs.length} shown
              {diffsState.total !== null ? ` · ${diffsState.total.toLocaleString()} total` : ''})
            </div>
            <div className="text-[11px] text-text-muted">
              Field names only · Clinical values remain hidden
            </div>
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onClose}
            aria-label="Close change details"
            className="shrink-0"
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border text-[11px]">
          {diffsState.diffs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              No field changes were recorded on this page.
            </div>
          ) : (
            diffsState.diffs.map((d) => (
              <div key={d.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Chip tone="neutral" size="xs" className="rounded-md text-text shrink-0">
                    {formatDiffAction(d.action)}
                  </Chip>
                  <Text
                    variant="mono"
                    className="text-[11px] text-text-secondary"
                    title={`${d.entityType} #${d.v1Id}`}
                  >
                    {d.entityType} #{d.v1Id}
                  </Text>
                </div>
                <Text
                  as="div"
                  className="text-text-muted max-w-md"
                  title={d.changedFields.join(', ') || undefined}
                >
                  {d.changedFields.join(', ') || '—'}
                </Text>
              </div>
            ))
          )}
        </div>
        <div className="px-5 py-2.5 border-t border-border bg-surface-muted/40 flex items-center justify-between text-[11px] text-text-muted">
          <span>
            Page {Math.floor(diffsState.offset / DIFFS_PAGE_SIZE) + 1}
            {diffsState.total !== null
              ? ` · ${Math.min(diffsState.offset + diffsState.diffs.length, diffsState.total)} of ${diffsState.total}`
              : ''}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="xs"
              disabled={diffsState.offset === 0}
              leadingIcon={<IconChevronLeft className="h-3.5 w-3.5" />}
              onClick={() => onChangeOffset(Math.max(0, diffsState.offset - DIFFS_PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="xs"
              disabled={!diffsState.hasMore}
              trailingIcon={<IconChevronRight className="h-3.5 w-3.5" />}
              onClick={() => onChangeOffset(diffsState.offset + DIFFS_PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExtraProfileFieldsCard({
  fields,
}: {
  fields: V1CatalogResponseDto['dynamicCustomFieldsPreview'];
}) {
  return (
    <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-text">
          <IconSparkles className="h-4 w-4 text-primary shrink-0" />
          <span>Extra Profile Fields Carried Over</span>
        </div>
        <Text className="text-[11px] text-text-muted">
          {fields.length} institutional fields preserved
        </Text>
      </div>
      <p className="text-[11px] text-text-muted leading-relaxed">
        Institutional student, employee, and government ID fields from Classic Clinic EZ are
        automatically preserved as dedicated profile fields.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-[11px]">
        {fields.map((cf) => (
          <div
            key={cf.fieldKey}
            className="px-3.5 py-2.5 rounded-xl bg-surface-muted/50 border border-border flex items-center justify-between gap-2 min-w-0"
          >
            <div className="min-w-0">
              <Text as="div" className="font-medium text-text">
                {cf.label}
              </Text>
              <Text as="div" className="text-[10px] text-text-muted">
                {cf.category}
              </Text>
            </div>
            <Chip tone="neutral" size="xs" className="tabular-nums shrink-0">
              {cf.populatedV1Count.toLocaleString()}
            </Chip>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface SkippedStorageFilesCardProps {
  items: readonly StorageObjectItemDto[];
  totalCount: number;
  failedRetryableCount?: number | null;
  offset: number;
  statusFilter: string;
  planeFilter: string;
  sourceFilter?: string;
  busyAction: string | null;
  actionsLocked?: boolean;
  onChangeStatusFilter: (nextStatus: string) => void;
  onChangePlaneFilter: (nextPlane: string) => void;
  onChangeSourceFilter?: (nextSource: string) => void;
  onChangeOffset: (nextOffset: number) => void;
  onRetryFailed: () => void;
}

export function SkippedStorageFilesCard({
  items,
  totalCount,
  failedRetryableCount,
  offset,
  statusFilter,
  planeFilter,
  sourceFilter = '',
  busyAction,
  actionsLocked = false,
  onChangeStatusFilter,
  onChangePlaneFilter,
  onChangeSourceFilter,
  onChangeOffset,
  onRetryFailed,
}: SkippedStorageFilesCardProps) {
  const hasMore = offset + items.length < totalCount;
  const allRowsLoaded = offset === 0 && items.length >= totalCount;
  const isAuthFilterWithRetry = statusFilter === 'SKIPPED_AUTH_REQUIRED';
  const isNonRetryableOnlyFilter =
    statusFilter === 'SKIPPED_LEGACY_UNSUPPORTED' ||
    statusFilter === 'SKIPPED_DEAD_LINK,SKIPPED_EMPTY_BLOB';

  const hasRetryableItems = (() => {
    if (isNonRetryableOnlyFilter) return false;
    if (isAuthFilterWithRetry) {
      return allRowsLoaded
        ? items.some((i) => i.status === 'SKIPPED_AUTH_REQUIRED' || i.status === 'FAILED_RETRYABLE')
        : totalCount > 0;
    }
    if (allRowsLoaded) {
      return items.some((i) => i.status === 'FAILED_RETRYABLE');
    }
    if (failedRetryableCount !== undefined && failedRetryableCount !== null) {
      return failedRetryableCount > 0 || items.some((i) => i.status === 'FAILED_RETRYABLE');
    }
    return (
      items.some((i) => i.status === 'FAILED_RETRYABLE') ||
      (totalCount > 0 && (statusFilter === 'ATTENTION' || statusFilter.includes('FAILED_RETRYABLE')))
    );
  })();
  const canRetry = !busyAction && !actionsLocked && hasRetryableItems;

  const isMigratedOrAllView = statusFilter === 'MIGRATED,VERIFIED' || statusFilter === '';
  const cardHeading = isMigratedOrAllView ? 'File Transfer Log' : 'Skipped & Failed Files';
  const cardSubtitle = isMigratedOrAllView
    ? 'Review migrated, verified, and skipped file transfers while keeping confidential patient file links hidden.'
    : 'Files that could not be transferred remain safely accessible at their original links in Classic Clinic EZ.';

  return (
    <div className="rounded-2xl bg-surface border border-border">
      <div className="px-5 py-3.5 border-b border-border rounded-t-2xl flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-text">
            {cardHeading} ({totalCount.toLocaleString()})
          </div>
          <div className="text-[11px] text-text-muted">{cardSubtitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="w-48">
            <SelectField
              ariaLabel="Filter files by status"
              size="sm"
              align="right"
              value={statusFilter}
              onValueChange={onChangeStatusFilter}
              options={STORAGE_ATTENTION_STATUS_OPTIONS}
              searchable={false}
            />
          </div>
          <div className="w-36">
            <SelectField
              ariaLabel="Filter files by destination"
              size="sm"
              align="right"
              value={planeFilter}
              onValueChange={onChangePlaneFilter}
              options={STORAGE_PLANE_FILTER_OPTIONS}
              searchable={false}
            />
          </div>
          {onChangeSourceFilter && (
            <div className="w-40">
              <SelectField
                ariaLabel="Filter files by source"
                size="sm"
                align="right"
                value={sourceFilter}
                onValueChange={onChangeSourceFilter}
                options={STORAGE_LOG_SOURCE_FILTER_OPTIONS}
                searchable={false}
              />
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={!canRetry}
            onClick={onRetryFailed}
            leadingIcon={<IconRotateClockwise className="h-3.5 w-3.5" />}
          >
            Retry Failed
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="p-6 text-center text-text-muted text-xs">
          No files match the current filter.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted border-b border-border text-[11px] uppercase tracking-wider text-text-muted font-semibold">
              <tr>
                <th className="px-4 py-2.5">File</th>
                <th className="px-4 py-2.5">Destination</th>
                <th className="px-4 py-2.5">Source</th>
                <th className="px-4 py-2.5">Before → After Location</th>
                <th className="px-4 py-2.5 text-right">Size</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Attempts</th>
                <th className="px-4 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => {
                const statusInfo = formatStorageObjectStatus(item.status);
                const summaryText = formatStorageErrorSummary(item.status, item.lastErrorCode);
                const locationPreview = formatStorageLocationPreview(item);
                const isTransferred = item.status === 'MIGRATED' || item.status === 'VERIFIED';
                return (
                  <tr
                    key={`${item.targetPlane}-${item.targetEntityId}`}
                    className="hover:bg-surface-muted/40 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <Text variant="mono" className="text-[11px] text-text-secondary max-w-[140px]">
                        {shortUuid(item.targetEntityId)}
                      </Text>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Chip
                        tone={item.targetPlane === 'CLINIC_ATTACHMENT' ? 'primary' : 'info'}
                        size="xs"
                      >
                        {formatStoragePlane(item.targetPlane)}
                      </Chip>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Text className="text-[11px] text-text-secondary">
                        {formatStorageProvider(item.sourceProvider)}
                      </Text>
                    </td>
                    <td className="px-4 py-2.5 min-w-[230px]">
                      <div className="space-y-0.5 text-[11px]">
                        <div className="text-text-muted truncate max-w-[280px]" title={locationPreview.before}>
                          <span className="font-semibold text-text-secondary">Before:</span>{' '}
                          <span className="font-mono">{locationPreview.before}</span>
                        </div>
                        <div
                          className={`truncate max-w-[280px] ${
                            isTransferred
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-text-muted'
                          }`}
                          title={locationPreview.after}
                        >
                          <span className="font-semibold">After:</span>{' '}
                          <span className={isTransferred ? 'font-mono' : ''}>
                            {locationPreview.after}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-secondary whitespace-nowrap">
                      {formatBytes(item.sourceSizeBytes)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Chip tone={statusInfo.tone} size="xs">
                        {statusInfo.label}
                      </Chip>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
                      {item.attemptCount}
                    </td>
                    <td className="px-4 py-2.5">
                      <Text className="text-[11px] text-text-muted max-w-[240px]" title={summaryText}>
                        {summaryText}
                      </Text>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-5 py-2.5 border-t border-border bg-surface-muted/40 rounded-b-2xl flex items-center justify-between text-[11px] text-text-muted">
        <span>
          Page {Math.floor(offset / STORAGE_PAGE_SIZE) + 1} ·{' '}
          {Math.min(offset + items.length, totalCount)} of {totalCount.toLocaleString()}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="xs"
            disabled={offset === 0}
            leadingIcon={<IconChevronLeft className="h-3.5 w-3.5" />}
            onClick={() => onChangeOffset(Math.max(0, offset - STORAGE_PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="xs"
            disabled={!hasMore}
            trailingIcon={<IconChevronRight className="h-3.5 w-3.5" />}
            onClick={() => onChangeOffset(offset + STORAGE_PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
