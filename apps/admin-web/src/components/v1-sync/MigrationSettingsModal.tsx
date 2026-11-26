import React, { useEffect, useState } from 'react';
import {
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconCheck,
  IconRefresh,
  IconShieldLock,
  IconX,
} from '@tabler/icons-react';
import { Button, Chip, SelectField, Text, type SelectFieldOption } from '@/components/ui';
import type {
  SyncRuntimeSettingsDto,
  UpdateSyncRuntimeSettingsPayload,
} from '@/services/v1Sync.service';

export interface MigrationSettingsModalProps {
  settings: SyncRuntimeSettingsDto | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onRetryLoad: () => void;
  onSave: (payload: UpdateSyncRuntimeSettingsPayload) => void;
  onClose: () => void;
}

const HOUR_OPTIONS: readonly SelectFieldOption[] = Array.from({ length: 24 }, (_, hour) => {
  const padded = String(hour).padStart(2, '0');
  const suffix = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return {
    value: String(hour),
    label: `${hour12}:00 ${suffix} (${padded}:00 PH)`,
  };
});

const BYTES_PER_MB = 1024 * 1024;

export function MigrationSettingsModal({
  settings,
  loading,
  saving,
  error,
  onRetryLoad,
  onSave,
  onClose,
}: MigrationSettingsModalProps) {
  const [environmentLabel, setEnvironmentLabel] = useState('PRODUCTION');
  const [enableBackgroundWorker, setEnableBackgroundWorker] = useState(true);
  const [defaultPollSeconds, setDefaultPollSeconds] = useState('30');
  const [overnightPollSeconds, setOvernightPollSeconds] = useState('300');
  const [overnightStartHour, setOvernightStartHour] = useState('22');
  const [overnightEndHour, setOvernightEndHour] = useState('6');
  const [defaultBatchSize, setDefaultBatchSize] = useState('200');
  const [maxPoolSize, setMaxPoolSize] = useState('2');
  const [storageEnabled, setStorageEnabled] = useState(true);
  const [azureBlob1Enabled, setAzureBlob1Enabled] = useState(true);
  const [storageMaxConcurrency, setStorageMaxConcurrency] = useState('6');
  const [storageMaxFileMb, setStorageMaxFileMb] = useState('50');
  const [verificationRatePct, setVerificationRatePct] = useState('2');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setEnvironmentLabel(settings.environmentLabel);
    setEnableBackgroundWorker(settings.enableBackgroundWorker);
    setDefaultPollSeconds(String(settings.defaultPollIntervalSeconds));
    setOvernightPollSeconds(String(settings.overnightPollIntervalSeconds));
    setOvernightStartHour(String(settings.overnightBackoffStartHourPh));
    setOvernightEndHour(String(settings.overnightBackoffEndHourPh));
    setDefaultBatchSize(String(settings.defaultBatchSize));
    setMaxPoolSize(String(settings.maxPoolSize));
    setStorageEnabled(settings.storageEnabled);
    setAzureBlob1Enabled(settings.azureBlob1Enabled);
    setStorageMaxConcurrency(String(settings.storageMaxConcurrency));
    setStorageMaxFileMb(
      String(Math.max(1, Math.round(settings.storageMaxFileSizeBytes / BYTES_PER_MB)))
    );
    setVerificationRatePct(
      String(Number((settings.storageVerificationSampleRate * 100).toFixed(2)))
    );
    setValidationError(null);
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const envTrimmed = environmentLabel.trim().toUpperCase();
    const poll = Number(defaultPollSeconds);
    const overnightPoll = Number(overnightPollSeconds);
    const startH = Number(overnightStartHour);
    const endH = Number(overnightEndHour);
    const batch = Number(defaultBatchSize);
    const pool = Number(maxPoolSize);
    const concurrency = Number(storageMaxConcurrency);
    const maxFileMb = Number(storageMaxFileMb);
    const verifyPct = Number(verificationRatePct);

    if (!envTrimmed || envTrimmed.length > 32) {
      setValidationError('Environment label must be between 1 and 32 characters.');
      return;
    }
    if (!Number.isInteger(poll) || poll < 10 || poll > 600) {
      setValidationError('Default poll interval must be an integer between 10 and 600 seconds.');
      return;
    }
    if (!Number.isInteger(overnightPoll) || overnightPoll < 60 || overnightPoll > 3600) {
      setValidationError(
        'Off-hours poll interval must be an integer between 60 and 3,600 seconds.'
      );
      return;
    }
    if (!Number.isInteger(batch) || batch < 10 || batch > 1000) {
      setValidationError('Default batch size must be an integer between 10 and 1,000.');
      return;
    }
    if (!Number.isInteger(pool) || pool < 1 || pool > 10) {
      setValidationError('Database pool limit must be an integer between 1 and 10.');
      return;
    }
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
      setValidationError('Concurrent file transfers must be an integer between 1 and 16.');
      return;
    }
    if (!Number.isFinite(maxFileMb) || maxFileMb < 1 || maxFileMb > 500) {
      setValidationError('Maximum file size must be between 1 MB and 500 MB.');
      return;
    }
    if (!Number.isFinite(verifyPct) || verifyPct < 0 || verifyPct > 100) {
      setValidationError('Verification sample rate must be between 0% and 100%.');
      return;
    }

    setValidationError(null);
    onSave({
      environmentLabel: envTrimmed,
      enableBackgroundWorker,
      defaultPollIntervalSeconds: poll,
      overnightPollIntervalSeconds: overnightPoll,
      overnightBackoffStartHourPh: startH,
      overnightBackoffEndHourPh: endH,
      defaultBatchSize: batch,
      maxPoolSize: pool,
      storageEnabled,
      azureBlob1Enabled,
      storageMaxConcurrency: concurrency,
      storageMaxFileSizeBytes: Math.round(maxFileMb * BYTES_PER_MB),
      storageVerificationSampleRate: Number((verifyPct / 100).toFixed(4)),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Migration Settings"
        onClick={(e) => e.stopPropagation()}
        className="max-w-2xl w-full max-h-[90vh] flex flex-col rounded-2xl bg-surface border border-border shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <IconAdjustmentsHorizontal className="h-4 w-4 text-primary shrink-0" />
              <h3 className="text-base font-bold text-text">Migration Settings</h3>
            </div>
            <p className="text-xs text-text-muted">
              Operational tuning saved in the sync database. Changes apply immediately unless noted.
            </p>
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            disabled={saving}
            onClick={onClose}
            aria-label="Close migration settings"
            className="shrink-0"
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        {loading && !settings ? (
          <div className="p-8 text-center text-xs text-text-muted flex items-center justify-center gap-2">
            <IconRefresh className="h-4 w-4 animate-spin text-primary" />
            <span>Loading migration settings...</span>
          </div>
        ) : error && !settings ? (
          <div className="p-6 space-y-3">
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <IconAlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              <Button variant="dangerSubtle" size="xs" onClick={onRetryLoad} className="shrink-0">
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="px-6 py-4 space-y-5 overflow-y-auto flex-1 text-xs">
              {(validationError || error) && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <IconAlertCircle className="h-4 w-4 shrink-0" />
                  <span>{validationError || error}</span>
                </div>
              )}

              {/* Section 1: Auto-Sync & Background Worker */}
              <div className="p-4 rounded-xl bg-surface-muted/40 border border-border space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">
                      Auto-Sync &amp; Background Worker
                    </div>
                    <div className="text-[11px] text-text-muted">
                      Controls live change polling and overnight backoff cadence.
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="unstyled"
                    size="xs"
                    disabled={saving}
                    aria-label="Toggle Background Auto-Sync"
                    onClick={() => setEnableBackgroundWorker((prev) => !prev)}
                    className={`rounded-xl font-semibold border ${
                      enableBackgroundWorker
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-surface border-border text-text-secondary hover:text-text'
                    }`}
                  >
                    Worker: {enableBackgroundWorker ? 'Active' : 'Paused'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Text as="label" htmlFor="sync-setting-poll" variant="label" className="text-xs">
                      Default Poll Interval (seconds)
                    </Text>
                    <input
                      id="sync-setting-poll"
                      type="number"
                      min={10}
                      max={600}
                      step={1}
                      disabled={saving}
                      value={defaultPollSeconds}
                      onChange={(e) => setDefaultPollSeconds(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-surface border border-border text-xs text-text tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Text
                      as="label"
                      htmlFor="sync-setting-overnight-poll"
                      variant="label"
                      className="text-xs"
                    >
                      Off-Hours Poll Interval (seconds)
                    </Text>
                    <input
                      id="sync-setting-overnight-poll"
                      type="number"
                      min={60}
                      max={3600}
                      step={1}
                      disabled={saving}
                      value={overnightPollSeconds}
                      onChange={(e) => setOvernightPollSeconds(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-surface border border-border text-xs text-text tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Text as="span" variant="label" className="block text-xs">
                      Off-Hours Start (PH Time)
                    </Text>
                    <SelectField
                      ariaLabel="Off-Hours Start Hour"
                      size="sm"
                      disabled={saving}
                      value={overnightStartHour}
                      onValueChange={setOvernightStartHour}
                      options={HOUR_OPTIONS}
                      searchable={false}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Text as="span" variant="label" className="block text-xs">
                      Off-Hours End (PH Time)
                    </Text>
                    <SelectField
                      ariaLabel="Off-Hours End Hour"
                      size="sm"
                      disabled={saving}
                      value={overnightEndHour}
                      onValueChange={setOvernightEndHour}
                      options={HOUR_OPTIONS}
                      searchable={false}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Throughput & Pool */}
              <div className="p-4 rounded-xl bg-surface-muted/40 border border-border space-y-3.5">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">
                    Throughput &amp; Database Pool
                  </div>
                  <div className="text-[11px] text-text-muted">
                    Default chunking for new connections and database pool sizing.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Text
                      as="label"
                      htmlFor="sync-setting-env-label"
                      variant="label"
                      className="text-xs"
                    >
                      Environment Label
                    </Text>
                    <input
                      id="sync-setting-env-label"
                      type="text"
                      maxLength={32}
                      disabled={saving}
                      value={environmentLabel}
                      onChange={(e) => setEnvironmentLabel(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-surface border border-border text-xs text-text uppercase focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Text
                      as="label"
                      htmlFor="sync-setting-batch"
                      variant="label"
                      className="text-xs"
                    >
                      Default Batch Size
                    </Text>
                    <input
                      id="sync-setting-batch"
                      type="number"
                      min={10}
                      max={1000}
                      step={1}
                      disabled={saving}
                      value={defaultBatchSize}
                      onChange={(e) => setDefaultBatchSize(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-surface border border-border text-xs text-text tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Text
                      as="label"
                      htmlFor="sync-setting-pool"
                      variant="label"
                      className="text-xs"
                    >
                      Database Pool Limit (1–10)
                    </Text>
                    <input
                      id="sync-setting-pool"
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      disabled={saving}
                      value={maxPoolSize}
                      onChange={(e) => setMaxPoolSize(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-surface border border-border text-xs text-text tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
                {settings?.poolSizeRestartRequired ? (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300">
                    Saved pool limit ({settings.maxPoolSize}) differs from the active pool (
                    {settings.activeMaxPoolSize}). Restart the sync service to apply the new pool
                    limit.
                  </div>
                ) : (
                  <div className="text-[11px] text-text-muted">
                    Pool limit changes apply on the next sync service restart (currently active:{' '}
                    {settings?.activeMaxPoolSize ?? maxPoolSize}).
                  </div>
                )}
              </div>

              {/* Section 3: File Storage Transfer */}
              <div className="p-4 rounded-xl bg-surface-muted/40 border border-border space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">
                      File Storage Transfer
                    </div>
                    <div className="text-[11px] text-text-muted">
                      Controls encrypted file migration concurrency, file size cap, and verification
                      sampling.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="unstyled"
                      size="xs"
                      disabled={saving}
                      aria-label="Toggle File Storage Migration"
                      onClick={() => setStorageEnabled((prev) => !prev)}
                      className={`rounded-xl font-semibold border ${
                        storageEnabled
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                          : 'bg-surface border-border text-text-secondary hover:text-text'
                      }`}
                    >
                      File Storage: {storageEnabled ? 'Enabled' : 'Disabled'}
                    </Button>
                    <Button
                      type="button"
                      variant="unstyled"
                      size="xs"
                      disabled={saving || !storageEnabled}
                      aria-label="Toggle Primary Source Downloads"
                      onClick={() => setAzureBlob1Enabled((prev) => !prev)}
                      className={`rounded-xl font-semibold border ${
                        azureBlob1Enabled && storageEnabled
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                          : 'bg-surface border-border text-text-secondary hover:text-text'
                      }`}
                    >
                      Primary Source: {azureBlob1Enabled ? 'On' : 'Off'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Text
                      as="label"
                      htmlFor="sync-setting-concurrency"
                      variant="label"
                      className="text-xs"
                    >
                      Concurrent File Transfers
                    </Text>
                    <input
                      id="sync-setting-concurrency"
                      type="number"
                      min={1}
                      max={16}
                      step={1}
                      disabled={saving}
                      value={storageMaxConcurrency}
                      onChange={(e) => setStorageMaxConcurrency(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-surface border border-border text-xs text-text tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Text
                      as="label"
                      htmlFor="sync-setting-max-mb"
                      variant="label"
                      className="text-xs"
                    >
                      Max File Size (MB)
                    </Text>
                    <input
                      id="sync-setting-max-mb"
                      type="number"
                      min={1}
                      max={500}
                      step={1}
                      disabled={saving}
                      value={storageMaxFileMb}
                      onChange={(e) => setStorageMaxFileMb(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-surface border border-border text-xs text-text tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Text
                      as="label"
                      htmlFor="sync-setting-verify-pct"
                      variant="label"
                      className="text-xs"
                    >
                      Verification Sample (%)
                    </Text>
                    <input
                      id="sync-setting-verify-pct"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      disabled={saving}
                      value={verificationRatePct}
                      onChange={(e) => setVerificationRatePct(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-surface border border-border text-xs text-text tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Environment Secrets Status (Read-Only) */}
              {settings && (
                <div className="p-4 rounded-xl bg-surface-muted/30 border border-border space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">
                    <IconShieldLock className="h-3.5 w-3.5 text-text-muted" />
                    <span>Server Environment Secrets (Read-Only)</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={settings.clinicStorageConfigured ? 'success' : 'warning'} size="xs">
                      Clinic Cloud Storage: {settings.clinicStorageConfigured ? 'Configured' : 'Not Set'}
                    </Chip>
                    <Chip tone={settings.patientStorageConfigured ? 'success' : 'warning'} size="xs">
                      Patient Cloud Storage: {settings.patientStorageConfigured ? 'Configured' : 'Not Set'}
                    </Chip>
                    <Chip
                      tone={settings.clinicEncryptionConfigured ? 'success' : 'warning'}
                      size="xs"
                    >
                      Clinic Encryption Key: {settings.clinicEncryptionConfigured ? 'Configured' : 'Not Set'}
                    </Chip>
                    <Chip
                      tone={settings.patientEncryptionConfigured ? 'success' : 'warning'}
                      size="xs"
                    >
                      Patient Encryption Key:{' '}
                      {settings.patientEncryptionConfigured ? 'Configured' : 'Not Set'}
                    </Chip>
                  </div>
                  <p className="text-[11px] text-text-muted">
                    Database connections, cloud storage credentials, and encryption keys remain in
                    server environment secrets and are never stored in the database.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-border bg-surface-muted/30 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-text-muted">
                {settings?.updatedBy
                  ? `Last saved by ${settings.updatedBy}`
                  : 'Using initial default settings'}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  disabled={saving}
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={saving || loading}
                  leadingIcon={<IconCheck className="h-3.5 w-3.5" />}
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
