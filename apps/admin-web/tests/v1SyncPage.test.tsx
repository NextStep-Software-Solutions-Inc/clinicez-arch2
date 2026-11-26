import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toast } from 'sonner';
import { adminService, type AdminMeDto, type AdminTenantDto } from '../src/services/admin.service';
import {
  v1SyncService,
  type ParityReportDto,
  type SyncBindingDto,
  type SyncChangeDiffDto,
  type SyncConflictDto,
  type SyncRunRecordDto,
  type SyncSystemStatusDto,
  type V1CatalogResponseDto,
  type V2ClinicOptionDto,
} from '../src/services/v1Sync.service';
import { groupUnifiedConnections, V1SyncPage } from '../src/routes/v1-sync';
import {
  AnimatedNumber,
  LiveImportProgressCard,
  RecordVerificationCard,
  SkippedStorageFilesCard,
  SyncActivityCard,
} from '../src/components/v1-sync';

interface TreeInstance {
  type: any;
  stateSlots: any[];
  effectSlots: Array<{ fn: () => any; cleanup?: any; deps: any[]; hasChanged: boolean }>;
  refSlots: Array<{ current: any }>;
  memoSlots: Array<{ value: any; deps: any[] }>;
}

function mountReactTree(initialElement: React.ReactElement) {
  const instances = new Map<string, TreeInstance>();
  let currentElement = initialElement;
  let renderedTree: any = null;
  let isRendering = false;
  let hasPendingRender = false;
  let activePaths = new Set<string>();

  function renderNode(node: any, nodePath: string): any {
    if (node == null || typeof node === 'boolean') return node;
    if (typeof node === 'string' || typeof node === 'number') return node;
    if (Array.isArray(node)) {
      return node.map((child, idx) => {
        const keyPart =
          child && typeof child === 'object' && child.key != null ? `k_${child.key}` : `i_${idx}`;
        return renderNode(child, `${nodePath}.${keyPart}`);
      });
    }
    if (!React.isValidElement(node)) return node;

    const el = node as React.ReactElement<any>;
    const keySuffix = el.key != null ? `@${String(el.key)}` : '';
    const instancePath = `${nodePath}${keySuffix}`;

    if (el.type === React.Fragment) {
      return React.createElement(
        React.Fragment,
        el.key != null ? { key: el.key } : null,
        renderNode(el.props.children, `${instancePath}.frag`)
      );
    }

    if (typeof el.type === 'function') {
      activePaths.add(instancePath);
      let inst = instances.get(instancePath);
      if (!inst || inst.type !== el.type) {
        if (inst) {
          for (const eff of inst.effectSlots) {
            if (typeof eff.cleanup === 'function') eff.cleanup();
          }
        }
        inst = {
          type: el.type,
          stateSlots: [],
          effectSlots: [],
          refSlots: [],
          memoSlots: [],
        };
        instances.set(instancePath, inst);
      }

      let slotIndex = 0;
      let effectIndex = 0;
      let refIndex = 0;
      let memoIndex = 0;
      const targetInst = inst;
      const mockHooks: any = {
        useState: (initial: any) => {
          const idx = slotIndex++;
          if (targetInst.stateSlots.length <= idx) {
            targetInst.stateSlots.push(typeof initial === 'function' ? initial() : initial);
          }
          const setState = (newVal: any) => {
            const nextVal =
              typeof newVal === 'function' ? newVal(targetInst.stateSlots[idx]) : newVal;
            if (!Object.is(targetInst.stateSlots[idx], nextVal)) {
              targetInst.stateSlots[idx] = nextVal;
              scheduleRender();
            }
          };
          return [targetInst.stateSlots[idx], setState];
        },
        useRef: (initial: any) => {
          const idx = refIndex++;
          if (targetInst.refSlots.length <= idx) targetInst.refSlots.push({ current: initial });
          return targetInst.refSlots[idx];
        },
        useCallback: (fn: any, deps: any[]) => mockHooks.useMemo(() => fn, deps),
        useMemo: (fn: any, deps: any[]) => {
          const idx = memoIndex++;
          const prev = targetInst.memoSlots[idx];
          const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
          if (changed) {
            const value = fn();
            targetInst.memoSlots[idx] = { value, deps };
            return value;
          }
          return prev.value;
        },
        useEffect: (fn: any, deps: any[]) => {
          const idx = effectIndex++;
          const prev = targetInst.effectSlots[idx];
          const hasChanged =
            !prev || !deps || !prev.deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
          targetInst.effectSlots[idx] = { fn, deps, hasChanged, cleanup: prev?.cleanup };
        },
        useContext: (context: React.Context<any>) => (context as any)._currentValue,
        useSyncExternalStore: (_sub: any, getSnap: () => any) => getSnap(),
      };

      const internals = (React as any)
        .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const prevDispatcher = internals ? internals.H : null;
      if (internals) internals.H = mockHooks;
      let output: any;
      try {
        output = (el.type as (p: any) => any)(el.props);
      } finally {
        if (internals) internals.H = prevDispatcher;
      }
      return renderNode(output, `${instancePath}.out`);
    }

    if (el.props && 'children' in el.props) {
      const renderedChildren = renderNode(el.props.children, `${instancePath}.c`);
      return Array.isArray(renderedChildren)
        ? React.cloneElement(el, el.props, ...renderedChildren)
        : React.cloneElement(el, el.props, renderedChildren);
    }
    return el;
  }

  function scheduleRender() {
    if (isRendering) {
      hasPendingRender = true;
      return;
    }
    render();
  }

  function render() {
    if (isRendering) return;
    isRendering = true;
    try {
      do {
        hasPendingRender = false;
        activePaths = new Set<string>();
        renderedTree = renderNode(currentElement, 'root');
        for (const [p, inst] of Array.from(instances.entries())) {
          if (!activePaths.has(p)) {
            for (const eff of inst.effectSlots) {
              if (typeof eff.cleanup === 'function') eff.cleanup();
            }
            instances.delete(p);
          }
        }
        for (const p of Array.from(activePaths)) {
          const inst = instances.get(p);
          if (!inst) continue;
          for (const eff of inst.effectSlots) {
            if (eff.hasChanged) {
              eff.hasChanged = false;
              if (typeof eff.cleanup === 'function') eff.cleanup();
              eff.cleanup = eff.fn();
            }
          }
        }
      } while (hasPendingRender);
    } finally {
      isRendering = false;
    }
  }

  render();

  return {
    get tree() {
      return renderedTree;
    },
    get html() {
      return renderToStaticMarkup(renderedTree);
    },
    unmount() {
      for (const inst of instances.values()) {
        for (const eff of inst.effectSlots) {
          if (typeof eff.cleanup === 'function') eff.cleanup();
        }
      }
    },
  };
}

function findElements(
  node: any,
  predicate: (el: React.ReactElement<any>) => boolean
): React.ReactElement<any>[] {
  const results: React.ReactElement<any>[] = [];
  function walk(n: any) {
    if (!n || typeof n === 'boolean' || typeof n === 'string' || typeof n === 'number') return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (React.isValidElement(n)) {
      const el = n as React.ReactElement<any>;
      if (predicate(el)) results.push(el);
      if (el.props && 'children' in el.props) walk(el.props.children);
    }
  }
  walk(node);
  return results;
}

function textContent(node: any): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<any>;
    return textContent(el.props?.children);
  }
  return '';
}

function selectCustomOption(
  tree: ReturnType<typeof mountReactTree>,
  comboboxAriaLabel: string,
  optionLabelMatch: string
) {
  const trigger = findElements(
    tree.tree,
    (el) =>
      el.type === 'button' &&
      el.props.role === 'combobox' &&
      el.props['aria-label'] === comboboxAriaLabel
  )[0];
  expect(trigger).toBeDefined();
  trigger.props.onClick();

  const optionBtn = findElements(
    tree.tree,
    (el) =>
      el.type === 'button' &&
      el.props.role === 'option' &&
      textContent(el).includes(optionLabelMatch)
  )[0];
  expect(optionBtn).toBeDefined();
  optionBtn.props.onClick();
}

async function flushMicrotasks(ticks = 6) {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
  }
}

const adminWithPerm: AdminMeDto = {
  isAdmin: true,
  fullName: 'Migration Admin',
  email: 'ops@example.com',
  roleName: 'Super Admin',
  permissions: ['manage:migrations'],
};

const sampleTenants: AdminTenantDto[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'USTP Medical Clinic',
    clinicName: 'USTP Medical Clinic',
    tenantSlug: 'ustp-cdo',
    tenantType: 'Clinic',
    facilityType: 'Clinic',
    ownerName: 'Admin',
    email: 'clinic@example.com',
    createdAt: '2026-11-25T00:00:00Z',
    subscriptionStatus: 'Active',
    subscriptionPlanId: 'enterprise',
    isAnnual: true,
    facilitiesCount: 1,
    clinicalBranchesCount: 1,
    staffAccountsCount: 5,
    activePatientRecordsCount: 100,
    monthlyApiQuotaUsed: 10,
    monthlyApiQuotaLimit: 1000,
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    name: 'Cebu Doctors Clinic',
    clinicName: 'Cebu Doctors Clinic',
    tenantSlug: 'cebu-doc',
    tenantType: 'Clinic',
    facilityType: 'Clinic',
    ownerName: 'Admin 2',
    email: 'cebu@example.com',
    createdAt: '2026-11-25T00:00:00Z',
    subscriptionStatus: 'Active',
    subscriptionPlanId: 'pro',
    isAnnual: true,
    facilitiesCount: 2,
    clinicalBranchesCount: 2,
    staffAccountsCount: 8,
    activePatientRecordsCount: 200,
    monthlyApiQuotaUsed: 10,
    monthlyApiQuotaLimit: 1000,
  },
];

const sampleV2Clinics: V2ClinicOptionDto[] = [
  {
    id: 'cb09fe02-6979-4b7a-8e50-d3b8a1419762',
    name: 'USTP Main Clinic',
    tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    tenantSlug: 'ustp-cdo',
  },
  {
    id: '12345678-1234-4123-8123-1234567890ab',
    name: 'Cebu North Branch',
    tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    tenantSlug: 'cebu-doc',
  },
  {
    id: '87654321-4321-4321-8321-ba0987654321',
    name: 'Cebu South Branch',
    tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    tenantSlug: 'cebu-doc',
  },
];

const sampleBindings: SyncBindingDto[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    track: 'TRACK1_CLINIC',
    name: 'Track 1 Binding A',
    v1ClinicId: 3,
    v1OrgId: 1,
    v2TenantId: 'ustp-cdo',
    v2ClinicId: 'cb09fe02-6979-4b7a-8e50-d3b8a1419762',
    patientCohortMode: 'SCOPED',
    autoSyncEnabled: false,
    pollIntervalSeconds: 30,
    isFrozen: false,
    frozenAt: null,
    frozenBy: null,
    freezeReason: null,
    createdAt: '2026-11-25T00:00:00Z',
    updatedAt: '2026-11-25T00:00:00Z',
    lastChangelogSeq: 42,
    lastPolledAt: null,
    openConflictCount: 1,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    track: 'TRACK1_CLINIC',
    name: 'Track 1 Binding B',
    v1ClinicId: 4,
    v1OrgId: null,
    v2TenantId: 'ustp-cdo',
    v2ClinicId: 'cb09fe02-6979-4b7a-8e50-d3b8a1419762',
    patientCohortMode: 'SCOPED',
    autoSyncEnabled: false,
    pollIntervalSeconds: 30,
    isFrozen: false,
    frozenAt: null,
    frozenBy: null,
    freezeReason: null,
    createdAt: '2026-11-25T00:00:00Z',
    updatedAt: '2026-11-25T00:00:00Z',
    lastChangelogSeq: 12,
    lastPolledAt: null,
    openConflictCount: 0,
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    track: 'TRACK2_PATIENT',
    name: 'Track 2 Patient Plane',
    v1ClinicId: 3,
    v1OrgId: 1,
    v2TenantId: null,
    v2ClinicId: null,
    patientCohortMode: 'SCOPED',
    autoSyncEnabled: false,
    pollIntervalSeconds: 30,
    isFrozen: false,
    frozenAt: null,
    frozenBy: null,
    freezeReason: null,
    createdAt: '2026-11-25T00:00:00Z',
    updatedAt: '2026-11-25T00:00:00Z',
    lastChangelogSeq: 99,
    lastPolledAt: null,
    openConflictCount: 0,
  },
];

const sampleStatus: SyncSystemStatusDto = {
  environmentLabel: 'LOCAL',
  v1SourceConnected: true,
  clinicDbConnected: true,
  patientDbConnected: true,
  syncLedgerConnected: true,
  v1SyncTriggersInstalled: true,
  v1SyncTriggerTableCount: 55,
  v1ChangelogMaxSeq: 120,
  backgroundWorkerEnabled: true,
  workerLastHeartbeatUtc: '2026-11-25T10:00:00Z',
  activeBindingsCount: 3,
  openConflictsCount: 1,
  clinicR2Connected: true,
  patientR2Connected: true,
  clinicEncryptionConfigured: true,
  patientEncryptionConfigured: true,
  azureBlob1Configured: true,
  clinicPendingStorageCount: 12,
  patientPendingStorageCount: 8,
  clinicTotalStorageCount: 100,
  patientTotalStorageCount: 200,
};

const sampleCatalog: V1CatalogResponseDto = {
  tenants: [
    {
      id: 1,
      tenantUid: 'ustp',
      name: 'USTP',
      clinicCount: 1,
      organizationCount: 1,
    },
    {
      id: 2,
      tenantUid: 'san_ignacio',
      name: 'San Ignacio',
      clinicCount: 1,
      organizationCount: 1,
    },
  ],
  clinics: [
    {
      id: 3,
      clinicUid: 'c-3',
      name: 'USTP Clinic',
      clinicPatientCount: 14308,
      appointmentCount: 7658,
      consultationCount: 6235,
      tenantId: 1,
    },
    {
      id: 16,
      clinicUid: 'c-16',
      name: 'San Ignacio Carmen',
      clinicPatientCount: 410,
      appointmentCount: 220,
      consultationCount: 185,
      tenantId: 2,
    },
  ],
  organizations: [
    {
      id: 1,
      orgUid: 'o-1',
      name: 'USTP - CDO',
      memberCount: 14310,
      studentCount: 13000,
      employeeCount: 1310,
      tenantId: 1,
    },
    {
      id: 10,
      orgUid: 'o-10',
      name: 'San Ignacio Org',
      memberCount: 450,
      studentCount: 380,
      employeeCount: 70,
      tenantId: 2,
    },
  ],
  totalActiveV1Users: 15839,
  clerkV1Users: 1200,
  legacyAuth0V1Users: 14639,
  totalV1Files: 34411,
  privateV1Files: 12,
  dynamicCustomFieldsPreview: [],
};

const sampleConflicts: SyncConflictDto[] = [
  {
    id: 'conflict-1',
    bindingId: '11111111-1111-1111-1111-111111111111',
    runId: 'run-1',
    entityType: 'Patient',
    v1Id: '501',
    v2Id: '99999999-9999-9999-9999-999999999999',
    conflictType: 'V2_MODIFIED',
    changedFields: ['FirstName', 'MiddleName'],
    status: 'OPEN',
    resolvedBy: null,
    resolvedAt: null,
    createdAt: '2026-11-25T10:00:00Z',
  },
];

const sampleDiffs: SyncChangeDiffDto[] = [
  {
    id: 1,
    runId: 'run-1',
    bindingId: '11111111-1111-1111-1111-111111111111',
    entityType: 'Patient',
    v1Id: '501',
    v2Id: '99999999-9999-9999-9999-999999999999',
    action: 'UPDATE',
    changedFields: ['FirstName'],
    createdAt: '2026-11-25T10:00:00Z',
  },
];

const sampleParity: ParityReportDto = {
  bindingId: '11111111-1111-1111-1111-111111111111',
  track: 'TRACK1_CLINIC',
  bindingName: 'Track 1 Binding A',
  isFrozen: false,
  changelogMaxSeq: 42,
  lastCursorSeq: 42,
  changelogLag: 0,
  openConflictsCount: 1,
  readyToFreeze: false,
  checks: [],
  generatedAtUtc: '2026-11-25T10:00:00Z',
};

describe('V1SyncPage UI/UX, Custom SelectField & Hierarchical Tenant Scoping', () => {
  const origGetMe = adminService.getMe;
  const origGetTenants = adminService.getTenants;
  const origGetAdminClinics = adminService.getAdminClinics;
  const origGetStatus = v1SyncService.getStatus;
  const origGetSettings = v1SyncService.getSettings;
  const origUpdateSettings = v1SyncService.updateSettings;
  const origGetMappingGuide = v1SyncService.getMappingGuide;
  const origListBindings = v1SyncService.listBindings;
  const origGetCatalog = v1SyncService.getCatalog;
  const origListV2Clinics = v1SyncService.listV2Clinics;
  const origListRuns = v1SyncService.listRuns;
  const origListConflicts = v1SyncService.listConflicts;
  const origGetParity = v1SyncService.getParityReport;
  const origResolveConflict = v1SyncService.resolveConflict;
  const origListRunDiffs = v1SyncService.listRunDiffs;
  const origCreateBinding = v1SyncService.createBinding;
  const origUpdateBinding = v1SyncService.updateBinding;
  const origDeleteBinding = v1SyncService.deleteBinding;
  const origGetStorageObjects = v1SyncService.getStorageObjects;
  const origRetryFailedStorage = v1SyncService.retryFailedStorage;
  const origRunDryRun = v1SyncService.runDryRun;
  const origRunBackfill = v1SyncService.runBackfill;
  const origPullNow = v1SyncService.pullNow;
  const origRunFinalSweep = v1SyncService.runFinalSweep;
  const origToastSuccess = toast.success;
  const origToastError = toast.error;

  beforeEach(() => {
    adminService.getMe = mock(async () => adminWithPerm);
    adminService.getTenants = mock(async () => sampleTenants);
    adminService.getAdminClinics = mock(async () => []);
    v1SyncService.getStatus = mock(async () => sampleStatus);
    v1SyncService.getSettings = mock(async () => ({
      environmentLabel: 'PRODUCTION',
      maxPoolSize: 2,
      activeMaxPoolSize: 2,
      poolSizeRestartRequired: false,
      defaultBatchSize: 200,
      enableBackgroundWorker: true,
      defaultPollIntervalSeconds: 30,
      overnightPollIntervalSeconds: 300,
      overnightBackoffStartHourPh: 22,
      overnightBackoffEndHourPh: 6,
      storageEnabled: true,
      storageMaxConcurrency: 6,
      storageMaxFileSizeBytes: 52_428_800,
      storageVerificationSampleRate: 0.02,
      azureBlob1Enabled: true,
      clinicStorageConfigured: true,
      patientStorageConfigured: true,
      clinicEncryptionConfigured: true,
      patientEncryptionConfigured: true,
      updatedBy: 'ops@example.com',
      updatedAt: '2026-11-26T05:00:00Z',
    }));
    v1SyncService.updateSettings = mock(async (payload) => ({
      environmentLabel: payload.environmentLabel ?? 'PRODUCTION',
      maxPoolSize: payload.maxPoolSize ?? 2,
      activeMaxPoolSize: 2,
      poolSizeRestartRequired: (payload.maxPoolSize ?? 2) !== 2,
      defaultBatchSize: payload.defaultBatchSize ?? 200,
      enableBackgroundWorker: payload.enableBackgroundWorker ?? true,
      defaultPollIntervalSeconds: payload.defaultPollIntervalSeconds ?? 30,
      overnightPollIntervalSeconds: payload.overnightPollIntervalSeconds ?? 300,
      overnightBackoffStartHourPh: payload.overnightBackoffStartHourPh ?? 22,
      overnightBackoffEndHourPh: payload.overnightBackoffEndHourPh ?? 6,
      storageEnabled: payload.storageEnabled ?? true,
      storageMaxConcurrency: payload.storageMaxConcurrency ?? 6,
      storageMaxFileSizeBytes: payload.storageMaxFileSizeBytes ?? 52_428_800,
      storageVerificationSampleRate: payload.storageVerificationSampleRate ?? 0.02,
      azureBlob1Enabled: payload.azureBlob1Enabled ?? true,
      clinicStorageConfigured: true,
      patientStorageConfigured: true,
      clinicEncryptionConfigured: true,
      patientEncryptionConfigured: true,
      updatedBy: 'admin@example.com',
      updatedAt: '2026-11-26T06:00:00Z',
    }));
    v1SyncService.getMappingGuide = mock(async () => ({
      version: '2026.11',
      coreProtections: [
        'v2-Wins Conflict Protection: Edited Clinic EZ v2 records are never silently overwritten.',
        'Deletion Shield: Soft-deleting in Classic (v1) never deletes migrated Clinic EZ v2 records.',
      ],
      tracks: [
        {
          track: 'TRACK1_CLINIC',
          title: 'Clinic Sync',
          targetDatabase: 'Clinic Database (Clinic EZ v2)',
          overview: 'Migrates clinic-scoped clinical charts into Clinic EZ v2.',
          globalRules: ['Every row is stamped with TenantId and ClinicId.'],
          entities: [
            {
              key: 'Patients',
              displayName: 'Clinic Patients',
              category: 'Patient Profile',
              v1SourceTables: 'public."User" (+ ClinicPatient)',
              v2TargetTable: 'public."Patients"',
              summary: 'Imports demographics and CustomFields JSONB.',
              rules: ['Sex normalizes MALE -> Male, FEMALE -> Female.'],
              columns: [
                {
                  v1Column: 'User.gender',
                  v2Column: 'Sex',
                  transform: 'MALE/M -> Male, FEMALE/F -> Female',
                },
              ],
              conflictPolicy: 'v2-Wins with Deletion Shield.',
            },
          ],
        },
        {
          track: 'TRACK2_PATIENT',
          title: 'Patient Accounts',
          targetDatabase: 'Patient Database (Clinic EZ v2)',
          overview: 'Migrates patient accounts, private files, and mirrored clinic records.',
          globalRules: ['Zero-Auth0: auth0|* converts to clerk_user_id = NULL.'],
          entities: [
            {
              key: 'FileRecords (Incl. PRIVATE)',
              displayName: 'Patient Files (Includes Private Files)',
              category: 'Personal Documents',
              v1SourceTables: 'public."File" (+ public."Folder", public."FileType")',
              v2TargetTable: 'public.file_records',
              summary: 'Flattens v1 folders into notes and preserves PRIVATE patient files.',
              rules: [
                'Folder Flattening: Appends Folder: <name> into file_records.notes.',
                'Includes PRIVATE files; skips deleted folders.',
              ],
              columns: [
                {
                  v1Column: 'Folder.name + File.notes',
                  v2Column: 'notes',
                  transform: 'Appends Folder: <Folder.name>',
                },
                {
                  v1Column: 'File.url',
                  v2Column: 'storage_key',
                  transform: 'Updated by File Storage once encrypted into Patient Cloud Vault',
                },
              ],
              conflictPolicy: 'v2-Wins with encrypted pointer protection.',
            },
          ],
        },
        {
          track: 'TRACK3_STORAGE',
          title: 'File Storage',
          targetDatabase: 'Isolated Clinic & Patient Cloud Vaults',
          overview: 'Encrypts eligible clinic and patient files independently.',
          globalRules: ['Independent clinic and patient encryption keys with zero cross-plane reuse.'],
          entities: [
            {
              key: 'ClinicStorageMigration',
              displayName: 'Clinic Files (Encrypted Cloud Vault)',
              category: 'Clinic Cloud Vault',
              v1SourceTables: 'public."RecordAttachments"',
              v2TargetTable: 'Clinic Cloud Vault + public."RecordAttachments"',
              summary: 'Encrypts clinic attachments and swaps StorageUri atomically.',
              rules: ['Streams up to configured max file size.'],
              columns: [
                {
                  v1Column: 'RecordAttachments.StorageUri (legacy URL)',
                  v2Column: 'RecordAttachments.StorageUri (vault key)',
                  transform: 'AES-256-GCM envelope encryption',
                },
              ],
              conflictPolicy: 'Idempotent via sync_storage_objects.',
            },
          ],
        },
      ],
    }));
    v1SyncService.listBindings = mock(async () => sampleBindings);
    v1SyncService.getCatalog = mock(async () => sampleCatalog);
    v1SyncService.listV2Clinics = mock(async () => sampleV2Clinics);
    v1SyncService.listRuns = mock(async () => [
      {
        id: 'run-1',
        bindingId: '11111111-1111-1111-1111-111111111111',
        mode: 'INCREMENTAL',
        sampleLimit: null,
        status: 'COMPLETED',
        triggeredBy: 'ops@example.com',
        startedAt: '2026-11-25T09:59:00Z',
        completedAt: '2026-11-25T10:00:00Z',
        summary: { cohortPatientCount: 1, durationMs: 25 },
        errorMessage: null,
      },
    ]);
    v1SyncService.listConflicts = mock(async (_id: string, opts?: any) => ({
      items: sampleConflicts,
      total: 30,
      limit: opts?.limit ?? 25,
      offset: opts?.offset ?? 0,
      hasMore: (opts?.offset ?? 0) + sampleConflicts.length < 30,
    }));
    v1SyncService.getParityReport = mock(async () => sampleParity);
    v1SyncService.resolveConflict = mock(async () => ({
      conflict: { ...sampleConflicts[0], status: 'RESOLVED_FORCE_V1' },
      message: 'Immediate forced re-sync completed.',
    }));
    v1SyncService.listRunDiffs = mock(async (_runId: string, limit = 50, offset = 0) => ({
      items: sampleDiffs,
      total: 80,
      limit,
      offset,
      hasMore: offset + sampleDiffs.length < 80,
    }));
    v1SyncService.createBinding = mock(async (payload) => ({
      ...sampleBindings[0],
      id: '99999999-1111-1111-1111-111111111111',
      name: payload.name,
      v2TenantId: payload.v2TenantId,
      v2ClinicId: payload.v2ClinicId,
    }));
    v1SyncService.updateBinding = mock(async (id, payload) => ({
      ...(sampleBindings.find((b) => b.id === id) ?? sampleBindings[0]),
      name: payload.name ?? sampleBindings[0].name,
      pollIntervalSeconds: payload.pollIntervalSeconds ?? 30,
      autoSyncEnabled: payload.autoSyncEnabled ?? false,
      patientCohortMode: payload.patientCohortMode ?? 'SCOPED',
    }));
    v1SyncService.deleteBinding = mock(async (id, force) => ({
      deletedId: id,
      name: sampleBindings.find((b) => b.id === id)?.name ?? 'Deleted',
      hadSyncHistory: Boolean(force),
    }));
    v1SyncService.getStorageObjects = mock(async (bindingId) => ({
      bindingId,
      totalCount: 0,
      items: [],
    }));
    v1SyncService.retryFailedStorage = mock(async (bindingId) => ({
      id: 'run-retry-1',
      bindingId,
      mode: 'BACKFILL',
      sampleLimit: null,
      status: 'RUNNING',
      triggeredBy: 'ops@example.com',
      startedAt: '2026-11-26T05:00:00Z',
      completedAt: null,
      summary: { track: 'TRACK3_STORAGE', mode: 'BACKFILL', processedItems: 0, totalItems: 2 },
      errorMessage: null,
    }));
    v1SyncService.runDryRun = mock(async (bindingId) => ({
      id: 'run-dry-1',
      bindingId,
      mode: 'DRY_RUN',
      sampleLimit: null,
      status: 'RUNNING',
      triggeredBy: 'ops@example.com',
      startedAt: '2026-11-26T05:00:00Z',
      completedAt: null,
      summary: { track: 'TRACK3_STORAGE', mode: 'DRY_RUN' },
      errorMessage: null,
    }));
    v1SyncService.runBackfill = mock(async (bindingId) => ({
      id: 'run-backfill-1',
      bindingId,
      mode: 'BACKFILL',
      sampleLimit: null,
      status: 'RUNNING',
      triggeredBy: 'ops@example.com',
      startedAt: '2026-11-26T05:00:00Z',
      completedAt: null,
      summary: { track: 'TRACK3_STORAGE', mode: 'BACKFILL' },
      errorMessage: null,
    }));
    v1SyncService.pullNow = mock(async (bindingId) => ({
      id: 'run-pull-1',
      bindingId,
      mode: 'INCREMENTAL',
      sampleLimit: null,
      status: 'COMPLETED',
      triggeredBy: 'ops@example.com',
      startedAt: '2026-11-26T05:00:00Z',
      completedAt: '2026-11-26T05:00:02Z',
      summary: { track: 'TRACK3_STORAGE', mode: 'INCREMENTAL' },
      errorMessage: null,
    }));
    v1SyncService.runFinalSweep = mock(async (bindingId) => ({
      run: {
        id: 'run-sweep-1',
        bindingId,
        mode: 'FINAL_SWEEP',
        sampleLimit: null,
        status: 'RUNNING',
        triggeredBy: 'ops@example.com',
        startedAt: '2026-11-26T05:00:00Z',
        completedAt: null,
        summary: { track: 'TRACK3_STORAGE', mode: 'FINAL_SWEEP' },
        errorMessage: null,
      },
    }));
    toast.success = mock(() => '') as any;
    toast.error = mock(() => '') as any;
  });

  afterEach(() => {
    adminService.getMe = origGetMe;
    adminService.getTenants = origGetTenants;
    adminService.getAdminClinics = origGetAdminClinics;
    v1SyncService.getStatus = origGetStatus;
    v1SyncService.getSettings = origGetSettings;
    v1SyncService.updateSettings = origUpdateSettings;
    v1SyncService.getMappingGuide = origGetMappingGuide;
    v1SyncService.listBindings = origListBindings;
    v1SyncService.getCatalog = origGetCatalog;
    v1SyncService.listV2Clinics = origListV2Clinics;
    v1SyncService.listRuns = origListRuns;
    v1SyncService.listConflicts = origListConflicts;
    v1SyncService.getParityReport = origGetParity;
    v1SyncService.resolveConflict = origResolveConflict;
    v1SyncService.listRunDiffs = origListRunDiffs;
    v1SyncService.createBinding = origCreateBinding;
    v1SyncService.updateBinding = origUpdateBinding;
    v1SyncService.deleteBinding = origDeleteBinding;
    v1SyncService.getStorageObjects = origGetStorageObjects;
    v1SyncService.retryFailedStorage = origRetryFailedStorage;
    v1SyncService.runDryRun = origRunDryRun;
    v1SyncService.runBackfill = origRunBackfill;
    v1SyncService.pullNow = origPullNow;
    v1SyncService.runFinalSweep = origRunFinalSweep;
    toast.success = origToastSuccess;
    toast.error = origToastError;
  });

  test('new admin UI files contain ZERO raw native HTML <select> elements', () => {
    const newUiFiles = [
      path.resolve(__dirname, '../src/routes/v1-sync.tsx'),
      path.resolve(__dirname, '../src/routes/patient-identities.tsx'),
      path.resolve(__dirname, '../src/components/PatientIdentityDirectoryPanel.tsx'),
      path.resolve(__dirname, '../src/components/ui/SelectField.tsx'),
      path.resolve(__dirname, '../src/components/v1-sync/MigrationSettingsModal.tsx'),
      path.resolve(__dirname, '../src/components/v1-sync/MappingGuideModal.tsx'),
      path.resolve(__dirname, '../src/components/v1-sync/ConnectionActionDeck.tsx'),
    ];
    for (const filePath of newUiFiles) {
      const source = fs.readFileSync(filePath, 'utf-8');
      expect(/<select(?:\s|>|\n|$)/.test(source)).toBe(false);
    }
  });

  test('does NOT default hasPermission to true while loading and blocks privileged UI until verified', () => {
    const tree = mountReactTree(<V1SyncPage initialPermissionsLoading={true} />);
    const html = tree.html;
    expect(html).toContain('Loading migration permissions');
    expect(html).not.toContain('Migrate All Records');
    expect(html).not.toContain('Freeze &amp; Retire');
    expect(v1SyncService.listBindings).not.toHaveBeenCalled();
    tree.unmount();
  });

  test('renders Restricted Administrative Module when user lacks manage:migrations', async () => {
    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={{
          isAdmin: true,
          fullName: 'Support',
          email: 'support@example.com',
          roleName: 'Support',
          permissions: ['view:tenants'],
        }}
        initialPermissionsLoading={false}
      />
    );
    await flushMicrotasks();
    expect(tree.html).toContain('Restricted Administrative Module');
    expect(tree.html).not.toContain('Migrate All Records');
    expect(v1SyncService.listBindings).not.toHaveBeenCalled();
    tree.unmount();
  });

  test('groupUnifiedConnections pairs Track 1 and Track 2 bindings sharing source/destination into one unified connection', () => {
    const grouped = groupUnifiedConnections(sampleBindings);
    expect(grouped.length).toBe(2);

    // Track 1 Binding A (v1ClinicId=3, v1OrgId=1) pairs with Track 2 Patient Plane (v1ClinicId=3, v1OrgId=1)
    expect(grouped[0].id).toBe('11111111-1111-1111-1111-111111111111');
    expect(grouped[0].name).toBe('Track 1 Binding A');
    expect(grouped[0].clinicBinding?.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(grouped[0].patientBinding?.id).toBe('33333333-3333-3333-3333-333333333333');
    expect(grouped[0].totalOpenConflicts).toBe(1);

    // Track 1 Binding B (v1ClinicId=4, v1OrgId=null) remains standalone with patientBinding=null
    expect(grouped[1].id).toBe('22222222-2222-2222-2222-222222222222');
    expect(grouped[1].clinicBinding?.id).toBe('22222222-2222-2222-2222-222222222222');
    expect(grouped[1].patientBinding).toBeNull();
  });

  test('root /v1-sync shows ONLY the unified connections roster + New Connection / Refresh, hiding health metrics until a connection is opened', async () => {
    const tree = mountReactTree(
      <V1SyncPage initialProfile={adminWithPerm} initialPermissionsLoading={false} />
    );
    await flushMicrotasks();

    // Root roster shows New Connection, Refresh, and 2 unified rows (Track 2 Patient Plane merged into Track 1 Binding A)
    expect(tree.html).toContain('New Connection');
    expect(tree.html).toContain('Refresh');
    expect(tree.html).toContain('2 connections');
    expect(tree.html).toContain('Track 1 Binding A');
    expect(tree.html).toContain('Track 1 Binding B');
    expect(tree.html).not.toContain('Track 2 Patient Plane');
    // No separate track filter tabs on the root roster
    expect(findElements(tree.tree, (el) => el.props?.role === 'tab').length).toBe(0);

    // Health stats, catalog account pool, and action deck stay hidden on root until a connection is opened
    expect(tree.html).not.toContain('Clinic Data');
    expect(tree.html).not.toContain('Patient Data');
    expect(tree.html).not.toContain('Sync History');
    expect(tree.html).not.toContain('Classic Account Pool');
    expect(tree.html).not.toContain('Migrate All Records');
    expect(v1SyncService.listRuns).not.toHaveBeenCalled();

    // Opening a unified connection reveals health metrics, Track 1 & Track 2 tabs, and workspace controls
    const openBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.title === 'Open Track 1 Binding A'
    )[0];
    expect(openBtn).toBeDefined();
    openBtn.props.onClick();
    await flushMicrotasks();

    expect(tree.html).toContain('Clinic Data');
    expect(tree.html).toContain('Patient Data');
    expect(tree.html).toContain('Migrate All Records');
    // Connection name & source -> destination live solely in the top detail header; deck uses plain track title & omits redundant Manual/Auto-Sync chip
    expect(
      findElements(tree.tree, (el) => el.type === 'h2' && textContent(el) === 'Track 1 Binding A')
        .length
    ).toBe(0);
    expect(
      findElements(tree.tree, (el) => el.type === 'h2' && textContent(el) === 'Clinic Sync').length
    ).toBe(1);
    expect(tree.html).not.toContain('>Manual<');
    const detailTabs = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.role === 'tab'
    );
    expect(detailTabs.length).toBe(3);
    expect(detailTabs.map(textContent).join(' ')).toContain('Clinic Sync');
    expect(detailTabs.map(textContent).join(' ')).toContain('Patient Accounts');
    expect(detailTabs.map(textContent).join(' ')).toContain('File Storage');
    expect(v1SyncService.listRuns).toHaveBeenCalledTimes(1);
    expect(v1SyncService.listRuns).toHaveBeenLastCalledWith(
      '11111111-1111-1111-1111-111111111111',
      15
    );

    // Switching to Patient Accounts tab inside the opened connection loads Track 2 details + Classic Account Pool
    const patientTabBtn = detailTabs.find((el) => textContent(el).includes('Patient Accounts'))!;
    patientTabBtn.props.onClick();
    await flushMicrotasks();

    expect(tree.html).toContain('Classic Account Pool');
    expect(tree.html).toContain('Switch to All Accounts');
    expect(v1SyncService.listRuns).toHaveBeenCalledTimes(2);
    expect(v1SyncService.listRuns).toHaveBeenLastCalledWith(
      '33333333-3333-3333-3333-333333333333',
      15
    );

    // Returning via All Connections hides health stats again
    const backBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('All Connections')
    )[0];
    expect(backBtn).toBeDefined();
    backBtn.props.onClick();
    await flushMicrotasks();

    expect(tree.html).not.toContain('Clinic Data');
    expect(tree.html).not.toContain('Classic Account Pool');
    expect(tree.html).not.toContain('Migrate All Records');
    expect(tree.html).toContain('Track 1 Binding B');
    tree.unmount();
  });

  test('switching connections or track tabs inside an opened connection does NOT re-fetch loadAll endpoints', async () => {
    const tree = mountReactTree(
      <V1SyncPage initialProfile={adminWithPerm} initialPermissionsLoading={false} />
    );
    await flushMicrotasks();

    expect(v1SyncService.getStatus).toHaveBeenCalledTimes(1);
    expect(v1SyncService.listBindings).toHaveBeenCalledTimes(1);
    expect(v1SyncService.getCatalog).toHaveBeenCalledTimes(1);
    expect(adminService.getTenants).toHaveBeenCalledTimes(1);
    expect(v1SyncService.listRuns).toHaveBeenCalledTimes(0);

    // Open unified connection A
    const openConnABtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.title === 'Open Track 1 Binding A'
    )[0];
    expect(openConnABtn).toBeDefined();
    openConnABtn.props.onClick();
    await flushMicrotasks();

    // Switch to Patient Accounts tab inside Connection A
    const track2Btn = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'tab' &&
        textContent(el).includes('Patient Accounts')
    )[0];
    expect(track2Btn).toBeDefined();
    track2Btn.props.onClick();
    await flushMicrotasks();

    // Switch to Connection B via the unified detail switcher
    selectCustomOption(tree, 'Switch connection', 'Track 1 Binding B');
    await flushMicrotasks();

    // loadAll endpoints must STILL have been called only ONCE!
    expect(v1SyncService.getStatus).toHaveBeenCalledTimes(1);
    expect(v1SyncService.listBindings).toHaveBeenCalledTimes(1);
    expect(v1SyncService.getCatalog).toHaveBeenCalledTimes(1);
    expect(adminService.getTenants).toHaveBeenCalledTimes(1);
    // Detail endpoints refreshed per selection (Track 1 A -> Track 2 A -> Track 1 B)
    expect((v1SyncService.listRuns as any).mock.calls.length).toBe(3);

    tree.unmount();
  });

  test('FORCE_V1 opens confirmation modal and invokes resolveConflict with FORCE_V1 + feedback', async () => {
    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId="11111111-1111-1111-1111-111111111111"
      />
    );
    await flushMicrotasks();

    const forceBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).trim() === 'Use Classic (v1)'
    )[0];
    expect(forceBtn).toBeDefined();
    forceBtn.props.onClick();

    // Confirmation modal opens with plain-English copy
    expect(tree.html).toContain('Replace with Classic (v1) Data');
    expect(tree.html).not.toContain('RESOLVED_FORCE_V1');

    const confirmBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Confirm & Replace with v1')
    )[0];
    expect(confirmBtn).toBeDefined();
    await confirmBtn.props.onClick();
    await flushMicrotasks();

    expect(v1SyncService.resolveConflict).toHaveBeenCalledWith(
      'conflict-1',
      'FORCE_V1',
      'ops@example.com'
    );
    expect(toast.success).toHaveBeenCalledWith('Immediate forced re-sync completed.');
    tree.unmount();
  });

  test('New Connection form uses custom SelectField with hierarchical tenant -> clinic scoping and strict manual UUID validation', async () => {
    const tree = mountReactTree(
      <V1SyncPage initialProfile={adminWithPerm} initialPermissionsLoading={false} />
    );
    await flushMicrotasks();

    const newConnBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('New Connection')
    )[0];
    newConnBtn.props.onClick();

    // Zero native <select> tags and zero connection-type tabs rendered in unified New Connection form
    expect(findElements(tree.tree, (el) => el.type === 'select').length).toBe(0);
    expect(findElements(tree.tree, (el) => el.props?.role === 'tab').length).toBe(0);

    // Source Organization & Source Clinic are disabled until a Source v1 Tenant is chosen
    const srcOrgInitial = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'combobox' &&
        el.props['aria-label'] === 'Source v1 Organization'
    )[0];
    const srcClinicInitial = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'combobox' &&
        el.props['aria-label'] === 'Source v1 Clinic'
    )[0];
    expect(srcOrgInitial.props.disabled).toBe(true);
    expect(srcClinicInitial.props.disabled).toBe(true);

    // Selecting Source v1 Tenant "USTP" unlocks Source Org & Source Clinic scoped strictly to USTP
    selectCustomOption(tree, 'Source v1 Tenant', 'USTP');
    const srcClinicUstp = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'combobox' &&
        el.props['aria-label'] === 'Source v1 Clinic'
    )[0];
    expect(srcClinicUstp.props.disabled).toBe(false);
    srcClinicUstp.props.onClick();
    const ustpSourceClinicOptions = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.role === 'option'
    ).map(textContent);
    expect(ustpSourceClinicOptions.some((t) => t.includes('USTP Clinic'))).toBe(true);
    expect(ustpSourceClinicOptions.some((t) => t.includes('San Ignacio Carmen'))).toBe(false);
    srcClinicUstp.props.onClick();

    // Target Clinic is disabled until a Target Tenant is chosen
    const clinicTriggerInitial = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'combobox' &&
        el.props['aria-label'] === 'Target v2 Clinic'
    )[0];
    expect(clinicTriggerInitial).toBeDefined();
    expect(clinicTriggerInitial.props.disabled).toBe(true);

    // Step 1: Select Target Tenant "Cebu Doctors Clinic" -> Target Clinic lists ONLY Cebu clinics
    selectCustomOption(tree, 'Target v2 Tenant', 'Cebu Doctors Clinic');

    const clinicTriggerCebu = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'combobox' &&
        el.props['aria-label'] === 'Target v2 Clinic'
    )[0];
    expect(clinicTriggerCebu.props.disabled).toBe(false);
    clinicTriggerCebu.props.onClick();

    const cebuOptions = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.role === 'option'
    );
    const cebuOptionTexts = cebuOptions.map(textContent);
    expect(cebuOptionTexts.some((t) => t.includes('Cebu North Branch'))).toBe(true);
    expect(cebuOptionTexts.some((t) => t.includes('Cebu South Branch'))).toBe(true);
    expect(cebuOptionTexts.some((t) => t.includes('USTP Main Clinic'))).toBe(false);

    // Close clinic dropdown and switch to USTP tenant -> auto-selects its single clinic (USTP Main Clinic)
    clinicTriggerCebu.props.onClick();
    selectCustomOption(tree, 'Target v2 Tenant', 'USTP Medical Clinic');
    const clinicTriggerUstp = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'combobox' &&
        el.props['aria-label'] === 'Target v2 Clinic'
    )[0];
    expect(textContent(clinicTriggerUstp)).toContain('USTP Main Clinic');

    // Switch to manual clinic UUID entry and enter an invalid UUID
    selectCustomOption(tree, 'Target v2 Clinic', 'Enter clinic ID manually');
    const manualInput = findElements(
      tree.tree,
      (el) => el.type === 'input' && el.props['aria-label'] === 'Manual Target v2 Clinic UUID'
    )[0];
    expect(manualInput).toBeDefined();
    manualInput.props.onChange({ target: { value: 'invalid-uuid-123' } });

    expect(tree.html).toContain('Enter a valid clinic ID');

    const saveBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.type === 'submit'
    )[0];
    expect(saveBtn.props.disabled).toBe(true);

    // Fix to a valid UUID and submit
    const updatedManualInput = findElements(
      tree.tree,
      (el) => el.type === 'input' && el.props['aria-label'] === 'Manual Target v2 Clinic UUID'
    )[0];
    updatedManualInput.props.onChange({
      target: { value: 'cb09fe02-6979-4b7a-8e50-d3b8a1419762' },
    });

    const form = findElements(tree.tree, (el) => el.type === 'form')[0];
    await form.props.onSubmit({ preventDefault: () => {} });
    await flushMicrotasks();

    // Unified creation provisions both Track 1 (Clinic Sync) and Track 2 (Patient Accounts) together
    expect(v1SyncService.createBinding).toHaveBeenCalledTimes(2);
    expect((v1SyncService.createBinding as any).mock.calls[0][0].track).toBe('TRACK1_CLINIC');
    expect((v1SyncService.createBinding as any).mock.calls[1][0].track).toBe('TRACK2_PATIENT');
    expect((v1SyncService.createBinding as any).mock.calls[1][0].v2ClinicId).toBe(
      'cb09fe02-6979-4b7a-8e50-d3b8a1419762'
    );
    tree.unmount();
  });

  test('renders pagination controls for conflicts and diffs and passes offset on Next', async () => {
    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId="11111111-1111-1111-1111-111111111111"
      />
    );
    await flushMicrotasks();

    // Open diffs for run-1
    const inspectBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).trim() === 'Inspect Changes'
    )[0];
    await inspectBtn.props.onClick();
    await flushMicrotasks();

    expect(v1SyncService.listRunDiffs).toHaveBeenCalledWith('run-1', 50, 0);

    const nextButtons = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Next')
    );
    expect(nextButtons.length).toBe(2); // Conflicts Next + Diffs Next

    // Click Conflicts Next
    await nextButtons[0].props.onClick();
    await flushMicrotasks();
    expect(v1SyncService.listConflicts).toHaveBeenLastCalledWith(
      '11111111-1111-1111-1111-111111111111',
      { limit: 25, offset: 25, status: undefined }
    );

    // Click Diffs Next
    await nextButtons[1].props.onClick();
    await flushMicrotasks();
    expect(v1SyncService.listRunDiffs).toHaveBeenLastCalledWith('run-1', 50, 50);

    tree.unmount();
  });

  test('polls automatically while any run is RUNNING and stops when COMPLETED', async () => {
    let runStatus: 'RUNNING' | 'COMPLETED' = 'RUNNING';
    v1SyncService.listRuns = mock(async () => [
      {
        id: 'run-live',
        bindingId: '11111111-1111-1111-1111-111111111111',
        mode: 'BACKFILL',
        sampleLimit: null,
        status: runStatus,
        triggeredBy: 'ops@example.com',
        startedAt: '2026-11-25T10:00:00Z',
        completedAt: null,
        summary: { cohortPatientCount: 100, durationMs: 0 },
        errorMessage: null,
      },
    ]);

    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;
    let activeCallback: (() => void) | null = null;
    let clearedCount = 0;

    globalThis.setInterval = ((cb: () => void) => {
      activeCallback = cb;
      return 123 as any;
    }) as any;
    globalThis.clearInterval = ((_id: any) => {
      clearedCount += 1;
      activeCallback = null;
    }) as any;

    try {
      const tree = mountReactTree(
        <V1SyncPage
          initialProfile={adminWithPerm}
          initialPermissionsLoading={false}
          initialSelectedBindingId="11111111-1111-1111-1111-111111111111"
        />
      );
      await flushMicrotasks();

      expect(tree.html).toContain('Live updating');
      expect(activeCallback).not.toBeNull();

      // Transition run to COMPLETED on next poll tick
      runStatus = 'COMPLETED';
      activeCallback!();
      await flushMicrotasks();

      expect(tree.html).not.toContain('Live updating');
      expect(clearedCount).toBeGreaterThanOrEqual(1);
      expect(activeCallback).toBeNull();
      tree.unmount();
    } finally {
      globalThis.setInterval = origSetInterval;
      globalThis.clearInterval = origClearInterval;
    }
  });

  test('switching to unconfigured Patient Accounts tab inside an unpaired connection does NOT leak Clinic Sync workspace and allows 1-click enable', async () => {
    v1SyncService.listBindings = mock(async () =>
      sampleBindings.filter((b) => b.track === 'TRACK1_CLINIC')
    );

    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId="11111111-1111-1111-1111-111111111111"
      />
    );
    await flushMicrotasks();

    const track2Btn = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'tab' &&
        textContent(el).includes('Patient Accounts')
    )[0];
    expect(track2Btn).toBeDefined();
    track2Btn.props.onClick();
    await flushMicrotasks();

    expect(tree.html).toContain('Patient Accounts not enabled for this connection');
    expect(tree.html).toContain('Enable Patient Accounts Sync');
    expect(tree.html).not.toContain('Migrate All Records');

    const refreshBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Refresh'
    )[0];
    expect(refreshBtn).toBeDefined();
    refreshBtn.props.onClick();
    await flushMicrotasks();

    expect(v1SyncService.listBindings).toHaveBeenCalledTimes(2);
    expect(tree.html).toContain('Patient Accounts not enabled for this connection');
    expect(tree.html).not.toContain('Migrate All Records');

    // Clicking 1-click Enable Patient Accounts Sync provisions Track 2 with the same source/destination
    const enableBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Enable Patient Accounts Sync')
    )[0];
    expect(enableBtn).toBeDefined();
    await enableBtn.props.onClick();
    await flushMicrotasks();

    expect(v1SyncService.createBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        track: 'TRACK2_PATIENT',
        name: 'Track 1 Binding A',
        v1ClinicId: 3,
        v1OrgId: 1,
        v2TenantId: 'ustp-cdo',
        v2ClinicId: 'cb09fe02-6979-4b7a-8e50-d3b8a1419762',
        patientCohortMode: 'SCOPED',
      })
    );

    tree.unmount();
  });

  test('switching from RUNNING Binding A to idle Binding B does NOT start spurious interval or extra loadAll', async () => {
    const bindingAId = '11111111-1111-1111-1111-111111111111';
    const bindingBId = '22222222-2222-2222-2222-222222222222';
    let resolveBindingBRuns!: (val: SyncRunRecordDto[]) => void;

    v1SyncService.listRuns = mock((id: string) => {
      if (id === bindingAId) {
        return Promise.resolve([
          {
            id: 'run-a-live',
            bindingId: bindingAId,
            mode: 'BACKFILL',
            sampleLimit: null,
            status: 'RUNNING',
            triggeredBy: 'ops@example.com',
            startedAt: '2026-11-25T10:00:00Z',
            completedAt: null,
            summary: { cohortPatientCount: 50, durationMs: 0 },
            errorMessage: null,
          },
        ]);
      }
      return new Promise<SyncRunRecordDto[]>((resolve) => {
        resolveBindingBRuns = resolve;
      });
    });

    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;
    let intervalCount = 0;

    globalThis.setInterval = ((_cb: () => void) => {
      intervalCount += 1;
      return intervalCount as any;
    }) as any;
    globalThis.clearInterval = ((_id: any) => {}) as any;

    try {
      const tree = mountReactTree(
        <V1SyncPage
          initialProfile={adminWithPerm}
          initialPermissionsLoading={false}
          initialSelectedBindingId="11111111-1111-1111-1111-111111111111"
        />
      );
      await flushMicrotasks();

      expect(intervalCount).toBe(1);
      expect(tree.html).toContain('Live updating');
      expect(v1SyncService.listBindings).toHaveBeenCalledTimes(1);

      selectCustomOption(tree, 'Switch connection', 'Track 1 Binding B');
      await flushMicrotasks();

      expect(intervalCount).toBe(1);
      expect(tree.html).not.toContain('Live updating');
      expect(v1SyncService.listBindings).toHaveBeenCalledTimes(1);

      resolveBindingBRuns([
        {
          id: 'run-b-done',
          bindingId: bindingBId,
          mode: 'INCREMENTAL',
          sampleLimit: null,
          status: 'COMPLETED',
          triggeredBy: 'ops@example.com',
          startedAt: '2026-11-25T10:01:00Z',
          completedAt: '2026-11-25T10:01:05Z',
          summary: { cohortPatientCount: 12, durationMs: 500 },
          errorMessage: null,
        },
      ]);
      await flushMicrotasks();

      expect(intervalCount).toBe(1);
      expect(v1SyncService.listBindings).toHaveBeenCalledTimes(1);
      expect(tree.html).toContain('12 patients');
      tree.unmount();
    } finally {
      globalThis.setInterval = origSetInterval;
      globalThis.clearInterval = origClearInterval;
    }
  });

  test('out-of-order loadBindingDetails response from prior binding does NOT overwrite active binding', async () => {
    const bindingAId = '11111111-1111-1111-1111-111111111111';
    const bindingBId = '22222222-2222-2222-2222-222222222222';
    let resolveBindingARuns!: (val: SyncRunRecordDto[]) => void;

    v1SyncService.listRuns = mock((id: string) => {
      if (id === bindingAId) {
        return new Promise<SyncRunRecordDto[]>((resolve) => {
          resolveBindingARuns = resolve;
        });
      }
      return Promise.resolve([
        {
          id: 'run-b-fresh',
          bindingId: bindingBId,
          mode: 'BACKFILL',
          sampleLimit: null,
          status: 'COMPLETED',
          triggeredBy: 'ops@example.com',
          startedAt: '2026-11-25T10:02:00Z',
          completedAt: '2026-11-25T10:02:10Z',
          summary: { cohortPatientCount: 999, durationMs: 42 },
          errorMessage: null,
        },
      ]);
    });

    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={bindingAId}
      />
    );
    await flushMicrotasks();

    // Switch to Binding B before Binding A's listRuns resolves
    selectCustomOption(tree, 'Switch connection', 'Track 1 Binding B');
    await flushMicrotasks();

    expect(tree.html).toContain('999 patients');

    // Now resolve stale Binding A request
    resolveBindingARuns([
      {
        id: 'run-a-stale',
        bindingId: bindingAId,
        mode: 'BACKFILL',
        sampleLimit: null,
        status: 'FAILED',
        triggeredBy: 'ops@example.com',
        startedAt: '2026-11-25T10:00:00Z',
        completedAt: '2026-11-25T10:00:05Z',
        summary: { cohortPatientCount: 111, durationMs: 10 },
        errorMessage: 'Stale error from Binding A',
      },
    ]);
    await flushMicrotasks();

    expect(tree.html).toContain('999 patients');
    expect(tree.html).not.toContain('Stale error from Binding A');
    expect(tree.html).not.toContain('111 patients');
    tree.unmount();
  });

  test('disables Create Connection when v2ClinicOptions is empty with empty UUID and blocks whitespace-only name', async () => {
    v1SyncService.listBindings = mock(async () => []);
    v1SyncService.listV2Clinics = mock(async () => []);

    const tree = mountReactTree(
      <V1SyncPage initialProfile={adminWithPerm} initialPermissionsLoading={false} />
    );
    await flushMicrotasks();

    const newConnBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('New Connection')
    )[0];
    newConnBtn.props.onClick();

    // Empty clinics + empty UUID on Clinic Sync -> submit disabled
    const saveBtnInitial = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.type === 'submit'
    )[0];
    expect(saveBtnInitial.props.disabled).toBe(true);
    expect(tree.html).toContain('Target Clinic ID is required for clinic sync connections.');

    // Enter valid UUID + whitespace-only connection name
    const manualInput = findElements(
      tree.tree,
      (el) => el.type === 'input' && el.props['aria-label'] === 'Manual Target v2 Clinic UUID'
    )[0];
    manualInput.props.onChange({
      target: { value: 'cb09fe02-6979-4b7a-8e50-d3b8a1419762' },
    });

    const nameInput = findElements(
      tree.tree,
      (el) => el.type === 'input' && el.props['aria-label'] === 'Connection Name'
    )[0];
    expect(nameInput).toBeDefined();
    nameInput.props.onChange({ target: { value: '   ' } });

    const saveBtnWhitespace = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.type === 'submit'
    )[0];
    expect(saveBtnWhitespace.props.disabled).toBe(true);

    const form = findElements(tree.tree, (el) => el.type === 'form')[0];
    await form.props.onSubmit({ preventDefault: () => {} });
    await flushMicrotasks();

    expect(v1SyncService.createBinding).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Connection name is required.');
    tree.unmount();
  });

  test('Edit Sync Connection modal edits name, poll interval, track toggles across both tracks and guards mapping override + deletion', async () => {
    const tree = mountReactTree(
      <V1SyncPage initialProfile={adminWithPerm} initialPermissionsLoading={false} />
    );
    await flushMicrotasks();

    // Open Edit modal directly from the Connections Roster row
    const editRowBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.title === 'Edit Track 1 Binding A'
    )[0];
    expect(editRowBtn).toBeDefined();
    editRowBtn.props.onClick();

    expect(tree.html).toContain('Edit Sync Connection');
    expect(tree.html).toContain('Locked · Sync History');
    expect(findElements(tree.tree, (el) => el.type === 'select').length).toBe(0);

    // Rename + update poll interval to 60s + enable Clinic Sync Auto-Sync
    const nameInput = findElements(
      tree.tree,
      (el) => el.type === 'input' && el.props['aria-label'] === 'Edit Connection Name'
    )[0];
    expect(nameInput).toBeDefined();
    nameInput.props.onChange({ target: { value: 'USTP Unified Clinic' } });

    selectCustomOption(tree, 'Edit Poll Interval', 'Every 1 minute');

    const clinicAutoSyncToggle = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Toggle Clinic Sync Auto-Sync'
    )[0];
    expect(clinicAutoSyncToggle).toBeDefined();
    clinicAutoSyncToggle.props.onClick();

    // Submit safe metadata changes (does NOT pass updateMapping or forceMappingChange)
    const editForm = findElements(tree.tree, (el) => el.type === 'form')[0];
    await editForm.props.onSubmit({ preventDefault: () => {} });
    await flushMicrotasks();

    expect(v1SyncService.updateBinding).toHaveBeenCalledTimes(2);
    expect(v1SyncService.updateBinding).toHaveBeenNthCalledWith(
      1,
      '11111111-1111-1111-1111-111111111111',
      expect.objectContaining({
        name: 'USTP Unified Clinic',
        pollIntervalSeconds: 60,
        autoSyncEnabled: true,
      })
    );
    expect((v1SyncService.updateBinding as any).mock.calls[0][1].updateMapping).toBeUndefined();
    expect(v1SyncService.updateBinding).toHaveBeenNthCalledWith(
      2,
      '33333333-3333-3333-3333-333333333333',
      expect.objectContaining({
        name: 'USTP Unified Clinic',
        pollIntervalSeconds: 60,
        autoSyncEnabled: false,
        patientCohortMode: 'SCOPED',
      })
    );

    // Re-open Edit modal, unlock mapping, change Source Organization -> sends forceMappingChange=true
    const editRowBtn2 = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.title === 'Edit Track 1 Binding A'
    )[0];
    editRowBtn2.props.onClick();

    const unlockBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Unlock Mapping')
    )[0];
    expect(unlockBtn).toBeDefined();
    unlockBtn.props.onClick();
    expect(tree.html).toContain('Unlocked (Resets Ledger)');

    selectCustomOption(tree, 'Edit Source v1 Organization', 'None (Clinic only)');
    const editForm2 = findElements(tree.tree, (el) => el.type === 'form')[0];
    await editForm2.props.onSubmit({ preventDefault: () => {} });
    await flushMicrotasks();

    expect(v1SyncService.updateBinding).toHaveBeenCalledTimes(4);
    expect((v1SyncService.updateBinding as any).mock.calls[2][1]).toMatchObject({
      updateMapping: true,
      v1OrgId: null,
      forceMappingChange: true,
    });

    // Re-open Edit modal -> Delete Connection requires typing DELETE when sync history exists
    const editRowBtn3 = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.title === 'Edit Track 1 Binding A'
    )[0];
    editRowBtn3.props.onClick();

    const deleteTrigger = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Delete Connection')
    )[0];
    expect(deleteTrigger).toBeDefined();
    deleteTrigger.props.onClick();

    const confirmDeleteDisabled = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Confirm Delete')
    )[0];
    expect(confirmDeleteDisabled.props.disabled).toBe(true);

    const tokenInput = findElements(
      tree.tree,
      (el) => el.type === 'input' && el.props['aria-label'] === 'Confirm Delete Connection Token'
    )[0];
    tokenInput.props.onChange({ target: { value: 'DELETE' } });

    const confirmDeleteEnabled = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Confirm Delete')
    )[0];
    expect(confirmDeleteEnabled.props.disabled).toBe(false);
    await confirmDeleteEnabled.props.onClick();
    await flushMicrotasks();

    expect(v1SyncService.deleteBinding).toHaveBeenCalledTimes(2);
    expect(v1SyncService.deleteBinding).toHaveBeenNthCalledWith(
      1,
      '11111111-1111-1111-1111-111111111111',
      true
    );
    expect(v1SyncService.deleteBinding).toHaveBeenNthCalledWith(
      2,
      '33333333-3333-3333-3333-333333333333',
      true
    );

    tree.unmount();
  });

  test('renders LiveImportProgressCard with stage progress, incremental counters, verbose log toggle, and configurable batch size', async () => {
    v1SyncService.listRuns = mock(async () => [
      {
        id: 'run-live-import',
        bindingId: '11111111-1111-1111-1111-111111111111',
        mode: 'BACKFILL',
        sampleLimit: null,
        status: 'RUNNING',
        triggeredBy: 'ops@example.com',
        startedAt: '2026-11-26T11:30:00Z',
        completedAt: null,
        summary: {
          track: 'TRACK1_CLINIC',
          mode: 'BACKFILL',
          batchSize: 50,
          cohortPatientCount: 250,
          currentStage: 'Appointments, Queue, Consultations & Vitals',
          stageIndex: 3,
          totalStages: 9,
          processedItems: 150,
          totalItems: 250,
          percentComplete: 28,
          durationMs: 4200,
          entities: {
            Patient: {
              created: 250,
              updated: 0,
              unchanged: 0,
              skippedV2Wins: 0,
              shieldedDeletes: 0,
              adoptedExisting: 0,
              errors: 0,
            },
            Appointment: {
              created: 112,
              updated: 4,
              unchanged: 0,
              skippedV2Wins: 0,
              shieldedDeletes: 0,
              adoptedExisting: 0,
              errors: 0,
            },
          },
          verboseLogs: [
            '[11:30:01] Stage 1/9: Patients & Custom Profiles — starting (250 patient(s), 5 batch(es) of 50)',
            '[11:30:03] Stage 3/9 batch 3/5 (150/250) — +362 added, 4 updated, 0 unchanged, 0 kept v2',
          ],
        },
        errorMessage: null,
      },
    ]);

    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;
    globalThis.setInterval = (() => 999 as any) as any;
    globalThis.clearInterval = (() => {}) as any;

    try {
      const tree = mountReactTree(
        <V1SyncPage
          initialProfile={adminWithPerm}
          initialPermissionsLoading={false}
          initialSelectedBindingId="11111111-1111-1111-1111-111111111111"
        />
      );
      await flushMicrotasks();

      // LiveImportProgressCard renders stage, batch count, percent, and incremental counters
      expect(tree.html).toContain('Full Migration in Progress');
      expect(tree.html).toContain('Stage 3 / 9');
      expect(tree.html).toContain('Appointments, Queue, Consultations &amp; Vitals');
      expect(tree.html).toContain('150 / 250 patients in current stage');
      expect(tree.html).toContain('Batch: 50');
      expect(tree.html).toContain('28%');
      expect(tree.html).toContain('+362');
      expect(tree.html).toContain('By Record Type (2)');
      expect(tree.html).toContain('Patients');
      expect(tree.html).toContain('Appointments');
      expect(tree.html).toContain('+250');
      expect(tree.html).toContain('+112');
      expect(tree.html).toContain('4 updated');
      expect(tree.html).not.toContain('0 upd');
      expect(tree.html).not.toContain('0 eq');
      expect(tree.html).not.toContain('Stage 3/9 batch 3/5');

      // Toggling Verbose Log opens the zero-PHI timestamped stream
      const verboseBtn = findElements(
        tree.tree,
        (el) => el.type === 'button' && textContent(el).trim() === 'Verbose Log'
      )[0];
      expect(verboseBtn).toBeDefined();
      verboseBtn.props.onClick();

      expect(tree.html).toContain('Verbose Migration Log (Zero PHI)');
      expect(tree.html).toContain('Stage 3/9 batch 3/5 (150/250)');

      tree.unmount();
    } finally {
      globalThis.setInterval = origSetInterval;
      globalThis.clearInterval = origClearInterval;
    }
  });

  test('groupUnifiedConnections supports 3-track pairing, Track 2+3 pairing, and standalone Track 3', () => {
    const storageBindingA: SyncBindingDto = {
      ...sampleBindings[0],
      id: '44444444-4444-4444-4444-444444444444',
      track: 'TRACK3_STORAGE',
      name: 'Track 3 Storage A',
      lastChangelogSeq: 0,
      openConflictCount: 0,
    };
    const patientOnlyBinding: SyncBindingDto = {
      ...sampleBindings[2],
      id: '55555555-5555-5555-5555-555555555555',
      v1ClinicId: 9,
      v1OrgId: 9,
      name: 'Patient Only',
    };
    const storageForPatientOnly: SyncBindingDto = {
      ...sampleBindings[2],
      id: '66666666-6666-6666-6666-666666666666',
      track: 'TRACK3_STORAGE',
      v1ClinicId: 9,
      v1OrgId: 9,
      name: 'Storage For Patient Only',
    };
    const standaloneStorage: SyncBindingDto = {
      ...sampleBindings[2],
      id: '77777777-7777-7777-7777-777777777777',
      track: 'TRACK3_STORAGE',
      v1ClinicId: 99,
      v1OrgId: null,
      name: 'Standalone File Storage',
      hasSyncHistory: true,
    };

    const grouped = groupUnifiedConnections([
      ...sampleBindings,
      storageBindingA,
      patientOnlyBinding,
      storageForPatientOnly,
      standaloneStorage,
    ]);

    expect(grouped.length).toBe(4);
    expect(grouped[0].clinicBinding?.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(grouped[0].patientBinding?.id).toBe('33333333-3333-3333-3333-333333333333');
    expect(grouped[0].storageBinding?.id).toBe('44444444-4444-4444-4444-444444444444');

    expect(grouped[2].clinicBinding).toBeNull();
    expect(grouped[2].patientBinding?.id).toBe('55555555-5555-5555-5555-555555555555');
    expect(grouped[2].storageBinding?.id).toBe('66666666-6666-6666-6666-666666666666');

    expect(grouped[3].clinicBinding).toBeNull();
    expect(grouped[3].patientBinding).toBeNull();
    expect(grouped[3].storageBinding?.id).toBe('77777777-7777-7777-7777-777777777777');
    expect(grouped[3].hasSyncHistory).toBe(true);
  });

  test('File Storage tab gates unlock when no clinic/patient file metadata exists and unlocks 1-click Enable File Storage once indexed', async () => {
    v1SyncService.getStatus = mock(async () => ({
      ...sampleStatus,
      clinicTotalStorageCount: 0,
      patientTotalStorageCount: 0,
      clinicPendingStorageCount: 0,
      patientPendingStorageCount: 0,
    }));

    const treeLocked = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId="11111111-1111-1111-1111-111111111111"
      />
    );
    await flushMicrotasks();

    const fileTabLocked = findElements(
      treeLocked.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'tab' &&
        textContent(el).includes('File Storage')
    )[0];
    expect(fileTabLocked).toBeDefined();
    fileTabLocked.props.onClick();
    await flushMicrotasks();

    expect(treeLocked.html).toContain('Migrate Clinic or Patient Records First');
    const disabledEnableBtn = findElements(
      treeLocked.tree,
      (el) => el.type === 'button' && textContent(el).includes('Enable File Storage')
    )[0];
    expect(disabledEnableBtn).toBeDefined();
    expect(disabledEnableBtn.props.disabled).toBe(true);

    // Quick jump back to Clinic Sync works
    const goClinicBtn = findElements(
      treeLocked.tree,
      (el) => el.type === 'button' && textContent(el).includes('Go to Clinic Sync')
    )[0];
    expect(goClinicBtn).toBeDefined();
    goClinicBtn.props.onClick();
    await flushMicrotasks();
    expect(treeLocked.html).toContain('Migrate All Records');
    treeLocked.unmount();

    // Now with indexed files present -> 1-click Enable File Storage works
    v1SyncService.getStatus = mock(async () => sampleStatus);
    const treeUnlocked = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId="11111111-1111-1111-1111-111111111111"
      />
    );
    await flushMicrotasks();

    const fileTabUnlocked = findElements(
      treeUnlocked.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'tab' &&
        textContent(el).includes('File Storage')
    )[0];
    fileTabUnlocked.props.onClick();
    await flushMicrotasks();

    expect(treeUnlocked.html).toContain('File Storage Readiness');
    expect(treeUnlocked.html).toContain('File Storage not enabled for this connection');
    const enableStorageBtn = findElements(
      treeUnlocked.tree,
      (el) => el.type === 'button' && textContent(el).includes('Enable File Storage')
    )[0];
    expect(enableStorageBtn.props.disabled).toBe(false);
    await enableStorageBtn.props.onClick();
    await flushMicrotasks();

    expect(v1SyncService.createBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        track: 'TRACK3_STORAGE',
        name: 'Track 1 Binding A',
        v1ClinicId: 3,
        v1OrgId: 1,
        v2TenantId: 'ustp-cdo',
        v2ClinicId: 'cb09fe02-6979-4b7a-8e50-d3b8a1419762',
      })
    );
    treeUnlocked.unmount();
  });

  test('Track 3 File Storage tab renders health card, filters forwarding options, live GB/MBps progress, skipped/failed table, and Retry Failed', async () => {
    const storageBinding: SyncBindingDto = {
      ...sampleBindings[0],
      id: '44444444-4444-4444-4444-444444444444',
      track: 'TRACK3_STORAGE',
      name: 'Track 3 File Storage',
    };
    v1SyncService.listBindings = mock(async () => [...sampleBindings, storageBinding]);
    v1SyncService.listRuns = mock(async (id: string) => {
      if (id === storageBinding.id) {
        return [
          {
            id: 'run-storage-live',
            bindingId: storageBinding.id,
            mode: 'BACKFILL',
            sampleLimit: null,
            status: 'RUNNING',
            triggeredBy: 'ops@example.com',
            startedAt: '2026-11-26T05:10:00Z',
            completedAt: null,
            summary: {
              track: 'TRACK3_STORAGE',
              mode: 'BACKFILL',
              batchSize: 50,
              currentStage: 'Encrypting & transferring files',
              stageIndex: 2,
              totalStages: 3,
              processedItems: 40,
              totalItems: 100,
              percentComplete: 40,
              durationMs: 12_000,
              bytesDownloaded: 2_147_483_648,
              bytesUploaded: 2_147_483_648,
              transferRateMbps: 18.4,
              clinicCopiesMigrated: 25,
              patientCopiesMigrated: 15,
              skippedCount: 6,
              failedCount: 2,
              overlapSavedDownloads: 5,
              verboseLogs: ['[05:10:02] Encrypted 25 clinic files & 15 patient files (18.4 MB/s)'],
            },
            errorMessage: null,
          },
        ];
      }
      return [];
    });
    v1SyncService.getStorageObjects = mock(async (bindingId) => ({
      bindingId,
      totalCount: 4,
      items: [
        {
          targetPlane: 'CLINIC_ATTACHMENT',
          targetEntityId: 'aaaa1111-1111-1111-1111-111111111111',
          ownerId: 'bbbb1111-1111-1111-1111-111111111111',
          tenantId: 'ustp-cdo',
          sourceProvider: 'GOOGLE_DRIVE',
          status: 'SKIPPED_LEGACY_UNSUPPORTED',
          sourceSizeBytes: 0,
          encryptedSizeBytes: 0,
          attemptCount: 1,
          lastErrorCode: 'LEGACY_GOOGLE_DRIVE',
          lastErrorMessage: null,
          migratedAt: null,
          verifiedAt: null,
          updatedAt: '2026-11-26T05:10:00Z',
        },
        {
          targetPlane: 'PATIENT_FILE',
          targetEntityId: 'cccc1111-1111-1111-1111-111111111111',
          ownerId: 'dddd1111-1111-1111-1111-111111111111',
          tenantId: null,
          sourceProvider: 'AZURE_BLOB_1',
          status: 'SKIPPED_DEAD_LINK',
          sourceSizeBytes: 0,
          encryptedSizeBytes: 0,
          attemptCount: 1,
          lastErrorCode: '404_NOT_FOUND',
          lastErrorMessage: null,
          migratedAt: null,
          verifiedAt: null,
          updatedAt: '2026-11-26T05:10:00Z',
        },
        {
          targetPlane: 'PATIENT_FILE',
          targetEntityId: 'eeee1111-1111-1111-1111-111111111111',
          ownerId: 'ffff1111-1111-1111-1111-111111111111',
          tenantId: null,
          sourceProvider: 'AZURE_BLOB_1',
          status: 'SKIPPED_AUTH_REQUIRED',
          sourceSizeBytes: 2048,
          encryptedSizeBytes: 0,
          attemptCount: 1,
          lastErrorCode: 'HTML_INTERSTITIAL',
          lastErrorMessage: null,
          migratedAt: null,
          verifiedAt: null,
          updatedAt: '2026-11-26T05:10:00Z',
        },
        {
          targetPlane: 'CLINIC_ATTACHMENT',
          targetEntityId: '99991111-1111-1111-1111-111111111111',
          ownerId: '88881111-1111-1111-1111-111111111111',
          tenantId: 'ustp-cdo',
          sourceProvider: 'AZURE_BLOB_1',
          status: 'FAILED_RETRYABLE',
          sourceSizeBytes: 5_242_880,
          encryptedSizeBytes: 0,
          attemptCount: 2,
          lastErrorCode: 'TRANSIENT_TIMEOUT',
          lastErrorMessage: null,
          migratedAt: null,
          verifiedAt: null,
          updatedAt: '2026-11-26T05:10:00Z',
        },
      ],
    }));

    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;
    globalThis.setInterval = (() => 888 as any) as any;
    globalThis.clearInterval = (() => {}) as any;

    try {
      const tree = mountReactTree(
        <V1SyncPage
          initialProfile={adminWithPerm}
          initialPermissionsLoading={false}
          initialSelectedBindingId={storageBinding.id}
        />
      );
      await flushMicrotasks();

      // Health strip 6th card + readiness bar
      expect(tree.html).toContain('File Storage');
      expect(tree.html).toContain('20 files pending');
      expect(tree.html).toContain('File Storage Readiness');
      expect(tree.html).toContain('12 pending / 100 total');
      expect(tree.html).toContain('8 pending / 200 total');

      // LiveImportProgressCard in Track 3 mode
      expect(tree.html).toContain('40 / 100 files in current stage');
      expect(tree.html).toContain('2.00 GB');
      expect(tree.html).toContain('2.3 MB/s');
      expect(tree.html).toContain('Clinic Files: 25');
      expect(tree.html).toContain('Patient Files: 15');
      expect(tree.html).toContain('Shared Downloads Saved: 5');
      expect(tree.html).toContain('Transfer Failed: 2');

      // Skipped & Failed Files table with zero-jargon chips
      expect(tree.html).toContain('Skipped &amp; Failed Files (4)');
      expect(tree.html).toContain('External Link (Kept As-Is)');
      expect(tree.html).toContain('Unavailable (Kept As-Is)');
      expect(tree.html).toContain('Needs Access (Kept As-Is)');
      expect(tree.html).toContain('Transfer Failed');

      // Zero-jargon verification on rendered Track 3 HTML
      const forbiddenTerms = [
        'CMK',
        'PMK',
        'DEK',
        '.cez',
        'SKIPPED_LEGACY_UNSUPPORTED',
        'SKIPPED_DEAD_LINK',
        'SKIPPED_AUTH_REQUIRED',
        'SKIPPED_EMPTY_BLOB',
        'FAILED_RETRYABLE',
        'FAILED_PERMANENT',
        'NXDOMAIN',
        'RecordAttachments',
        'file_records',
        'sync_storage_objects',
        'HTML Interstitial',
        'ClinicEZ',
      ];
      for (const term of forbiddenTerms) {
        expect(tree.html).not.toContain(term);
      }
      expect(/\bR2\b/.test(tree.html)).toBe(false);

      // Pause running state so action deck & retry button are enabled
      v1SyncService.listRuns = mock(async () => [
        {
          id: 'run-storage-done',
          bindingId: storageBinding.id,
          mode: 'BACKFILL',
          sampleLimit: null,
          status: 'COMPLETED',
          triggeredBy: 'ops@example.com',
          startedAt: '2026-11-26T05:10:00Z',
          completedAt: '2026-11-26T05:11:00Z',
          summary: {
            track: 'TRACK3_STORAGE',
            mode: 'BACKFILL',
            totalItems: 100,
            bytesUploaded: 2_147_483_648,
            transferRateMbps: 18.4,
            durationMs: 60_000,
          },
          errorMessage: null,
        },
      ]);
      const refreshBtn = findElements(
        tree.tree,
        (el) => el.type === 'button' && el.props['aria-label'] === 'Refresh'
      )[0];
      await refreshBtn.props.onClick();
      await flushMicrotasks();

      expect(tree.html).toContain('100 files · 2.00 GB · 2.3 MB/s');
      expect(tree.html).toContain('Migrate All Files');

      // Select Target = Clinic Files Only and Source = Primary Storage Only -> verify filter forwarding
      selectCustomOption(tree, 'Target file scope', 'Clinic Files Only');
      selectCustomOption(tree, 'Source file filter', 'Primary Storage Only');

      // Retry Failed calls retryFailedStorage while idle (and starts RUNNING retry run)
      const retryBtn = findElements(
        tree.tree,
        (el) => el.type === 'button' && textContent(el).includes('Retry Failed')
      )[0];
      expect(retryBtn).toBeDefined();
      expect(retryBtn.props.disabled).toBe(false);
      await retryBtn.props.onClick();
      await flushMicrotasks();

      expect(v1SyncService.retryFailedStorage).toHaveBeenCalledWith(storageBinding.id, {
        asyncMode: true,
      });

      // Refresh back to idle COMPLETED state, then trigger Full Preview with selected filters
      await refreshBtn.props.onClick();
      await flushMicrotasks();

      const previewBtn = findElements(
        tree.tree,
        (el) => el.type === 'button' && textContent(el).trim() === 'Full Preview'
      )[0];
      expect(previewBtn.props.disabled).toBe(false);
      await previewBtn.props.onClick();
      await flushMicrotasks();

      expect(v1SyncService.runDryRun).toHaveBeenCalledWith(
        storageBinding.id,
        null,
        expect.objectContaining({
          asyncMode: true,
          providerFilter: 'AZURE_BLOB_1',
          targetPlaneFilter: 'CLINIC_ONLY',
        })
      );

      tree.unmount();
    } finally {
      globalThis.setInterval = origSetInterval;
      globalThis.clearInterval = origClearInterval;
    }
  });

  test('3-track Create, Edit, and Delete flows include TRACK3_STORAGE when enabled', async () => {
    const storageBindingA: SyncBindingDto = {
      ...sampleBindings[0],
      id: '44444444-4444-4444-4444-444444444444',
      track: 'TRACK3_STORAGE',
      name: 'Track 3 Storage A',
      autoSyncEnabled: false,
      lastChangelogSeq: 0,
      openConflictCount: 0,
    };
    v1SyncService.listBindings = mock(async () => [...sampleBindings, storageBindingA]);

    const tree = mountReactTree(
      <V1SyncPage initialProfile={adminWithPerm} initialPermissionsLoading={false} />
    );
    await flushMicrotasks();

    // Edit modal on 3-track connection shows File Storage chip + Auto-Sync toggle & deletes all 3
    const editRowBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.title === 'Edit Track 1 Binding A'
    )[0];
    editRowBtn.props.onClick();

    expect(tree.html).toContain('File Storage Auto-Sync');
    const storageAutoSyncToggle = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Toggle File Storage Auto-Sync'
    )[0];
    expect(storageAutoSyncToggle).toBeDefined();
    storageAutoSyncToggle.props.onClick();

    const editForm = findElements(tree.tree, (el) => el.type === 'form')[0];
    await editForm.props.onSubmit({ preventDefault: () => {} });
    await flushMicrotasks();

    expect(v1SyncService.updateBinding).toHaveBeenCalledTimes(3);
    expect(v1SyncService.updateBinding).toHaveBeenNthCalledWith(
      3,
      '44444444-4444-4444-4444-444444444444',
      expect.objectContaining({ autoSyncEnabled: true })
    );

    // Re-open Edit modal and delete 3-track connection -> deletes all 3 bindings
    const editRowBtn2 = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props.title === 'Edit Track 1 Binding A'
    )[0];
    editRowBtn2.props.onClick();

    const deleteTrigger = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Delete Connection')
    )[0];
    deleteTrigger.props.onClick();

    const tokenInput = findElements(
      tree.tree,
      (el) => el.type === 'input' && el.props['aria-label'] === 'Confirm Delete Connection Token'
    )[0];
    tokenInput.props.onChange({ target: { value: 'DELETE' } });

    const confirmDeleteBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Confirm Delete')
    )[0];
    await confirmDeleteBtn.props.onClick();
    await flushMicrotasks();

    expect(v1SyncService.deleteBinding).toHaveBeenCalledTimes(3);
    expect(v1SyncService.deleteBinding).toHaveBeenNthCalledWith(
      3,
      '44444444-4444-4444-4444-444444444444',
      true
    );

    // Create Connection with Include File Storage Track toggled on provisions all 3 tracks
    const newConnBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('New Connection')
    )[0];
    newConnBtn.props.onClick();

    selectCustomOption(tree, 'Source v1 Tenant', 'USTP');
    selectCustomOption(tree, 'Target v2 Tenant', 'USTP Medical Clinic');
    const toggleCreateStorage = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' && el.props['aria-label'] === 'Toggle File Storage Track on Create'
    )[0];
    expect(toggleCreateStorage).toBeDefined();
    toggleCreateStorage.props.onClick();

    const createForm = findElements(tree.tree, (el) => el.type === 'form')[0];
    await createForm.props.onSubmit({ preventDefault: () => {} });
    await flushMicrotasks();

    expect(v1SyncService.createBinding).toHaveBeenCalledTimes(3);
    expect((v1SyncService.createBinding as any).mock.calls[2][0].track).toBe('TRACK3_STORAGE');

    tree.unmount();
  });

  test('groupUnifiedConnections never cross-pairs distinct non-null v2ClinicId clinics sharing tenant/v1 coordinates', () => {
    const clinicA: SyncBindingDto = {
      ...sampleBindings[0],
      id: 'clinic-a',
      track: 'TRACK1_CLINIC',
      name: 'Clinic A',
      v1ClinicId: 10,
      v1OrgId: 1,
      v2TenantId: 'tenant-a',
      v2ClinicId: '11111111-1111-4111-8111-111111111111',
    };
    const clinicB: SyncBindingDto = {
      ...sampleBindings[0],
      id: 'clinic-b',
      track: 'TRACK1_CLINIC',
      name: 'Clinic B',
      v1ClinicId: 10,
      v1OrgId: 1,
      v2TenantId: 'tenant-a',
      v2ClinicId: '22222222-2222-4222-8222-222222222222',
    };
    const patientB: SyncBindingDto = {
      ...sampleBindings[2],
      id: 'patient-b',
      track: 'TRACK2_PATIENT',
      name: 'Patient B',
      v1ClinicId: 10,
      v1OrgId: 1,
      v2TenantId: 'tenant-a',
      v2ClinicId: '22222222-2222-4222-8222-222222222222',
    };
    const storageB: SyncBindingDto = {
      ...sampleBindings[0],
      id: 'storage-b',
      track: 'TRACK3_STORAGE',
      name: 'Storage B',
      v1ClinicId: 10,
      v1OrgId: 1,
      v2TenantId: 'tenant-a',
      v2ClinicId: '22222222-2222-4222-8222-222222222222',
    };

    const grouped = groupUnifiedConnections([clinicA, clinicB, patientB, storageB]);
    expect(grouped).toHaveLength(2);
    const connA = grouped.find((c) => c.id === 'clinic-a')!;
    const connB = grouped.find((c) => c.id === 'clinic-b')!;
    expect(connA.patientBinding).toBeNull();
    expect(connA.storageBinding).toBeNull();
    expect(connB.patientBinding?.id).toBe('patient-b');
    expect(connB.storageBinding?.id).toBe('storage-b');
  });

  test('Track 2 + Track 3 connection stays on File Storage tab across Refresh (loadAll)', async () => {
    const patientOnly: SyncBindingDto = {
      ...sampleBindings[2],
      id: '2222aaaa-1111-1111-1111-111111111111',
      track: 'TRACK2_PATIENT',
      name: 'Track 2+3 Unified',
      v1ClinicId: 77,
      v1OrgId: 7,
      v2TenantId: 'ustp-cdo',
      v2ClinicId: 'cb09fe02-6979-4b7a-8e50-d3b8a1419762',
    };
    const storageOnly: SyncBindingDto = {
      ...sampleBindings[0],
      id: '3333aaaa-1111-1111-1111-111111111111',
      track: 'TRACK3_STORAGE',
      name: 'Track 2+3 Storage',
      v1ClinicId: 77,
      v1OrgId: 7,
      v2TenantId: 'ustp-cdo',
      v2ClinicId: 'cb09fe02-6979-4b7a-8e50-d3b8a1419762',
    };
    v1SyncService.listBindings = mock(async () => [patientOnly, storageOnly]);

    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={patientOnly.id}
      />
    );
    await flushMicrotasks();

    const getTab = (label: string) =>
      findElements(
        tree.tree,
        (el) => el.type === 'button' && el.props.role === 'tab' && textContent(el).includes(label)
      )[0];

    expect(getTab('Patient Accounts').props['aria-selected']).toBe(true);
    expect(getTab('File Storage').props['aria-selected']).toBe(false);

    getTab('File Storage').props.onClick();
    await flushMicrotasks();
    expect(getTab('File Storage').props['aria-selected']).toBe(true);
    expect(getTab('Patient Accounts').props['aria-selected']).toBe(false);

    const refreshBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Refresh'
    )[0];
    await refreshBtn.props.onClick();
    await flushMicrotasks();

    expect(getTab('File Storage').props['aria-selected']).toBe(true);
    expect(getTab('Patient Accounts').props['aria-selected']).toBe(false);
    tree.unmount();
  });

  test('Track 3 components sanitize all backend jargon across RecordVerificationCard, LiveImportProgressCard, and SyncActivityCard', async () => {
    const forbiddenTerms = [
      'CMK',
      'PMK',
      'DEK',
      '.cez',
      'SKIPPED_',
      'FAILED_',
      'NXDOMAIN',
      'RecordAttachments',
      'file_records',
      'FileRecords',
      'sync_storage_objects',
      'HTML Interstitial',
      'ClinicEZ',
      'Azure Blob',
    ];
    const assertCleanHtml = (html: string) => {
      for (const term of forbiddenTerms) {
        expect(html).not.toContain(term);
      }
      expect(/\bR2\b/.test(html)).toBe(false);
    };

    const parityReport: ParityReportDto = {
      bindingId: 'b-storage',
      track: 'TRACK3_STORAGE',
      bindingName: 'Storage Binding',
      isFrozen: false,
      changelogMaxSeq: 0,
      lastCursorSeq: 0,
      changelogLag: 0,
      openConflictsCount: 0,
      readyToFreeze: false,
      checks: [
        {
          entityType: 'Clinic RecordAttachments (AES-256-GCM)',
          v1ExpectedCount: 100,
          v2ActualCount: 90,
          mappedLedgerCount: 90,
          isMatched: false,
          notes: '10 reachable Azure Blob #1 Clinic attachments still pending.',
        },
        {
          entityType: 'Patient FileRecords (AES-256-GCM)',
          v1ExpectedCount: 50,
          v2ActualCount: 50,
          mappedLedgerCount: 50,
          isMatched: true,
          notes: 'All 50 reachable Patient files encrypted.',
        },
        {
          entityType: 'Skipped Legacy / Dead / Auth-Gated (Kept As-Is)',
          v1ExpectedCount: 10,
          v2ActualCount: 10,
          mappedLedgerCount: 10,
          isMatched: true,
          notes: 'Dead=2, Empty=1, Auth=3, Legacy=4',
        },
        {
          entityType: 'Failed Transfers (Retryable / Permanent)',
          v1ExpectedCount: 0,
          v2ActualCount: 3,
          mappedLedgerCount: 3,
          isMatched: false,
          notes: 'Retryable=2, Permanent=1',
        },
        {
          entityType: 'RecordAttachments',
          v1ExpectedCount: 1,
          v2ActualCount: 1,
          mappedLedgerCount: 1,
          isMatched: true,
          notes:
            'CMK PMK DEK record.cez SKIPPED_LEGACY_UNSUPPORTED NXDOMAIN R2 HTML Interstitial ClinicEZ',
        },
        {
          entityType: 'file_records',
          v1ExpectedCount: 1,
          v2ActualCount: 1,
          mappedLedgerCount: 1,
          isMatched: true,
          notes: 'sync_storage_objects Azure Blob #2 FAILED_RETRYABLE',
        },
        {
          entityType: 'sync_storage_objects',
          v1ExpectedCount: 1,
          v2ActualCount: 1,
          mappedLedgerCount: 1,
          isMatched: true,
          notes: null,
        },
      ],
      generatedAtUtc: '2026-11-26T05:00:00Z',
    };

    const parityTree = mountReactTree(
      <RecordVerificationCard parity={parityReport} track="TRACK3_STORAGE" />
    );
    assertCleanHtml(parityTree.html);
    expect(parityTree.html).toContain('Clinic Files');
    expect(parityTree.html).toContain('Patient Files');
    expect(parityTree.html).toContain('File Storage');
    expect(parityTree.html).toContain('10 reachable Primary Storage Clinic attachments still pending.');
    expect(parityTree.html).toContain('Unavailable: 2 dead, 1 empty · Needs Access: 3 · External Link: 4');
    expect(parityTree.html).toContain('Temporary failures: 2 · Permanent failures: 1');
    parityTree.unmount();

    // LiveImportProgressCard with track="TRACK3_STORAGE" and NO summary.track
    const progressMinimalRun: SyncRunRecordDto = {
      id: 'run-minimal',
      bindingId: 'b-storage',
      mode: 'BACKFILL',
      sampleLimit: null,
      status: 'RUNNING',
      triggeredBy: 'ops@example.com',
      startedAt: '2026-11-26T05:00:00Z',
      completedAt: null,
      summary: {
        totalItems: 10,
        processedItems: 3,
      },
      errorMessage: null,
    };
    const progressMinimalTree = mountReactTree(
      <LiveImportProgressCard
        run={progressMinimalRun}
        track="TRACK3_STORAGE"
        verboseOpen={false}
        onToggleVerbose={() => {}}
      />
    );
    expect(progressMinimalTree.html).toContain('3 / 10 files in current stage');
    expect(progressMinimalTree.html).toContain('Encrypted &amp; Saved');
    expect(progressMinimalTree.html).not.toContain('patients');
    progressMinimalTree.unmount();

    // LiveImportProgressCard with real Track3StorageSyncEngine stage & verbose logs
    const progressRealRun: SyncRunRecordDto = {
      ...progressMinimalRun,
      id: 'run-real',
      summary: {
        track: 'TRACK3_STORAGE',
        currentStage: 'Migrate Azure Blob #1',
        stageIndex: 3,
        totalStages: 4,
        processedItems: 5,
        totalItems: 10,
        percentComplete: 50,
        transferRateMbps: 80,
        verboseLogs: [
          'Inventory complete: 10 Azure Blob #1 (5 Clinic, 5 Patient), 2 legacy links, 1 overlap saves.',
          'Classified 12 non-migratable links as SKIPPED_LEGACY_UNSUPPORTED (original URLs preserved).',
          'Verified 10 encrypted objects via R2 read-back + AES-256-GCM decrypt parity check.',
        ],
      },
    };
    const progressRealTree = mountReactTree(
      <LiveImportProgressCard
        run={progressRealRun}
        track="TRACK3_STORAGE"
        verboseOpen={true}
        onToggleVerbose={() => {}}
      />
    );
    assertCleanHtml(progressRealTree.html);
    expect(progressRealTree.html).toContain('Migrate Primary Storage');
    expect(progressRealTree.html).toContain('10.0 MB/s');
    expect(progressRealTree.html).toContain('External Link (Kept As-Is)');
    expect(progressRealTree.html).toContain('Cloud Storage');
    progressRealTree.unmount();

    // SyncActivityCard with errorMessage and verboseLogs
    const failedRun: SyncRunRecordDto = {
      id: 'run-failed',
      bindingId: 'b-storage',
      mode: 'BACKFILL',
      sampleLimit: null,
      status: 'FAILED',
      triggeredBy: 'ops@example.com',
      startedAt: '2026-11-26T05:00:00Z',
      completedAt: '2026-11-26T05:01:00Z',
      summary: {
        track: 'TRACK3_STORAGE',
        totalItems: 12,
        durationMs: 1200,
        verboseLogs: [
          'Classified 4 links as SKIPPED_LEGACY_UNSUPPORTED for RecordAttachments and file_records.',
          'sync_storage_objects failed with HTML Interstitial from ClinicEZ R2.',
        ],
      },
      errorMessage:
        'Clinic file migration requires Track3Storage:ClinicR2 and ClinicEncryption:MasterSecret to be configured. CMK key.cez NXDOMAIN',
    };
    const activityTree = mountReactTree(
      <SyncActivityCard
        runs={[failedRun]}
        track="TRACK3_STORAGE"
        hasRunningRun={false}
        onBrowseAllChanges={() => {}}
        onInspectRunChanges={() => {}}
      />
    );
    const verboseBtn = findElements(
      activityTree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Verbose Log')
    )[0];
    expect(verboseBtn).toBeDefined();
    verboseBtn.props.onClick();

    assertCleanHtml(activityTree.html);
    expect(activityTree.html).toContain('Cloud Storage');
    expect(activityTree.html).toContain('encryption key');
    expect(activityTree.html).toContain('Clinic Files');
    expect(activityTree.html).toContain('Patient Files');
    activityTree.unmount();
  });

  test('SkippedStorageFilesCard filters, Next pagination, Retry Failed enablement, and activeBinding prerequisite lock work cleanly', async () => {
    const storageBinding: SyncBindingDto = {
      ...sampleBindings[0],
      id: '44444444-4444-4444-4444-444444444444',
      track: 'TRACK3_STORAGE',
      name: 'Track 3 File Storage',
    };
    v1SyncService.listBindings = mock(async () => [...sampleBindings, storageBinding]);
    v1SyncService.listRuns = mock(async () => []);
    v1SyncService.getStorageObjects = mock(async (bindingId, params) => {
      if (params?.status === 'SKIPPED_LEGACY_UNSUPPORTED') {
        return {
          bindingId,
          totalCount: 1,
          items: [
            {
              targetPlane: 'CLINIC_ATTACHMENT',
              targetEntityId: 'aaaa1111-1111-1111-1111-111111111111',
              ownerId: 'bbbb1111-1111-1111-1111-111111111111',
              tenantId: 'ustp-cdo',
              sourceProvider: 'GOOGLE_DRIVE',
              status: 'SKIPPED_LEGACY_UNSUPPORTED',
              sourceSizeBytes: 0,
              encryptedSizeBytes: 0,
              attemptCount: 1,
              lastErrorCode: 'GOOGLE_DRIVE_UNSUPPORTED',
              lastErrorMessage: null,
              migratedAt: null,
              verifiedAt: null,
              updatedAt: '2026-11-26T05:10:00Z',
            },
          ],
        };
      }
      return {
        bindingId,
        totalCount: 75,
        items: [
          {
            targetPlane: 'PATIENT_FILE',
            targetEntityId: '99991111-1111-1111-1111-111111111111',
            ownerId: '88881111-1111-1111-1111-111111111111',
            tenantId: null,
            sourceProvider: 'AZURE_BLOB_1',
            status: 'FAILED_RETRYABLE',
            sourceSizeBytes: 2048,
            encryptedSizeBytes: 0,
            attemptCount: 1,
            lastErrorCode: 'TIMEOUT',
            lastErrorMessage: null,
            migratedAt: null,
            verifiedAt: null,
            updatedAt: '2026-11-26T05:10:00Z',
          },
        ],
      };
    });

    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={storageBinding.id}
      />
    );
    await flushMicrotasks();

    const getRetryBtn = () =>
      findElements(
        tree.tree,
        (el) => el.type === 'button' && textContent(el).includes('Retry Failed')
      )[0];

    // Under ATTENTION with totalCount=75 -> Retry Failed enabled
    expect(getRetryBtn().props.disabled).toBe(false);

    // Filter status to External Link (Kept As-Is) -> 0 failures, Retry Failed disabled
    selectCustomOption(tree, 'Filter files by status', 'External Link (Kept As-Is)');
    await flushMicrotasks();
    expect(v1SyncService.getStorageObjects).toHaveBeenCalledWith(
      storageBinding.id,
      expect.objectContaining({
        status: 'SKIPPED_LEGACY_UNSUPPORTED',
        offset: 0,
        limit: 50,
      })
    );
    expect(getRetryBtn().props.disabled).toBe(true);

    // Filter back to All Skipped & Failed -> Retry Failed enabled again
    selectCustomOption(tree, 'Filter files by status', 'All Skipped & Failed');
    await flushMicrotasks();
    expect(getRetryBtn().props.disabled).toBe(false);

    // Filter destination to Patient Files -> forwards plane: 'PATIENT_FILE'
    selectCustomOption(tree, 'Filter files by destination', 'Patient Files');
    await flushMicrotasks();
    expect(v1SyncService.getStorageObjects).toHaveBeenCalledWith(
      storageBinding.id,
      expect.objectContaining({
        plane: 'PATIENT_FILE',
        offset: 0,
        limit: 50,
      })
    );

    // Click Next pagination button -> forwards offset: 50
    const nextBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Next')
    ).pop()!;
    expect(nextBtn.props.disabled).toBe(false);
    nextBtn.props.onClick();
    await flushMicrotasks();
    expect(v1SyncService.getStorageObjects).toHaveBeenCalledWith(
      storageBinding.id,
      expect.objectContaining({
        offset: 50,
        limit: 50,
      })
    );
    tree.unmount();

    // activeBinding-present prerequisite-locked banner + disabled action deck
    v1SyncService.getStatus = mock(async () => ({
      ...sampleStatus,
      clinicTotalStorageCount: 0,
      patientTotalStorageCount: 0,
      clinicPendingStorageCount: 0,
      patientPendingStorageCount: 0,
    }));
    const lockedTree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={storageBinding.id}
      />
    );
    await flushMicrotasks();

    expect(lockedTree.html).toContain('Migrate Clinic or Patient Records First');
    expect(lockedTree.html).toContain(
      'File Storage actions are locked until Clinic Sync or Patient Accounts has migrated file metadata into Clinic EZ v2.'
    );
    const fullPreviewBtn = findElements(
      lockedTree.tree,
      (el) => el.type === 'button' && textContent(el).trim() === 'Full Preview'
    )[0];
    const migrateAllFilesBtn = findElements(
      lockedTree.tree,
      (el) => el.type === 'button' && textContent(el).trim() === 'Migrate All Files'
    )[0];
    const lockedRetryBtn = findElements(
      lockedTree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Retry Failed')
    )[0];
    expect(fullPreviewBtn.props.disabled).toBe(true);
    expect(migrateAllFilesBtn.props.disabled).toBe(true);
    expect(lockedRetryBtn.props.disabled).toBe(true);
    lockedTree.unmount();
  });

  test('lightweight 1200ms poll ticks do not cancel in-flight user storage filter requests', async () => {
    const storageBinding: SyncBindingDto = {
      ...sampleBindings[0],
      id: '44444444-4444-4444-4444-444444444444',
      track: 'TRACK3_STORAGE',
      name: 'Track 3 Polling Race',
    };
    v1SyncService.listBindings = mock(async () => [storageBinding]);
    v1SyncService.listRuns = mock(async () => [
      {
        id: 'run-live',
        bindingId: storageBinding.id,
        mode: 'BACKFILL',
        sampleLimit: null,
        status: 'RUNNING',
        triggeredBy: 'ops@example.com',
        startedAt: '2026-11-26T05:10:00Z',
        completedAt: null,
        summary: {
          track: 'TRACK3_STORAGE',
          currentStage: 'Migrate Azure Blob #1',
          processedItems: 10,
          totalItems: 100,
          percentComplete: 10,
        },
        errorMessage: null,
      },
    ]);

    let resolveFilteredObjects!: (val: any) => void;
    let callNum = 0;
    v1SyncService.getStorageObjects = mock((bindingId: string, params?: any) => {
      callNum += 1;
      if (callNum === 1) {
        return Promise.resolve({ bindingId, totalCount: 0, items: [] });
      }
      return new Promise((resolve) => {
        resolveFilteredObjects = resolve;
      });
    });

    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;
    let capturedPollCb: (() => void) | null = null;
    globalThis.setInterval = ((cb: () => void) => {
      capturedPollCb = cb;
      return 999 as any;
    }) as any;
    globalThis.clearInterval = (() => {}) as any;

    try {
      const tree = mountReactTree(
        <V1SyncPage
          initialProfile={adminWithPerm}
          initialPermissionsLoading={false}
          initialSelectedBindingId={storageBinding.id}
        />
      );
      await flushMicrotasks();
      expect(capturedPollCb).not.toBeNull();

      // Trigger user filter change -> starts slow getStorageObjects request
      selectCustomOption(tree, 'Filter files by status', 'Transfer Failed');
      await flushMicrotasks();

      // Fire lightweight 1200ms poll tick while filter request is still in-flight
      capturedPollCb!();
      await flushMicrotasks();

      // Now resolve the user's filter request
      resolveFilteredObjects({
        bindingId: storageBinding.id,
        totalCount: 1,
        items: [
          {
            targetPlane: 'CLINIC_ATTACHMENT',
            targetEntityId: 'deadbeef-1111-1111-1111-111111111111',
            ownerId: 'bbbb1111-1111-1111-1111-111111111111',
            tenantId: 'ustp-cdo',
            sourceProvider: 'AZURE_BLOB_1',
            status: 'FAILED_RETRYABLE',
            sourceSizeBytes: 4096,
            encryptedSizeBytes: 0,
            attemptCount: 2,
            lastErrorCode: 'TIMEOUT',
            lastErrorMessage: null,
            migratedAt: null,
            verifiedAt: null,
            updatedAt: '2026-11-26T05:10:00Z',
          },
        ],
      });
      await flushMicrotasks();

      expect(tree.html).toContain('Skipped &amp; Failed Files (1)');
      expect(tree.html).toContain('Transfer Failed');
      expect(tree.html).toContain('deadbeef…1111');
      tree.unmount();
    } finally {
      globalThis.setInterval = origSetInterval;
      globalThis.clearInterval = origClearInterval;
    }
  });

  test('groupUnifiedConnections exact-matches v2ClinicId before fallback so v2ClinicId=null never steals exact-match Track 2/3 bindings', () => {
    const clinicNull: SyncBindingDto = {
      ...sampleBindings[0],
      id: 'clinic-null',
      track: 'TRACK1_CLINIC',
      name: 'Clinic Null',
      v1ClinicId: 10,
      v1OrgId: 1,
      v2TenantId: 'tenant-a',
      v2ClinicId: null,
    };
    const clinicB: SyncBindingDto = {
      ...sampleBindings[0],
      id: 'clinic-b',
      track: 'TRACK1_CLINIC',
      name: 'Clinic B',
      v1ClinicId: 10,
      v1OrgId: 1,
      v2TenantId: 'tenant-a',
      v2ClinicId: '22222222-2222-4222-8222-222222222222',
    };
    const storageB: SyncBindingDto = {
      ...sampleBindings[0],
      id: 'storage-b',
      track: 'TRACK3_STORAGE',
      name: 'Storage B',
      v1ClinicId: 10,
      v1OrgId: 1,
      v2TenantId: 'tenant-a',
      v2ClinicId: '22222222-2222-4222-8222-222222222222',
    };

    const grouped = groupUnifiedConnections([clinicNull, clinicB, storageB]);
    expect(grouped).toHaveLength(2);
    const connNull = grouped.find((c) => c.id === 'clinic-null')!;
    const connB = grouped.find((c) => c.id === 'clinic-b')!;
    expect(connNull.storageBinding).toBeNull();
    expect(connB.storageBinding?.id).toBe('storage-b');
  });

  test('RecordVerificationCard sanitizes storage jargon even when track prop and parity.track are omitted', () => {
    const parityNoTrack = {
      bindingId: 'b-direct',
      track: undefined as any,
      bindingName: 'Direct Parity',
      isFrozen: false,
      changelogMaxSeq: 0,
      lastCursorSeq: 0,
      changelogLag: 0,
      openConflictsCount: 0,
      readyToFreeze: false,
      checks: [
        {
          entityType: 'RecordAttachments',
          v1ExpectedCount: 5,
          v2ActualCount: 4,
          mappedLedgerCount: 4,
          isMatched: false,
          notes: 'CMK_MISSING record.cez SKIPPED_DEAD_LINK R2_UPLOAD_FAILED r2-client ClinicEz.V1Sync.Api',
        },
      ],
      generatedAtUtc: '2026-11-26T05:00:00Z',
    };

    const tree = mountReactTree(<RecordVerificationCard parity={parityNoTrack} />);
    expect(tree.html).toContain('Clinic Files');
    expect(tree.html).not.toMatch(/cmk|record\.cez|SKIPPED_|r2|Clinic[Ee][Zz]/i);
    tree.unmount();
  });

  test('handleChangeBatchSize sanitizes Track 3 Axios error toasts even when triggered from Track 1 or Track 2 tab', async () => {
    const storageBinding: SyncBindingDto = {
      ...sampleBindings[0],
      id: '44444444-4444-4444-4444-444444444444',
      track: 'TRACK3_STORAGE',
      name: 'Track 3 Storage A',
    };
    v1SyncService.listBindings = mock(async () => [...sampleBindings, storageBinding]);
    v1SyncService.updateBinding = mock(async (id: string) => {
      if (id === storageBinding.id) {
        const axiosErr = new Error('Request failed with status code 400') as Error & {
          response?: { data?: { message?: string } };
        };
        axiosErr.response = {
          data: {
            message: 'Track3Storage:ClinicR2 CMK_MISSING for .cez on r2-client ERR_NXDOMAIN',
          },
        };
        throw axiosErr;
      }
      return sampleBindings[0];
    });

    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId="11111111-1111-1111-1111-111111111111"
      />
    );
    await flushMicrotasks();

    // Switch to Track 2 Patient Accounts tab, then trigger Batch Size change
    const patientTab = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'tab' &&
        textContent(el).includes('Patient Accounts')
    )[0];
    patientTab.props.onClick();
    await flushMicrotasks();

    selectCustomOption(tree, 'Migration batch size', '500 / batch');
    await flushMicrotasks();

    const toastCalls = (toast.error as any).mock.calls;
    expect(toastCalls.length).toBeGreaterThan(0);
    const errMsg = String(toastCalls[toastCalls.length - 1][0]);
    expect(errMsg).toContain('Cloud Storage');
    expect(errMsg).toContain('encryption key');
    expect(errMsg).toContain('unreachable address');
    expect(errMsg).not.toMatch(/ClinicR2|CMK|\.cez|NXDOMAIN|(?<![a-z0-9])r2(?![a-z0-9])/i);
    tree.unmount();
  });

  test('SkippedStorageFilesCard disables Retry Failed on all-loaded non-retryable ATTENTION rows and forwards includeAuthSkipped under SKIPPED_AUTH_REQUIRED', async () => {
    // 1. Direct SkippedStorageFilesCard check: ATTENTION with totalCount=2, offset=0, 2 non-retryable items -> disabled
    const cardTree = mountReactTree(
      <SkippedStorageFilesCard
        items={[
          {
            targetPlane: 'CLINIC_ATTACHMENT',
            targetEntityId: 'aaaa1111-1111-1111-1111-111111111111',
            ownerId: 'bbbb1111-1111-1111-1111-111111111111',
            tenantId: 'ustp-cdo',
            sourceProvider: 'GOOGLE_DRIVE',
            status: 'SKIPPED_LEGACY_UNSUPPORTED',
            sourceSizeBytes: 0,
            encryptedSizeBytes: 0,
            attemptCount: 1,
            lastErrorCode: 'LEGACY_GOOGLE_DRIVE',
            lastErrorMessage: null,
            migratedAt: null,
            verifiedAt: null,
            updatedAt: '2026-11-26T05:10:00Z',
          },
          {
            targetPlane: 'PATIENT_FILE',
            targetEntityId: 'cccc1111-1111-1111-1111-111111111111',
            ownerId: 'dddd1111-1111-1111-1111-111111111111',
            tenantId: null,
            sourceProvider: 'AZURE_BLOB_1',
            status: 'SKIPPED_DEAD_LINK',
            sourceSizeBytes: 0,
            encryptedSizeBytes: 0,
            attemptCount: 1,
            lastErrorCode: '404_NOT_FOUND',
            lastErrorMessage: null,
            migratedAt: null,
            verifiedAt: null,
            updatedAt: '2026-11-26T05:10:00Z',
          },
        ]}
        totalCount={2}
        offset={0}
        statusFilter="ATTENTION"
        planeFilter=""
        busyAction={null}
        onChangeStatusFilter={() => {}}
        onChangePlaneFilter={() => {}}
        onChangeOffset={() => {}}
        onRetryFailed={() => {}}
      />
    );
    const cardRetryBtn = findElements(
      cardTree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Retry Failed')
    )[0];
    expect(cardRetryBtn.props.disabled).toBe(true);
    cardTree.unmount();

    // 2. Full V1SyncPage check: filtering to Needs Access (SKIPPED_AUTH_REQUIRED) enables Retry Failed and forwards includeAuthSkipped: true
    const storageBinding: SyncBindingDto = {
      ...sampleBindings[0],
      id: '44444444-4444-4444-4444-444444444444',
      track: 'TRACK3_STORAGE',
      name: 'Track 3 Storage Auth',
    };
    v1SyncService.listBindings = mock(async () => [storageBinding]);
    v1SyncService.listRuns = mock(async () => []);
    v1SyncService.getStorageObjects = mock(async (bindingId, params) => {
      if (params?.status === 'SKIPPED_AUTH_REQUIRED') {
        return {
          bindingId,
          totalCount: 1,
          items: [
            {
              targetPlane: 'PATIENT_FILE',
              targetEntityId: 'eeee1111-1111-1111-1111-111111111111',
              ownerId: 'ffff1111-1111-1111-1111-111111111111',
              tenantId: null,
              sourceProvider: 'AZURE_BLOB_1',
              status: 'SKIPPED_AUTH_REQUIRED',
              sourceSizeBytes: 2048,
              encryptedSizeBytes: 0,
              attemptCount: 1,
              lastErrorCode: '403_FORBIDDEN',
              lastErrorMessage: null,
              migratedAt: null,
              verifiedAt: null,
              updatedAt: '2026-11-26T05:10:00Z',
            },
          ],
        };
      }
      return { bindingId, totalCount: 0, items: [] };
    });

    const pageTree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={storageBinding.id}
      />
    );
    await flushMicrotasks();

    selectCustomOption(pageTree, 'Filter files by status', 'Needs Access (Kept As-Is)');
    await flushMicrotasks();

    const retryAuthBtn = findElements(
      pageTree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Retry Failed')
    )[0];
    expect(retryAuthBtn.props.disabled).toBe(false);
    await retryAuthBtn.props.onClick();
    await flushMicrotasks();

    expect(v1SyncService.retryFailedStorage).toHaveBeenCalledWith(storageBinding.id, {
      asyncMode: true,
      includeAuthSkipped: true,
    });
    pageTree.unmount();
  });

  test('SkippedStorageFilesCard disables Retry Failed on FAILED_PERMANENT-only and uses failedRetryableCount across paginated All Files & ATTENTION views', () => {
    // 1. FAILED_PERMANENT only -> Retry Failed disabled
    const permTree = mountReactTree(
      <SkippedStorageFilesCard
        items={[
          {
            targetPlane: 'CLINIC_ATTACHMENT',
            targetEntityId: 'aaaa1111-1111-1111-1111-111111111111',
            ownerId: 'bbbb1111-1111-1111-1111-111111111111',
            tenantId: 'ustp-cdo',
            sourceProvider: 'AZURE_BLOB_1',
            status: 'FAILED_PERMANENT',
            sourceSizeBytes: 1024,
            encryptedSizeBytes: 0,
            attemptCount: 3,
            lastErrorCode: 'SIZE_EXCEEDED',
            lastErrorMessage: null,
            migratedAt: null,
            verifiedAt: null,
            updatedAt: '2026-11-26T05:10:00Z',
          },
        ]}
        totalCount={1}
        failedRetryableCount={0}
        offset={0}
        statusFilter="ATTENTION"
        planeFilter=""
        busyAction={null}
        onChangeStatusFilter={() => {}}
        onChangePlaneFilter={() => {}}
        onChangeOffset={() => {}}
        onRetryFailed={() => {}}
      />
    );
    const permRetryBtn = findElements(
      permTree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Retry Failed')
    )[0];
    expect(permRetryBtn.props.disabled).toBe(true);
    permTree.unmount();

    // 2. Page 2 of All Files (offset=50, total=60, items=[MIGRATED]) with failedRetryableCount=2 -> enabled
    const page2Tree = mountReactTree(
      <SkippedStorageFilesCard
        items={[
          {
            targetPlane: 'CLINIC_ATTACHMENT',
            targetEntityId: 'cccc1111-1111-1111-1111-111111111111',
            ownerId: 'bbbb1111-1111-1111-1111-111111111111',
            tenantId: 'ustp-cdo',
            sourceProvider: 'AZURE_BLOB_1',
            status: 'MIGRATED',
            sourceSizeBytes: 1024,
            encryptedSizeBytes: 1024,
            attemptCount: 1,
            lastErrorCode: null,
            lastErrorMessage: null,
            migratedAt: '2026-11-26T05:10:00Z',
            verifiedAt: null,
            updatedAt: '2026-11-26T05:10:00Z',
          },
        ]}
        totalCount={60}
        failedRetryableCount={2}
        offset={50}
        statusFilter=""
        planeFilter=""
        busyAction={null}
        onChangeStatusFilter={() => {}}
        onChangePlaneFilter={() => {}}
        onChangeOffset={() => {}}
        onRetryFailed={() => {}}
      />
    );
    const page2RetryBtn = findElements(
      page2Tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Retry Failed')
    )[0];
    expect(page2RetryBtn.props.disabled).toBe(false);
    page2Tree.unmount();

    // 3. Page 1 of ATTENTION (offset=0, total=60, items=[SKIPPED_LEGACY_UNSUPPORTED]) with failedRetryableCount=0 -> disabled
    const page1AttTree = mountReactTree(
      <SkippedStorageFilesCard
        items={[
          {
            targetPlane: 'PATIENT_FILE',
            targetEntityId: 'dddd1111-1111-1111-1111-111111111111',
            ownerId: 'eeee1111-1111-1111-1111-111111111111',
            tenantId: null,
            sourceProvider: 'GOOGLE_DRIVE',
            status: 'SKIPPED_LEGACY_UNSUPPORTED',
            sourceSizeBytes: 0,
            encryptedSizeBytes: 0,
            attemptCount: 1,
            lastErrorCode: 'GOOGLE_DRIVE_UNSUPPORTED',
            lastErrorMessage: null,
            migratedAt: null,
            verifiedAt: null,
            updatedAt: '2026-11-26T05:10:00Z',
          },
        ]}
        totalCount={60}
        failedRetryableCount={0}
        offset={0}
        statusFilter="ATTENTION"
        planeFilter=""
        busyAction={null}
        onChangeStatusFilter={() => {}}
        onChangePlaneFilter={() => {}}
        onChangeOffset={() => {}}
        onRetryFailed={() => {}}
      />
    );
    const page1AttRetryBtn = findElements(
      page1AttTree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Retry Failed')
    )[0];
    expect(page1AttRetryBtn.props.disabled).toBe(true);
    page1AttTree.unmount();
  });

  test('tab switch during in-flight handleStartAsyncImport does not overwrite active tab runs, and partial delete/edit failure still calls loadAll', async () => {
    const bindingA = sampleBindings[0];
    const bindingB = sampleBindings[2];
    let resolveDryRun!: (val: SyncRunRecordDto) => void;
    v1SyncService.runDryRun = mock(
      () =>
        new Promise<SyncRunRecordDto>((resolve) => {
          resolveDryRun = resolve;
        })
    );
    v1SyncService.listRuns = mock(async (id: string) => [
      {
        id: `init-${id}`,
        bindingId: id,
        mode: 'INCREMENTAL',
        sampleLimit: null,
        status: 'COMPLETED',
        triggeredBy: 'ops@example.com',
        startedAt: '2026-11-25T09:59:00Z',
        completedAt: '2026-11-25T10:00:00Z',
        summary: { cohortPatientCount: id === bindingB.id ? 77 : 11, durationMs: 25 },
        errorMessage: null,
      },
    ]);

    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={bindingA.id}
      />
    );
    await flushMicrotasks();

    // Start async Full Preview on Track 1 (bindingA)
    const previewBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Full Preview')
    )[0];
    const previewPromise = previewBtn.props.onClick();

    // Switch to Patient Accounts tab (bindingB) before runDryRun resolves
    const patientTab = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'tab' &&
        textContent(el).includes('Patient Accounts')
    )[0];
    patientTab.props.onClick();
    await flushMicrotasks();
    expect(tree.html).toContain('77 patients');

    // Resolve stale bindingA runDryRun -> must NOT overwrite bindingB's view with bindingA's RUNNING card
    resolveDryRun({
      id: 'stale-dry-a',
      bindingId: bindingA.id,
      mode: 'DRY_RUN',
      sampleLimit: 25,
      status: 'RUNNING',
      triggeredBy: 'ops@example.com',
      startedAt: '2026-11-26T05:00:00Z',
      completedAt: null,
      summary: { cohortPatientCount: 25, currentStage: 'Stale Binding A Stage' },
      errorMessage: null,
    });
    await previewPromise;
    await flushMicrotasks();

    expect(tree.html).toContain('77 patients');
    expect(tree.html).not.toContain('Stale Binding A Stage');
    tree.unmount();

    // Partial failure in handleSaveEditConnection (binding #1 succeeds, binding #2 throws 409) still refreshes loadAll()
    const listBindingsCallsBefore = (v1SyncService.listBindings as any).mock.calls.length;
    let updateIdx = 0;
    v1SyncService.updateBinding = mock(async (id: string, payload) => {
      updateIdx += 1;
      if (updateIdx === 2) {
        throw new Error('409 Conflict on second track');
      }
      return { ...bindingA, id, name: payload.name ?? bindingA.name };
    });

    const editTree = mountReactTree(
      <V1SyncPage initialProfile={adminWithPerm} initialPermissionsLoading={false} />
    );
    await flushMicrotasks();
    const callsAfterMount = (v1SyncService.listBindings as any).mock.calls.length;

    const editRowBtn = findElements(
      editTree.tree,
      (el) => el.type === 'button' && el.props.title === 'Edit Track 1 Binding A'
    )[0];
    editRowBtn.props.onClick();
    const editForm = findElements(editTree.tree, (el) => el.type === 'form')[0];
    await editForm.props.onSubmit({ preventDefault: () => {} });
    await flushMicrotasks();

    expect((v1SyncService.listBindings as any).mock.calls.length).toBeGreaterThan(callsAfterMount);
    expect(listBindingsCallsBefore).toBeGreaterThanOrEqual(0);
    editTree.unmount();

    // Partial failure in handleDeleteConnection (binding #1 succeeds, binding #2 throws 409) still refreshes loadAll()
    let delIdx = 0;
    v1SyncService.deleteBinding = mock(async (id: string, force?: boolean) => {
      delIdx += 1;
      if (delIdx === 2) {
        throw new Error('409 Conflict deleting second track');
      }
      return { deletedId: id, name: 'Track 1 Binding A', hadSyncHistory: Boolean(force) };
    });

    const delTree = mountReactTree(
      <V1SyncPage initialProfile={adminWithPerm} initialPermissionsLoading={false} />
    );
    await flushMicrotasks();
    const callsAfterDelMount = (v1SyncService.listBindings as any).mock.calls.length;

    const editRowForDel = findElements(
      delTree.tree,
      (el) => el.type === 'button' && el.props.title === 'Edit Track 1 Binding A'
    )[0];
    editRowForDel.props.onClick();

    const delTrigger = findElements(
      delTree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Delete Connection')
    )[0];
    delTrigger.props.onClick();

    const delTokenInput = findElements(
      delTree.tree,
      (el) => el.type === 'input' && el.props['aria-label'] === 'Confirm Delete Connection Token'
    )[0];
    delTokenInput.props.onChange({ target: { value: 'DELETE' } });

    const confirmDelBtn = findElements(
      delTree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Confirm Delete')
    )[0];
    await confirmDelBtn.props.onClick();
    await flushMicrotasks();

    expect((v1SyncService.listBindings as any).mock.calls.length).toBeGreaterThan(
      callsAfterDelMount
    );
    delTree.unmount();
  });

  test('opens Classic (v1) Live Tracking SQL modal and renders Before -> After storage previews', async () => {
    const origGetTrackingScripts = v1SyncService.getTrackingScripts;
    try {
    const clinicBinding: SyncBindingDto = {
      id: 'c1000000-0000-4000-8000-000000000001',
      track: 'TRACK1_CLINIC',
      name: 'USTP Medical Clinic - CDO',
      v1ClinicId: 3,
      v1OrgId: 1,
      v2TenantId: 'ustp-cdo',
      v2ClinicId: '33333333-0001-4000-8000-000000000003',
      patientCohortMode: 'SCOPED',
      autoSyncEnabled: false,
      pollIntervalSeconds: 30,
      isFrozen: false,
      frozenAt: null,
      frozenBy: null,
      freezeReason: null,
      createdAt: '2026-11-26T00:00:00Z',
      updatedAt: '2026-11-26T00:00:00Z',
      lastChangelogSeq: 0,
      lastPolledAt: null,
      openConflictCount: 0,
      hasSyncHistory: true,
      batchSize: 200,
    };
    const storageBinding = {
      ...clinicBinding,
      id: 's1000000-0000-4000-8000-000000000003',
      track: 'TRACK3_STORAGE' as const,
    };

    v1SyncService.getStatus = mock(async () => ({
      ...sampleStatus,
      v1SyncTriggersInstalled: false,
      v1SyncTriggerTableCount: 0,
      clinicR2Connected: true,
      patientR2Connected: true,
      clinicEncryptionConfigured: true,
      patientEncryptionConfigured: true,
      clinicTotalStorageCount: 100,
      patientTotalStorageCount: 200,
    }));
    v1SyncService.listBindings = mock(async () => [clinicBinding, storageBinding]);
    v1SyncService.getTrackingScripts = mock(async () => ({
      install: {
        fileName: '01_install_v1_sync_changelog.sql',
        title: 'Enable Live Change Tracking',
        description: 'Run once on your Classic Clinic EZ PostgreSQL database.',
        sql: 'BEGIN;\nCREATE SCHEMA IF NOT EXISTS _v1_sync;\nCOMMIT;',
      },
      uninstall: {
        fileName: '02_uninstall_v1_sync_changelog.sql',
        title: 'Remove Live Change Tracking',
        description: 'Run once after retiring Classic Clinic EZ.',
        sql: 'BEGIN;\nDROP SCHEMA IF EXISTS _v1_sync CASCADE;\nCOMMIT;',
      },
    }));
    v1SyncService.getStorageObjects = mock(async (_id, params) => ({
      bindingId: storageBinding.id,
      totalCount: 1,
      failedRetryableCount: 0,
      items: [
        {
          targetPlane: 'CLINIC_ATTACHMENT',
          targetEntityId: 'aaaa1111-2222-4333-8444-555566667777',
          ownerId: '33333333-0001-4000-8000-000000000003',
          tenantId: 'ustp-cdo',
          sourceProvider: 'AZURE_BLOB_1',
          status: params?.status === 'MIGRATED,VERIFIED' ? 'MIGRATED' : 'SKIPPED_LEGACY_UNSUPPORTED',
          sourceSizeBytes: 120000,
          encryptedSizeBytes: params?.status === 'MIGRATED,VERIFIED' ? 120000 : 0,
          attemptCount: 1,
          lastErrorCode: null,
          lastErrorMessage: null,
          migratedAt: params?.status === 'MIGRATED,VERIFIED' ? '2026-11-26T05:10:00Z' : null,
          verifiedAt: null,
          updatedAt: '2026-11-26T05:10:00Z',
        },
      ],
    }));

    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={storageBinding.id}
      />
    );
    await flushMicrotasks();

    // Classic (v1) card shows Setup Script CTA when tracking is not enabled
    const setupBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Setup Script'
    )[0];
    expect(setupBtn).toBeDefined();
    setupBtn.props.onClick();
    await flushMicrotasks();

    expect(v1SyncService.getTrackingScripts).toHaveBeenCalledTimes(1);
    expect(tree.html).toContain('Classic (v1) Live Tracking SQL');
    expect(tree.html).toContain('01_install_v1_sync_changelog.sql');
    expect(tree.html).toContain('data-testid="sql-syntax-viewer"');
    expect(tree.html).toContain('data-sql-token="keyword"');
    const installCode = findElements(tree.tree, (el) => el.type === 'code')[0];
    expect(textContent(installCode)).toContain('CREATE SCHEMA IF NOT EXISTS _v1_sync;');

    // Switch to Remove Tracking tab
    const removeTab = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Remove Tracking')
    )[0];
    expect(removeTab).toBeDefined();
    removeTab.props.onClick();
    await flushMicrotasks();
    expect(tree.html).toContain('02_uninstall_v1_sync_changelog.sql');
    const uninstallCode = findElements(tree.tree, (el) => el.type === 'code')[0];
    expect(textContent(uninstallCode)).toContain('DROP SCHEMA IF EXISTS _v1_sync CASCADE;');

    // Close modal
    const closeBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Close tracking script dialog'
    )[0];
    closeBtn.props.onClick();
    await flushMicrotasks();
    expect(tree.html).not.toContain('Classic (v1) Live Tracking SQL');

    // Switch File Storage status filter to Encrypted & Saved -> shows File Transfer Log with clean Source & Status (no masked URL clutter)
    selectCustomOption(tree, 'Filter files by status', 'Encrypted & Saved');
    await flushMicrotasks();
    expect(v1SyncService.getStorageObjects).toHaveBeenCalledWith(
      storageBinding.id,
      expect.objectContaining({ status: 'MIGRATED,VERIFIED' })
    );
    expect(tree.html).toContain('File Transfer Log (1)');
    expect(tree.html).toContain('Encrypted &amp; Saved');
    expect(tree.html).toContain('Primary Storage');
    expect(tree.html).toContain('Before → After Location');
    expect(tree.html).toContain('Before:');
    expect(tree.html).toContain('Clinic Cloud Vault / ustp-cdo /');
    expect(tree.html).toContain('(Encrypted)');

    // Switch to Clinic Sync tab and verify Browse All Changes opens Change Details as a dismissible modal that closes on backdrop click
    const clinicTabBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && textContent(el).includes('Clinic Sync')
    )[0];
    expect(clinicTabBtn).toBeDefined();
    clinicTabBtn.props.onClick();
    await flushMicrotasks();

    const origListBindingDiffs = v1SyncService.listBindingDiffs;
    v1SyncService.listBindingDiffs = mock(async () => ({
      items: [
        {
          id: 901,
          runId: 'run-901',
          bindingId: clinicBinding.id,
          entityType: 'Patient',
          v1Id: '101',
          v2Id: 'aaaa1111-2222-4333-8444-555566667777',
          action: 'UPDATE',
          changedFields: ['firstName', 'contactNumber'],
          createdAt: '2026-11-26T05:10:00Z',
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
      hasMore: false,
    }));
    try {
      const browseBtn = findElements(
        tree.tree,
        (el) => el.type === 'button' && textContent(el).includes('Browse All Changes')
      )[0];
      expect(browseBtn).toBeDefined();
      browseBtn.props.onClick();
      await flushMicrotasks();

      expect(tree.html).toContain('role="dialog"');
      expect(tree.html).toContain('Change Details (1 shown');

      const backdrop = findElements(
        tree.tree,
        (el) => el.props?.['data-testid'] === 'change-details-backdrop'
      )[0];
      expect(backdrop).toBeDefined();
      backdrop.props.onClick();
      await flushMicrotasks();
      expect(tree.html).not.toContain('Change Details (1 shown');
    } finally {
      v1SyncService.listBindingDiffs = origListBindingDiffs;
    }
    tree.unmount();
    } finally {
      v1SyncService.getTrackingScripts = origGetTrackingScripts;
    }
  });

  test('File Storage Readiness separates terminally skipped legacy files from pending counts', async () => {
    const storageBinding: SyncBindingDto = {
      id: '33333333-3333-4333-8333-333333333399',
      track: 'TRACK3_STORAGE',
      name: 'Skipped Breakdown Storage Binding',
      v1ClinicId: null,
      v1OrgId: null,
      v2TenantId: 'ustp-cdo',
      v2ClinicId: '33333333-0001-4000-8000-000000000003',
      patientCohortMode: 'GLOBAL',
      autoSyncEnabled: false,
      pollIntervalSeconds: 30,
      isFrozen: false,
      frozenAt: null,
      frozenBy: null,
      freezeReason: null,
      createdAt: '2026-11-26T00:00:00Z',
      updatedAt: '2026-11-26T00:00:00Z',
      lastChangelogSeq: 0,
      lastPolledAt: null,
      openConflictCount: 0,
      hasSyncHistory: true,
      batchSize: 200,
    };
    v1SyncService.getStatus = mock(async () => ({
      ...sampleStatus,
      clinicR2Connected: true,
      patientR2Connected: true,
      clinicEncryptionConfigured: true,
      patientEncryptionConfigured: true,
      clinicPendingStorageCount: 0,
      patientPendingStorageCount: 0,
      clinicSkippedStorageCount: 8,
      patientSkippedStorageCount: 15802,
      clinicTotalStorageCount: 10651,
      patientTotalStorageCount: 35385,
    }));
    v1SyncService.listBindings = mock(async () => [storageBinding]);
    v1SyncService.getStorageObjects = mock(async () => ({
      bindingId: storageBinding.id,
      totalCount: 0,
      items: [],
      failedRetryableCount: 0,
    }));

    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={storageBinding.id}
      />
    );
    await flushMicrotasks();

    expect(tree.html).toContain('All encrypted · 15,810 skipped');
    expect(tree.html).toContain('0 pending · 8 skipped / 10,651 total');
    expect(tree.html).toContain('0 pending · 15,802 skipped / 35,385 total');
    tree.unmount();
  });

  test('sample-first workflow shows only Sample buttons on a fresh binding and replaces them with Full/All once each sample completes', async () => {
    const freshBinding: SyncBindingDto = {
      ...sampleBindings[0],
      id: 'aaaa0000-1111-4111-8111-111111111111',
      name: 'Fresh Clinic Connection',
      lastChangelogSeq: 0,
      hasSyncHistory: false,
      hasCompletedPreview: false,
      hasCompletedMigration: false,
      openConflictCount: 0,
    };
    v1SyncService.listBindings = mock(async () => [freshBinding]);

    // Phase 1: Brand new binding (0 runs) -> ONLY Preview Sample (25) & Migrate Sample (25)
    v1SyncService.listRuns = mock(async () => []);
    const tree1 = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={freshBinding.id}
      />
    );
    await flushMicrotasks();

    expect(tree1.html).toContain('2. Migrate &amp; Sync');
    expect(tree1.html).toContain('Preview Sample (25)');
    expect(tree1.html).not.toContain('Full Preview');
    expect(tree1.html).toContain('Migrate Sample (25)');
    expect(tree1.html).not.toContain('Migrate All Records');
    expect(tree1.html).not.toContain('Import Sample');
    expect(tree1.html).not.toContain('Import All');
    tree1.unmount();

    // Phase 2: Sample Preview completed (DRY_RUN COMPLETED) -> Full Preview replaces Preview Sample (25);
    // Migrate Sample (25) stays until sample migration completes (a FAILED backfill must NOT unlock Migrate All)
    v1SyncService.listRuns = mock(async () => [
      {
        id: 'run-failed-sample',
        bindingId: freshBinding.id,
        mode: 'BACKFILL',
        sampleLimit: 25,
        status: 'FAILED',
        triggeredBy: 'ops@example.com',
        startedAt: '2026-11-26T05:05:00Z',
        completedAt: '2026-11-26T05:05:10Z',
        summary: { cohortPatientCount: 25, durationMs: 10_000 },
        errorMessage: 'Transient error',
      },
      {
        id: 'run-preview-ok',
        bindingId: freshBinding.id,
        mode: 'DRY_RUN',
        sampleLimit: 25,
        status: 'COMPLETED',
        triggeredBy: 'ops@example.com',
        startedAt: '2026-11-26T05:00:00Z',
        completedAt: '2026-11-26T05:00:05Z',
        summary: { cohortPatientCount: 25, durationMs: 5_000 },
        errorMessage: null,
      },
    ]);
    const tree2 = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={freshBinding.id}
      />
    );
    await flushMicrotasks();

    expect(tree2.html).toContain('Full Preview');
    expect(tree2.html).not.toContain('Preview Sample (25)');
    expect(tree2.html).toContain('Migrate Sample (25)');
    expect(tree2.html).not.toContain('Migrate All Records');
    tree2.unmount();

    // Phase 3: Sample Migration completed (BACKFILL sampleLimit=25 COMPLETED) -> Migrate All Records replaces Migrate Sample (25)
    v1SyncService.listRuns = mock(async () => [
      {
        id: 'run-sample-mig-ok',
        bindingId: freshBinding.id,
        mode: 'BACKFILL',
        sampleLimit: 25,
        status: 'COMPLETED',
        triggeredBy: 'ops@example.com',
        startedAt: '2026-11-26T05:10:00Z',
        completedAt: '2026-11-26T05:10:15Z',
        summary: { cohortPatientCount: 25, durationMs: 15_000 },
        errorMessage: null,
      },
    ]);
    const tree3 = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={freshBinding.id}
      />
    );
    await flushMicrotasks();

    expect(tree3.html).toContain('Full Preview');
    expect(tree3.html).not.toContain('Preview Sample (25)');
    expect(tree3.html).toContain('Migrate All Records');
    expect(tree3.html).not.toContain('Migrate Sample (25)');
    expect(tree3.html).toContain('Sample Migration');
    tree3.unmount();
  });

  test('Migration Settings modal loads DB-backed runtime settings, enforces zero backend jargon, and saves updates', async () => {
    const tree = mountReactTree(
      <V1SyncPage initialProfile={adminWithPerm} initialPermissionsLoading={false} />
    );
    await flushMicrotasks();

    const settingsBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Migration Settings'
    )[0];
    expect(settingsBtn).toBeDefined();
    settingsBtn.props.onClick();
    await flushMicrotasks();

    expect(v1SyncService.getSettings).toHaveBeenCalledTimes(1);
    expect(tree.html).toContain('Migration Settings');
    expect(tree.html).toContain('Auto-Sync &amp; Background Worker');
    expect(tree.html).toContain('File Storage Transfer');
    expect(tree.html).toContain('Clinic Cloud Storage: Configured');
    expect(tree.html).not.toContain('Azure Blob');
    expect(tree.html).not.toContain('Track3Storage');
    expect(tree.html).not.toContain('ClinicEZ');
    expect(/\bR2\b/.test(tree.html)).toBe(false);

    // Toggle Background Worker off and increase Default Batch Size to 500
    const workerToggle = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Toggle Background Auto-Sync'
    )[0];
    expect(workerToggle).toBeDefined();
    workerToggle.props.onClick();

    const batchInput = findElements(
      tree.tree,
      (el) => el.type === 'input' && el.props.id === 'sync-setting-batch'
    )[0];
    expect(batchInput).toBeDefined();
    batchInput.props.onChange({ target: { value: '500' } });

    const form = findElements(tree.tree, (el) => el.type === 'form')[0];
    expect(form).toBeDefined();
    await form.props.onSubmit({ preventDefault: () => {} });
    await flushMicrotasks();

    expect(v1SyncService.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        enableBackgroundWorker: false,
        defaultBatchSize: 500,
        storageEnabled: true,
        storageMaxConcurrency: 6,
        storageMaxFileSizeBytes: 52_428_800,
      })
    );
    tree.unmount();
  });

  test('Migration & Sync Activity displays timestamps, hides Batch badge on 0-record runs, filters by type, and action deck shows workflow cue', async () => {
    v1SyncService.listRuns = mock(async (_id: string, _limit?: number, mode?: string) => {
      const allRuns: SyncRunRecordDto[] = [
        {
          id: 'run-idle-0',
          bindingId: sampleBindings[0].id,
          mode: 'INCREMENTAL',
          sampleLimit: null,
          status: 'COMPLETED',
          triggeredBy: 'admin@example.com',
          startedAt: '2026-11-26T21:05:00Z',
          completedAt: '2026-11-26T21:05:00Z',
          summary: { cohortPatientCount: 0, batchSize: 500, durationMs: 12 },
          errorMessage: null,
        },
        {
          id: 'run-full-mig',
          bindingId: sampleBindings[0].id,
          mode: 'BACKFILL',
          sampleLimit: null,
          status: 'COMPLETED',
          triggeredBy: 'admin@example.com',
          startedAt: '2026-11-26T20:00:00Z',
          completedAt: '2026-11-26T20:01:00Z',
          summary: { cohortPatientCount: 150, batchSize: 200, durationMs: 60_000 },
          errorMessage: null,
        },
      ];
      if (mode === 'BACKFILL,FINAL_SWEEP') {
        return allRuns.filter((r) => r.mode === 'BACKFILL' || r.mode === 'FINAL_SWEEP');
      }
      return allRuns;
    });

    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={sampleBindings[0].id}
      />
    );
    await flushMicrotasks();

    // Workflow order cue + renamed Migration & Sync Activity header
    expect(tree.html).toContain('Follow 1 → 2 → 3 sequentially per track');
    expect(tree.html).toContain('Migration &amp; Sync Activity');
    // Batch badge shown for 150-patient migration (Batch · 200) and hidden for 0-patient idle run (Batch · 500)
    expect(tree.html).toContain('Batch · 200');
    expect(tree.html).not.toContain('Batch · 500');
    // Formatted timestamps rendered on activity rows
    expect(tree.html).toMatch(/Nov 2[67](?:,| at) \d{1,2}:\d{2}\s?[AP]M/);

    // Filter activity by Migrations & Sweeps -> calls listRuns with mode='BACKFILL,FINAL_SWEEP'
    selectCustomOption(tree, 'Filter activity by type', 'Migrations & Sweeps');
    await flushMicrotasks();

    expect(v1SyncService.listRuns).toHaveBeenLastCalledWith(
      sampleBindings[0].id,
      15,
      'BACKFILL,FINAL_SWEEP'
    );
    expect(tree.html).toContain('Full Migration');
    expect(tree.html).not.toContain('Live Sync');
    tree.unmount();
  });

  test('Mapping Guide modal opens across all 3 tracks, searches columns & rules, expands details, and avoids backend jargon', async () => {
    const tree = mountReactTree(
      <V1SyncPage
        initialProfile={adminWithPerm}
        initialPermissionsLoading={false}
        initialSelectedBindingId={sampleBindings[0].id}
      />
    );
    await flushMicrotasks();

    // Switch connection workspace to Patient Accounts track first
    const patientTab = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'tab' &&
        textContent(el).includes('Patient Accounts')
    )[0];
    expect(patientTab).toBeDefined();
    patientTab.props.onClick();
    await flushMicrotasks();

    // Open Mapping Guide from inside Patient Accounts -> defaults to TRACK2_PATIENT
    const guideBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Mapping Guide'
    )[0];
    expect(guideBtn).toBeDefined();
    expect(guideBtn.props['data-ui-tooltip']).toBe('v1 → v2 Mapping Guide');
    expect(textContent(guideBtn).trim()).toBe('');
    guideBtn.props.onClick();
    await flushMicrotasks();

    expect(v1SyncService.getMappingGuide).toHaveBeenCalledTimes(1);
    expect(tree.html).toContain('v1 → v2 Mapping Guide');
    expect(tree.html).toContain('data-testid="track-pipeline-diagram"');
    expect(tree.html).toContain('Patient Files (Includes Private Files)');
    expect(tree.html).toContain('Folder Flattening');
    expect(tree.html).toContain('file_records');
    expect(tree.html).not.toContain('text-primary-foreground');
    expect(tree.html).not.toContain('Azure Blob');
    expect(tree.html).not.toContain('ClinicEZ');
    expect(/\b(R2|CMK|PMK|DEK)\b/.test(tree.html)).toBe(false);

    // Search for a column name -> auto-expands matching column details
    const searchInput = findElements(
      tree.tree,
      (el) => el.type === 'input' && el.props.id === 'mapping-guide-search'
    )[0];
    expect(searchInput).toBeDefined();
    searchInput.props.onChange({ target: { value: 'storage_key' } });
    await flushMicrotasks();

    expect(tree.html).toContain('Classic (v1) Column');
    expect(tree.html).toContain('Clinic EZ v2 Column');
    expect(tree.html).toContain('storage_key');

    // Clear search and switch to File Storage tab
    searchInput.props.onChange({ target: { value: '' } });
    await flushMicrotasks();

    const fileStorageTab = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props.role === 'tab' &&
        textContent(el).includes('File Storage')
    ).pop();
    expect(fileStorageTab).toBeDefined();
    fileStorageTab!.props.onClick();
    await flushMicrotasks();

    expect(tree.html).toContain('Clinic Files (Encrypted Cloud Vault)');

    // Manually expand columns on File Storage
    const expandBtn = findElements(
      tree.tree,
      (el) =>
        el.type === 'button' &&
        el.props['aria-label'] === 'Toggle column mapping for Clinic Files (Encrypted Cloud Vault)'
    )[0];
    expect(expandBtn).toBeDefined();
    expandBtn.props.onClick();
    await flushMicrotasks();

    expect(tree.html).toContain('AES-256-GCM envelope encryption');

    // Close modal
    const closeBtn = findElements(
      tree.tree,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Close mapping guide'
    )[0];
    expect(closeBtn).toBeDefined();
    closeBtn.props.onClick();
    await flushMicrotasks();

    expect(tree.html).not.toContain('data-testid="mapping-guide-backdrop"');
    tree.unmount();
  });

  test('AnimatedNumber smoothly interpolates counts via requestAnimationFrame and respects prefers-reduced-motion', () => {
    const origWindow = (globalThis as any).window;
    const origPerformance = globalThis.performance;

    let nowMs = 1000;
    let nextRafId = 1;
    const rafQueue = new Map<number, (ts: number) => void>();
    let reducedMotion = false;

    (globalThis as any).window = {
      requestAnimationFrame: (cb: (ts: number) => void) => {
        const id = nextRafId++;
        rafQueue.set(id, cb);
        return id;
      },
      cancelAnimationFrame: (id: number) => {
        rafQueue.delete(id);
      },
      matchMedia: () => ({ matches: reducedMotion }),
    };
    (globalThis as any).performance = { now: () => nowMs };

    const flushFrame = (advanceMs: number) => {
      nowMs += advanceMs;
      const pending = Array.from(rafQueue.entries());
      rafQueue.clear();
      for (const [, cb] of pending) cb(nowMs);
    };

    try {
      let setVal!: (v: number) => void;
      function Harness({ animateOnMount }: { animateOnMount?: boolean }) {
        const [val, updateVal] = React.useState(1000);
        setVal = updateVal;
        return (
          <div>
            <AnimatedNumber value={val} prefix="+" durationMs={400} animateOnMount={animateOnMount} />
          </div>
        );
      }

      // Mount with animateOnMount starts at 0 and counts up smoothly
      const tree = mountReactTree(<Harness animateOnMount />);
      expect(tree.html).toBe('<div>+0</div>');

      flushFrame(200); // halfway: cubic ease-out = 1 - 0.5^3 = 0.875 -> 875
      expect(tree.html).toBe('<div>+875</div>');

      // Mid-flight retargeting while at 875 -> target jumps to 2,000 without resetting back to 0 or 1,000
      setVal(2000);
      flushFrame(200); // halfway from 875 to 2000: 875 + 1125 * 0.875 = 1859.375 -> 1,859
      expect(tree.html).toBe('<div>+1,859</div>');

      flushFrame(200); // finishes cleanly at exact target
      expect(tree.html).toBe('<div>+2,000</div>');
      tree.unmount();

      // prefers-reduced-motion snaps immediately without scheduling animation frames
      reducedMotion = true;
      rafQueue.clear();
      const reducedTree = mountReactTree(<Harness animateOnMount />);
      expect(reducedTree.html).toBe('<div>+1,000</div>');
      expect(rafQueue.size).toBe(0);
      reducedTree.unmount();
    } finally {
      if (origWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = origWindow;
      }
      (globalThis as any).performance = origPerformance;
    }
  });
});
