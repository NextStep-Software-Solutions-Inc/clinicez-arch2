import React, { useEffect, useMemo, useState } from 'react';
import {
  IconAlertTriangle,
  IconClock,
  IconEye,
  IconEyeOff,
  IconGitCompare,
  IconInfoCircle,
  IconLock,
  IconRefresh,
  IconShieldCheck,
  IconShieldLock,
  IconX,
} from '@tabler/icons-react';
import { Button, Chip, TabButton, TabList, Text } from '@/components/ui';
import type {
  ConflictDetailDto,
  ConflictFieldDiffDto,
  ConflictResolution,
  SyncConflictDto,
} from '@/services/v1Sync.service';
import {
  compareConflictTimestamps,
  formatConflictRecordStatus,
  formatConflictStatus,
  formatConflictType,
  formatFieldDiffClassification,
  formatRunTimestamp,
  shortUuid,
} from './v1SyncHelpers';

export interface ConflictDiffDrawerProps {
  conflict: SyncConflictDto;
  detail: ConflictDetailDto | null;
  loading: boolean;
  error: string | null;
  busyAction: string | null;
  revealingValues: boolean;
  canRevealBreakGlass: boolean;
  hasVerifiedMfa: boolean;
  disableEscapeClose?: boolean;
  onRetry: () => void;
  onRevealValues: (reason: string) => void;
  onReturnToMasked: () => void;
  onResolve: (conflict: SyncConflictDto, resolution: ConflictResolution) => void;
  onRequestForceV1: (conflict: SyncConflictDto) => void;
  onClose: () => void;
}

function renderFieldPreviewCell(
  field: ConflictFieldDiffDto,
  side: 'v1' | 'v2',
  valuesRevealed: boolean
): React.ReactNode {
  const revealedValue = side === 'v1' ? field.v1Value : field.v2Value;
  const previewValue = side === 'v1' ? field.v1Preview : field.v2Preview;
  const display = valuesRevealed && revealedValue !== undefined && revealedValue !== null
    ? revealedValue
    : previewValue;

  if (display === null || display === undefined || display === '') {
    return <span className="italic text-text-muted">— (empty)</span>;
  }

  const isRevealedSensitive =
    valuesRevealed &&
    revealedValue !== undefined &&
    revealedValue !== null &&
    field.sensitivity !== 'SAFE_ENUM_OR_BOOL';

  return (
    <span
      className={`break-words ${
        isRevealedSensitive
          ? 'font-mono text-text bg-amber-500/10 px-1.5 py-0.5 rounded'
          : field.sensitivity === 'SAFE_ENUM_OR_BOOL'
            ? 'font-medium text-text'
            : 'font-mono text-text-secondary'
      }`}
    >
      {display}
    </span>
  );
}

export function ConflictDiffDrawer({
  conflict,
  detail,
  loading,
  error,
  busyAction,
  revealingValues,
  canRevealBreakGlass,
  hasVerifiedMfa,
  disableEscapeClose = false,
  onRetry,
  onRevealValues,
  onReturnToMasked,
  onResolve,
  onRequestForceV1,
  onClose,
}: ConflictDiffDrawerProps) {
  const [fieldView, setFieldView] = useState<'changed' | 'all'>('changed');
  const [breakGlassFormOpen, setBreakGlassFormOpen] = useState(false);
  const [breakGlassReason, setBreakGlassReason] = useState('');

  useEffect(() => {
    setFieldView('changed');
    setBreakGlassFormOpen(false);
    setBreakGlassReason('');
  }, [conflict.id]);

  useEffect(() => {
    if (detail?.valuesRevealed) {
      setBreakGlassFormOpen(false);
      setBreakGlassReason('');
    }
  }, [detail?.valuesRevealed]);

  useEffect(() => {
    if (disableEscapeClose) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyAction) {
        onClose();
      }
    };
    if (
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function' &&
      typeof window.removeEventListener === 'function'
    ) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
    return undefined;
  }, [busyAction, disableEscapeClose, onClose]);

  const allFields = detail?.fields ?? [];
  const changedFields = useMemo(
    () => allFields.filter((f) => f.isChanged),
    [allFields]
  );
  const visibleFields = fieldView === 'changed' ? changedFields : allFields;

  const v1Ts = formatRunTimestamp(detail?.v1UpdatedAtUtc);
  const v2Ts = formatRunTimestamp(detail?.v2UpdatedAtUtc);
  const newerSide = compareConflictTimestamps(detail?.v1UpdatedAtUtc, detail?.v2UpdatedAtUtc);
  const v1StatusInfo = formatConflictRecordStatus(detail?.v1RecordStatus ?? 'UNAVAILABLE');
  const v2StatusInfo = formatConflictRecordStatus(detail?.v2RecordStatus ?? 'UNAVAILABLE');

  const isDeletionShield = conflict.conflictType === 'V1_SOFT_DELETED_SHIELDED';
  const v1UnavailableForForce =
    detail !== null &&
    detail.inspectorMode === 'FIELD_DIFF' &&
    detail.v1RecordStatus !== 'ACTIVE';
  const forceV1Blocked = isDeletionShield || v1UnavailableForForce;
  const trimmedReason = breakGlassReason.trim();
  const reasonValid = trimmedReason.length >= 5 && trimmedReason.length <= 500;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs"
      onClick={() => {
        if (!busyAction) onClose();
      }}
      data-testid="conflict-diff-drawer-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Conflict Diff Inspector — ${conflict.entityType} #${conflict.v1Id}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl h-full bg-surface border-l border-border shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary-subtle text-primary shrink-0">
                <IconGitCompare className="h-4 w-4" />
              </span>
              <Text as="h3" className="text-base font-bold text-text">
                {conflict.entityType} #{conflict.v1Id}
              </Text>
              <Chip tone="warning" size="xs">
                {formatConflictType(conflict.conflictType)}
              </Chip>
              <Chip tone="neutral" size="xs">
                {formatConflictStatus(conflict.status)}
              </Chip>
              {detail && (
                <Chip
                  tone={detail.valuesRevealed ? 'warning' : 'primary'}
                  size="xs"
                  leadingIcon={
                    detail.valuesRevealed ? (
                      <IconEye className="h-3 w-3" />
                    ) : (
                      <IconShieldCheck className="h-3 w-3" />
                    )
                  }
                >
                  {detail.valuesRevealed ? 'Break-Glass Unmasked' : 'Zero-PHI Mode'}
                </Chip>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
              <span>
                Classic v1 ID:{' '}
                <Text variant="mono" className="text-text-secondary">
                  #{conflict.v1Id}
                </Text>
              </span>
              <span>
                Clinic EZ v2 ID:{' '}
                <Text variant="mono" className="text-text-secondary" title={conflict.v2Id}>
                  {shortUuid(conflict.v2Id)}
                </Text>
              </span>
              {detail?.bindingName && (
                <span>
                  Connection: <strong className="text-text-secondary">{detail.bindingName}</strong>
                </span>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="iconSm"
            disabled={Boolean(busyAction)}
            onClick={onClose}
            aria-label="Close conflict diff inspector"
            className="shrink-0"
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {/* State 1: Loading Skeleton */}
          {loading && !detail ? (
            <div className="space-y-4 animate-pulse" aria-label="Loading conflict diff">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="h-20 rounded-xl bg-surface-muted border border-border" />
                <div className="h-20 rounded-xl bg-surface-muted border border-border" />
              </div>
              <div className="h-12 rounded-xl bg-surface-muted border border-border" />
              <div className="space-y-2">
                <div className="h-10 rounded-xl bg-surface-muted" />
                <div className="h-10 rounded-xl bg-surface-muted" />
                <div className="h-10 rounded-xl bg-surface-muted" />
                <div className="h-10 rounded-xl bg-surface-muted" />
              </div>
            </div>
          ) : error && !detail ? (
            /* State 2: Error State */
            <div
              role="alert"
              className="p-5 rounded-2xl bg-red-500/10 border border-red-500/25 text-xs text-red-700 dark:text-red-300 space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <IconAlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">Unable to inspect live record diff</div>
                  <p className="leading-relaxed">{error}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="dangerSubtle"
                  size="xs"
                  onClick={onRetry}
                  leadingIcon={<IconRefresh className="h-3.5 w-3.5" />}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : detail ? (
            <>
              {/* Inline error banner (e.g. if break-glass request failed while Tier 1 detail is visible) */}
              {error && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-700 dark:text-red-300 flex items-start gap-2"
                >
                  <IconAlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Stale Conflict Warning Banner */}
              {detail.isStale && (
                <div
                  role="alert"
                  data-testid="stale-conflict-warning"
                  className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 space-y-1.5"
                >
                  <div className="flex items-center gap-2 font-bold">
                    <IconAlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Stale Conflict Warning — Live Record Has Changed</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    The live record hash or availability has drifted since this conflict was logged.
                    Review the live field status carefully before choosing a resolution.
                  </p>
                  {detail.staleReasons.length > 0 && (
                    <ul className="list-disc list-inside text-[11px] space-y-0.5 pt-1">
                      {detail.staleReasons.map((reasonText) => (
                        <li key={reasonText}>{reasonText}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Metadata-only note */}
              {detail.note && (
                <div
                  data-testid="conflict-inspector-note"
                  className="p-3.5 rounded-xl bg-surface-muted border border-border text-xs text-text-secondary flex items-start gap-2.5"
                >
                  <IconInfoCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{detail.note}</span>
                </div>
              )}

              {/* Timestamps & Record Status Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-4 rounded-xl bg-surface-muted/60 border border-border space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-text">Classic Clinic EZ (v1)</span>
                    <div className="flex items-center gap-1.5">
                      {newerSide === 'v1' && (
                        <Chip tone="primary" size="xs">
                          Newer
                        </Chip>
                      )}
                      <Chip tone={v1StatusInfo.tone} size="xs">
                        {v1StatusInfo.label}
                      </Chip>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                    <IconClock className="h-3.5 w-3.5 shrink-0" />
                    <span title={v1Ts?.full ?? undefined}>
                      Updated: <strong className="text-text-secondary">{v1Ts ? v1Ts.full : 'Unavailable'}</strong>
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-surface-muted/60 border border-border space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-text">Clinic EZ v2</span>
                    <div className="flex items-center gap-1.5">
                      {newerSide === 'v2' && (
                        <Chip tone="success" size="xs">
                          Newer
                        </Chip>
                      )}
                      <Chip tone={v2StatusInfo.tone} size="xs">
                        {v2StatusInfo.label}
                      </Chip>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                    <IconClock className="h-3.5 w-3.5 shrink-0" />
                    <span title={v2Ts?.full ?? undefined}>
                      Updated: <strong className="text-text-secondary">{v2Ts ? v2Ts.full : 'Unavailable'}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Privacy & Tier 2 Break-Glass Control Bar */}
              {detail.inspectorMode === 'FIELD_DIFF' && (
                <div className="p-4 rounded-2xl bg-surface-muted/50 border border-border space-y-3 text-xs">
                  {detail.valuesRevealed ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <IconShieldLock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <div className="font-bold text-text">
                            Tier 2 Break-Glass Active (Transient · Audit Logged)
                          </div>
                          <p className="text-[11px] text-text-muted">
                            Values were loaded transiently with <code className="font-mono">Cache-Control: no-store</code> and logged to <code className="font-mono">sync_audit_logs</code>.
                            {detail.clinicalNotesRedactedByPolicy
                              ? ' Free-text clinical notes remain redacted by governance policy.'
                              : ''}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="xs"
                        disabled={revealingValues || Boolean(busyAction)}
                        onClick={onReturnToMasked}
                        leadingIcon={<IconEyeOff className="h-3.5 w-3.5" />}
                      >
                        Return to Masked View
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <IconShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <div className="font-bold text-text">
                              Tier 1 Zero-PHI Privacy Mode
                            </div>
                            <p className="text-[11px] text-text-muted">
                              Non-sensitive enums and booleans are shown directly; PII/PHI strings,
                              clinical measurements, and clinical notes stay masked by default.
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="xs"
                          disabled={!canRevealBreakGlass || revealingValues || Boolean(busyAction)}
                          onClick={() => setBreakGlassFormOpen((prev) => !prev)}
                          leadingIcon={
                            hasVerifiedMfa ? (
                              <IconEye className="h-3.5 w-3.5" />
                            ) : (
                              <IconLock className="h-3.5 w-3.5" />
                            )
                          }
                          tooltip={
                            !hasVerifiedMfa
                              ? 'Active Multi-Factor Authentication (MFA) is required for break-glass unmasked inspection'
                              : 'Reveal unmasked values transiently (logged in sync_audit_logs)'
                          }
                        >
                          {breakGlassFormOpen ? 'Cancel Break-Glass' : 'Reveal Unmasked Values'}
                        </Button>
                      </div>

                      {!hasVerifiedMfa && (
                        <div className="text-[11px] text-text-muted flex items-center gap-1.5 pt-1 border-t border-border/60">
                          <IconLock className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            Active Multi-Factor Authentication (MFA) + <code className="font-mono">manage:migrations</code> is required to enable break-glass reveal.
                          </span>
                        </div>
                      )}

                      {breakGlassFormOpen && canRevealBreakGlass && (
                        <div
                          data-testid="break-glass-form"
                          className="p-3.5 rounded-xl bg-surface border border-amber-500/30 space-y-2.5"
                        >
                          <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                            Break-Glass Confirmation (RA 10173 Audit Logged)
                          </div>
                          <p className="text-[11px] text-text-muted leading-relaxed">
                            Provide a governance reason to fetch unmasked values transiently. This
                            access is recorded immutably in <code className="font-mono">sync_audit_logs</code>;
                            free-text clinical notes remain redacted unless enabled by DPO policy.
                          </p>
                          <div className="space-y-1.5">
                            <Text as="label" htmlFor="break-glass-reason" variant="label" className="text-[11px]">
                              Justification Reason (min 5 characters)
                            </Text>
                            <input
                              id="break-glass-reason"
                              type="text"
                              value={breakGlassReason}
                              onChange={(e) => setBreakGlassReason(e.target.value)}
                              placeholder="e.g. Confirming patient contact update during clinic cutover"
                              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="subtle"
                              size="xs"
                              disabled={revealingValues}
                              onClick={() => {
                                setBreakGlassFormOpen(false);
                                setBreakGlassReason('');
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="unstyled"
                              size="xs"
                              disabled={!reasonValid || revealingValues}
                              onClick={() => onRevealValues(trimmedReason)}
                              className="font-semibold text-white bg-amber-600 hover:bg-amber-700"
                            >
                              {revealingValues ? 'Verifying & Loading...' : 'Confirm & Reveal Unmasked'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Field-by-Field Diff Table */}
              <div className="rounded-2xl bg-surface border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-text">
                    Field Comparison ({changedFields.length} changed
                    {allFields.length > changedFields.length ? ` · ${allFields.length} total` : ''})
                  </div>
                  {detail.inspectorMode === 'FIELD_DIFF' && allFields.length > 0 && (
                    <TabList ariaLabel="Field comparison filter">
                      <TabButton
                        active={fieldView === 'changed'}
                        onClick={() => setFieldView('changed')}
                      >
                        Changed ({changedFields.length})
                      </TabButton>
                      <TabButton
                        active={fieldView === 'all'}
                        onClick={() => setFieldView('all')}
                      >
                        All Fields ({allFields.length})
                      </TabButton>
                    </TabList>
                  )}
                </div>

                {visibleFields.length === 0 ? (
                  <div className="p-6 text-center text-xs text-text-muted">
                    {fieldView === 'changed' && allFields.length > 0
                      ? 'No live field differences remain between Classic (v1) and Clinic EZ v2. Switch to "All Fields" to inspect matching values.'
                      : 'No field-level changes were recorded for this review item.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-muted border-b border-border text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                        <tr>
                          <th className="px-4 py-2.5">Field</th>
                          <th className="px-4 py-2.5">Change Status</th>
                          <th className="px-4 py-2.5">Classic (v1)</th>
                          <th className="px-4 py-2.5">Clinic EZ v2</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {visibleFields.map((field) => {
                          const clsInfo = formatFieldDiffClassification(field.classification);
                          const visibleSubDiffs = (field.subFieldDiffs ?? []).filter(
                            (sf) => fieldView === 'all' || sf.isChanged
                          );

                          return (
                            <React.Fragment key={field.fieldName}>
                              <tr className="hover:bg-surface-muted/40 align-top">
                                <td className="px-4 py-2.5">
                                  <div className="font-semibold text-text">{field.label}</div>
                                  <div className="text-[10px] font-mono text-text-muted">
                                    {field.fieldName}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  <Chip tone={clsInfo.tone} size="xs">
                                    {clsInfo.label}
                                  </Chip>
                                </td>
                                <td className="px-4 py-2.5 max-w-[200px]">
                                  {renderFieldPreviewCell(field, 'v1', detail.valuesRevealed)}
                                </td>
                                <td className="px-4 py-2.5 max-w-[200px]">
                                  {renderFieldPreviewCell(field, 'v2', detail.valuesRevealed)}
                                </td>
                              </tr>
                              {visibleSubDiffs.length > 0 && (
                                <tr className="bg-surface-muted/30">
                                  <td colSpan={4} className="px-6 py-2.5">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                                      Custom Field Sub-Keys ({visibleSubDiffs.length})
                                    </div>
                                    <div className="space-y-1">
                                      {visibleSubDiffs.map((sf) => {
                                        const sfCls = formatFieldDiffClassification(sf.classification);
                                        const v1Sub =
                                          detail.valuesRevealed && sf.v1Value !== undefined && sf.v1Value !== null
                                            ? sf.v1Value
                                            : sf.v1Preview;
                                        const v2Sub =
                                          detail.valuesRevealed && sf.v2Value !== undefined && sf.v2Value !== null
                                            ? sf.v2Value
                                            : sf.v2Preview;
                                        return (
                                          <div
                                            key={sf.key}
                                            className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px] py-1 border-t border-border/50 first:border-t-0"
                                          >
                                            <Text variant="mono" className="text-[11px] text-text-secondary" title={sf.key}>
                                              {sf.key}
                                            </Text>
                                            <span>
                                              <Chip tone={sfCls.tone} size="xs">
                                                {sfCls.label}
                                              </Chip>
                                            </span>
                                            <span className="font-mono text-text-muted break-words">
                                              {v1Sub || '— (empty)'}
                                            </span>
                                            <span className="font-mono text-text-muted break-words">
                                              {v2Sub || '— (empty)'}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border bg-surface-muted/40 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] text-text-muted">
            {conflict.status === 'OPEN'
              ? 'Choose how to resolve this conflict after reviewing live differences.'
              : `Resolved (${formatConflictStatus(conflict.status)})${conflict.resolvedBy ? ` by ${conflict.resolvedBy}` : ''}.`}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {conflict.status === 'OPEN' && (
              <>
                <Button
                  variant="unstyled"
                  size="sm"
                  disabled={Boolean(busyAction) || loading}
                  onClick={() => onResolve(conflict, 'KEEP_V2')}
                  className="font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20"
                >
                  Keep v2
                </Button>
                <Button
                  variant="unstyled"
                  size="sm"
                  disabled={Boolean(busyAction) || loading || forceV1Blocked}
                  onClick={() => onRequestForceV1(conflict)}
                  tooltip={
                    forceV1Blocked
                      ? 'Use Classic (v1) is blocked because the Classic (v1) source record is deleted or protected by Deletion Shield'
                      : 'Overwrite Clinic EZ v2 fields with Classic (v1) data'
                  }
                  className="font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 hover:bg-amber-500/20"
                >
                  Use Classic (v1)
                </Button>
                <Button
                  variant="subtle"
                  size="sm"
                  disabled={Boolean(busyAction) || loading}
                  onClick={() => onResolve(conflict, 'IGNORE')}
                  className="border border-border text-text-secondary hover:text-text font-semibold"
                >
                  Dismiss
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={Boolean(busyAction)}
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
