import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { useUser } from '@clerk/clerk-react';
import { Route as authRoute } from './_auth';
import { adminService, AdminMeDto, AdminTenantDto } from '@/services/admin.service';
import { hasVerifiedMfa } from '@/lib/mfaGuard';
import {
  Button,
  Chip,
  SelectField,
  TabButton,
  TabList,
  Text,
  type SelectFieldOption,
} from '@/components/ui';
import {
  v1SyncService,
  isValidUuid,
  ConflictDetailDto,
  ConflictResolution,
  MappingGuideResponseDto,
  StorageObjectItemDto,
  StorageProviderFilter,
  StorageTargetPlaneFilter,
  SyncBindingDto,
  SyncConflictDto,
  SyncRunRecordDto,
  SyncRuntimeSettingsDto,
  SyncSystemStatusDto,
  SyncTrack,
  TrackingSqlScriptsResponseDto,
  UpdateSyncRuntimeSettingsPayload,
  V1CatalogResponseDto,
  V2ClinicOptionDto,
  ParityReportDto,
} from '@/services/v1Sync.service';
import {
  buildBindingStateFingerprint,
  buildRunsHeadFingerprint,
  buildSyncStatusFingerprint,
  ChangeDetailsCard,
  CONFLICTS_PAGE_SIZE,
  ConflictDiffDrawer,
  ConflictsReviewCard,
  ConnectionActionDeck,
  ConnectionHealthStrip,
  ConnectionsRosterView,
  CreateConnectionForm,
  DIFFS_PAGE_SIZE,
  EditConnectionModal,
  ExtraProfileFieldsCard,
  filterV1ClinicsForTenant,
  filterV1OrgsForTenant,
  filterV2ClinicsForTenant,
  ForceV1ConfirmModal,
  formatSyncRunMode,
  FreezeConnectionModal,
  groupUnifiedConnections,
  hasCompletedSampleMigration,
  hasCompletedSamplePreview,
  LiveImportProgressCard,
  MappingGuideModal,
  mergeV2ClinicOptions,
  mergeV2TenantOptions,
  MigrationSettingsModal,
  RecordVerificationCard,
  resolveV1SyncPermissionState,
  resolveV1TenantIdForSource,
  sanitizeStorageDisplayText,
  shortUuid,
  SkippedStorageFilesCard,
  STORAGE_PAGE_SIZE,
  SyncActivityCard,
  TrackingScriptModal,
  type EditConnectionSavePayload,
  type SyncDiffsState,
  type UnifiedSyncConnection,
} from '@/components/v1-sync';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowRight,
  IconBook2,
  IconBuildingHospital,
  IconCloudLock,
  IconCode,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconShieldLock,
  IconUsers,
} from '@tabler/icons-react';
import { toast } from 'sonner';

export {
  CONFLICTS_PAGE_SIZE,
  DIFFS_PAGE_SIZE,
  STORAGE_PAGE_SIZE,
  resolveV1SyncPermissionState,
  resolveV1TenantIdForSource,
  filterV1OrgsForTenant,
  filterV1ClinicsForTenant,
  groupUnifiedConnections,
  mergeV2ClinicOptions,
  mergeV2TenantOptions,
  filterV2ClinicsForTenant,
  formatSyncRunMode,
  formatRunStatus,
  formatConflictType,
  formatConflictStatus,
  formatDiffAction,
  formatDurationMs,
  formatBytes,
  formatTransferRate,
  formatStorageObjectStatus,
  formatStoragePlane,
  formatStorageProvider,
  formatStorageErrorSummary,
  formatParityEntityLabel,
  sanitizeStorageDisplayText,
  type UnifiedSyncConnection,
  type V2TenantOption,
} from '@/components/v1-sync';

export interface V1SyncPageProps {
  initialProfile?: AdminMeDto | null;
  initialPermissionsLoading?: boolean;
  initialSelectedBindingId?: string | null;
  initialMfaVerified?: boolean;
}

function extractApiErrorMessage(err: unknown, fallback: string, sanitizeStorage = false): string {
  const apiMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  const msg = apiMsg || (err instanceof Error ? err.message : fallback);
  return sanitizeStorage ? sanitizeStorageDisplayText(msg) : msg;
}

function findConnectionForId(
  connections: readonly UnifiedSyncConnection[],
  id: string | null
): UnifiedSyncConnection | null {
  if (!id) return null;
  return (
    connections.find(
      (c) =>
        c.id === id ||
        c.clinicBinding?.id === id ||
        c.patientBinding?.id === id ||
        c.storageBinding?.id === id
    ) ?? null
  );
}

export function V1SyncPage({
  initialProfile,
  initialPermissionsLoading,
  initialSelectedBindingId = null,
  initialMfaVerified,
}: V1SyncPageProps = {}) {
  let clerkUser: Parameters<typeof hasVerifiedMfa>[0] = null;
  try {
    const userState = useUser();
    clerkUser = userState.user;
  } catch {
    // Outside ClerkProvider in unit tests
  }
  const mfaVerified = initialMfaVerified ?? hasVerifiedMfa(clerkUser);

  const [adminProfile, setAdminProfile] = useState<AdminMeDto | null>(initialProfile ?? null);
  const [permissionsLoading, setPermissionsLoading] = useState<boolean>(
    initialPermissionsLoading ?? initialProfile === undefined
  );
  const [profileError, setProfileError] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncSystemStatusDto | null>(null);
  const [catalog, setCatalog] = useState<V1CatalogResponseDto | null>(null);
  const [bindings, setBindings] = useState<SyncBindingDto[]>([]);
  const [tenants, setTenants] = useState<AdminTenantDto[]>([]);
  const [v2Clinics, setV2Clinics] = useState<V2ClinicOptionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rosterSearch, setRosterSearch] = useState('');
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    initialSelectedBindingId
  );
  const [activeDetailTrack, setActiveDetailTrack] = useState<SyncTrack>('TRACK1_CLINIC');
  const [detailsBindingId, setDetailsBindingId] = useState<string | null>(null);
  const [runs, setRuns] = useState<SyncRunRecordDto[]>([]);
  const [runModeFilter, setRunModeFilter] = useState<string>('');
  const [conflicts, setConflicts] = useState<SyncConflictDto[]>([]);
  const [conflictsTotal, setConflictsTotal] = useState<number | null>(null);
  const [conflictsOffset, setConflictsOffset] = useState(0);
  const [conflictsHasMore, setConflictsHasMore] = useState(false);
  const [conflictStatusFilter, setConflictStatusFilter] = useState<string>('');
  const [parity, setParity] = useState<ParityReportDto | null>(null);
  const [selectedRunDiffs, setSelectedRunDiffs] = useState<SyncDiffsState | null>(null);
  const [storageProviderFilter, setStorageProviderFilter] = useState<StorageProviderFilter>('ALL');
  const [storageTargetPlaneFilter, setStorageTargetPlaneFilter] =
    useState<StorageTargetPlaneFilter>('BOTH');
  const [storageObjects, setStorageObjects] = useState<StorageObjectItemDto[]>([]);
  const [storageObjectsTotal, setStorageObjectsTotal] = useState(0);
  const [storageFailedRetryableCount, setStorageFailedRetryableCount] = useState<number | null>(
    null
  );
  const [storageObjectsOffset, setStorageObjectsOffset] = useState(0);
  const [storageStatusFilter, setStorageStatusFilter] = useState('ATTENTION');
  const [storagePlaneFilter, setStoragePlaneFilter] = useState('');
  const [storageSourceFilter, setStorageSourceFilter] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [verboseLogsOpen, setVerboseLogsOpen] = useState(false);

  // Unified new connection form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameTouchedByUser, setNameTouchedByUser] = useState(false);
  const [newV1TenantId, setNewV1TenantId] = useState<number | ''>('');
  const [newV1ClinicId, setNewV1ClinicId] = useState<number | ''>('');
  const [newV1OrgId, setNewV1OrgId] = useState<number | ''>('');
  const [newV2TenantId, setNewV2TenantId] = useState('');
  const [v2TenantManualMode, setV2TenantManualMode] = useState(false);
  const [newV2ClinicId, setNewV2ClinicId] = useState('');
  const [v2ClinicManualMode, setV2ClinicManualMode] = useState(false);
  const [createIncludeStorage, setCreateIncludeStorage] = useState(false);

  // Confirmation & edit modals
  const [forceV1Target, setForceV1Target] = useState<SyncConflictDto | null>(null);
  const [diffTargetConflict, setDiffTargetConflict] = useState<SyncConflictDto | null>(null);
  const [conflictDetail, setConflictDetail] = useState<ConflictDetailDto | null>(null);
  const [conflictDetailLoading, setConflictDetailLoading] = useState(false);
  const [conflictDetailError, setConflictDetailError] = useState<string | null>(null);
  const [conflictDetailRevealing, setConflictDetailRevealing] = useState(false);
  const [exportingReportFormat, setExportingReportFormat] = useState<'csv' | 'json' | null>(null);
  const conflictDetailReqSeqRef = useRef(0);
  const [freezeTarget, setFreezeTarget] = useState<SyncBindingDto | null>(null);
  const [freezeToken, setFreezeToken] = useState('');
  const [freezeReason, setFreezeReason] = useState('');
  const [editTargetConnectionId, setEditTargetConnectionId] = useState<string | null>(null);
  const [trackingScriptModalTab, setTrackingScriptModalTab] = useState<'install' | 'uninstall' | null>(null);
  const [trackingScripts, setTrackingScripts] = useState<TrackingSqlScriptsResponseDto | null>(null);
  const [trackingScriptsLoading, setTrackingScriptsLoading] = useState(false);
  const [trackingScriptsError, setTrackingScriptsError] = useState<string | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [runtimeSettings, setRuntimeSettings] = useState<SyncRuntimeSettingsDto | null>(null);
  const [runtimeSettingsLoading, setRuntimeSettingsLoading] = useState(false);
  const [runtimeSettingsSaving, setRuntimeSettingsSaving] = useState(false);
  const [runtimeSettingsError, setRuntimeSettingsError] = useState<string | null>(null);
  const [mappingGuideOpen, setMappingGuideOpen] = useState(false);
  const [mappingGuide, setMappingGuide] = useState<MappingGuideResponseDto | null>(null);
  const [mappingGuideLoading, setMappingGuideLoading] = useState(false);
  const [mappingGuideError, setMappingGuideError] = useState<string | null>(null);

  const loadMappingGuide = useCallback(async () => {
    try {
      setMappingGuideLoading(true);
      setMappingGuideError(null);
      const data = await v1SyncService.getMappingGuide();
      setMappingGuide(data);
    } catch (err: unknown) {
      setMappingGuideError(
        extractApiErrorMessage(err, 'Unable to load the v1 to v2 mapping guide.', true)
      );
    } finally {
      setMappingGuideLoading(false);
    }
  }, []);

  const handleOpenMappingGuide = useCallback(() => {
    setMappingGuideOpen(true);
    if (!mappingGuide && !mappingGuideLoading) {
      void loadMappingGuide();
    }
  }, [mappingGuide, mappingGuideLoading, loadMappingGuide]);

  const loadRuntimeSettings = useCallback(async () => {
    try {
      setRuntimeSettingsLoading(true);
      setRuntimeSettingsError(null);
      const data = await v1SyncService.getSettings();
      setRuntimeSettings(data);
    } catch (err: unknown) {
      setRuntimeSettingsError(
        extractApiErrorMessage(err, 'Unable to load migration settings.', true)
      );
    } finally {
      setRuntimeSettingsLoading(false);
    }
  }, []);

  const handleOpenSettings = useCallback(() => {
    setSettingsModalOpen(true);
    void loadRuntimeSettings();
  }, [loadRuntimeSettings]);

  const loadTrackingScripts = useCallback(async () => {
    try {
      setTrackingScriptsLoading(true);
      setTrackingScriptsError(null);
      const data = await v1SyncService.getTrackingScripts();
      setTrackingScripts(data);
    } catch (err: unknown) {
      setTrackingScriptsError(
        extractApiErrorMessage(err, 'Unable to load tracking SQL scripts.')
      );
    } finally {
      setTrackingScriptsLoading(false);
    }
  }, []);

  const handleOpenTrackingScript = useCallback(
    (tab: 'install' | 'uninstall' = 'install') => {
      setTrackingScriptModalTab(tab);
      if (!trackingScripts && !trackingScriptsLoading) {
        void loadTrackingScripts();
      }
    },
    [trackingScripts, trackingScriptsLoading, loadTrackingScripts]
  );

  const unifiedConnections = useMemo(() => groupUnifiedConnections(bindings), [bindings]);

  const selectedConnection = useMemo(
    () => findConnectionForId(unifiedConnections, selectedConnectionId),
    [unifiedConnections, selectedConnectionId]
  );

  const editTargetConnection = useMemo(
    () => findConnectionForId(unifiedConnections, editTargetConnectionId),
    [unifiedConnections, editTargetConnectionId]
  );

  const activeBinding = useMemo(() => {
    if (!selectedConnection) return null;
    if (activeDetailTrack === 'TRACK1_CLINIC') return selectedConnection.clinicBinding;
    if (activeDetailTrack === 'TRACK2_PATIENT') return selectedConnection.patientBinding;
    return selectedConnection.storageBinding;
  }, [selectedConnection, activeDetailTrack]);

  const activeBindingId = activeBinding?.id ?? null;

  const activeBindingIdRef = useRef<string | null>(activeBindingId);
  activeBindingIdRef.current = activeBindingId;
  const activeBindingRef = useRef<SyncBindingDto | null>(activeBinding);
  activeBindingRef.current = activeBinding;
  const selectedConnectionIdRef = useRef<string | null>(selectedConnectionId);
  selectedConnectionIdRef.current = selectedConnectionId;
  const activeDetailTrackRef = useRef<SyncTrack>(activeDetailTrack);
  activeDetailTrackRef.current = activeDetailTrack;
  const userChangedTrackRef = useRef(false);
  const runsRequestSeqRef = useRef(0);
  const conflictsRequestSeqRef = useRef(0);
  const parityRequestSeqRef = useRef(0);
  const storageObjectsRequestSeqRef = useRef(0);
  const diffsRequestSeqRef = useRef(0);
  const conflictsOffsetRef = useRef(conflictsOffset);
  conflictsOffsetRef.current = conflictsOffset;
  const runModeFilterRef = useRef(runModeFilter);
  runModeFilterRef.current = runModeFilter;
  const conflictStatusFilterRef = useRef(conflictStatusFilter);
  conflictStatusFilterRef.current = conflictStatusFilter;
  const storageObjectsOffsetRef = useRef(storageObjectsOffset);
  storageObjectsOffsetRef.current = storageObjectsOffset;
  const storageStatusFilterRef = useRef(storageStatusFilter);
  storageStatusFilterRef.current = storageStatusFilter;
  const storagePlaneFilterRef = useRef(storagePlaneFilter);
  storagePlaneFilterRef.current = storagePlaneFilter;
  const storageSourceFilterRef = useRef(storageSourceFilter);
  storageSourceFilterRef.current = storageSourceFilter;
  const notifiedCompletedRunsRef = useRef<Set<string>>(new Set());
  const observedRunningRunIdsRef = useRef<Set<string>>(new Set());
  const lastStatusRef = useRef<SyncSystemStatusDto | null>(null);
  const lastStatusFingerprintRef = useRef<string>('');
  const lastBindingFingerprintRef = useRef<string>('');
  const lastRunsHeadFingerprintRef = useRef<string>('');
  const selectedRunDiffsRef = useRef<SyncDiffsState | null>(selectedRunDiffs);
  selectedRunDiffsRef.current = selectedRunDiffs;
  const realtimePollInFlightRef = useRef(false);
  const lastFocusRevalidateAtRef = useRef(0);

  const { loading: isAuthLoading, hasPermission } = resolveV1SyncPermissionState(
    adminProfile,
    permissionsLoading
  );

  // Fetch current admin profile once on mount (unless provided by test)
  useEffect(() => {
    if (initialProfile !== undefined || initialPermissionsLoading !== undefined) {
      return;
    }
    let cancelled = false;
    setPermissionsLoading(true);
    setProfileError(null);
    adminService
      .getMe()
      .then((me) => {
        if (!cancelled) setAdminProfile(me);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setAdminProfile(null);
          setProfileError(
            err instanceof Error ? err.message : 'Unable to verify administrative permissions.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPermissionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialProfile, initialPermissionsLoading]);

  const applyFetchedBindings = useCallback((nextBindings: SyncBindingDto[]) => {
    const nextUnified = groupUnifiedConnections(nextBindings);
    setBindings(nextBindings);
    const prevSelectedId = selectedConnectionIdRef.current;
    if (!prevSelectedId) {
      setSelectedConnectionId(null);
      lastBindingFingerprintRef.current = '';
      return;
    }
    const match = findConnectionForId(nextUnified, prevSelectedId);
    if (!match) {
      selectedConnectionIdRef.current = null;
      setSelectedConnectionId(null);
      lastBindingFingerprintRef.current = '';
      return;
    }

    const isDirectSubBindingSelection =
      prevSelectedId !== match.id &&
      (match.clinicBinding?.id === prevSelectedId ||
        match.patientBinding?.id === prevSelectedId ||
        match.storageBinding?.id === prevSelectedId);

    let effectiveTrack = activeDetailTrackRef.current;
    if (isDirectSubBindingSelection) {
      effectiveTrack =
        match.clinicBinding?.id === prevSelectedId
          ? 'TRACK1_CLINIC'
          : match.patientBinding?.id === prevSelectedId
            ? 'TRACK2_PATIENT'
            : 'TRACK3_STORAGE';
      activeDetailTrackRef.current = effectiveTrack;
      setActiveDetailTrack(effectiveTrack);
    } else if (!userChangedTrackRef.current) {
      const currentTrackHasBinding =
        (effectiveTrack === 'TRACK1_CLINIC' && Boolean(match.clinicBinding)) ||
        (effectiveTrack === 'TRACK2_PATIENT' && Boolean(match.patientBinding)) ||
        (effectiveTrack === 'TRACK3_STORAGE' && Boolean(match.storageBinding));
      if (!currentTrackHasBinding) {
        effectiveTrack = match.clinicBinding
          ? 'TRACK1_CLINIC'
          : match.patientBinding
            ? 'TRACK2_PATIENT'
            : 'TRACK3_STORAGE';
        activeDetailTrackRef.current = effectiveTrack;
        setActiveDetailTrack(effectiveTrack);
      }
    }

    if (prevSelectedId !== match.id) {
      selectedConnectionIdRef.current = match.id;
      setSelectedConnectionId(match.id);
    }

    const matchedBinding =
      effectiveTrack === 'TRACK1_CLINIC'
        ? match.clinicBinding
        : effectiveTrack === 'TRACK2_PATIENT'
          ? match.patientBinding
          : match.storageBinding;
    lastBindingFingerprintRef.current = buildBindingStateFingerprint(matchedBinding);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [tenantsRes, portalClinicsRes, statusRes, bindingsRes, catalogRes, v2ClinicsRes] =
        await Promise.allSettled([
          adminService.getTenants(),
          adminService.getAdminClinics(),
          v1SyncService.getStatus(),
          v1SyncService.listBindings(),
          v1SyncService.getCatalog(),
          v1SyncService.listV2Clinics(),
        ]);

      if (tenantsRes.status === 'fulfilled') setTenants(tenantsRes.value);
      const mergedFetchedClinics: V2ClinicOptionDto[] = [
        ...(portalClinicsRes.status === 'fulfilled' ? portalClinicsRes.value : []),
        ...(v2ClinicsRes.status === 'fulfilled' ? v2ClinicsRes.value : []),
      ];
      if (portalClinicsRes.status === 'fulfilled' || v2ClinicsRes.status === 'fulfilled') {
        setV2Clinics(mergedFetchedClinics);
      }
      if (statusRes.status === 'fulfilled') {
        lastStatusRef.current = statusRes.value;
        lastStatusFingerprintRef.current = buildSyncStatusFingerprint(statusRes.value);
        setStatus(statusRes.value);
      }
      if (bindingsRes.status === 'fulfilled') {
        applyFetchedBindings(bindingsRes.value);
      } else {
        setError(bindingsRes.reason?.message || 'Unable to connect to the sync service.');
      }
      if (catalogRes.status === 'fulfilled') setCatalog(catalogRes.value);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load migration console.');
    } finally {
      setLoading(false);
    }
  }, [applyFetchedBindings]);

  const loadBindingDetails = useCallback(
    async (
      bindingId: string,
      opts?: {
        track?: SyncTrack;
        runMode?: string;
        conflictsOffset?: number;
        conflictStatus?: string;
        includeConflicts?: boolean;
        includeParity?: boolean;
        storageOffset?: number;
        storageStatus?: string;
        storagePlane?: string;
        storageSource?: string;
        includeStorageObjects?: boolean;
      }
    ) => {
      const runsSeq = ++runsRequestSeqRef.current;
      const track = opts?.track ?? activeDetailTrackRef.current;
      const isStorage = track === 'TRACK3_STORAGE';
      const runMode = opts?.runMode ?? runModeFilterRef.current;
      const offset = opts?.conflictsOffset ?? conflictsOffsetRef.current;
      const statusFilter = opts?.conflictStatus ?? conflictStatusFilterRef.current;
      const includeConflicts = !isStorage && (opts?.includeConflicts ?? true);
      const includeParity = opts?.includeParity ?? true;
      const storageOffset = opts?.storageOffset ?? storageObjectsOffsetRef.current;
      const storageStatus = opts?.storageStatus ?? storageStatusFilterRef.current;
      const storagePlane = opts?.storagePlane ?? storagePlaneFilterRef.current;
      const storageSource = opts?.storageSource ?? storageSourceFilterRef.current;
      const includeStorageObjects = isStorage && (opts?.includeStorageObjects ?? true);
      const conflictsSeq = includeConflicts
        ? ++conflictsRequestSeqRef.current
        : conflictsRequestSeqRef.current;
      const paritySeq = includeParity
        ? ++parityRequestSeqRef.current
        : parityRequestSeqRef.current;
      const storageSeq = includeStorageObjects
        ? ++storageObjectsRequestSeqRef.current
        : storageObjectsRequestSeqRef.current;
      try {
        const [runsRes, conflictsRes, parityRes, storageRes] = await Promise.allSettled([
          runMode
            ? v1SyncService.listRuns(bindingId, 15, runMode)
            : v1SyncService.listRuns(bindingId, 15),
          includeConflicts
            ? v1SyncService.listConflicts(bindingId, {
                limit: CONFLICTS_PAGE_SIZE,
                offset,
                status: statusFilter || undefined,
              })
            : Promise.resolve(null),
          includeParity ? v1SyncService.getParityReport(bindingId) : Promise.resolve(null),
          includeStorageObjects
            ? v1SyncService.getStorageObjects(bindingId, {
                status: storageStatus || undefined,
                ...(storageSource ? { provider: storageSource } : {}),
                plane: storagePlane || undefined,
                limit: STORAGE_PAGE_SIZE,
                offset: storageOffset,
              })
            : Promise.resolve(null),
        ]);
        if (activeBindingIdRef.current !== bindingId) {
          return;
        }
        const runsAreFresh = runsSeq === runsRequestSeqRef.current;
        const freshRuns = runsAreFresh && runsRes.status === 'fulfilled' ? runsRes.value : null;
        if (freshRuns) {
          for (const run of freshRuns) {
            if (run.status === 'RUNNING') {
              observedRunningRunIdsRef.current.add(run.id);
            }
          }
        }
        const settledObservedRun =
          freshRuns?.find(
            (r) =>
              r.status !== 'RUNNING' &&
              observedRunningRunIdsRef.current.has(r.id) &&
              !notifiedCompletedRunsRef.current.has(r.id)
          ) ?? null;
        const justFinishedRun =
          Boolean(freshRuns) &&
          !includeParity &&
          !freshRuns!.some((r) => r.status === 'RUNNING') &&
          Boolean(settledObservedRun);

        let finalParity =
          includeParity &&
          paritySeq === parityRequestSeqRef.current &&
          parityRes.status === 'fulfilled'
            ? parityRes.value
            : null;
        let finalConflicts =
          includeConflicts &&
          conflictsSeq === conflictsRequestSeqRef.current &&
          conflictsRes.status === 'fulfilled'
            ? conflictsRes.value
            : null;
        let finalStorage =
          includeStorageObjects &&
          storageSeq === storageObjectsRequestSeqRef.current &&
          storageRes.status === 'fulfilled'
            ? storageRes.value
            : null;
        let finalParitySeq = paritySeq;
        let finalConflictsSeq = conflictsSeq;
        let finalStorageSeq = storageSeq;

        if (justFinishedRun && settledObservedRun) {
          const settledRun = settledObservedRun;
          observedRunningRunIdsRef.current.delete(settledRun.id);
          if (!notifiedCompletedRunsRef.current.has(settledRun.id)) {
            notifiedCompletedRunsRef.current.add(settledRun.id);
            const runLabel = formatSyncRunMode(settledRun.mode, settledRun.sampleLimit);
            if (settledRun.status === 'FAILED') {
              const rawErr = settledRun.errorMessage || `${runLabel} failed.`;
              toast.error(isStorage ? sanitizeStorageDisplayText(rawErr) : rawErr);
            } else {
              toast.success(`${runLabel} completed.`);
            }
          }
          const settledParitySeq = ++parityRequestSeqRef.current;
          const settledConflictsSeq = !isStorage
            ? ++conflictsRequestSeqRef.current
            : conflictsRequestSeqRef.current;
          const settledStorageSeq = isStorage
            ? ++storageObjectsRequestSeqRef.current
            : storageObjectsRequestSeqRef.current;
          const settledConflictsOffset = conflictsOffsetRef.current;
          const settledConflictStatus = conflictStatusFilterRef.current;
          const settledStorageOffset = storageObjectsOffsetRef.current;
          const settledStorageStatus = storageStatusFilterRef.current;
          const settledStoragePlane = storagePlaneFilterRef.current;
          const settledStorageSource = storageSourceFilterRef.current;

          const [settledParityRes, settledConflictsRes, settledStorageRes] =
            await Promise.allSettled([
              v1SyncService.getParityReport(bindingId),
              !isStorage
                ? v1SyncService.listConflicts(bindingId, {
                    limit: CONFLICTS_PAGE_SIZE,
                    offset: settledConflictsOffset,
                    status: settledConflictStatus || undefined,
                  })
                : Promise.resolve(null),
              isStorage
                ? v1SyncService.getStorageObjects(bindingId, {
                    status: settledStorageStatus || undefined,
                    ...(settledStorageSource ? { provider: settledStorageSource } : {}),
                    plane: settledStoragePlane || undefined,
                    limit: STORAGE_PAGE_SIZE,
                    offset: settledStorageOffset,
                  })
                : Promise.resolve(null),
            ]);
          if (activeBindingIdRef.current !== bindingId) {
            return;
          }
          if (
            settledParitySeq === parityRequestSeqRef.current &&
            settledParityRes.status === 'fulfilled'
          ) {
            finalParity = settledParityRes.value;
            finalParitySeq = settledParitySeq;
          }
          if (
            !isStorage &&
            settledConflictsSeq === conflictsRequestSeqRef.current &&
            settledConflictsRes.status === 'fulfilled'
          ) {
            finalConflicts = settledConflictsRes.value;
            finalConflictsSeq = settledConflictsSeq;
          }
          if (
            isStorage &&
            settledStorageSeq === storageObjectsRequestSeqRef.current &&
            settledStorageRes.status === 'fulfilled'
          ) {
            finalStorage = settledStorageRes.value;
            finalStorageSeq = settledStorageSeq;
          }
        }

        if (runsAreFresh) {
          setDetailsBindingId(bindingId);
          if (freshRuns) {
            lastRunsHeadFingerprintRef.current = buildRunsHeadFingerprint(freshRuns);
            setRuns(freshRuns);
          }
        } else if (
          (finalConflicts && finalConflictsSeq === conflictsRequestSeqRef.current) ||
          (finalParity && finalParitySeq === parityRequestSeqRef.current) ||
          (finalStorage && finalStorageSeq === storageObjectsRequestSeqRef.current)
        ) {
          setDetailsBindingId(bindingId);
        }
        if (finalConflicts && finalConflictsSeq === conflictsRequestSeqRef.current) {
          setConflicts(finalConflicts.items);
          setConflictsTotal(finalConflicts.total);
          setConflictsHasMore(finalConflicts.hasMore);
        }
        if (finalParity && finalParitySeq === parityRequestSeqRef.current) {
          setParity(finalParity);
        }
        if (finalStorage && finalStorageSeq === storageObjectsRequestSeqRef.current) {
          setStorageObjects(finalStorage.items);
          setStorageObjectsTotal(finalStorage.totalCount);
          setStorageFailedRetryableCount(
            typeof finalStorage.failedRetryableCount === 'number'
              ? finalStorage.failedRetryableCount
              : null
          );
        }
      } catch {
        // Non-fatal detail refresh error
      }
    },
    []
  );

  useEffect(() => {
    if (!isAuthLoading && hasPermission) {
      void loadAll();
    }
  }, [isAuthLoading, hasPermission, loadAll]);

  useEffect(() => {
    if (!hasPermission) return;
    runsRequestSeqRef.current += 1;
    conflictsRequestSeqRef.current += 1;
    parityRequestSeqRef.current += 1;
    storageObjectsRequestSeqRef.current += 1;
    diffsRequestSeqRef.current += 1;
    setDetailsBindingId(null);
    setRuns([]);
    lastRunsHeadFingerprintRef.current = '';
    lastBindingFingerprintRef.current = buildBindingStateFingerprint(activeBindingRef.current);
    setRunModeFilter('');
    runModeFilterRef.current = '';
    setConflicts([]);
    setConflictsTotal(null);
    setConflictsHasMore(false);
    setConflictsOffset(0);
    conflictsOffsetRef.current = 0;
    setConflictStatusFilter('');
    conflictStatusFilterRef.current = '';
    setParity(null);
    setSelectedRunDiffs(null);
    conflictDetailReqSeqRef.current += 1;
    setDiffTargetConflict(null);
    setConflictDetail(null);
    setConflictDetailError(null);
    setConflictDetailLoading(false);
    setConflictDetailRevealing(false);
    setStorageObjects([]);
    setStorageObjectsTotal(0);
    setStorageFailedRetryableCount(null);
    setStorageObjectsOffset(0);
    storageObjectsOffsetRef.current = 0;
    setStorageStatusFilter('ATTENTION');
    storageStatusFilterRef.current = 'ATTENTION';
    setStoragePlaneFilter('');
    storagePlaneFilterRef.current = '';
    setStorageSourceFilter('');
    storageSourceFilterRef.current = '';
    if (activeBindingId) {
      void loadBindingDetails(activeBindingId, {
        track: activeBinding?.track ?? activeDetailTrackRef.current,
        runMode: '',
        conflictsOffset: 0,
        conflictStatus: '',
        storageOffset: 0,
        storageStatus: 'ATTENTION',
        storagePlane: '',
        storageSource: '',
      });
    }
  }, [hasPermission, activeBindingId, activeBinding?.track, loadBindingDetails]);

  useEffect(() => {
    if (
      (!forceV1Target &&
        !freezeTarget &&
        !editTargetConnectionId &&
        !trackingScriptModalTab &&
        !settingsModalOpen &&
        !mappingGuideOpen &&
        !selectedRunDiffs) ||
      typeof document === 'undefined'
    ) {
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyAction && !runtimeSettingsSaving) {
        setForceV1Target(null);
        setFreezeTarget(null);
        setFreezeToken('');
        setFreezeReason('');
        setEditTargetConnectionId(null);
        setTrackingScriptModalTab(null);
        setSettingsModalOpen(false);
        setMappingGuideOpen(false);
        if (selectedRunDiffs) {
          diffsRequestSeqRef.current += 1;
          setSelectedRunDiffs(null);
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [
    forceV1Target,
    freezeTarget,
    editTargetConnectionId,
    trackingScriptModalTab,
    settingsModalOpen,
    mappingGuideOpen,
    selectedRunDiffs,
    busyAction,
    runtimeSettingsSaving,
  ]);

  const visibleRuns = useMemo(
    () => (activeBindingId && detailsBindingId === activeBindingId ? runs : []),
    [runs, detailsBindingId, activeBindingId]
  );

  const visibleConflicts = useMemo(
    () => (activeBindingId && detailsBindingId === activeBindingId ? conflicts : []),
    [conflicts, detailsBindingId, activeBindingId]
  );

  const visibleParity = useMemo(
    () => (activeBindingId && detailsBindingId === activeBindingId ? parity : null),
    [parity, detailsBindingId, activeBindingId]
  );

  const visibleStorageObjects = useMemo(
    () => (activeBindingId && detailsBindingId === activeBindingId ? storageObjects : []),
    [storageObjects, detailsBindingId, activeBindingId]
  );

  const visibleStorageObjectsTotal = useMemo(
    () => (activeBindingId && detailsBindingId === activeBindingId ? storageObjectsTotal : 0),
    [storageObjectsTotal, detailsBindingId, activeBindingId]
  );

  const visibleStorageFailedRetryableCount = useMemo(
    () =>
      activeBindingId && detailsBindingId === activeBindingId ? storageFailedRetryableCount : null,
    [storageFailedRetryableCount, detailsBindingId, activeBindingId]
  );

  const v2ClinicOptions = useMemo(
    () => mergeV2ClinicOptions(v2Clinics, bindings),
    [v2Clinics, bindings]
  );

  const tenantScopedV2Clinics = useMemo(
    () => filterV2ClinicsForTenant(v2ClinicOptions, newV2TenantId, tenants),
    [v2ClinicOptions, newV2TenantId, tenants]
  );

  const v1ClinicById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of catalog?.clinics ?? []) map.set(c.id, c.name);
    return map;
  }, [catalog]);

  const v1OrgById = useMemo(() => {
    const map = new Map<number, string>();
    for (const o of catalog?.organizations ?? []) map.set(o.id, o.name);
    return map;
  }, [catalog]);

  const v2TenantNameBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tenants) {
      map.set(t.tenantSlug.toLowerCase(), t.clinicName || t.name);
      map.set(t.id.toLowerCase(), t.clinicName || t.name);
    }
    return map;
  }, [tenants]);

  const v2ClinicNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of v2ClinicOptions) map.set(c.id.toLowerCase(), c.name);
    return map;
  }, [v2ClinicOptions]);

  const filteredRosterConnections = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return unifiedConnections;
    return unifiedConnections.filter((conn) => {
      const sourceClinic =
        conn.v1ClinicId !== null
          ? v1ClinicById.get(conn.v1ClinicId) ?? `Clinic #${conn.v1ClinicId}`
          : '';
      const sourceOrg =
        conn.v1OrgId !== null ? v1OrgById.get(conn.v1OrgId) ?? `Org #${conn.v1OrgId}` : '';
      const destTenant = conn.v2TenantId
        ? v2TenantNameBySlug.get(conn.v2TenantId.toLowerCase()) ?? conn.v2TenantId
        : '';
      const destClinic = conn.v2ClinicId
        ? v2ClinicNameById.get(conn.v2ClinicId.toLowerCase()) ?? conn.v2ClinicId
        : '';
      return [
        conn.name,
        conn.clinicBinding?.name ?? '',
        conn.patientBinding?.name ?? '',
        conn.storageBinding?.name ?? '',
        sourceClinic,
        sourceOrg,
        destTenant,
        destClinic,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [
    unifiedConnections,
    rosterSearch,
    v1ClinicById,
    v1OrgById,
    v2TenantNameBySlug,
    v2ClinicNameById,
  ]);

  const connectionSwitcherOptions = useMemo<SelectFieldOption[]>(
    () =>
      unifiedConnections.map((conn) => {
        const trackBadges: string[] = [];
        if (conn.clinicBinding) trackBadges.push('Clinic');
        if (conn.patientBinding) trackBadges.push('Patients');
        if (conn.storageBinding) trackBadges.push('Files');
        return {
          value: conn.id,
          label: conn.name,
          badge: trackBadges.join(' + ') || 'Sync',
          description:
            conn.totalOpenConflicts > 0
              ? `${conn.totalOpenConflicts.toLocaleString()} to review`
              : conn.clinicBinding?.autoSyncEnabled ||
                  conn.patientBinding?.autoSyncEnabled ||
                  conn.storageBinding?.autoSyncEnabled
                ? 'Auto-Sync On'
                : 'Manual',
        };
      }),
    [unifiedConnections]
  );

  const activeRunningRun = useMemo(
    () =>
      activeBindingId && detailsBindingId === activeBindingId && !activeBinding?.isFrozen
        ? runs.find((r) => r.status === 'RUNNING') ?? null
        : null,
    [runs, detailsBindingId, activeBindingId, activeBinding?.isFrozen]
  );

  const hasRunningRun = Boolean(activeRunningRun);

  const wasRunningRef = useRef<{ bindingId: string | null; wasRunning: boolean }>({
    bindingId: null,
    wasRunning: false,
  });
  useEffect(() => {
    const prev = wasRunningRef.current;
    if (
      prev.bindingId === activeBindingId &&
      prev.wasRunning &&
      !hasRunningRun &&
      hasPermission
    ) {
      void loadAll();
      if (activeBindingId) {
        void loadBindingDetails(activeBindingId, {
          includeConflicts: true,
          includeParity: true,
          includeStorageObjects: true,
        });
      }
    }
    wasRunningRef.current = { bindingId: activeBindingId, wasRunning: hasRunningRun };
  }, [activeBindingId, hasRunningRun, hasPermission, loadAll, loadBindingDetails]);

  const revalidateRealtimeState = useCallback(async () => {
    if (!hasPermission || realtimePollInFlightRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    realtimePollInFlightRef.current = true;
    const targetBindingId = activeBindingIdRef.current;
    const targetTrack = activeDetailTrackRef.current;
    const targetRunMode = runModeFilterRef.current;
    const runsSeq = targetBindingId ? ++runsRequestSeqRef.current : runsRequestSeqRef.current;

    try {
      const [statusRes, bindingsRes, runsRes] = await Promise.allSettled([
        v1SyncService.getStatus(),
        v1SyncService.listBindings(),
        targetBindingId
          ? targetRunMode
            ? v1SyncService.listRuns(targetBindingId, 15, targetRunMode)
            : v1SyncService.listRuns(targetBindingId, 15)
          : Promise.resolve(null),
      ]);

      let statusChanged = false;
      let catalogInvalidated = false;
      if (statusRes.status === 'fulfilled') {
        const nextStatus = statusRes.value;
        const prevStatus = lastStatusRef.current;
        const prevFp = lastStatusFingerprintRef.current;
        const nextFp = buildSyncStatusFingerprint(nextStatus);
        statusChanged = Boolean(prevFp) && nextFp !== prevFp;
        catalogInvalidated =
          Boolean(prevStatus) &&
          (prevStatus!.v1SourceConnected !== nextStatus.v1SourceConnected ||
            prevStatus!.v1SyncTriggersInstalled !== nextStatus.v1SyncTriggersInstalled ||
            prevStatus!.v1ChangelogMaxSeq !== nextStatus.v1ChangelogMaxSeq);
        lastStatusRef.current = nextStatus;
        lastStatusFingerprintRef.current = nextFp;
        setStatus(nextStatus);
      }

      let bindingChanged = false;
      if (bindingsRes.status === 'fulfilled') {
        const prevBindingFp = lastBindingFingerprintRef.current;
        const nextBindings = bindingsRes.value;
        const matchedNextBinding = targetBindingId
          ? nextBindings.find((b) => b.id === targetBindingId) ?? null
          : null;
        const nextBindingFp = buildBindingStateFingerprint(matchedNextBinding);
        bindingChanged =
          Boolean(targetBindingId) &&
          targetBindingId === activeBindingIdRef.current &&
          Boolean(prevBindingFp) &&
          nextBindingFp !== prevBindingFp;
        applyFetchedBindings(nextBindings);
      }

      let runsChanged = false;
      if (
        targetBindingId &&
        targetBindingId === activeBindingIdRef.current &&
        runsSeq === runsRequestSeqRef.current &&
        runsRes.status === 'fulfilled' &&
        Array.isArray(runsRes.value)
      ) {
        const freshRuns = runsRes.value;
        const prevRunsFp = lastRunsHeadFingerprintRef.current;
        const nextRunsFp = buildRunsHeadFingerprint(freshRuns);
        runsChanged = Boolean(prevRunsFp) && nextRunsFp !== prevRunsFp;
        for (const run of freshRuns) {
          if (run.status === 'RUNNING') {
            observedRunningRunIdsRef.current.add(run.id);
          }
        }
        const settledRun =
          freshRuns.find(
            (r) =>
              r.status !== 'RUNNING' &&
              observedRunningRunIdsRef.current.has(r.id) &&
              !notifiedCompletedRunsRef.current.has(r.id)
          ) ?? null;
        if (settledRun) {
          observedRunningRunIdsRef.current.delete(settledRun.id);
          notifiedCompletedRunsRef.current.add(settledRun.id);
          const runLabel = formatSyncRunMode(settledRun.mode, settledRun.sampleLimit);
          if (settledRun.status === 'FAILED') {
            const rawErr = settledRun.errorMessage || `${runLabel} failed.`;
            toast.error(
              targetTrack === 'TRACK3_STORAGE' ? sanitizeStorageDisplayText(rawErr) : rawErr
            );
          } else {
            toast.success(`${runLabel} completed.`);
          }
        }
        lastRunsHeadFingerprintRef.current = nextRunsFp;
        setDetailsBindingId(targetBindingId);
        setRuns(freshRuns);
      }

      const shouldInvalidateDetails = statusChanged || bindingChanged || runsChanged;
      if (shouldInvalidateDetails) {
        if (catalogInvalidated) {
          void v1SyncService
            .getCatalog()
            .then((nextCatalog) => setCatalog(nextCatalog))
            .catch(() => {
              // Non-fatal background catalog refresh error
            });
        }
        if (targetBindingId && targetBindingId === activeBindingIdRef.current) {
          await loadBindingDetails(targetBindingId, {
            track: targetTrack,
            includeConflicts: true,
            includeParity: true,
            includeStorageObjects: true,
          });
          const openDiffs = selectedRunDiffsRef.current;
          if (openDiffs?.scope === 'binding' && openDiffs.targetId === targetBindingId) {
            const diffSeq = ++diffsRequestSeqRef.current;
            void v1SyncService
              .listBindingDiffs(targetBindingId, DIFFS_PAGE_SIZE, openDiffs.offset)
              .then((page) => {
                if (
                  diffSeq === diffsRequestSeqRef.current &&
                  activeBindingIdRef.current === targetBindingId
                ) {
                  setSelectedRunDiffs({
                    scope: 'binding',
                    targetId: targetBindingId,
                    diffs: page.items,
                    total: page.total,
                    offset: page.offset,
                    hasMore: page.hasMore,
                  });
                }
              })
              .catch(() => {
                // Non-fatal background diff drawer refresh error
              });
          }
        }
      }
    } catch {
      // Non-fatal background realtime poll error
    } finally {
      realtimePollInFlightRef.current = false;
    }
  }, [hasPermission, applyFetchedBindings, loadBindingDetails]);

  useEffect(() => {
    if (!hasPermission || !activeBindingId || !hasRunningRun) return;
    let inFlight = false;
    let tick = 0;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      tick += 1;
      const refreshHeavy = tick % 3 === 0;
      if (refreshHeavy) {
        void v1SyncService
          .getStatus()
          .then((nextStatus) => {
            lastStatusRef.current = nextStatus;
            lastStatusFingerprintRef.current = buildSyncStatusFingerprint(nextStatus);
            setStatus(nextStatus);
          })
          .catch(() => {
            // Non-fatal live status tick error
          });
        void v1SyncService
          .listBindings()
          .then((nextBindings) => applyFetchedBindings(nextBindings))
          .catch(() => {
            // Non-fatal live bindings tick error
          });
      }
      void loadBindingDetails(activeBindingId, {
        includeConflicts: refreshHeavy,
        includeParity: refreshHeavy,
        includeStorageObjects: refreshHeavy,
      }).finally(() => {
        inFlight = false;
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [hasPermission, activeBindingId, hasRunningRun, applyFetchedBindings, loadBindingDetails]);

  // Continuous lightweight realtime revalidation when idle (visible tab only; self-scheduling setTimeout prevents overlaps)
  useEffect(() => {
    if (!hasPermission || hasRunningRun) return;
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (cancelled) return;
      timerId = setTimeout(() => {
        if (cancelled) return;
        void revalidateRealtimeState().finally(() => {
          scheduleNext();
        });
      }, 4000);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [hasPermission, hasRunningRun, activeBindingId, revalidateRealtimeState]);

  // Instant revalidation when returning focus / visibility to this browser tab (e.g. after running SQL or editing v1)
  useEffect(() => {
    if (!hasPermission) return;

    const triggerImmediateRevalidate = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastFocusRevalidateAtRef.current < 1000) return;
      lastFocusRevalidateAtRef.current = now;
      void revalidateRealtimeState();
    };

    const canListenWindow =
      typeof window !== 'undefined' && typeof window.addEventListener === 'function';
    const canListenDoc =
      typeof document !== 'undefined' && typeof document.addEventListener === 'function';

    if (canListenWindow) {
      window.addEventListener('focus', triggerImmediateRevalidate);
    }
    if (canListenDoc) {
      document.addEventListener('visibilitychange', triggerImmediateRevalidate);
    }
    return () => {
      if (canListenWindow && typeof window.removeEventListener === 'function') {
        window.removeEventListener('focus', triggerImmediateRevalidate);
      }
      if (canListenDoc && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', triggerImmediateRevalidate);
      }
    };
  }, [hasPermission, revalidateRealtimeState]);

  const needsManualClinicInput =
    v2ClinicManualMode ||
    v2ClinicOptions.length === 0 ||
    (Boolean(newV2TenantId.trim()) && tenantScopedV2Clinics.length === 0);

  const v2ClinicUuidError = useMemo(() => {
    const trimmed = newV2ClinicId.trim();
    if (!trimmed) {
      return needsManualClinicInput
        ? 'Target Clinic ID is required for clinic sync connections.'
        : null;
    }
    if (!isValidUuid(trimmed)) {
      return 'Enter a valid clinic ID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).';
    }
    return null;
  }, [newV2ClinicId, needsManualClinicInput]);

  const hasV1Tenants = (catalog?.tenants?.length ?? 0) > 0;
  const scopedV1Orgs = useMemo(
    () => filterV1OrgsForTenant(catalog, newV1TenantId),
    [catalog, newV1TenantId]
  );
  const scopedV1Clinics = useMemo(
    () => filterV1ClinicsForTenant(catalog, newV1TenantId),
    [catalog, newV1TenantId]
  );

  const v2TenantOptions = useMemo(
    () => mergeV2TenantOptions(tenants, v2ClinicOptions, bindings),
    [tenants, v2ClinicOptions, bindings]
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

  const v1ClinicSelectOptions = useMemo<SelectFieldOption[]>(
    () => [
      {
        value: '',
        label: 'Select a Classic (v1) clinic...',
        disabled: true,
      },
      ...scopedV1Clinics.map((c) => ({
        value: String(c.id),
        label: c.name,
        description: `${c.clinicPatientCount.toLocaleString()} patients · ${c.consultationCount.toLocaleString()} consultations`,
        badge: `#${c.id}`,
      })),
    ],
    [scopedV1Clinics]
  );

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

  const v2ClinicSelectOptions = useMemo<SelectFieldOption[]>(
    () => [
      ...tenantScopedV2Clinics.map((c) => ({
        value: c.id,
        label: c.name,
        description: `${c.tenantSlug ? `${c.tenantSlug} · ` : ''}${shortUuid(c.id)}`,
        group: newV2TenantId.trim() ? `Clinics in ${newV2TenantId.trim()}` : 'Available Clinics',
      })),
      {
        value: '__manual__',
        label: 'Enter clinic ID manually...',
        description: 'Paste a Clinic EZ v2 clinic UUID directly',
        group: 'Other',
      },
    ],
    [tenantScopedV2Clinics, newV2TenantId]
  );

  const handleSelectV1Tenant = (val: string) => {
    const parsed = val ? Number(val) : '';
    setNewV1TenantId(parsed);
    const matchingOrgs = filterV1OrgsForTenant(catalog, parsed);
    const matchingClinics = filterV1ClinicsForTenant(catalog, parsed);
    if (newV1OrgId !== '' && !matchingOrgs.some((o) => o.id === newV1OrgId)) {
      setNewV1OrgId(matchingOrgs.length === 1 ? matchingOrgs[0].id : '');
    } else if (newV1OrgId === '' && matchingOrgs.length === 1) {
      setNewV1OrgId(matchingOrgs[0].id);
    }
    if (newV1ClinicId !== '' && !matchingClinics.some((c) => c.id === newV1ClinicId)) {
      const nextClinic = matchingClinics.length === 1 ? matchingClinics[0] : null;
      setNewV1ClinicId(nextClinic ? nextClinic.id : '');
      if (nextClinic && !nameTouchedByUser && !newName.trim()) setNewName(nextClinic.name);
    } else if (newV1ClinicId === '' && matchingClinics.length === 1) {
      setNewV1ClinicId(matchingClinics[0].id);
      if (!nameTouchedByUser && !newName.trim()) setNewName(matchingClinics[0].name);
    }
  };

  const handleSelectTargetTenant = (val: string) => {
    if (val === '__manual__') {
      setV2TenantManualMode(true);
      setNewV2TenantId('');
      setNewV2ClinicId('');
      return;
    }
    setV2TenantManualMode(false);
    setNewV2TenantId(val);
    const matchingClinics = filterV2ClinicsForTenant(v2ClinicOptions, val, tenants);
    if (!v2ClinicManualMode) {
      const stillValid = matchingClinics.some((c) => c.id === newV2ClinicId);
      if (!stillValid) {
        if (matchingClinics.length === 1) {
          setNewV2ClinicId(matchingClinics[0].id);
          if (!nameTouchedByUser && !newName.trim()) setNewName(matchingClinics[0].name);
        } else {
          setNewV2ClinicId('');
        }
      }
    }
  };

  const handleSelectTargetClinic = (val: string) => {
    if (val === '__manual__') {
      setV2ClinicManualMode(true);
      if (v2ClinicOptions.some((c) => c.id === newV2ClinicId)) setNewV2ClinicId('');
      return;
    }
    setV2ClinicManualMode(false);
    setNewV2ClinicId(val);
    const matched = v2ClinicOptions.find((c) => c.id === val);
    if (matched?.tenantSlug && !newV2TenantId) setNewV2TenantId(matched.tenantSlug);
    if (matched && !nameTouchedByUser && !newName.trim()) setNewName(matched.name);
  };

  const handleSelectV1Clinic = (val: string) => {
    const parsed = val ? Number(val) : '';
    setNewV1ClinicId(parsed);
    if (parsed !== '' && !nameTouchedByUser && !newName.trim()) {
      const matched = catalog?.clinics.find((c) => c.id === parsed);
      if (matched) setNewName(matched.name);
    }
  };

  const handleOpenConnection = (connectionId: string) => {
    const conn = findConnectionForId(unifiedConnections, connectionId);
    setShowCreateForm(false);
    userChangedTrackRef.current = true;
    if (!conn) {
      selectedConnectionIdRef.current = connectionId;
      setSelectedConnectionId(connectionId);
      return;
    }
    const nextTrack: SyncTrack = conn.clinicBinding
      ? 'TRACK1_CLINIC'
      : conn.patientBinding
        ? 'TRACK2_PATIENT'
        : 'TRACK3_STORAGE';
    selectedConnectionIdRef.current = conn.id;
    activeDetailTrackRef.current = nextTrack;
    setSelectedConnectionId(conn.id);
    setActiveDetailTrack(nextTrack);
  };

  const handleSwitchConnection = (nextConnectionId: string) => {
    const nextConn = findConnectionForId(unifiedConnections, nextConnectionId);
    userChangedTrackRef.current = true;
    if (!nextConn) {
      selectedConnectionIdRef.current = nextConnectionId;
      setSelectedConnectionId(nextConnectionId);
      return;
    }
    selectedConnectionIdRef.current = nextConn.id;
    setSelectedConnectionId(nextConn.id);
    const hasActiveTrackBinding =
      (activeDetailTrack === 'TRACK1_CLINIC' && nextConn.clinicBinding) ||
      (activeDetailTrack === 'TRACK2_PATIENT' && nextConn.patientBinding) ||
      (activeDetailTrack === 'TRACK3_STORAGE' && nextConn.storageBinding);
    if (!hasActiveTrackBinding) {
      const nextTrack: SyncTrack = nextConn.clinicBinding
        ? 'TRACK1_CLINIC'
        : nextConn.patientBinding
          ? 'TRACK2_PATIENT'
          : 'TRACK3_STORAGE';
      activeDetailTrackRef.current = nextTrack;
      setActiveDetailTrack(nextTrack);
    }
  };

  const handleCreateBinding = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName) {
      toast.error('Connection name is required.');
      return;
    }
    const trimmedClinicId = newV2ClinicId.trim();
    if (!trimmedClinicId) {
      toast.error('Target Clinic ID is required for clinic sync connections.');
      return;
    }
    if (!isValidUuid(trimmedClinicId)) {
      toast.error('Target Clinic ID must be a valid UUID.');
      return;
    }

    const v1ClinicId = newV1ClinicId === '' ? null : Number(newV1ClinicId);
    const v1OrgId = newV1OrgId === '' ? null : Number(newV1OrgId);
    const v2TenantId = newV2TenantId.trim() || null;

    try {
      setBusyAction('create');
      const createdClinic = await v1SyncService.createBinding({
        track: 'TRACK1_CLINIC',
        name: trimmedName,
        v1ClinicId,
        v1OrgId,
        v2TenantId,
        v2ClinicId: trimmedClinicId,
        patientCohortMode: 'SCOPED',
      });

      let track2Warning: string | null = null;
      try {
        await v1SyncService.createBinding({
          track: 'TRACK2_PATIENT',
          name: trimmedName,
          v1ClinicId,
          v1OrgId,
          v2TenantId,
          v2ClinicId: trimmedClinicId,
          patientCohortMode: 'SCOPED',
        });
      } catch (track2Err: unknown) {
        track2Warning = extractApiErrorMessage(
          track2Err,
          'Patient Accounts track could not be enabled automatically.'
        );
      }

      let track3Warning: string | null = null;
      if (createIncludeStorage) {
        try {
          await v1SyncService.createBinding({
            track: 'TRACK3_STORAGE',
            name: trimmedName,
            v1ClinicId,
            v1OrgId,
            v2TenantId,
            v2ClinicId: trimmedClinicId,
            patientCohortMode: 'SCOPED',
          });
        } catch (track3Err: unknown) {
          const rawTrack3Err = extractApiErrorMessage(
            track3Err,
            'File Storage track could not be enabled automatically.'
          );
          track3Warning = sanitizeStorageDisplayText(rawTrack3Err);
        }
      }

      if (track2Warning || track3Warning) {
        toast.success(
          `Created Clinic Sync for "${createdClinic.name}". You can enable remaining tracks inside the connection.`
        );
        if (track2Warning) toast.error(track2Warning);
        if (track3Warning) toast.error(track3Warning);
      } else {
        toast.success(
          createIncludeStorage
            ? `Created sync connection "${createdClinic.name}" with Clinic Sync, Patient Accounts, and File Storage tracks.`
            : `Created sync connection "${createdClinic.name}" with Clinic Sync and Patient Accounts tracks.`
        );
      }

      setShowCreateForm(false);
      setNewName('');
      setNameTouchedByUser(false);
      setCreateIncludeStorage(false);
      userChangedTrackRef.current = true;
      selectedConnectionIdRef.current = createdClinic.id;
      activeDetailTrackRef.current = 'TRACK1_CLINIC';
      setSelectedConnectionId(createdClinic.id);
      setActiveDetailTrack('TRACK1_CLINIC');
      await loadAll();
    } catch (err: unknown) {
      const rawErr = extractApiErrorMessage(err, 'Unable to create sync connection.');
      toast.error(createIncludeStorage ? sanitizeStorageDisplayText(rawErr) : rawErr);
    } finally {
      setBusyAction(null);
    }
  };

  const handleEnableMissingTrack = async (track: SyncTrack) => {
    if (!selectedConnection) return;
    if (
      track === 'TRACK1_CLINIC' &&
      (selectedConnection.v1ClinicId === null ||
        !selectedConnection.v2TenantId ||
        !selectedConnection.v2ClinicId)
    ) {
      setNewName(selectedConnection.name);
      setNameTouchedByUser(true);
      setNewV1TenantId(
        resolveV1TenantIdForSource(
          catalog,
          selectedConnection.v1ClinicId,
          selectedConnection.v1OrgId
        )
      );
      setNewV1ClinicId(selectedConnection.v1ClinicId ?? '');
      setNewV1OrgId(selectedConnection.v1OrgId ?? '');
      setNewV2TenantId(selectedConnection.v2TenantId ?? '');
      setNewV2ClinicId(selectedConnection.v2ClinicId ?? '');
      setSelectedConnectionId(null);
      setShowCreateForm(true);
      return;
    }

    const label =
      track === 'TRACK1_CLINIC'
        ? 'Clinic Sync'
        : track === 'TRACK2_PATIENT'
          ? 'Patient Accounts'
          : 'File Storage';
    try {
      setBusyAction(`Enable ${label}`);
      const created = await v1SyncService.createBinding({
        track,
        name: selectedConnection.name,
        v1ClinicId: selectedConnection.v1ClinicId,
        v1OrgId: selectedConnection.v1OrgId,
        v2TenantId: selectedConnection.v2TenantId,
        v2ClinicId: selectedConnection.v2ClinicId,
        patientCohortMode: 'SCOPED',
      });
      toast.success(`Enabled ${label} for "${selectedConnection.name}".`);
      userChangedTrackRef.current = true;
      activeDetailTrackRef.current = track;
      setActiveDetailTrack(track);
      if (track === 'TRACK1_CLINIC') {
        selectedConnectionIdRef.current = created.id;
        setSelectedConnectionId(created.id);
      }
      await loadAll();
    } catch (err: unknown) {
      const rawErr = extractApiErrorMessage(err, `Unable to enable ${label}.`);
      toast.error(track === 'TRACK3_STORAGE' ? sanitizeStorageDisplayText(rawErr) : rawErr);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunAction = async (label: string, action: () => Promise<unknown>) => {
    if (!activeBinding) return;
    const targetBindingId = activeBinding.id;
    const targetBindingName = activeBinding.name;
    const targetTrack = activeBinding.track;
    try {
      setBusyAction(label);
      await action();
      toast.success(`${label} completed for "${targetBindingName}".`);
      if (activeBindingIdRef.current === targetBindingId) {
        await Promise.all([loadAll(), loadBindingDetails(targetBindingId)]);
      } else {
        await loadAll();
      }
    } catch (err: unknown) {
      toast.error(
        extractApiErrorMessage(err, `${label} failed.`, targetTrack === 'TRACK3_STORAGE')
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleResolveConflict = async (
    conflict: SyncConflictDto,
    resolution: ConflictResolution
  ) => {
    if (!activeBinding) return;
    const label =
      resolution === 'FORCE_V1'
        ? 'Use Classic (v1)'
        : resolution === 'KEEP_V2'
          ? 'Keep Clinic EZ v2'
          : 'Dismiss Item';

    try {
      setBusyAction(label);
      const res = await v1SyncService.resolveConflict(
        conflict.id,
        resolution,
        adminProfile?.email
      );
      if (resolution === 'FORCE_V1') {
        toast.success(
          res.message ||
            `Replaced with Classic (v1) data for ${conflict.entityType} #${conflict.v1Id}.`
        );
      } else if (resolution === 'KEEP_V2') {
        toast.success(`Kept Clinic EZ v2 version for ${conflict.entityType} #${conflict.v1Id}.`);
      } else {
        toast.success(`Dismissed review item for ${conflict.entityType} #${conflict.v1Id}.`);
      }
      setForceV1Target(null);
      setDiffTargetConflict((prev) => (prev?.id === conflict.id ? null : prev));
      setConflictDetail((prev) => (prev?.conflict.id === conflict.id ? null : prev));
      await Promise.all([loadAll(), loadBindingDetails(activeBinding.id)]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `${label} failed.`);
    } finally {
      setBusyAction(null);
    }
  };

  const loadConflictDetail = useCallback(
    async (
      conflict: SyncConflictDto,
      opts?: { revealValues?: boolean; reason?: string }
    ) => {
      const reqSeq = ++conflictDetailReqSeqRef.current;
      const isReveal = Boolean(opts?.revealValues);
      try {
        if (isReveal) {
          setConflictDetailRevealing(true);
        } else {
          setConflictDetailLoading(true);
        }
        setConflictDetailError(null);
        const data = await v1SyncService.getConflictDetail(conflict.id, opts);
        if (reqSeq !== conflictDetailReqSeqRef.current) return;
        setConflictDetail(data);
        if (isReveal) {
          toast.success('Unmasked values loaded transiently and logged to audit trail.');
        }
      } catch (err: unknown) {
        if (reqSeq !== conflictDetailReqSeqRef.current) return;
        const msg = extractApiErrorMessage(err, 'Unable to inspect live conflict diff.');
        setConflictDetailError(msg);
        if (isReveal) {
          toast.error(msg);
        }
      } finally {
        if (reqSeq === conflictDetailReqSeqRef.current) {
          setConflictDetailLoading(false);
          setConflictDetailRevealing(false);
        }
      }
    },
    []
  );

  const handleOpenConflictDiff = useCallback(
    (conflict: SyncConflictDto) => {
      setDiffTargetConflict(conflict);
      setConflictDetail(null);
      setConflictDetailError(null);
      void loadConflictDetail(conflict, { revealValues: false });
    },
    [loadConflictDetail]
  );

  const handleCloseConflictDiff = useCallback(() => {
    conflictDetailReqSeqRef.current += 1;
    setDiffTargetConflict(null);
    setConflictDetail(null);
    setConflictDetailError(null);
    setConflictDetailLoading(false);
    setConflictDetailRevealing(false);
  }, []);

  const handleExportConflictsReport = useCallback(
    async (format: 'csv' | 'json') => {
      if (!activeBinding) return;
      try {
        setExportingReportFormat(format);
        const result = await v1SyncService.exportConflictsReport(activeBinding.id, {
          status: conflictStatusFilter || 'ALL',
          format,
        });
        if (typeof document !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
          const url = URL.createObjectURL(result.blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = result.fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
        }
        toast.success(`Exported Zero-PHI conflict review report (${result.fileName}).`);
      } catch (err: unknown) {
        toast.error(
          extractApiErrorMessage(err, `Unable to export ${format.toUpperCase()} conflict report.`)
        );
      } finally {
        setExportingReportFormat(null);
      }
    },
    [activeBinding, conflictStatusFilter]
  );

  const handleInspectDiffs = async (
    targetId: string,
    offset = 0,
    scope: 'run' | 'binding' = 'run'
  ) => {
    const requestSeq = ++diffsRequestSeqRef.current;
    const expectedBindingId = activeBindingIdRef.current;
    try {
      const page =
        scope === 'binding'
          ? await v1SyncService.listBindingDiffs(targetId, DIFFS_PAGE_SIZE, offset)
          : await v1SyncService.listRunDiffs(targetId, DIFFS_PAGE_SIZE, offset);
      if (
        requestSeq !== diffsRequestSeqRef.current ||
        activeBindingIdRef.current !== expectedBindingId
      ) {
        return;
      }
      setSelectedRunDiffs({
        scope,
        targetId,
        diffs: page.items,
        total: page.total,
        offset: page.offset,
        hasMore: page.hasMore,
      });
    } catch (err: unknown) {
      if (
        requestSeq === diffsRequestSeqRef.current &&
        activeBindingIdRef.current === expectedBindingId
      ) {
        toast.error(err instanceof Error ? err.message : 'Unable to load change details.');
      }
    }
  };

  const handleConfirmFreeze = async () => {
    if (!freezeTarget) return;
    try {
      setBusyAction('freeze');
      const res = await v1SyncService.freezeBinding(
        freezeTarget.id,
        freezeToken.trim(),
        freezeReason.trim()
      );
      toast.success(`Connection "${res.binding.name}" is now frozen and retired.`);
      setFreezeTarget(null);
      setFreezeToken('');
      setFreezeReason('');
      await Promise.all([loadAll(), loadBindingDetails(res.binding.id)]);
    } catch (err: unknown) {
      const rawErr = extractApiErrorMessage(err, 'Unable to freeze connection.');
      toast.error(
        freezeTarget.track === 'TRACK3_STORAGE' ? sanitizeStorageDisplayText(rawErr) : rawErr
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartAsyncImport = async (
    label: string,
    action: () => Promise<SyncRunRecordDto | { run: SyncRunRecordDto }>
  ) => {
    if (!activeBinding) return;
    const targetBindingId = activeBinding.id;
    const targetBindingName = activeBinding.name;
    const targetTrack = activeBinding.track;
    try {
      setBusyAction(label);
      const result = await action();
      const startedRun = 'run' in result ? result.run : result;
      if (startedRun && startedRun.status === 'RUNNING') {
        observedRunningRunIdsRef.current.add(startedRun.id);
        if (activeBindingIdRef.current === targetBindingId) {
          setDetailsBindingId(targetBindingId);
          setRuns((prev) => [startedRun, ...prev.filter((r) => r.id !== startedRun.id)]);
        }
        toast.success(`${label} started — tracking live batch progress.`);
      } else {
        toast.success(`${label} completed for "${targetBindingName}".`);
        if (activeBindingIdRef.current === targetBindingId) {
          await Promise.all([loadAll(), loadBindingDetails(targetBindingId)]);
        } else {
          await loadAll();
        }
      }
    } catch (err: unknown) {
      toast.error(
        extractApiErrorMessage(err, `${label} failed.`, targetTrack === 'TRACK3_STORAGE')
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleChangeBatchSize = async (nextBatchSize: number) => {
    if (!selectedConnection) return;
    const targets = [
      selectedConnection.clinicBinding?.id,
      selectedConnection.patientBinding?.id,
      selectedConnection.storageBinding?.id,
    ].filter((id): id is string => Boolean(id));
    try {
      setBusyAction('Batch Size Update');
      for (const id of targets) {
        await v1SyncService.updateBinding(id, { batchSize: nextBatchSize });
      }
      toast.success(`Batch size updated to ${nextBatchSize.toLocaleString()} items per batch.`);
      await loadAll();
    } catch (err: unknown) {
      const rawErr = extractApiErrorMessage(err, 'Unable to update batch size.');
      toast.error(
        selectedConnection.storageBinding ? sanitizeStorageDisplayText(rawErr) : rawErr
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveEditConnection = async (payload: EditConnectionSavePayload) => {
    if (!editTargetConnection) return;
    const mappingFields = payload.updateMapping
      ? {
          updateMapping: true,
          v1ClinicId: payload.v1ClinicId,
          v1OrgId: payload.v1OrgId,
          v2TenantId: payload.v2TenantId,
          v2ClinicId: payload.v2ClinicId,
          forceMappingChange: payload.forceMappingChange,
        }
      : {};

    let mutatedCount = 0;
    try {
      setBusyAction('edit');
      if (editTargetConnection.clinicBinding) {
        await v1SyncService.updateBinding(editTargetConnection.clinicBinding.id, {
          name: payload.name,
          pollIntervalSeconds: payload.pollIntervalSeconds,
          batchSize: payload.batchSize,
          autoSyncEnabled: payload.clinicAutoSyncEnabled,
          ...mappingFields,
        });
        mutatedCount += 1;
      }
      if (editTargetConnection.patientBinding) {
        await v1SyncService.updateBinding(editTargetConnection.patientBinding.id, {
          name: payload.name,
          pollIntervalSeconds: payload.pollIntervalSeconds,
          batchSize: payload.batchSize,
          autoSyncEnabled: payload.patientAutoSyncEnabled,
          patientCohortMode: payload.patientCohortMode,
          ...mappingFields,
        });
        mutatedCount += 1;
      }
      if (editTargetConnection.storageBinding) {
        await v1SyncService.updateBinding(editTargetConnection.storageBinding.id, {
          name: payload.name,
          pollIntervalSeconds: payload.pollIntervalSeconds,
          batchSize: payload.batchSize,
          autoSyncEnabled: payload.storageAutoSyncEnabled,
          ...mappingFields,
        });
        mutatedCount += 1;
      }

      toast.success(
        payload.updateMapping && payload.forceMappingChange
          ? `Updated "${payload.name}" and reset its sync ledger for the new mapping.`
          : `Saved changes for "${payload.name}".`
      );
      setEditTargetConnectionId(null);
    } catch (err: unknown) {
      toast.error(
        extractApiErrorMessage(
          err,
          'Unable to save connection changes.',
          Boolean(editTargetConnection.storageBinding)
        )
      );
    } finally {
      if (mutatedCount > 0) {
        await loadAll();
        if (activeBindingIdRef.current) {
          await loadBindingDetails(activeBindingIdRef.current);
        }
      }
      setBusyAction(null);
    }
  };

  const handleDeleteConnection = async (force: boolean) => {
    if (!editTargetConnection) return;
    const targetName = editTargetConnection.name;
    const deletingSelected = selectedConnection?.id === editTargetConnection.id;
    const bindingIds = [
      editTargetConnection.clinicBinding?.id,
      editTargetConnection.patientBinding?.id,
      editTargetConnection.storageBinding?.id,
    ].filter((id): id is string => Boolean(id));

    let deletedCount = 0;
    try {
      setBusyAction('delete');
      for (const id of bindingIds) {
        await v1SyncService.deleteBinding(id, force);
        deletedCount += 1;
      }
      toast.success(`Deleted sync connection "${targetName}".`);
      setEditTargetConnectionId(null);
      if (deletingSelected) {
        userChangedTrackRef.current = false;
        selectedConnectionIdRef.current = null;
        setSelectedConnectionId(null);
      }
    } catch (err: unknown) {
      toast.error(
        extractApiErrorMessage(
          err,
          'Unable to delete sync connection.',
          Boolean(editTargetConnection.storageBinding)
        )
      );
    } finally {
      if (deletedCount > 0) {
        await loadAll();
      }
      setBusyAction(null);
    }
  };

  const handleSaveRuntimeSettings = async (payload: UpdateSyncRuntimeSettingsPayload) => {
    try {
      setRuntimeSettingsSaving(true);
      setRuntimeSettingsError(null);
      const saved = await v1SyncService.updateSettings(payload);
      setRuntimeSettings(saved);
      toast.success(
        saved.poolSizeRestartRequired
          ? 'Migration settings saved. Restart the sync service to apply the new pool limit.'
          : 'Migration settings saved.'
      );
      setSettingsModalOpen(false);
      await loadAll();
    } catch (err: unknown) {
      const msg = extractApiErrorMessage(err, 'Unable to save migration settings.', true);
      setRuntimeSettingsError(msg);
      toast.error(msg);
    } finally {
      setRuntimeSettingsSaving(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="space-y-6 animate-pulse" aria-label="Loading migration permissions">
        <div className="h-14 w-80 max-w-full rounded-2xl bg-surface-muted" />
        <div className="h-16 w-full rounded-2xl bg-surface-muted" />
        <div className="h-64 w-full rounded-2xl bg-surface-muted" />
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div className="py-16 flex items-center justify-center">
        <div className="max-w-md w-full p-8 rounded-2xl bg-surface border border-border text-center space-y-4 shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-surface-muted text-text-muted flex items-center justify-center">
            <IconShieldLock className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-text">Restricted Administrative Module</h2>
            <p className="text-xs text-text-muted leading-relaxed">
              {profileError ||
                'Your administrator role does not include permission to manage Classic Clinic EZ (v1) data migrations. Contact a Super Admin if you need access.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const sourceChildrenDisabled = hasV1Tenants && newV1TenantId === '';
  const targetClinicDisabled =
    v2TenantOptions.length > 0 && !newV2TenantId.trim() && !v2ClinicManualMode;

  const canSaveConnection =
    busyAction !== 'create' &&
    Boolean(newName.trim()) &&
    !v2ClinicUuidError &&
    Boolean(newV2ClinicId.trim());

  const selectedSourceClinicLabel =
    selectedConnection && selectedConnection.v1ClinicId !== null
      ? v1ClinicById.get(selectedConnection.v1ClinicId) ??
        `Classic Clinic #${selectedConnection.v1ClinicId}`
      : 'All Classic Clinics';
  const selectedSourceOrgLabel =
    selectedConnection && selectedConnection.v1OrgId !== null
      ? v1OrgById.get(selectedConnection.v1OrgId) ?? `Org #${selectedConnection.v1OrgId}`
      : null;
  const selectedDestinationLabel = selectedConnection?.v2TenantId
    ? `${
        v2TenantNameBySlug.get(selectedConnection.v2TenantId.toLowerCase()) ??
        selectedConnection.v2TenantId
      }${
        selectedConnection.v2ClinicId
          ? ` · ${
              v2ClinicNameById.get(selectedConnection.v2ClinicId.toLowerCase()) ??
              shortUuid(selectedConnection.v2ClinicId)
            }`
          : ''
      }`
    : 'Shared Clinic EZ v2 Patient Directory';

  const storageTotalIndexed =
    (status?.clinicTotalStorageCount ?? 0) + (status?.patientTotalStorageCount ?? 0);
  const storagePrerequisiteLocked = status !== null && storageTotalIndexed === 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header — Root Connections Roster vs Opened Connection Detail */}
      {!selectedConnection ? (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-text">
              v1 Migration &amp; Sync
            </h1>
            <p className="text-xs text-text-muted max-w-2xl">
              Manage migration and live sync connections between Classic Clinic EZ (v1) and Clinic EZ
              v2. Select any connection to inspect server health and manage Clinic Sync, Patient
              Accounts, and File Storage tracks.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="primary"
              size="md"
              onClick={() => setShowCreateForm((prev) => !prev)}
              leadingIcon={<IconPlus className="h-4 w-4" />}
              className="shrink-0"
            >
              New Connection
            </Button>
            <div className="flex items-center gap-1.5 pl-1 border-l border-border">
              <Button
                variant="secondary"
                size="icon"
                onClick={handleOpenMappingGuide}
                tooltip="v1 → v2 Mapping Guide"
                aria-label="Mapping Guide"
                className="shrink-0"
              >
                <IconBook2 className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={handleOpenSettings}
                tooltip="Migration Settings"
                aria-label="Migration Settings"
                className="shrink-0"
              >
                <IconSettings className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => void loadAll()}
                disabled={loading}
                tooltip="Refresh"
                aria-label="Refresh"
                className="shrink-0"
              >
                <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Top Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                userChangedTrackRef.current = false;
                selectedConnectionIdRef.current = null;
                setSelectedConnectionId(null);
                setShowCreateForm(false);
              }}
              leadingIcon={<IconArrowLeft className="h-3.5 w-3.5" />}
            >
              All Connections
            </Button>

            <div className="flex items-center gap-2 min-w-0">
              {unifiedConnections.length > 1 && (
                <div className="w-56 sm:w-64 min-w-0">
                  <SelectField
                    ariaLabel="Switch connection"
                    size="sm"
                    align="right"
                    value={selectedConnection.id}
                    onValueChange={handleSwitchConnection}
                    options={connectionSwitcherOptions}
                    searchable={unifiedConnections.length > 6}
                    searchPlaceholder="Switch connection..."
                  />
                </div>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="secondary"
                  size="iconSm"
                  onClick={() => handleOpenTrackingScript('install')}
                  tooltip={
                    status?.v1SyncTriggersInstalled
                      ? 'Tracking SQL (Installed)'
                      : 'Setup Classic (v1) Tracking Script'
                  }
                  aria-label={status?.v1SyncTriggersInstalled ? 'Tracking SQL' : 'Setup Script'}
                  className={`shrink-0 ${
                    status && !status.v1SyncTriggersInstalled
                      ? 'border-amber-500/50 text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15'
                      : ''
                  }`}
                >
                  <IconCode className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  size="iconSm"
                  onClick={handleOpenMappingGuide}
                  tooltip="v1 → v2 Mapping Guide"
                  aria-label="Mapping Guide"
                  className="shrink-0"
                >
                  <IconBook2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  size="iconSm"
                  onClick={handleOpenSettings}
                  tooltip="Migration Settings"
                  aria-label="Migration Settings"
                  className="shrink-0"
                >
                  <IconSettings className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  size="iconSm"
                  onClick={() => setEditTargetConnectionId(selectedConnection.id)}
                  disabled={loading}
                  tooltip={`Edit ${selectedConnection.name}`}
                  aria-label={`Edit ${selectedConnection.name}`}
                  className="shrink-0"
                >
                  <IconEdit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  size="iconSm"
                  onClick={() => {
                    void loadAll();
                    if (activeBindingId) void loadBindingDetails(activeBindingId);
                  }}
                  disabled={loading}
                  tooltip="Refresh"
                  aria-label="Refresh"
                  className="shrink-0"
                >
                  <IconRefresh className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </div>

          {/* Unified Connection Header + Track Switcher Tabs */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <Text as="h1" className="text-xl font-bold tracking-tight text-text">
                {selectedConnection.name}
              </Text>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-muted min-w-0">
                <Text className="max-w-[220px] text-xs text-text-muted">
                  {selectedSourceClinicLabel}
                </Text>
                {selectedSourceOrgLabel && (
                  <Text className="max-w-[180px] text-xs text-text-muted">
                    · {selectedSourceOrgLabel}
                  </Text>
                )}
                <IconArrowRight className="h-3.5 w-3.5 shrink-0 text-text-muted/70" />
                <Text className="font-medium text-text-secondary max-w-[460px] text-xs">
                  {selectedDestinationLabel}
                </Text>
              </div>
            </div>

            <TabList ariaLabel="Connection sync tracks" fullWidthUntil="xl">
              <TabButton
                active={activeDetailTrack === 'TRACK1_CLINIC'}
                fullWidthUntil="xl"
                onClick={() => {
                  userChangedTrackRef.current = true;
                  activeDetailTrackRef.current = 'TRACK1_CLINIC';
                  setActiveDetailTrack('TRACK1_CLINIC');
                }}
                leadingIcon={<IconBuildingHospital className="h-3.5 w-3.5" />}
                tooltip={false}
                badge={
                  selectedConnection.clinicBinding &&
                  selectedConnection.clinicBinding.openConflictCount > 0 ? (
                    <Chip tone="warning" size="xs" className="tabular-nums">
                      {selectedConnection.clinicBinding.openConflictCount.toLocaleString()}
                    </Chip>
                  ) : undefined
                }
              >
                Clinic Sync
              </TabButton>
              <TabButton
                active={activeDetailTrack === 'TRACK2_PATIENT'}
                fullWidthUntil="xl"
                onClick={() => {
                  userChangedTrackRef.current = true;
                  activeDetailTrackRef.current = 'TRACK2_PATIENT';
                  setActiveDetailTrack('TRACK2_PATIENT');
                }}
                leadingIcon={<IconUsers className="h-3.5 w-3.5" />}
                tooltip={false}
                badge={
                  selectedConnection.patientBinding &&
                  selectedConnection.patientBinding.openConflictCount > 0 ? (
                    <Chip tone="warning" size="xs" className="tabular-nums">
                      {selectedConnection.patientBinding.openConflictCount.toLocaleString()}
                    </Chip>
                  ) : undefined
                }
              >
                Patient Accounts
              </TabButton>
              <TabButton
                active={activeDetailTrack === 'TRACK3_STORAGE'}
                fullWidthUntil="xl"
                onClick={() => {
                  userChangedTrackRef.current = true;
                  activeDetailTrackRef.current = 'TRACK3_STORAGE';
                  setActiveDetailTrack('TRACK3_STORAGE');
                }}
                leadingIcon={<IconCloudLock className="h-3.5 w-3.5" />}
                tooltip={false}
                badge={
                  selectedConnection.storageBinding &&
                  selectedConnection.storageBinding.openConflictCount > 0 ? (
                    <Chip tone="warning" size="xs" className="tabular-nums">
                      {selectedConnection.storageBinding.openConflictCount.toLocaleString()}
                    </Chip>
                  ) : undefined
                }
              >
                File Storage
              </TabButton>
            </TabList>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="dangerSubtle"
            size="xs"
            onClick={() => void loadAll()}
            className="shrink-0"
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Unified New Connection Form (Root View) */}
      {!selectedConnection && showCreateForm && (
        <CreateConnectionForm
          newName={newName}
          onChangeName={(val) => {
            setNameTouchedByUser(true);
            setNewName(val);
          }}
          newV1TenantId={newV1TenantId}
          onSelectV1Tenant={handleSelectV1Tenant}
          hasV1Tenants={hasV1Tenants}
          sourceChildrenDisabled={sourceChildrenDisabled}
          tenantScopedV1OrgsCount={scopedV1Orgs.length}
          tenantScopedV1ClinicsCount={scopedV1Clinics.length}
          newV1OrgId={newV1OrgId}
          onChangeV1OrgId={setNewV1OrgId}
          newV1ClinicId={newV1ClinicId}
          onSelectV1Clinic={handleSelectV1Clinic}
          newV2TenantId={newV2TenantId}
          onChangeV2TenantId={setNewV2TenantId}
          onSelectTargetTenant={handleSelectTargetTenant}
          v2TenantManualMode={v2TenantManualMode}
          onExitTenantManualMode={() => setV2TenantManualMode(false)}
          newV2ClinicId={newV2ClinicId}
          onChangeV2ClinicId={setNewV2ClinicId}
          onSelectTargetClinic={handleSelectTargetClinic}
          v2ClinicManualMode={v2ClinicManualMode}
          tenantScopedV2ClinicsCount={tenantScopedV2Clinics.length}
          targetClinicDisabled={targetClinicDisabled}
          needsManualClinicInput={needsManualClinicInput}
          v2ClinicUuidError={v2ClinicUuidError}
          v1TenantSelectOptions={v1TenantSelectOptions}
          v1OrgSelectOptions={v1OrgSelectOptions}
          v1ClinicSelectOptions={v1ClinicSelectOptions}
          v2TenantSelectOptions={v2TenantSelectOptions}
          v2ClinicSelectOptions={v2ClinicSelectOptions}
          canSaveConnection={canSaveConnection}
          isCreating={busyAction === 'create'}
          enableStorageTrack={createIncludeStorage}
          onToggleStorageTrack={setCreateIncludeStorage}
          onSubmit={handleCreateBinding}
          onClose={() => setShowCreateForm(false)}
        />
      )}

      {/* Root View: Unified Connections Roster ONLY | Detail View: Health Metrics + Active Track Workspace */}
      {!selectedConnection ? (
        <ConnectionsRosterView
          connections={unifiedConnections}
          filteredConnections={filteredRosterConnections}
          rosterSearch={rosterSearch}
          onChangeRosterSearch={setRosterSearch}
          v1ClinicById={v1ClinicById}
          v1OrgById={v1OrgById}
          v2TenantNameBySlug={v2TenantNameBySlug}
          v2ClinicNameById={v2ClinicNameById}
          onOpenConnection={handleOpenConnection}
          onEditConnection={(id) => setEditTargetConnectionId(id)}
          onOpenCreate={() => setShowCreateForm(true)}
        />
      ) : (
        <div className="space-y-5 min-w-0">
          <ConnectionHealthStrip
            status={status}
            catalog={catalog}
            activeTrack={activeDetailTrack}
          />

          {!activeBinding ? (
            <div className="p-8 rounded-2xl bg-surface border border-dashed border-border text-center space-y-3">
              <div className="inline-flex p-3 rounded-2xl bg-primary-subtle text-primary">
                {activeDetailTrack === 'TRACK1_CLINIC' ? (
                  <IconBuildingHospital className="h-6 w-6" />
                ) : activeDetailTrack === 'TRACK2_PATIENT' ? (
                  <IconUsers className="h-6 w-6" />
                ) : (
                  <IconCloudLock className="h-6 w-6" />
                )}
              </div>
              {activeDetailTrack === 'TRACK3_STORAGE' && storagePrerequisiteLocked ? (
                <>
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-text">
                      Migrate Clinic or Patient Records First
                    </div>
                    <p className="text-xs text-text-muted max-w-md mx-auto">
                      File Storage unlocks once Clinic Sync or Patient Accounts has migrated file
                      metadata into Clinic EZ v2.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        userChangedTrackRef.current = true;
                        activeDetailTrackRef.current = 'TRACK1_CLINIC';
                        setActiveDetailTrack('TRACK1_CLINIC');
                      }}
                    >
                      Go to Clinic Sync
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        userChangedTrackRef.current = true;
                        activeDetailTrackRef.current = 'TRACK2_PATIENT';
                        setActiveDetailTrack('TRACK2_PATIENT');
                      }}
                    >
                      Go to Patient Accounts
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={true}
                      onClick={() => void handleEnableMissingTrack('TRACK3_STORAGE')}
                      leadingIcon={<IconPlus className="h-3.5 w-3.5" />}
                    >
                      Enable File Storage
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-text">
                      {activeDetailTrack === 'TRACK1_CLINIC'
                        ? 'Clinic Sync not configured for this connection'
                        : activeDetailTrack === 'TRACK2_PATIENT'
                          ? 'Patient Accounts not enabled for this connection'
                          : 'File Storage not enabled for this connection'}
                    </div>
                    <p className="text-xs text-text-muted max-w-md mx-auto">
                      {activeDetailTrack === 'TRACK1_CLINIC'
                        ? `Link "${selectedConnection.name}" to a Clinic EZ v2 tenant and clinic to sync clinical charts, appointments, and consultations.`
                        : activeDetailTrack === 'TRACK2_PATIENT'
                          ? `Enable Track 2 for "${selectedConnection.name}" to sync Classic patient accounts, sign-in identities, and portal profiles using the same source and destination.`
                          : `Enable File Storage for "${selectedConnection.name}" to encrypt and save available clinic and patient files into isolated cloud storage.`}
                    </p>
                  </div>
                  <div className="pt-1">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!!busyAction}
                      onClick={() => void handleEnableMissingTrack(activeDetailTrack)}
                      leadingIcon={<IconPlus className="h-3.5 w-3.5" />}
                    >
                      {activeDetailTrack === 'TRACK1_CLINIC'
                        ? selectedConnection.v2ClinicId &&
                          selectedConnection.v2TenantId &&
                          selectedConnection.v1ClinicId !== null
                          ? 'Enable Clinic Sync'
                          : 'Configure Clinic Destination'
                        : activeDetailTrack === 'TRACK2_PATIENT'
                          ? 'Enable Patient Accounts Sync'
                          : 'Enable File Storage'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {activeBinding.track === 'TRACK3_STORAGE' && storagePrerequisiteLocked && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-300 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-bold">Migrate Clinic or Patient Records First</div>
                      <p className="text-[11px]">
                        File Storage actions are locked until Clinic Sync or Patient Accounts has
                        migrated file metadata into Clinic EZ v2.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => {
                        userChangedTrackRef.current = true;
                        activeDetailTrackRef.current = 'TRACK1_CLINIC';
                        setActiveDetailTrack('TRACK1_CLINIC');
                      }}
                    >
                      Go to Clinic Sync
                    </Button>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => {
                        userChangedTrackRef.current = true;
                        activeDetailTrackRef.current = 'TRACK2_PATIENT';
                        setActiveDetailTrack('TRACK2_PATIENT');
                      }}
                    >
                      Go to Patient Accounts
                    </Button>
                  </div>
                </div>
              )}

              <ConnectionActionDeck
                binding={activeBinding}
                catalog={catalog}
                busyAction={busyAction}
                hasRunningRun={hasRunningRun}
                prerequisiteLocked={
                  activeBinding.track === 'TRACK3_STORAGE' && storagePrerequisiteLocked
                }
                hasCompletedSamplePreview={hasCompletedSamplePreview(activeBinding, visibleRuns)}
                hasCompletedSampleMigration={hasCompletedSampleMigration(
                  activeBinding,
                  visibleRuns
                )}
                batchSize={activeBinding.batchSize ?? selectedConnection.batchSize ?? 200}
                onChangeBatchSize={(nextSize) => void handleChangeBatchSize(nextSize)}
                storageTargetPlane={storageTargetPlaneFilter}
                onChangeStorageTargetPlane={setStorageTargetPlaneFilter}
                storageSourceFilter={storageProviderFilter}
                onChangeStorageSourceFilter={setStorageProviderFilter}
                onToggleCohortMode={() =>
                  void handleRunAction('Scope Update', () =>
                    v1SyncService.updateBinding(activeBinding.id, {
                      patientCohortMode:
                        activeBinding.patientCohortMode === 'SCOPED' ? 'GLOBAL' : 'SCOPED',
                    })
                  )
                }
                onToggleAutoSync={() => {
                  const enabling = !activeBinding.autoSyncEnabled;
                  void handleRunAction(
                    enabling ? 'Enable Auto-Sync' : 'Pause Auto-Sync',
                    () =>
                      v1SyncService.updateBinding(activeBinding.id, {
                        autoSyncEnabled: enabling,
                      })
                  );
                }}
                onRunDryRun={(limit) =>
                  void handleStartAsyncImport(
                    limit ? `Preview Sample (${limit})` : 'Full Preview',
                    () =>
                      v1SyncService.runDryRun(activeBinding.id, limit, {
                        asyncMode: true,
                        batchSize: activeBinding.batchSize ?? 200,
                        ...(activeBinding.track === 'TRACK3_STORAGE'
                          ? {
                              providerFilter: storageProviderFilter,
                              targetPlaneFilter: storageTargetPlaneFilter,
                            }
                          : {}),
                      })
                  )
                }
                onRunBackfill={(limit) =>
                  void handleStartAsyncImport(
                    limit
                      ? `Migrate Sample (${limit})`
                      : activeBinding.track === 'TRACK3_STORAGE'
                        ? 'Migrate All Files'
                        : 'Migrate All Records',
                    () =>
                      v1SyncService.runBackfill(activeBinding.id, limit, {
                        asyncMode: true,
                        batchSize: activeBinding.batchSize ?? 200,
                        ...(activeBinding.track === 'TRACK3_STORAGE'
                          ? {
                              providerFilter: storageProviderFilter,
                              targetPlaneFilter: storageTargetPlaneFilter,
                            }
                          : {}),
                      })
                  )
                }
                onPullNow={() =>
                  void handleRunAction('Sync Latest Changes', () =>
                    v1SyncService.pullNow(
                      activeBinding.id,
                      activeBinding.track === 'TRACK3_STORAGE'
                        ? {
                            providerFilter: storageProviderFilter,
                            targetPlaneFilter: storageTargetPlaneFilter,
                          }
                        : undefined
                    )
                  )
                }
                onRunFinalSweep={() =>
                  void handleStartAsyncImport('Final Verification Sweep', () =>
                    v1SyncService.runFinalSweep(activeBinding.id, {
                      asyncMode: true,
                      batchSize: activeBinding.batchSize ?? 200,
                      ...(activeBinding.track === 'TRACK3_STORAGE'
                        ? {
                            providerFilter: storageProviderFilter,
                            targetPlaneFilter: storageTargetPlaneFilter,
                          }
                        : {}),
                    })
                  )
                }
                onUnfreeze={() =>
                  void handleRunAction('Unfreeze Connection', () =>
                    v1SyncService.unfreezeBinding(activeBinding.id)
                  )
                }
                onRequestFreeze={() => setFreezeTarget(activeBinding)}
              />

              {activeRunningRun && (
                <LiveImportProgressCard
                  run={activeRunningRun}
                  track={activeBinding.track}
                  verboseOpen={verboseLogsOpen}
                  onToggleVerbose={() => setVerboseLogsOpen((prev) => !prev)}
                />
              )}

              {visibleParity && (
                <RecordVerificationCard parity={visibleParity} track={activeBinding.track} />
              )}

              {activeBinding.track === 'TRACK3_STORAGE' && (
                <SkippedStorageFilesCard
                  items={visibleStorageObjects}
                  totalCount={visibleStorageObjectsTotal}
                  failedRetryableCount={visibleStorageFailedRetryableCount}
                  offset={storageObjectsOffset}
                  statusFilter={storageStatusFilter}
                  planeFilter={storagePlaneFilter}
                  sourceFilter={storageSourceFilter}
                  busyAction={busyAction}
                  actionsLocked={hasRunningRun || activeBinding.isFrozen || storagePrerequisiteLocked}
                  onChangeStatusFilter={(nextStatus) => {
                    setStorageStatusFilter(nextStatus);
                    storageStatusFilterRef.current = nextStatus;
                    setStorageObjectsOffset(0);
                    storageObjectsOffsetRef.current = 0;
                    void loadBindingDetails(activeBinding.id, {
                      track: 'TRACK3_STORAGE',
                      storageOffset: 0,
                      storageStatus: nextStatus,
                    });
                  }}
                  onChangePlaneFilter={(nextPlane) => {
                    setStoragePlaneFilter(nextPlane);
                    storagePlaneFilterRef.current = nextPlane;
                    setStorageObjectsOffset(0);
                    storageObjectsOffsetRef.current = 0;
                    void loadBindingDetails(activeBinding.id, {
                      track: 'TRACK3_STORAGE',
                      storageOffset: 0,
                      storagePlane: nextPlane,
                    });
                  }}
                  onChangeSourceFilter={(nextSource) => {
                    setStorageSourceFilter(nextSource);
                    storageSourceFilterRef.current = nextSource;
                    setStorageObjectsOffset(0);
                    storageObjectsOffsetRef.current = 0;
                    void loadBindingDetails(activeBinding.id, {
                      track: 'TRACK3_STORAGE',
                      storageOffset: 0,
                      storageSource: nextSource,
                    });
                  }}
                  onChangeOffset={(nextOffset) => {
                    setStorageObjectsOffset(nextOffset);
                    storageObjectsOffsetRef.current = nextOffset;
                    void loadBindingDetails(activeBinding.id, {
                      track: 'TRACK3_STORAGE',
                      storageOffset: nextOffset,
                    });
                  }}
                  onRetryFailed={() =>
                    void handleStartAsyncImport('Retry Failed', () =>
                      v1SyncService.retryFailedStorage(activeBinding.id, {
                        asyncMode: true,
                        ...(storageStatusFilter === 'SKIPPED_AUTH_REQUIRED'
                          ? { includeAuthSkipped: true }
                          : {}),
                      })
                    )
                  }
                />
              )}

              {activeBinding.track !== 'TRACK3_STORAGE' &&
                (visibleConflicts.length > 0 ||
                  conflictStatusFilter !== '' ||
                  conflictsOffset > 0) && (
                  <ConflictsReviewCard
                    conflicts={visibleConflicts}
                    conflictsTotal={conflictsTotal}
                    conflictsOffset={conflictsOffset}
                    conflictsHasMore={conflictsHasMore}
                    conflictStatusFilter={conflictStatusFilter}
                    busyAction={busyAction}
                    exportingFormat={exportingReportFormat}
                    onChangeStatusFilter={(nextStatus) => {
                      setConflictStatusFilter(nextStatus);
                      setConflictsOffset(0);
                      void loadBindingDetails(activeBinding.id, {
                        conflictsOffset: 0,
                        conflictStatus: nextStatus,
                      });
                    }}
                    onResolve={(cf, res) => void handleResolveConflict(cf, res)}
                    onRequestForceV1={setForceV1Target}
                    onInspectDiff={handleOpenConflictDiff}
                    onExportReport={(format) => void handleExportConflictsReport(format)}
                    onChangeOffset={(nextOffset) => {
                      setConflictsOffset(nextOffset);
                      void loadBindingDetails(activeBinding.id, { conflictsOffset: nextOffset });
                    }}
                  />
                )}

              <SyncActivityCard
                runs={visibleRuns}
                track={activeBinding.track}
                hasRunningRun={hasRunningRun}
                modeFilter={runModeFilter}
                onChangeModeFilter={(nextMode) => {
                  setRunModeFilter(nextMode);
                  runModeFilterRef.current = nextMode;
                  void loadBindingDetails(activeBinding.id, {
                    track: activeBinding.track,
                    runMode: nextMode,
                    includeConflicts: false,
                    includeParity: false,
                    includeStorageObjects: false,
                  });
                }}
                onBrowseAllChanges={() => void handleInspectDiffs(activeBinding.id, 0, 'binding')}
                onInspectRunChanges={(runId) => void handleInspectDiffs(runId, 0, 'run')}
              />

              {activeBinding.track === 'TRACK1_CLINIC' &&
                catalog &&
                catalog.dynamicCustomFieldsPreview.length > 0 && (
                  <ExtraProfileFieldsCard fields={catalog.dynamicCustomFieldsPreview} />
                )}
            </>
          )}
        </div>
      )}

      {selectedRunDiffs && (
        <ChangeDetailsCard
          diffsState={selectedRunDiffs}
          onClose={() => {
            diffsRequestSeqRef.current += 1;
            setSelectedRunDiffs(null);
          }}
          onChangeOffset={(nextOffset) =>
            void handleInspectDiffs(
              selectedRunDiffs.targetId,
              nextOffset,
              selectedRunDiffs.scope
            )
          }
        />
      )}

      {diffTargetConflict && (
        <ConflictDiffDrawer
          conflict={diffTargetConflict}
          detail={conflictDetail}
          loading={conflictDetailLoading}
          error={conflictDetailError}
          busyAction={busyAction}
          revealingValues={conflictDetailRevealing}
          canRevealBreakGlass={hasPermission && mfaVerified}
          hasVerifiedMfa={mfaVerified}
          disableEscapeClose={Boolean(forceV1Target)}
          onRetry={() => void loadConflictDetail(diffTargetConflict, { revealValues: false })}
          onRevealValues={(reason) =>
            void loadConflictDetail(diffTargetConflict, { revealValues: true, reason })
          }
          onReturnToMasked={() =>
            void loadConflictDetail(diffTargetConflict, { revealValues: false })
          }
          onResolve={(cf, res) => void handleResolveConflict(cf, res)}
          onRequestForceV1={setForceV1Target}
          onClose={handleCloseConflictDiff}
        />
      )}

      {forceV1Target && (
        <ForceV1ConfirmModal
          conflict={forceV1Target}
          busyAction={busyAction}
          onClose={() => setForceV1Target(null)}
          onConfirm={() => void handleResolveConflict(forceV1Target, 'FORCE_V1')}
        />
      )}

      {freezeTarget && (
        <FreezeConnectionModal
          binding={freezeTarget}
          freezeReason={freezeReason}
          onChangeReason={setFreezeReason}
          freezeToken={freezeToken}
          onChangeToken={setFreezeToken}
          busyAction={busyAction}
          onClose={() => {
            setFreezeTarget(null);
            setFreezeToken('');
            setFreezeReason('');
          }}
          onConfirm={handleConfirmFreeze}
          onOpenUninstallScript={() => {
            setFreezeTarget(null);
            setFreezeToken('');
            setFreezeReason('');
            handleOpenTrackingScript('uninstall');
          }}
        />
      )}

      {trackingScriptModalTab && (
        <TrackingScriptModal
          initialTab={trackingScriptModalTab}
          scripts={trackingScripts}
          loading={trackingScriptsLoading}
          error={trackingScriptsError}
          triggersInstalled={Boolean(status?.v1SyncTriggersInstalled)}
          triggerTableCount={status?.v1SyncTriggerTableCount ?? 0}
          refreshingStatus={loading}
          onRetryLoad={() => void loadTrackingScripts()}
          onRecheckStatus={() => {
            void (async () => {
              try {
                const nextStatus = await v1SyncService.getStatus();
                setStatus(nextStatus);
                if (nextStatus.v1SyncTriggersInstalled) {
                  toast.success(
                    `Live tracking active (${nextStatus.v1SyncTriggerTableCount} tables).`
                  );
                } else {
                  toast.info('Tracking triggers not detected yet — run the Enable script in Classic (v1).');
                }
              } catch (err: unknown) {
                toast.error(extractApiErrorMessage(err, 'Unable to re-check tracking status.'));
              }
              void loadAll();
            })();
          }}
          onClose={() => {
            setTrackingScriptModalTab(null);
            void revalidateRealtimeState();
          }}
        />
      )}

      {settingsModalOpen && (
        <MigrationSettingsModal
          settings={runtimeSettings}
          loading={runtimeSettingsLoading}
          saving={runtimeSettingsSaving}
          error={runtimeSettingsError}
          onRetryLoad={() => void loadRuntimeSettings()}
          onSave={(payload) => void handleSaveRuntimeSettings(payload)}
          onClose={() => setSettingsModalOpen(false)}
        />
      )}

      {mappingGuideOpen && (
        <MappingGuideModal
          guide={mappingGuide}
          loading={mappingGuideLoading}
          error={mappingGuideError}
          initialTrack={selectedConnection ? activeDetailTrack : 'TRACK1_CLINIC'}
          onRetryLoad={() => void loadMappingGuide()}
          onClose={() => setMappingGuideOpen(false)}
        />
      )}

      {editTargetConnection && (
        <EditConnectionModal
          key={editTargetConnection.id}
          connection={editTargetConnection}
          catalog={catalog}
          tenants={tenants}
          v2TenantOptions={v2TenantOptions}
          v2ClinicOptions={v2ClinicOptions}
          busyAction={busyAction}
          onClose={() => setEditTargetConnectionId(null)}
          onSave={handleSaveEditConnection}
          onDelete={handleDeleteConnection}
        />
      )}
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/v1-sync',
  component: () => <V1SyncPage />,
});
