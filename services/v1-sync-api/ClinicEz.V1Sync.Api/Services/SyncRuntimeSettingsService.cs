using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Data;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.V1Sync.Api.Services;

/// <summary>
/// Manages database-backed operational runtime settings stored in `sync_runtime_settings`
/// so operators can view and tune worker, batch, pool, and file-transfer behavior live
/// from Admin Web without upfront env-var bloat or container redeploys.
/// Secrets (DB connection strings, R2 keys, encryption master secrets) remain strictly in env.
/// </summary>
public sealed class SyncRuntimeSettingsService
{
    private readonly SyncConnectionFactory _connections;
    private readonly SyncLedgerRepository _ledger;
    private readonly IConfiguration _config;
    private readonly Track3StorageOptions _storageDefaults;
    private readonly ILogger<SyncRuntimeSettingsService> _logger;

    private volatile SyncRuntimeSettings _current;

    public SyncRuntimeSettingsService(
        SyncConnectionFactory connections,
        SyncLedgerRepository ledger,
        IConfiguration config,
        IOptions<Track3StorageOptions> storageOptions,
        ILogger<SyncRuntimeSettingsService> logger)
    {
        _connections = connections;
        _ledger = ledger;
        _config = config;
        _storageDefaults = storageOptions.Value;
        _logger = logger;
        _current = BuildDefaultsFromConfig();
    }

    public SyncRuntimeSettings Current => _current;

    public async Task InitializeAsync(CancellationToken ct = default)
    {
        if (!_connections.HasSyncLedgerDb)
        {
            return;
        }

        try
        {
            var existing = await _ledger.GetRuntimeSettingsAsync(ct);
            if (existing is null)
            {
                var seeded = BuildDefaultsFromConfig();
                existing = await _ledger.UpsertRuntimeSettingsAsync(seeded, "system-bootstrap", ct, writeAudit: false);
            }

            _current = existing;
            _connections.ApplyStartupMaxPoolSize(existing.MaxPoolSize);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to initialize DB-backed runtime settings; using configuration defaults.");
        }
    }

    public async Task<SyncRuntimeSettings> RefreshAsync(CancellationToken ct = default)
    {
        if (!_connections.HasSyncLedgerDb)
        {
            return _current;
        }

        try
        {
            using var refreshCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            refreshCts.CancelAfter(TimeSpan.FromSeconds(3));
            var tok = refreshCts.Token;

            var existing = await _ledger.GetRuntimeSettingsAsync(tok);
            if (existing is not null)
            {
                _current = existing;
            }
            else
            {
                var seeded = BuildDefaultsFromConfig();
                _current = await _ledger.UpsertRuntimeSettingsAsync(seeded, "system-bootstrap", tok, writeAudit: false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to refresh runtime settings from SyncLedgerDb; returning cached values.");
        }

        return _current;
    }

    public async Task<SyncRuntimeSettingsResponse> GetResponseAsync(
        Track3R2ClientPool r2Pool,
        Track3EnvelopeEncryptor encryptor,
        CancellationToken ct = default)
    {
        var current = await RefreshAsync(ct);
        return ToResponse(current, r2Pool, encryptor);
    }

    public async Task<SyncRuntimeSettingsResponse> UpdateAsync(
        UpdateSyncRuntimeSettingsRequest req,
        string actor,
        Track3R2ClientPool r2Pool,
        Track3EnvelopeEncryptor encryptor,
        CancellationToken ct = default)
    {
        if (!_connections.HasSyncLedgerDb)
        {
            throw new InvalidOperationException("Sync Ledger database is not configured.");
        }

        var baseline = await RefreshAsync(ct);

        var envLabel = req.EnvironmentLabel is not null
            ? req.EnvironmentLabel.Trim().ToUpperInvariant()
            : baseline.EnvironmentLabel;
        if (string.IsNullOrWhiteSpace(envLabel) || envLabel.Length > 32)
        {
            throw new ArgumentException("Environment label must be between 1 and 32 characters.");
        }

        var maxPoolSize = req.MaxPoolSize ?? baseline.MaxPoolSize;
        if (maxPoolSize is < 1 or > 10)
        {
            throw new ArgumentException("Database pool limit must be between 1 and 10.");
        }

        var defaultBatchSize = req.DefaultBatchSize ?? baseline.DefaultBatchSize;
        if (defaultBatchSize is < 10 or > 1000)
        {
            throw new ArgumentException("Default batch size must be between 10 and 1,000.");
        }

        var defaultPollSeconds = req.DefaultPollIntervalSeconds ?? baseline.DefaultPollIntervalSeconds;
        if (defaultPollSeconds is < 10 or > 600)
        {
            throw new ArgumentException("Default poll interval must be between 10 and 600 seconds.");
        }

        var overnightPollSeconds = req.OvernightPollIntervalSeconds ?? baseline.OvernightPollIntervalSeconds;
        if (overnightPollSeconds is < 60 or > 3600)
        {
            throw new ArgumentException("Off-hours poll interval must be between 60 and 3,600 seconds.");
        }

        var startHour = req.OvernightBackoffStartHourPh ?? baseline.OvernightBackoffStartHourPh;
        if (startHour is < 0 or > 23)
        {
            throw new ArgumentException("Off-hours start hour must be between 0 and 23.");
        }

        var endHour = req.OvernightBackoffEndHourPh ?? baseline.OvernightBackoffEndHourPh;
        if (endHour is < 0 or > 23)
        {
            throw new ArgumentException("Off-hours end hour must be between 0 and 23.");
        }

        var storageMaxConcurrency = req.StorageMaxConcurrency ?? baseline.StorageMaxConcurrency;
        if (storageMaxConcurrency is < 1 or > 16)
        {
            throw new ArgumentException("Concurrent file transfers must be between 1 and 16.");
        }

        var storageMaxFileSizeBytes = req.StorageMaxFileSizeBytes ?? baseline.StorageMaxFileSizeBytes;
        if (storageMaxFileSizeBytes is < 1_048_576L or > 524_288_000L)
        {
            throw new ArgumentException("Maximum file size must be between 1 MB and 500 MB.");
        }

        var sampleRate = req.StorageVerificationSampleRate ?? baseline.StorageVerificationSampleRate;
        if (double.IsNaN(sampleRate) || double.IsInfinity(sampleRate) || sampleRate is < 0.0 or > 1.0)
        {
            throw new ArgumentException("Verification sample rate must be between 0% and 100%.");
        }

        var next = new SyncRuntimeSettings(
            EnvironmentLabel: envLabel,
            MaxPoolSize: maxPoolSize,
            DefaultBatchSize: defaultBatchSize,
            EnableBackgroundWorker: req.EnableBackgroundWorker ?? baseline.EnableBackgroundWorker,
            DefaultPollIntervalSeconds: defaultPollSeconds,
            OvernightPollIntervalSeconds: overnightPollSeconds,
            OvernightBackoffStartHourPh: startHour,
            OvernightBackoffEndHourPh: endHour,
            StorageEnabled: req.StorageEnabled ?? baseline.StorageEnabled,
            StorageMaxConcurrency: storageMaxConcurrency,
            StorageMaxFileSizeBytes: storageMaxFileSizeBytes,
            StorageVerificationSampleRate: Math.Round(sampleRate, 4),
            AzureBlob1Enabled: req.AzureBlob1Enabled ?? baseline.AzureBlob1Enabled,
            UpdatedBy: actor,
            UpdatedAt: DateTimeOffset.UtcNow
        );

        var saved = await _ledger.UpsertRuntimeSettingsAsync(next, actor, ct, writeAudit: true);
        _current = saved;
        return ToResponse(saved, r2Pool, encryptor);
    }

    private SyncRuntimeSettingsResponse ToResponse(
        SyncRuntimeSettings settings,
        Track3R2ClientPool r2Pool,
        Track3EnvelopeEncryptor encryptor) => new(
            EnvironmentLabel: settings.EnvironmentLabel,
            MaxPoolSize: settings.MaxPoolSize,
            ActiveMaxPoolSize: _connections.ActiveMaxPoolSize,
            PoolSizeRestartRequired: settings.MaxPoolSize != _connections.ActiveMaxPoolSize,
            DefaultBatchSize: settings.DefaultBatchSize,
            EnableBackgroundWorker: settings.EnableBackgroundWorker,
            DefaultPollIntervalSeconds: settings.DefaultPollIntervalSeconds,
            OvernightPollIntervalSeconds: settings.OvernightPollIntervalSeconds,
            OvernightBackoffStartHourPh: settings.OvernightBackoffStartHourPh,
            OvernightBackoffEndHourPh: settings.OvernightBackoffEndHourPh,
            StorageEnabled: settings.StorageEnabled,
            StorageMaxConcurrency: settings.StorageMaxConcurrency,
            StorageMaxFileSizeBytes: settings.StorageMaxFileSizeBytes,
            StorageVerificationSampleRate: settings.StorageVerificationSampleRate,
            AzureBlob1Enabled: settings.AzureBlob1Enabled,
            ClinicStorageConfigured: r2Pool.HasClinicCredentials,
            PatientStorageConfigured: r2Pool.HasPatientCredentials,
            ClinicEncryptionConfigured: encryptor.IsClinicConfigured,
            PatientEncryptionConfigured: encryptor.IsPatientConfigured,
            UpdatedBy: settings.UpdatedBy,
            UpdatedAt: settings.UpdatedAt
        );

    private SyncRuntimeSettings BuildDefaultsFromConfig()
    {
        var rawEnvLabel = _config["V1Sync:EnvironmentLabel"];
        if (string.IsNullOrWhiteSpace(rawEnvLabel))
        {
            var aspEnv = _config["ASPNETCORE_ENVIRONMENT"];
            rawEnvLabel = string.Equals(aspEnv, "Production", StringComparison.OrdinalIgnoreCase)
                ? "PRODUCTION"
                : string.Equals(aspEnv, "Staging", StringComparison.OrdinalIgnoreCase)
                    ? "STAGING"
                    : "DEVELOPMENT";
        }

        return new SyncRuntimeSettings(
            EnvironmentLabel: rawEnvLabel.Trim().ToUpperInvariant(),
            MaxPoolSize: Math.Clamp(_config.GetValue("V1Sync:MaxPoolSize", 2), 1, 10),
            DefaultBatchSize: Math.Clamp(_config.GetValue("V1Sync:BatchSize", 200), 10, 1000),
            EnableBackgroundWorker: _config.GetValue("V1Sync:EnableBackgroundWorker", true),
            DefaultPollIntervalSeconds: Math.Clamp(_config.GetValue("V1Sync:DefaultPollIntervalSeconds", 30), 10, 600),
            OvernightPollIntervalSeconds: Math.Clamp(_config.GetValue("V1Sync:OvernightPollIntervalSeconds", 300), 60, 3600),
            OvernightBackoffStartHourPh: Math.Clamp(_config.GetValue("V1Sync:OvernightBackoffStartHourPh", 22), 0, 23),
            OvernightBackoffEndHourPh: Math.Clamp(_config.GetValue("V1Sync:OvernightBackoffEndHourPh", 6), 0, 23),
            StorageEnabled: _storageDefaults.Enabled,
            StorageMaxConcurrency: Math.Clamp(_storageDefaults.MaxConcurrency, 1, 16),
            StorageMaxFileSizeBytes: Math.Clamp(_storageDefaults.MaxFileSizeBytes, 1_048_576L, 524_288_000L),
            StorageVerificationSampleRate: Math.Clamp(_storageDefaults.VerificationSampleRate, 0.0, 1.0),
            AzureBlob1Enabled: _storageDefaults.AzureBlob1Enabled,
            UpdatedBy: null,
            UpdatedAt: DateTimeOffset.UtcNow
        );
    }
}
