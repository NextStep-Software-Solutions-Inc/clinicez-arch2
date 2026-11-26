import React from 'react';
import { Text } from '@/components/ui';
import type {
  SyncSystemStatusDto,
  SyncTrack,
  V1CatalogResponseDto,
} from '@/services/v1Sync.service';
import { AnimatedNumber } from './AnimatedNumber';

export interface ConnectionHealthStripProps {
  status: SyncSystemStatusDto | null;
  catalog: V1CatalogResponseDto | null;
  activeTrack: SyncTrack;
}

export function ConnectionHealthStrip({
  status,
  catalog,
  activeTrack,
}: ConnectionHealthStripProps) {
  const storageConnected = Boolean(status?.clinicR2Connected && status?.patientR2Connected);
  const encryptionConfigured = Boolean(
    status?.clinicEncryptionConfigured && status?.patientEncryptionConfigured
  );
  const totalPendingStorage =
    (status?.clinicPendingStorageCount ?? 0) + (status?.patientPendingStorageCount ?? 0);
  const totalSkippedStorage =
    (status?.clinicSkippedStorageCount ?? 0) + (status?.patientSkippedStorageCount ?? 0);
  const clinicPendingStorage = status?.clinicPendingStorageCount ?? 0;
  const clinicSkippedStorage = status?.clinicSkippedStorageCount ?? 0;
  const clinicTotalStorage = status?.clinicTotalStorageCount ?? 0;
  const patientPendingStorage = status?.patientPendingStorageCount ?? 0;
  const patientSkippedStorage = status?.patientSkippedStorageCount ?? 0;
  const patientTotalStorage = status?.patientTotalStorageCount ?? 0;

  const cards = [
    {
      label: 'Classic (v1)',
      ok: status?.v1SourceConnected,
      stateLabel: status?.v1SourceConnected ? 'Connected' : 'Pending',
      sub: status?.v1SyncTriggersInstalled
        ? `Live tracking (${status.v1SyncTriggerTableCount} tables)`
        : 'Tracking not enabled',
    },
    {
      label: 'Clinic Data',
      ok: status?.clinicDbConnected,
      stateLabel: status?.clinicDbConnected ? 'Connected' : 'Pending',
      sub: 'Per-tenant clinic charts',
    },
    {
      label: 'Patient Data',
      ok: status?.patientDbConnected,
      stateLabel: status?.patientDbConnected ? 'Connected' : 'Pending',
      sub: 'Shared patient profiles',
    },
    {
      label: 'Sync History',
      ok: status?.syncLedgerConnected,
      stateLabel: status?.syncLedgerConnected ? 'Connected' : 'Pending',
      sub: (
        <>
          Change cursor #<AnimatedNumber value={status?.v1ChangelogMaxSeq ?? 0} />
        </>
      ),
    },
    {
      label: 'Auto-Sync',
      ok: status?.backgroundWorkerEnabled,
      stateLabel: status?.backgroundWorkerEnabled ? 'Active' : 'Paused',
      sub:
        (status?.openConflictsCount ?? 0) > 0 ? (
          <>
            <AnimatedNumber value={status?.openConflictsCount ?? 0} /> to review
          </>
        ) : (
          'No items to review'
        ),
    },
    {
      label: 'File Storage',
      ok: storageConnected && encryptionConfigured,
      stateLabel: storageConnected
        ? encryptionConfigured
          ? 'Connected'
          : 'Setup Needed'
        : 'Pending',
      sub: storageConnected ? (
        clinicTotalStorage + patientTotalStorage === 0 ? (
          'No files synced yet'
        ) : totalPendingStorage > 0 ? (
          <>
            <AnimatedNumber value={totalPendingStorage} /> files pending
          </>
        ) : totalSkippedStorage > 0 ? (
          <>
            All encrypted · <AnimatedNumber value={totalSkippedStorage} /> skipped
          </>
        ) : (
          'All synced files encrypted'
        )
      ) : (
        'Cloud storage offline'
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="min-w-0 p-4 rounded-2xl bg-surface border border-border space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <Text className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
                {card.label}
              </Text>
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  card.ok ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </div>
            <Text as="div" className="text-sm font-bold text-text">
              {card.stateLabel}
            </Text>
            <Text
              as="div"
              truncate={false}
              className="text-[11px] leading-snug text-text-muted tabular-nums"
            >
              {card.sub}
            </Text>
          </div>
        ))}
      </div>

      {activeTrack === 'TRACK2_PATIENT' && catalog && (
        <div className="px-5 py-3 rounded-2xl bg-surface border border-border flex flex-wrap items-center justify-between gap-3 text-xs">
          <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Classic Account Pool
          </Text>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-text-muted">
            <span className="whitespace-nowrap">
              Classic Accounts:{' '}
              <strong className="text-text tabular-nums">
                <AnimatedNumber value={catalog.totalActiveV1Users} />
              </strong>
            </span>
            <span className="whitespace-nowrap">
              Modern Sign-In:{' '}
              <strong className="text-text tabular-nums">
                <AnimatedNumber value={catalog.clerkV1Users} />
              </strong>
            </span>
            <span className="whitespace-nowrap">
              Awaiting Upgrade:{' '}
              <strong className="text-text tabular-nums">
                <AnimatedNumber value={catalog.legacyAuth0V1Users} />
              </strong>
            </span>
            <span className="whitespace-nowrap">
              Files:{' '}
              <strong className="text-text tabular-nums">
                <AnimatedNumber value={catalog.totalV1Files} />
              </strong>
            </span>
          </div>
        </div>
      )}
      {activeTrack === 'TRACK3_STORAGE' && status && (
        <div className="px-5 py-3 rounded-2xl bg-surface border border-border flex flex-wrap items-center justify-between gap-3 text-xs">
          <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
            File Storage Readiness
          </Text>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-text-muted">
            <span className="whitespace-nowrap">
              Clinic Files:{' '}
              <strong className="text-text tabular-nums">
                <AnimatedNumber value={clinicPendingStorage} /> pending
                {clinicSkippedStorage > 0 ? (
                  <>
                    {' '}
                    · <AnimatedNumber value={clinicSkippedStorage} /> skipped
                  </>
                ) : null}{' '}
                / <AnimatedNumber value={clinicTotalStorage} /> total
              </strong>
            </span>
            <span className="whitespace-nowrap">
              Patient Files:{' '}
              <strong className="text-text tabular-nums">
                <AnimatedNumber value={patientPendingStorage} /> pending
                {patientSkippedStorage > 0 ? (
                  <>
                    {' '}
                    · <AnimatedNumber value={patientSkippedStorage} /> skipped
                  </>
                ) : null}{' '}
                / <AnimatedNumber value={patientTotalStorage} /> total
              </strong>
            </span>
            <span className="whitespace-nowrap">
              Cloud Storage:{' '}
              <strong className="text-text">
                {storageConnected ? 'Ready' : 'Pending'}
              </strong>
            </span>
            <span className="whitespace-nowrap">
              Encryption Keys:{' '}
              <strong className="text-text">
                {encryptionConfigured ? 'Configured' : 'Missing'}
              </strong>
            </span>
            <span className="whitespace-nowrap">
              Primary Source:{' '}
              <strong className="text-text">
                {status.azureBlob1Configured ? 'Configured' : 'Read-Only Public'}
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
