import { useState, useCallback, useEffect, useRef } from 'react';
import {
  clinicService,
  type ClinicAuditEntryDto,
  type ClinicAuditEntryDetailDto,
  type ClinicAuditCategory,
  type ClinicAuditSeverity,
  type AuditDatePreset,
  type AuditFilterParams,
} from '../services/clinicService';
import type { ApiError } from '@shared/safe';

export interface UseAuditLogsOptions {
  initialCategory?: string;
  initialSeverity?: string;
  initialPageSize?: number;
  initialDatePreset?: AuditDatePreset;
  canRead?: boolean;
}

export function useAuditLogs({
  initialCategory = 'All',
  initialSeverity = 'All',
  initialPageSize = 50,
  initialDatePreset = '7d',
  canRead = true,
}: UseAuditLogsOptions = {}) {
  // ── Filters State ──────────────────────────────────────────────────────────
  const [category, setCategory] = useState<string>(initialCategory);
  const [severity, setSeverity] = useState<string>(initialSeverity);
  const [search, setSearch] = useState<string>('');
  const [datePreset, setDatePreset] = useState<AuditDatePreset>(initialDatePreset);
  const [startDate, setStartDate] = useState<string>(() => computePresetStartDate(initialDatePreset));
  const [endDate, setEndDate] = useState<string>(() => computePresetEndDate(initialDatePreset));
  const [pageSize, setPageSize] = useState<number>(initialPageSize);

  // ── Data & Cursor Pagination State ─────────────────────────────────────────
  const [items, setItems] = useState<ClinicAuditEntryDto[]>([]);
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [totalCount, setTotalCount] = useState<number>(0);

  // ── UI / Interaction State ────────────────────────────────────────────────
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingEarlier, setLoadingEarlier] = useState<boolean>(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);

  // ── Inspection Drawer State ───────────────────────────────────────────────
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ClinicAuditEntryDetailDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<ApiError | null>(null);

  // ── Export State ──────────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Race condition guard
  const requestId = useRef<number>(0);

  // ── Date Range Validation ─────────────────────────────────────────────────
  const validateDates = useCallback((start: string, end: string): boolean => {
    if (start && end && start > end) {
      setDateRangeError('Start date cannot exceed end date.');
      return false;
    }
    setDateRangeError(null);
    return true;
  }, []);

  // ── Core Fetch Routine ────────────────────────────────────────────────────
  const fetchLogs = useCallback(
    async (cursor?: string, appendMode: boolean = false) => {
      if (!canRead) {
        setLoading(false);
        return;
      }

      if (!validateDates(startDate, endDate)) {
        setLoading(false);
        return;
      }

      const currentReq = ++requestId.current;
      if (appendMode) {
        setLoadingEarlier(true);
      } else {
        setLoading(true);
      }
      setError(null);

      let apiCategory: string | undefined = undefined;
      if (category && category !== 'All') {
        if (category === 'Clinical Access') {
          apiCategory = 'Clinical';
        } else if (category === 'PhilHealth Yakap') {
          apiCategory = 'PhilHealth';
        } else {
          apiCategory = category;
        }
      }

      const params: AuditFilterParams = {
        category: apiCategory,
        severity: severity !== 'All' ? severity : undefined,
        search: search.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate ? `${endDate}T23:59:59.999Z` : undefined,
        before: cursor,
        pageSize,
      };

      const [data, err] = await clinicService.getAuditLogs(params);

      if (currentReq !== requestId.current) return;

      if (err) {
        setError(err);
        if (appendMode) setLoadingEarlier(false);
        else setLoading(false);
        return;
      }

      if (data) {
        if (appendMode) {
          setItems((prev) => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }
        setNextCursor(data.nextCursor ?? null);
        setHasMore(data.hasMore);
        setTotalCount(data.totalCount);
      }

      if (appendMode) setLoadingEarlier(false);
      else setLoading(false);
    },
    [canRead, category, severity, search, startDate, endDate, pageSize, validateDates],
  );

  // ── Trigger Refresh on Filter Change (Reset Cursor to Top) ────────────────
  useEffect(() => {
    setCursorHistory([]);
    setCurrentCursor(undefined);
    fetchLogs(undefined, false);
  }, [canRead, category, severity, search, startDate, endDate, pageSize]);

  // ── Preset Change Handler ─────────────────────────────────────────────────
  const applyDatePreset = useCallback((preset: AuditDatePreset) => {
    setDatePreset(preset);
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset !== 'custom') {
      setStartDate(computePresetStartDate(preset));
      setEndDate(computePresetEndDate(preset));
    }
  }, []);

  // ── Backward Cursor Navigation: Next Page (Earlier Activity) ──────────────
  const goToNextPage = useCallback(async () => {
    if (!hasMore || !nextCursor || loading || loadingEarlier) return;
    setCursorHistory((prev) => [...prev, currentCursor]);
    setCurrentCursor(nextCursor);
    await fetchLogs(nextCursor, false);
  }, [hasMore, nextCursor, currentCursor, loading, loadingEarlier, fetchLogs]);

  // ── Backward Cursor Navigation: Previous Page (Newer Activity) ────────────
  const goToPreviousPage = useCallback(async () => {
    if (cursorHistory.length === 0 || loading || loadingEarlier) return;
    const prevCursor = cursorHistory[cursorHistory.length - 1];
    setCursorHistory((prev) => prev.slice(0, -1));
    setCurrentCursor(prevCursor);
    await fetchLogs(prevCursor, false);
  }, [cursorHistory, loading, loadingEarlier, fetchLogs]);

  // ── Stream Mode: Load Earlier Activity (Append) ───────────────────────────
  const loadEarlierStream = useCallback(async () => {
    if (!hasMore || !nextCursor || loading || loadingEarlier) return;
    await fetchLogs(nextCursor, true);
  }, [hasMore, nextCursor, loading, loadingEarlier, fetchLogs]);

  // ── Pull-to-Refresh Handler ───────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setCursorHistory([]);
    setCurrentCursor(undefined);
    await fetchLogs(undefined, false);
    setRefreshing(false);
  }, [fetchLogs]);

  // ── Filter Reset ──────────────────────────────────────────────────────────
  const resetFilters = useCallback(() => {
    setCategory('All');
    setSeverity('All');
    setSearch('');
    setDatePreset('7d');
    setStartDate(computePresetStartDate('7d'));
    setEndDate(computePresetEndDate('7d'));
  }, []);

  // ── Entry Detail Inspection Drawer ────────────────────────────────────────
  const openDetail = useCallback(async (entry: ClinicAuditEntryDto) => {
    setSelectedEntryId(entry.id);
    setSelectedDetail(null);
    setLoadingDetail(true);
    setDetailError(null);

    const [detail, err] = await clinicService.getAuditEntryDetail(entry.id);
    if (err) {
      setDetailError(err);
      setLoadingDetail(false);
      return;
    }

    setSelectedDetail(detail);
    setLoadingDetail(false);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedEntryId(null);
    setSelectedDetail(null);
    setDetailError(null);
  }, []);

  // ── File Export ───────────────────────────────────────────────────────────
  const exportLogs = useCallback(
    async (format: 'csv' | 'json' = 'csv', limit: number = 5000) => {
      setIsExporting(true);
      try {
        let apiCategory: string | undefined = undefined;
        if (category && category !== 'All') {
          if (category === 'Clinical Access') {
            apiCategory = 'Clinical';
          } else if (category === 'PhilHealth Yakap') {
            apiCategory = 'PhilHealth';
          } else {
            apiCategory = category;
          }
        }

        const [blob, err] = await clinicService.exportAuditLogs({
          format,
          category: apiCategory,
          severity: severity !== 'All' ? severity : undefined,
          search: search.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate ? `${endDate}T23:59:59.999Z` : undefined,
          limit: limit ?? 5000,
        });

        if (err || !blob) {
          throw err || new Error('Export download failed.');
        }

        // Web download trigger
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const mimeType = format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;';
          const typedBlob = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
          const objectUrl = URL.createObjectURL(typedBlob);
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = `clinic-audit-log-${new Date().toISOString().slice(0, 10)}.${format}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        }

        return { success: true };
      } catch (e: any) {
        return { success: false, error: e?.message || 'Unable to export audit records.' };
      } finally {
        setIsExporting(false);
      }
    },
    [category, severity, search, startDate, endDate],
  );

  return {
    // Data & status
    items,
    loading,
    refreshing,
    loadingEarlier,
    error,
    dateRangeError,
    totalCount,
    isEmpty: !loading && !error && items.length === 0,

    // Filters
    category,
    setCategory,
    severity,
    setSeverity,
    search,
    setSearch,
    datePreset,
    applyDatePreset,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    pageSize,
    setPageSize,
    resetFilters,

    // Pagination
    hasMore,
    nextCursor,
    pageNumber: cursorHistory.length + 1,
    hasPreviousPage: cursorHistory.length > 0,
    hasNextPage: hasMore,
    goToNextPage,
    goToPreviousPage,
    loadEarlierStream,
    refresh,

    // Detail Drawer
    selectedEntryId,
    selectedDetail,
    loadingDetail,
    detailError,
    openDetail,
    closeDetail,

    // Export
    isExporting,
    exportLogs,
  };
}

// ── Date Preset Helpers ─────────────────────────────────────────────────────

function computePresetStartDate(preset: AuditDatePreset): string {
  const d = new Date();
  if (preset === 'today') return d.toISOString().slice(0, 10);
  if (preset === '24h') {
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (preset === '7d') {
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }
  if (preset === '30d') {
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }
  return '';
}

function computePresetEndDate(preset: AuditDatePreset): string {
  if (preset === 'all') return '';
  return new Date().toISOString().slice(0, 10);
}
