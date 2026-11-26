import React, { useCallback, useEffect, useState } from 'react';
import {
  adminService,
  type PatientIdentityDirectoryResponseDto,
  type PatientIdentityFilter,
  type PatientIdentityItemDto,
  type ReconcilePatientIdentityPayload,
} from '@/services/admin.service';
import { v1SyncService } from '@/services/v1Sync.service';
import { ADMIN_PERMISSIONS, hasAdminPermission } from '@/constants/permissions';
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconLink,
  IconLinkOff,
  IconRefresh,
  IconSearch,
  IconShieldCheck,
  IconUserCheck,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { Button, Chip, Tabs, Text } from '@/components/ui';

export const IDENTITY_PAGE_SIZE = 25;

export function isValidClerkUserId(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('user_') &&
    trimmed.length > 5 &&
    trimmed.length <= 128 &&
    !/\s/.test(trimmed)
  );
}

export function canAccessPatientIdentityDirectory(
  profile: { permissions?: readonly string[] | null; isSuperAdmin?: boolean } | null | undefined
): boolean {
  if (!profile) return false;
  if (profile.isSuperAdmin) return true;
  return (
    hasAdminPermission(profile, ADMIN_PERMISSIONS.MANAGE_MIGRATIONS) ||
    hasAdminPermission(profile, ADMIN_PERMISSIONS.MANAGE_ADMINS)
  );
}

export function getPatientIdentityBadgeMeta(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'Reclaimed':
      return {
        label: 'Auto-Linked',
        className:
          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
      };
    case 'ClerkLinked':
      return {
        label: 'Signed In',
        className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25',
      };
    case 'AmbiguousEmail':
      return {
        label: 'Duplicate Email',
        className: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/25',
      };
    default:
      return {
        label: 'Awaiting Sign-Up',
        className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
      };
  }
}

export function formatIdentityActor(updatedBy: string | null | undefined): string {
  const raw = updatedBy?.trim();
  if (!raw) return '—';
  if (raw === 'System:ClerkEmailReclaim') return 'Auto-linked by email';
  if (raw === 'System:V1Sync') return 'Classic (v1) sync';
  if (raw === 'System:V1SyncAdmin') return 'Admin update';
  if (raw.startsWith('AdminReconcile:')) {
    const actor = raw.slice('AdminReconcile:'.length).trim();
    return actor ? `Admin · ${actor}` : 'Admin update';
  }
  if (raw.startsWith('System:')) {
    const suffix = raw.slice('System:'.length).replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    return suffix || 'System';
  }
  return raw;
}

export interface PatientIdentityDirectoryPanelProps {
  mode: 'platform-interop' | 'v1-sync-migration';
}

const FILTER_OPTIONS: ReadonlyArray<{ value: PatientIdentityFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'UNLINKED', label: 'Awaiting Sign-Up' },
  { value: 'RECLAIMED', label: 'Auto-Linked' },
  { value: 'AMBIGUOUS_EMAIL', label: 'Duplicate Emails' },
  { value: 'CLERK_LINKED', label: 'Signed In' },
];

export function PatientIdentityDirectoryPanel({ mode }: PatientIdentityDirectoryPanelProps) {
  const [data, setData] = useState<PatientIdentityDirectoryResponseDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PatientIdentityFilter>('ALL');
  const [offset, setOffset] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Reconcile modal state
  const [target, setTarget] = useState<PatientIdentityItemDto | null>(null);
  const [modalAction, setModalAction] = useState<'BIND_CLERK' | 'UNBIND_CLERK'>('BIND_CLERK');
  const [clerkIdInput, setClerkIdInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        search: appliedSearch || undefined,
        status: statusFilter,
        limit: IDENTITY_PAGE_SIZE,
        offset,
      };
      const res =
        mode === 'platform-interop'
          ? await adminService.getPatientIdentities(params)
          : await v1SyncService.listPatientIdentities(params);
      setData(res);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.Message ||
        err?.message ||
        'Unable to load patient identity records.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, mode, offset, statusFilter]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  // Close modal cleanly with Escape key
  useEffect(() => {
    if (!target || typeof document === 'undefined') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) setTarget(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [target, submitting]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setAppliedSearch(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setAppliedSearch('');
    setOffset(0);
  };

  const handleCopy = async (key: string, value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      toast.success(`Copied ${label}`);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1500);
    } catch {
      toast.error(`Unable to copy ${label}`);
    }
  };

  const openReconcileModal = (
    item: PatientIdentityItemDto,
    action: 'BIND_CLERK' | 'UNBIND_CLERK'
  ) => {
    setTarget(item);
    setModalAction(action);
    setClerkIdInput(action === 'BIND_CLERK' ? item.clerkUserId ?? '' : '');
    setReasonInput('');
  };

  const handleConfirmReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;

    if (modalAction === 'BIND_CLERK' && !isValidClerkUserId(clerkIdInput)) {
      toast.error("Sign-in account ID must start with 'user_' and contain no spaces.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: ReconcilePatientIdentityPayload = {
        action: modalAction,
        clerkUserId: modalAction === 'BIND_CLERK' ? clerkIdInput.trim() : null,
        reason: reasonInput.trim() || null,
      };

      if (mode === 'platform-interop') {
        await adminService.reconcilePatientIdentity(target.patientId, payload);
      } else {
        await v1SyncService.bindClerkIdentity(target.patientId, payload);
      }

      toast.success(
        modalAction === 'BIND_CLERK'
          ? `Linked sign-in account to ${target.firstName} ${target.lastName} (${target.clinicEzId}).`
          : `Unlinked sign-in account from ${target.firstName} ${target.lastName} (${target.clinicEzId}).`
      );
      setTarget(null);
      await loadDirectory();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.Message ||
        err?.message ||
        'Unable to update patient sign-in link.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const summary = data?.summary;
  const items = data?.items ?? [];
  const totalMatching = data?.totalMatching ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + items.length < totalMatching;
  const hasActiveFilters = statusFilter !== 'ALL' || Boolean(appliedSearch);

  const kpiCards: ReadonlyArray<{
    filter: PatientIdentityFilter;
    label: string;
    value: number;
    sub: string;
    accent: string;
  }> = [
    {
      filter: 'ALL',
      label: 'Total Patients',
      value: summary?.totalPrimaryPatients ?? 0,
      sub: 'Primary patient accounts',
      accent: 'text-text',
    },
    {
      filter: 'CLERK_LINKED',
      label: 'Signed In',
      value: summary?.clerkLinkedCount ?? 0,
      sub: 'Active login connected',
      accent: 'text-sky-600 dark:text-sky-400',
    },
    {
      filter: 'UNLINKED',
      label: 'Awaiting Sign-Up',
      value: summary?.unlinkedCount ?? 0,
      sub: 'Migrated, not yet claimed',
      accent: 'text-amber-600 dark:text-amber-400',
    },
    {
      filter: 'RECLAIMED',
      label: 'Auto-Linked',
      value: summary?.reclaimedViaEmailCount ?? 0,
      sub: 'Matched by verified email',
      accent: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      filter: 'AMBIGUOUS_EMAIL',
      label: 'Duplicate Emails',
      value: summary?.ambiguousDuplicateEmailGroups ?? 0,
      sub:
        (summary?.ambiguousDuplicatePatientCount ?? 0) > 0
          ? `${(summary?.ambiguousDuplicatePatientCount ?? 0).toLocaleString()} accounts need review`
          : 'No duplicate groups',
      accent:
        (summary?.ambiguousDuplicateEmailGroups ?? 0) > 0
          ? 'text-red-600 dark:text-red-400'
          : 'text-text-muted',
    },
  ];

  const colCount = 6;

  return (
    <div className="space-y-5">
      {/* Interactive KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {kpiCards.map((kpi) => {
          const isSelected = statusFilter === kpi.filter;
          return (
            <Button
              key={kpi.label}
              variant="unstyled"
              size="custom"
              multiline
              tooltip={`${kpi.label}: ${kpi.value.toLocaleString()} — ${kpi.sub}`}
              onClick={() => {
                setOffset(0);
                setStatusFilter(kpi.filter);
              }}
              className={`min-w-0 text-left p-4 rounded-2xl border transition-all space-y-1 ${
                isSelected
                  ? 'bg-primary-subtle/50 border-primary/40 shadow-xs'
                  : 'bg-surface border-border hover:border-primary/30 hover:bg-surface-muted/40'
              }`}
            >
              <Text as="div" className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
                {kpi.label}
              </Text>
              <div className={`text-2xl font-bold tabular-nums ${kpi.accent}`}>
                {kpi.value.toLocaleString()}
              </div>
              <Text as="div" className="text-[11px] text-text-muted">
                {kpi.sub}
              </Text>
            </Button>
          );
        })}
      </div>

      {/* Unified Filter & Search Toolbar */}
      <div className="p-4 rounded-2xl bg-surface border border-border flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <Tabs
          ariaLabel="Filter patient sign-in status"
          fullWidthUntil="xl"
          value={statusFilter}
          onValueChange={(nextFilter) => {
            setOffset(0);
            setStatusFilter(nextFilter);
          }}
          items={FILTER_OPTIONS}
        />

        <div className="flex items-center gap-2 w-full xl:flex-1 xl:max-w-md min-w-0">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-0">
            <div className="relative flex-1 min-w-0">
              <IconSearch className="h-3.5 w-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, email, or Clinic EZ ID..."
                aria-label="Search patient identities"
                className="w-full h-9 pl-9 pr-8 rounded-xl bg-surface-muted border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
              {searchInput && (
                <Button
                  variant="unstyled"
                  size="custom"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text p-0.5 rounded"
                >
                  <IconX className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <Button type="submit" variant="primary" size="md" className="shrink-0">
              Search
            </Button>
          </form>

          <Button
            variant="secondary"
            size="md"
            onClick={() => void loadDirectory()}
            disabled={loading}
            title="Refresh directory"
            aria-label="Refresh patient identities"
            leadingIcon={<IconRefresh className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />}
            className="shrink-0 px-3"
          >
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <IconAlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="dangerSubtle"
            size="xs"
            onClick={() => void loadDirectory()}
            className="shrink-0"
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Identity Table */}
      <div className="rounded-2xl bg-surface border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted border-b border-border text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              <tr>
                <th className="px-3.5 py-3 whitespace-nowrap">Patient</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Email</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Status</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Sign-In Account</th>
                <th className="hidden xl:table-cell px-3.5 py-3 whitespace-nowrap">Updated By</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && items.length === 0 ? (
                [1, 2, 3, 4, 5].map((row) => (
                  <tr key={row} className="animate-pulse">
                    <td colSpan={colCount} className="px-3.5 py-3.5">
                      <div className="h-5 w-full rounded-lg bg-surface-muted" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="inline-flex p-3 rounded-2xl bg-primary-subtle text-primary">
                        <IconUsers className="h-6 w-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-text">
                          No matching patient accounts
                        </div>
                        <p className="text-xs text-text-muted max-w-sm">
                          {hasActiveFilters
                            ? 'Try clearing your search query or switching to a different status filter.'
                            : 'Patient sign-in accounts will appear here once accounts are registered or synced.'}
                        </p>
                      </div>
                      {hasActiveFilters && (
                        <Button
                          variant="unstyled"
                          size="sm"
                          onClick={() => {
                            setStatusFilter('ALL');
                            setSearchInput('');
                            setAppliedSearch('');
                            setOffset(0);
                          }}
                          className="mt-1 px-3.5 rounded-xl font-semibold text-primary bg-primary-subtle hover:bg-primary/15"
                        >
                          Reset Filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const badge = getPatientIdentityBadgeMeta(item.identityStatus);
                  const idCopyKey = `id-${item.patientId}`;
                  const emailCopyKey = `email-${item.patientId}`;
                  const accountCopyKey = `acct-${item.patientId}`;

                  return (
                    <tr
                      key={item.patientId}
                      className="hover:bg-surface-muted/50 transition-colors"
                    >
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <Text as="div" className="font-semibold text-text max-w-[170px]">
                          {item.firstName} {item.lastName}
                        </Text>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Text variant="mono" className="text-[11px] text-text-muted">
                            {item.clinicEzId}
                          </Text>
                          <Button
                            variant="unstyled"
                            size="custom"
                            onClick={() =>
                              void handleCopy(idCopyKey, item.clinicEzId, 'Clinic EZ ID')
                            }
                            title="Copy Clinic EZ ID"
                            aria-label="Copy Clinic EZ ID"
                            className="p-0.5 rounded text-text-muted hover:text-text shrink-0"
                          >
                            {copiedKey === idCopyKey ? (
                              <IconCheck className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <IconCopy className="h-3 w-3" />
                            )}
                          </Button>
                          {mode === 'v1-sync-migration' && item.v1UserId && (
                            <Text variant="mono" className="text-[10px] text-text-muted">
                              · v1 #{item.v1UserId}
                            </Text>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-text-secondary">
                        <div className="flex items-center gap-1">
                          <Text className="max-w-[165px]" tooltip={item.email ?? false}>
                            {item.email || '—'}
                          </Text>
                          {item.email && (
                            <Button
                              variant="unstyled"
                              size="custom"
                              onClick={() =>
                                void handleCopy(emailCopyKey, item.email!, 'email address')
                              }
                              title="Copy email"
                              aria-label="Copy email"
                              className="p-0.5 rounded text-text-muted hover:text-text shrink-0"
                            >
                              {copiedKey === emailCopyKey ? (
                                <IconCheck className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <IconCopy className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                          {item.duplicateEmailCount > 1 && (
                            <Chip
                              tone="danger"
                              size="custom"
                              title={`${item.duplicateEmailCount} patient records share this email`}
                              className="px-1.5 py-0.5 rounded-md text-[10px] shrink-0"
                            >
                              ×{item.duplicateEmailCount}
                            </Chip>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <Chip tone="unstyled" size="sm" className={`px-2 border ${badge.className}`}>
                          {badge.label}
                        </Chip>
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        {item.clerkUserId ? (
                          <div className="flex items-center gap-1">
                            <Text variant="mono" className="text-[11px] text-text-secondary max-w-[115px]">
                              {item.clerkUserId}
                            </Text>
                            <Button
                              variant="unstyled"
                              size="custom"
                              onClick={() =>
                                void handleCopy(
                                  accountCopyKey,
                                  item.clerkUserId!,
                                  'sign-in account ID'
                                )
                              }
                              title="Copy sign-in account ID"
                              aria-label="Copy sign-in account ID"
                              className="p-0.5 rounded text-text-muted hover:text-text shrink-0"
                            >
                              {copiedKey === accountCopyKey ? (
                                <IconCheck className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <IconCopy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        ) : (
                          <Text className="text-[11px] text-text-muted" tooltip={false}>
                            Not linked
                          </Text>
                        )}
                      </td>
                      <td className="hidden xl:table-cell px-3.5 py-3 text-[11px] text-text-muted max-w-[120px]">
                        <Text
                          className="block text-[11px] text-text-muted"
                          title={item.updatedBy ?? undefined}
                        >
                          {formatIdentityActor(item.updatedBy)}
                        </Text>
                      </td>
                      <td className="px-3.5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="unstyled"
                            size="xs"
                            onClick={() => openReconcileModal(item, 'BIND_CLERK')}
                            leadingIcon={<IconLink className="h-3.5 w-3.5" />}
                            className="px-2.5 bg-primary-subtle text-primary hover:bg-primary/15 font-semibold shrink-0"
                          >
                            {item.clerkUserId ? 'Update' : 'Link'}
                          </Button>
                          {item.clerkUserId && (
                            <Button
                              variant="unstyled"
                              size="custom"
                              onClick={() => openReconcileModal(item, 'UNBIND_CLERK')}
                              className="h-7 w-7 p-0 rounded-lg bg-surface-muted text-text-secondary hover:text-red-600 dark:hover:text-red-400 shrink-0"
                              title="Unlink sign-in account"
                              aria-label={`Unlink sign-in account for ${item.firstName} ${item.lastName}`}
                            >
                              <IconLinkOff className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Privacy Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border bg-surface-muted/40 text-xs text-text-muted">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Showing {items.length === 0 ? 0 : offset + 1}–{offset + items.length} of{' '}
              <strong className="text-text">{totalMatching.toLocaleString()}</strong> accounts
            </span>
            {mode === 'v1-sync-migration' && (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-text-muted">
                <IconShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>Every update is logged · Medical records hidden</span>
              </span>
            )}
          </div>
          <div className="inline-flex items-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              disabled={!hasPrev || loading}
              onClick={() => setOffset(Math.max(0, offset - IDENTITY_PAGE_SIZE))}
              leadingIcon={<IconChevronLeft className="h-3.5 w-3.5" />}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="xs"
              disabled={!hasNext || loading}
              onClick={() => setOffset(offset + IDENTITY_PAGE_SIZE)}
              trailingIcon={<IconChevronRight className="h-3.5 w-3.5" />}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Link / Update / Unlink Sign-In Account Modal */}
      {target && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => {
            if (!submitting) setTarget(null);
          }}
        >
          <form
            onSubmit={handleConfirmReconcile}
            onClick={(e) => e.stopPropagation()}
            className="max-w-md w-full rounded-2xl bg-surface border border-border p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-2 rounded-xl shrink-0 ${
                    modalAction === 'BIND_CLERK'
                      ? 'bg-primary-subtle text-primary'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}
                >
                  {modalAction === 'BIND_CLERK' ? (
                    <IconUserCheck className="h-5 w-5" />
                  ) : (
                    <IconLinkOff className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <Text as="h3" className="text-base font-bold text-text">
                    {modalAction === 'BIND_CLERK'
                      ? target.clerkUserId
                        ? 'Update Sign-In Link'
                        : 'Link Sign-In Account'
                      : 'Unlink Sign-In Account'}
                  </Text>
                  <p className="text-[11px] text-text-muted">
                    This change is recorded in the admin audit trail.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="iconSm"
                disabled={submitting}
                onClick={() => setTarget(null)}
                aria-label="Close modal"
                className="shrink-0"
              >
                <IconX className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-3 rounded-xl bg-surface-muted/70 border border-border text-xs space-y-0.5">
              <Text as="div" className="font-semibold text-text">
                {target.firstName} {target.lastName}
              </Text>
              <div className="text-[11px] text-text-muted flex flex-wrap items-center gap-x-2">
                <Text variant="mono" className="text-[11px] text-text-secondary">
                  {target.clinicEzId}
                </Text>
                {target.email && <Text className="text-[11px] text-text-muted">· {target.email}</Text>}
              </div>
            </div>

            {modalAction === 'BIND_CLERK' ? (
              <div className="space-y-1.5 text-xs">
                <Text as="label" htmlFor="reconcile-clerk-id" variant="label" className="text-xs">
                  Sign-In Account ID
                </Text>
                <input
                  id="reconcile-clerk-id"
                  type="text"
                  required
                  value={clerkIdInput}
                  onChange={(e) => setClerkIdInput(e.target.value)}
                  placeholder="user_2abc..."
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="block text-[11px] text-text-muted">
                  Enter the verified sign-in account ID (starts with{' '}
                  <code className="font-mono text-text-secondary">user_</code>).
                </span>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                Unlinking <code className="font-mono font-semibold">{target.clerkUserId}</code>{' '}
                detaches sign-in access until the patient signs in with a verified email or an
                administrator links a replacement account.
              </div>
            )}

            <div className="space-y-1.5 text-xs">
              <Text as="label" htmlFor="reconcile-note" variant="label" className="text-xs">
                Note (optional)
              </Text>
              <input
                id="reconcile-note"
                type="text"
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="e.g. Verified patient ID to resolve duplicate email"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="subtle"
                size="md"
                disabled={submitting}
                onClick={() => setTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={modalAction === 'BIND_CLERK' ? 'primary' : 'danger'}
                size="md"
                disabled={
                  submitting ||
                  (modalAction === 'BIND_CLERK' && !isValidClerkUserId(clerkIdInput))
                }
              >
                {submitting
                  ? 'Saving...'
                  : modalAction === 'BIND_CLERK'
                    ? 'Save Account Link'
                    : 'Confirm Unlink'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
