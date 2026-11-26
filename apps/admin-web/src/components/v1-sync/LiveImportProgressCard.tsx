import React from 'react';
import { IconRefresh, IconTerminal2 } from '@tabler/icons-react';
import { Button, Chip, Text } from '@/components/ui';
import type { SyncRunRecordDto, SyncTrack } from '@/services/v1Sync.service';
import { AnimatedNumber } from './AnimatedNumber';
import {
  formatBytes,
  formatDurationMs,
  formatSyncEntityLabel,
  formatSyncRunMode,
  formatTransferRate,
  sanitizeStorageDisplayText,
} from './v1SyncHelpers';

const formatRoundedDurationMs = (ms: number) => formatDurationMs(Math.round(ms));

export interface LiveImportProgressCardProps {
  run: SyncRunRecordDto;
  track?: SyncTrack;
  verboseOpen: boolean;
  onToggleVerbose: () => void;
}

/**
 * Real-time importation progress monitor.
 * Displays active stage, batch progress bar, ticking incremental entity counts,
 * and an optional verbose timestamped log stream.
 */
export function LiveImportProgressCard({
  run,
  track,
  verboseOpen,
  onToggleVerbose,
}: LiveImportProgressCardProps) {
  const summary = run.summary ?? {};
  const isStorage = track === 'TRACK3_STORAGE' || summary.track === 'TRACK3_STORAGE';
  const percent = Math.max(0, Math.min(100, summary.percentComplete ?? 0));
  const stageIndex = summary.stageIndex ?? 0;
  const totalStages = summary.totalStages ?? 0;
  const rawStage =
    summary.currentStage || (isStorage ? 'Scanning files...' : 'Preparing migration...');
  const currentStage = isStorage ? sanitizeStorageDisplayText(rawStage) : rawStage;
  const processedItems = summary.processedItems ?? 0;
  const totalItems = summary.totalItems ?? summary.cohortPatientCount ?? 0;
  const batchSize = summary.batchSize ?? 200;
  const verboseLogs = (summary.verboseLogs ?? []).map((line) =>
    isStorage ? sanitizeStorageDisplayText(line) : line
  );

  const entityEntries = Object.entries(summary.entities ?? {}).filter(
    ([, c]) =>
      c.created > 0 ||
      c.updated > 0 ||
      c.unchanged > 0 ||
      c.skippedV2Wins > 0 ||
      c.shieldedDeletes > 0 ||
      c.errors > 0
  );

  const totalCreated = entityEntries.reduce((acc, [, c]) => acc + c.created, 0);
  const totalUpdated = entityEntries.reduce((acc, [, c]) => acc + c.updated, 0);
  const totalUnchanged = entityEntries.reduce((acc, [, c]) => acc + c.unchanged, 0);
  const totalSkipped = entityEntries.reduce((acc, [, c]) => acc + c.skippedV2Wins, 0);
  const totalShielded = entityEntries.reduce((acc, [, c]) => acc + c.shieldedDeletes, 0);
  const totalErrors = entityEntries.reduce((acc, [, c]) => acc + c.errors, 0);
  const allUnchanged =
    totalCreated === 0 &&
    totalUpdated === 0 &&
    totalSkipped === 0 &&
    totalShielded === 0 &&
    totalErrors === 0;

  const sortedEntityEntries = [...entityEntries].sort(([, a], [, b]) => {
    if (a.errors !== b.errors) return b.errors - a.errors;
    const aChanges = a.created + a.updated + a.skippedV2Wins + a.shieldedDeletes;
    const bChanges = b.created + b.updated + b.skippedV2Wins + b.shieldedDeletes;
    if (aChanges !== bChanges) return bChanges - aChanges;
    return bChanges + b.unchanged - (aChanges + a.unchanged);
  });

  const totalStorageMigrated =
    (summary.clinicCopiesMigrated ?? 0) + (summary.patientCopiesMigrated ?? 0) || totalCreated;
  const storageBytesTransferred = summary.bytesUploaded ?? summary.bytesDownloaded ?? 0;
  const storageSkippedCount = summary.skippedCount ?? totalSkipped;

  return (
    <div
      className="rounded-2xl bg-surface border border-primary/35 shadow-xs overflow-hidden"
      aria-live="polite"
    >
      {/* Header Row */}
      <div className="px-5 py-3.5 bg-primary-subtle/40 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <IconRefresh className="h-4 w-4 text-primary animate-spin shrink-0" />
          <Text className="text-xs font-bold text-text">
            {formatSyncRunMode(run.mode, run.sampleLimit)} in Progress
          </Text>
          {run.sampleLimit ? (
            <Chip tone="info" size="xs">
              Sample ({run.sampleLimit})
            </Chip>
          ) : null}
          <Chip tone="neutral" size="xs" className="tabular-nums">
            Batch: {batchSize.toLocaleString()}
          </Chip>
          <Chip tone="primary" size="xs" dot tooltip={`${percent}%`} className="tabular-nums">
            <AnimatedNumber value={percent} suffix="%" animateOnMount />
          </Chip>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {summary.durationMs !== undefined && summary.durationMs > 0 && (
            <Text
              tooltip={formatDurationMs(summary.durationMs)}
              className="text-[11px] font-mono tabular-nums text-text-muted"
            >
              <AnimatedNumber
                value={summary.durationMs}
                format={formatRoundedDurationMs}
                animateOnMount
              />
            </Text>
          )}
          <Button
            variant={verboseOpen ? 'primary' : 'secondary'}
            size="xs"
            onClick={onToggleVerbose}
            leadingIcon={<IconTerminal2 className="h-3.5 w-3.5" />}
          >
            {verboseOpen ? 'Hide Verbose Log' : 'Verbose Log'}
          </Button>
        </div>
      </div>

      {/* Stage & Progress Bar */}
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              {stageIndex > 0 && totalStages > 0 && (
                <Chip tone="neutral" size="xs" className="tabular-nums shrink-0">
                  Stage {stageIndex} / {totalStages}
                </Chip>
              )}
              <Text className="text-xs font-semibold text-text">{currentStage}</Text>
            </div>
            <Text
              tooltip={
                totalItems > 0
                  ? `${processedItems.toLocaleString()} / ${totalItems.toLocaleString()} ${
                      isStorage ? 'files' : 'patients'
                    } in current stage`
                  : isStorage
                    ? 'Scanning files...'
                    : 'Preparing cohort...'
              }
              className="text-[11px] text-text-muted tabular-nums"
            >
              {totalItems > 0 ? (
                <>
                  <AnimatedNumber value={processedItems} animateOnMount /> /{' '}
                  <AnimatedNumber value={totalItems} /> {isStorage ? 'files' : 'patients'} in
                  current stage
                </>
              ) : isStorage ? (
                'Scanning files...'
              ) : (
                'Preparing cohort...'
              )}
            </Text>
          </div>

          <div
            role="progressbar"
            aria-label={currentStage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="relative h-5 w-full flex items-center select-none"
          >
            {/* Active flowing sine-wave segment (Material 3 Expressive style) */}
            <div
              className="relative h-5 overflow-hidden shrink-0 transition-[width] duration-500 ease-out text-primary"
              style={{ width: `${Math.max(percent, 5)}%` }}
            >
              <svg
                aria-hidden="true"
                className="clinicez-progress-wave h-5 w-[calc(100%+32px)] max-w-none block"
                preserveAspectRatio="none"
              >
                <defs>
                  <pattern
                    id={`clinicez-wave-${run.id}`}
                    width="32"
                    height="20"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 0 10 Q 8 3 16 10 T 32 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </pattern>
                </defs>
                <rect
                  x="0"
                  y="0"
                  width="100%"
                  height="20"
                  fill={`url(#clinicez-wave-${run.id})`}
                />
              </svg>
              <span
                aria-hidden="true"
                className="clinicez-progress-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 dark:via-white/25 to-transparent"
              />
            </div>

            {/* Remaining straight track with end-stop dot */}
            {percent < 100 && (
              <div className="flex-1 flex items-center pl-1.5 min-w-0">
                <div className="h-1.5 w-full rounded-full bg-surface-muted border border-border/60 relative overflow-hidden">
                  <span
                    aria-hidden="true"
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 h-1 w-1 rounded-full bg-primary/60"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Aggregate Incremental Totals */}
        {isStorage ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="px-3 py-2 rounded-xl bg-surface-muted/50 border border-border">
                <Text as="div" className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
                  Encrypted &amp; Saved
                </Text>
                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                  <AnimatedNumber value={totalStorageMigrated} prefix="+" animateOnMount />
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-surface-muted/50 border border-border">
                <Text as="div" className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
                  Data Transferred
                </Text>
                <div className="text-sm font-bold text-sky-600 dark:text-sky-400 tabular-nums mt-0.5">
                  <AnimatedNumber
                    value={storageBytesTransferred}
                    format={formatBytes}
                    animateOnMount
                  />
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-surface-muted/50 border border-border">
                <Text as="div" className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
                  Transfer Speed
                </Text>
                <div className="text-sm font-bold text-text tabular-nums mt-0.5">
                  <AnimatedNumber
                    value={summary.transferRateMbps ?? 0}
                    format={formatTransferRate}
                    animateOnMount
                  />
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-surface-muted/50 border border-border">
                <Text as="div" className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
                  Kept As-Is
                </Text>
                <div className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                  <AnimatedNumber value={storageSkippedCount} animateOnMount />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Chip
                tone="primary"
                size="xs"
                tooltip={`Clinic Files: ${(summary.clinicCopiesMigrated ?? 0).toLocaleString()}`}
                className="tabular-nums"
              >
                Clinic Files: <AnimatedNumber value={summary.clinicCopiesMigrated ?? 0} animateOnMount />
              </Chip>
              <Chip
                tone="info"
                size="xs"
                tooltip={`Patient Files: ${(summary.patientCopiesMigrated ?? 0).toLocaleString()}`}
                className="tabular-nums"
              >
                Patient Files:{' '}
                <AnimatedNumber value={summary.patientCopiesMigrated ?? 0} animateOnMount />
              </Chip>
              {(summary.overlapSavedDownloads ?? 0) > 0 && (
                <Chip
                  tone="success"
                  size="xs"
                  tooltip={`Shared Downloads Saved: ${(summary.overlapSavedDownloads ?? 0).toLocaleString()}`}
                  className="tabular-nums"
                >
                  Shared Downloads Saved:{' '}
                  <AnimatedNumber value={summary.overlapSavedDownloads ?? 0} animateOnMount />
                </Chip>
              )}
              {(summary.failedCount ?? 0) > 0 && (
                <Chip
                  tone="danger"
                  size="xs"
                  tooltip={`Transfer Failed: ${(summary.failedCount ?? 0).toLocaleString()}`}
                  className="tabular-nums"
                >
                  Transfer Failed: <AnimatedNumber value={summary.failedCount ?? 0} animateOnMount />
                </Chip>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="px-3 py-2 rounded-xl bg-surface-muted/50 border border-border">
                <Text as="div" className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
                  Added
                </Text>
                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                  <AnimatedNumber value={totalCreated} prefix="+" animateOnMount />
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-surface-muted/50 border border-border">
                <Text as="div" className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
                  Updated
                </Text>
                <div className="text-sm font-bold text-sky-600 dark:text-sky-400 tabular-nums mt-0.5">
                  <AnimatedNumber value={totalUpdated} animateOnMount />
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-surface-muted/50 border border-border">
                <Text as="div" className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
                  Unchanged
                </Text>
                <div className="text-sm font-bold text-text tabular-nums mt-0.5">
                  <AnimatedNumber value={totalUnchanged} animateOnMount />
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-surface-muted/50 border border-border">
                <Text as="div" className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
                  Kept v2
                </Text>
                <div className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                  <AnimatedNumber value={totalSkipped} animateOnMount />
                </div>
              </div>
            </div>

            {/* Live Per-Entity Incremental Breakdown */}
            {sortedEntityEntries.length > 0 && (
              <div className="pt-3 border-t border-border/70 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                  <Text
                    tooltip={`By Record Type (${sortedEntityEntries.length})`}
                    className="font-semibold uppercase tracking-wider text-text-muted"
                  >
                    By Record Type (<AnimatedNumber value={sortedEntityEntries.length} />)
                  </Text>
                  {allUnchanged ? (
                    <Text className="text-text-muted">All unchanged</Text>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3 text-text-muted">
                      {totalCreated > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                          />
                          Added
                        </span>
                      )}
                      {totalUpdated > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-sky-500"
                          />
                          Updated
                        </span>
                      )}
                      {totalSkipped > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-amber-500"
                          />
                          Kept v2
                        </span>
                      )}
                      {totalErrors > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-red-500"
                          />
                          Failed
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {sortedEntityEntries.map(([entityType, c]) => {
                    const label = formatSyncEntityLabel(entityType);
                    const hasChanges =
                      c.created > 0 ||
                      c.updated > 0 ||
                      c.skippedV2Wins > 0 ||
                      c.shieldedDeletes > 0 ||
                      c.errors > 0;
                    const tooltipParts = [
                      `Added: ${c.created.toLocaleString()}`,
                      `Updated: ${c.updated.toLocaleString()}`,
                      `Unchanged: ${c.unchanged.toLocaleString()}`,
                      `Kept v2: ${c.skippedV2Wins.toLocaleString()}`,
                    ];
                    if (c.shieldedDeletes > 0) {
                      tooltipParts.push(`Protected: ${c.shieldedDeletes.toLocaleString()}`);
                    }
                    if (c.errors > 0) {
                      tooltipParts.push(`Failed: ${c.errors.toLocaleString()}`);
                    }
                    const chipSurfaceClass =
                      c.errors > 0
                        ? 'bg-red-500/5 border-red-500/25'
                        : c.skippedV2Wins > 0 || c.shieldedDeletes > 0
                          ? 'bg-amber-500/5 border-amber-500/25'
                          : c.created > 0 || c.updated > 0
                            ? 'bg-surface border-primary/25'
                            : 'bg-surface-muted/40 border-border';

                    return (
                      <Chip
                        key={entityType}
                        tone="unstyled"
                        size="custom"
                        tooltip={`${label} — ${tooltipParts.join(' · ')}`}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium gap-2 border ${chipSurfaceClass}`}
                      >
                        <span className="text-text-secondary font-medium">{label}</span>
                        <span aria-hidden="true" className="h-3 w-px bg-border shrink-0" />
                        <span className="inline-flex items-center gap-1.5 tabular-nums font-semibold shrink-0">
                          {c.created > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              <AnimatedNumber value={c.created} prefix="+" animateOnMount />
                            </span>
                          )}
                          {c.updated > 0 && (
                            <span className="text-sky-600 dark:text-sky-400">
                              <AnimatedNumber value={c.updated} suffix=" updated" animateOnMount />
                            </span>
                          )}
                          {c.skippedV2Wins > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                              <AnimatedNumber
                                value={c.skippedV2Wins}
                                suffix=" kept v2"
                                animateOnMount
                              />
                            </span>
                          )}
                          {c.shieldedDeletes > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                              <AnimatedNumber
                                value={c.shieldedDeletes}
                                suffix=" protected"
                                animateOnMount
                              />
                            </span>
                          )}
                          {c.errors > 0 && (
                            <span className="text-red-600 dark:text-red-400">
                              <AnimatedNumber value={c.errors} suffix=" failed" animateOnMount />
                            </span>
                          )}
                          {c.unchanged > 0 && (
                            <span
                              className={hasChanges ? 'text-text-muted font-medium' : 'text-text'}
                            >
                              <AnimatedNumber
                                value={c.unchanged}
                                suffix={hasChanges ? ' unchanged' : undefined}
                                animateOnMount
                              />
                            </span>
                          )}
                        </span>
                      </Chip>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Optional Verbose Migration Stream */}
        {verboseOpen && (
          <div className="rounded-xl bg-surface-muted/80 border border-border p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-text-muted">
              <span>Verbose Migration Log (Zero PHI)</span>
              <span className="tabular-nums">
                <AnimatedNumber value={verboseLogs.length} /> events
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1 font-mono text-[11px] text-text-secondary">
              {verboseLogs.length === 0 ? (
                <div className="text-text-muted">Waiting for first batch checkpoint...</div>
              ) : (
                verboseLogs.map((line, idx) => (
                  <div key={`${idx}-${line.slice(0, 12)}`} className="leading-relaxed">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
