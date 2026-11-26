import React from 'react';
import {
  IconArrowRight,
  IconBuildingHospital,
  IconCloudLock,
  IconDatabaseImport,
  IconEdit,
  IconPlus,
  IconSearch,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { Button, Chip, Text } from '@/components/ui';
import { shortUuid, type UnifiedSyncConnection } from './v1SyncHelpers';

export interface ConnectionsRosterViewProps {
  connections: readonly UnifiedSyncConnection[];
  filteredConnections: readonly UnifiedSyncConnection[];
  rosterSearch: string;
  onChangeRosterSearch: (value: string) => void;
  v1ClinicById: ReadonlyMap<number, string>;
  v1OrgById: ReadonlyMap<number, string>;
  v2TenantNameBySlug: ReadonlyMap<string, string>;
  v2ClinicNameById: ReadonlyMap<string, string>;
  onOpenConnection: (connectionId: string) => void;
  onEditConnection: (connectionId: string) => void;
  onOpenCreate: () => void;
}

function summarizeTrackStatus(
  label: string,
  binding: UnifiedSyncConnection['clinicBinding']
): { tone: 'success' | 'warning' | 'neutral'; text: string; dot?: boolean } {
  if (!binding) {
    return { tone: 'neutral', text: `${label}: Not enabled` };
  }
  if (binding.isFrozen) {
    return { tone: 'warning', text: `${label}: Frozen` };
  }
  if (binding.autoSyncEnabled) {
    return { tone: 'success', text: `${label}: Auto-Sync`, dot: true };
  }
  return { tone: 'neutral', text: `${label}: Manual` };
}

export function ConnectionsRosterView({
  connections,
  filteredConnections,
  rosterSearch,
  onChangeRosterSearch,
  v1ClinicById,
  v1OrgById,
  v2TenantNameBySlug,
  v2ClinicNameById,
  onOpenConnection,
  onEditConnection,
  onOpenCreate,
}: ConnectionsRosterViewProps) {
  return (
    <div className="space-y-4">
      {/* Roster Search Bar */}
      <div className="p-4 rounded-2xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Text className="text-xs font-bold text-text">Connections Roster</Text>
          <Chip tone="neutral" size="xs" className="tabular-nums shrink-0">
            {connections.length} {connections.length === 1 ? 'connection' : 'connections'}
          </Chip>
        </div>

        <div className="relative w-full sm:w-80 min-w-0">
          <IconSearch className="h-3.5 w-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={rosterSearch}
            onChange={(e) => onChangeRosterSearch(e.target.value)}
            placeholder="Search connections, clinics, or tenants..."
            aria-label="Search sync connections"
            className="w-full h-9 pl-9 pr-8 rounded-xl bg-surface-muted border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
          {rosterSearch && (
            <Button
              variant="unstyled"
              size="custom"
              onClick={() => onChangeRosterSearch('')}
              aria-label="Clear connection search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text p-0.5 rounded"
            >
              <IconX className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Unified Connections Roster Table */}
      {filteredConnections.length === 0 ? (
        <div className="p-10 rounded-2xl bg-surface border border-dashed border-border text-center space-y-3">
          <div className="inline-flex p-3 rounded-2xl bg-primary-subtle text-primary">
            <IconDatabaseImport className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-bold text-text">
              {rosterSearch.trim() ? 'No matching sync connections' : 'No sync connections yet'}
            </div>
            <p className="text-xs text-text-muted max-w-md mx-auto">
              {rosterSearch.trim()
                ? 'Try clearing your search query to view all configured sync connections.'
                : 'Create a connection to link a Classic Clinic EZ (v1) clinic with Clinic EZ v2 and manage Clinic Sync, Patient Accounts, and File Storage together.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            {rosterSearch.trim() ? (
              <Button variant="secondary" size="sm" onClick={() => onChangeRosterSearch('')}>
                Reset Search
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={onOpenCreate}
                leadingIcon={<IconPlus className="h-3.5 w-3.5" />}
              >
                New Connection
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-surface border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted border-b border-border text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Connection</th>
                  <th className="px-4 py-3 whitespace-nowrap">Source → Destination</th>
                  <th className="px-4 py-3 whitespace-nowrap">Tracks</th>
                  <th className="px-4 py-3 whitespace-nowrap">Review Queue</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredConnections.map((conn) => {
                  const sourceClinicName =
                    conn.v1ClinicId !== null
                      ? v1ClinicById.get(conn.v1ClinicId) ?? `Clinic #${conn.v1ClinicId}`
                      : 'All Classic Clinics';
                  const sourceOrgName =
                    conn.v1OrgId !== null
                      ? v1OrgById.get(conn.v1OrgId) ?? `Org #${conn.v1OrgId}`
                      : null;
                  const destLabel = conn.v2TenantId
                    ? `${
                        v2TenantNameBySlug.get(conn.v2TenantId.toLowerCase()) ?? conn.v2TenantId
                      }${
                        conn.v2ClinicId
                          ? ` · ${
                              v2ClinicNameById.get(conn.v2ClinicId.toLowerCase()) ??
                              shortUuid(conn.v2ClinicId)
                            }`
                          : ''
                      }`
                    : 'Shared Clinic EZ v2 Patient Directory';

                  const clinicTrackStatus = summarizeTrackStatus('Clinic', conn.clinicBinding);
                  const patientTrackStatus = summarizeTrackStatus('Patients', conn.patientBinding);
                  const storageTrackStatus = summarizeTrackStatus('Files', conn.storageBinding);

                  return (
                    <tr
                      key={conn.id}
                      onClick={() => onOpenConnection(conn.id)}
                      className="hover:bg-surface-muted/50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3.5 max-w-[260px]">
                        <Text as="div" className="font-semibold text-text">
                          {conn.name}
                        </Text>
                        <Text as="div" className="text-[11px] text-text-muted mt-0.5">
                          {conn.clinicBinding
                            ? `Clinic cursor #${conn.clinicBinding.lastChangelogSeq.toLocaleString()}`
                            : conn.patientBinding
                              ? conn.patientBinding.patientCohortMode === 'GLOBAL'
                                ? 'All Classic Accounts'
                                : 'Selected Clinic & Organization'
                              : 'File Storage Scope'}
                        </Text>
                      </td>
                      <td className="px-4 py-3.5 max-w-[320px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Text className="text-[11px] text-text-secondary max-w-[140px]">
                            {sourceOrgName
                              ? `${sourceClinicName} · ${sourceOrgName}`
                              : sourceClinicName}
                          </Text>
                          <IconArrowRight className="h-3 w-3 shrink-0 text-text-muted/70" />
                          <Text className="text-[11px] font-medium text-text max-w-[160px]">
                            {destLabel}
                          </Text>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Chip
                            tone={clinicTrackStatus.tone}
                            size="xs"
                            dot={clinicTrackStatus.dot}
                            leadingIcon={<IconBuildingHospital className="h-3 w-3" />}
                          >
                            {clinicTrackStatus.text}
                          </Chip>
                          <Chip
                            tone={patientTrackStatus.tone}
                            size="xs"
                            dot={patientTrackStatus.dot}
                            leadingIcon={<IconUsers className="h-3 w-3" />}
                          >
                            {patientTrackStatus.text}
                          </Chip>
                          <Chip
                            tone={storageTrackStatus.tone}
                            size="xs"
                            dot={storageTrackStatus.dot}
                            leadingIcon={<IconCloudLock className="h-3 w-3" />}
                          >
                            {storageTrackStatus.text}
                          </Chip>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {conn.totalOpenConflicts > 0 ? (
                          <Chip tone="warning" size="xs" className="tabular-nums">
                            {conn.totalOpenConflicts.toLocaleString()} to review
                          </Chip>
                        ) : (
                          <Text className="text-[11px] text-text-muted" tooltip={false}>
                            Clear
                          </Text>
                        )}
                      </td>
                      <td
                        className="px-4 py-3.5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => onEditConnection(conn.id)}
                            leadingIcon={<IconEdit className="h-3.5 w-3.5" />}
                            title={`Edit ${conn.name}`}
                            aria-label={`Edit ${conn.name}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => onOpenConnection(conn.id)}
                            trailingIcon={<IconArrowRight className="h-3.5 w-3.5" />}
                            title={`Open ${conn.name}`}
                            className="border border-border hover:bg-background font-semibold"
                          >
                            Open
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
