using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace ClinicEz.V1Sync.Api.Data;

public sealed class SyncConnectionFactory : IAsyncDisposable
{
    private readonly IConfiguration _config;
    private readonly ILogger<SyncConnectionFactory> _logger;
    private int _maxPoolSize;

    private NpgsqlDataSource? _v1Source;
    private NpgsqlDataSource? _clinicDb;
    private NpgsqlDataSource? _patientDb;
    private NpgsqlDataSource? _syncLedgerDb;
    private readonly object _lock = new();

    public SyncConnectionFactory(IConfiguration config, ILogger<SyncConnectionFactory> logger)
    {
        _config = config;
        _logger = logger;
        _maxPoolSize = Math.Clamp(config.GetValue("V1Sync:MaxPoolSize", 2), 1, 10);
    }

    public int ActiveMaxPoolSize
    {
        get
        {
            lock (_lock)
            {
                return _maxPoolSize;
            }
        }
    }

    public void ApplyStartupMaxPoolSize(int maxPoolSize)
    {
        var clamped = Math.Clamp(maxPoolSize, 1, 10);
        lock (_lock)
        {
            _maxPoolSize = clamped;
        }
    }

    public bool HasV1Source => !string.IsNullOrWhiteSpace(_config.GetConnectionString("V1Source"));
    public bool HasClinicDb => !string.IsNullOrWhiteSpace(_config.GetConnectionString("ClinicDb"));
    public bool HasPatientDb => !string.IsNullOrWhiteSpace(_config.GetConnectionString("PatientDb"));
    public bool HasSyncLedgerDb => !string.IsNullOrWhiteSpace(_config.GetConnectionString("SyncLedgerDb"));

    public async Task<NpgsqlConnection> OpenV1SourceAsync(CancellationToken ct = default) =>
        await GetOrCreate(ref _v1Source, "V1Source").OpenConnectionAsync(ct);

    public async Task<NpgsqlConnection> OpenClinicDbAsync(CancellationToken ct = default) =>
        await GetOrCreate(ref _clinicDb, "ClinicDb").OpenConnectionAsync(ct);

    public async Task<NpgsqlConnection> OpenPatientDbAsync(CancellationToken ct = default) =>
        await GetOrCreate(ref _patientDb, "PatientDb").OpenConnectionAsync(ct);

    public async Task<NpgsqlConnection> OpenSyncLedgerDbAsync(CancellationToken ct = default) =>
        await GetOrCreate(ref _syncLedgerDb, "SyncLedgerDb").OpenConnectionAsync(ct);

    /// <summary>
    /// Opens a dedicated non-pooled connection for session-level PostgreSQL advisory locks
    /// (`pg_try_advisory_lock`) so holding a binding lock never starves the `MaxPoolSize = 2` ledger pool.
    /// </summary>
    public async Task<NpgsqlConnection> OpenSyncLedgerAdvisoryConnectionAsync(CancellationToken ct = default)
    {
        var raw = _config.GetConnectionString("SyncLedgerDb");
        if (string.IsNullOrWhiteSpace(raw))
            throw new InvalidOperationException("ConnectionStrings:SyncLedgerDb is not configured.");

        var csb = new NpgsqlConnectionStringBuilder(raw)
        {
            Pooling = false,
            ApplicationName = "clinicez-v1-sync-advisory-lock",
            Timeout = 15,
            KeepAlive = 30
        };

        var conn = new NpgsqlConnection(csb.ConnectionString);
        await conn.OpenAsync(ct);
        return conn;
    }

    private NpgsqlDataSource GetOrCreate(ref NpgsqlDataSource? slot, string name)
    {
        if (slot is not null) return slot;
        lock (_lock)
        {
            if (slot is not null) return slot;
            var raw = _config.GetConnectionString(name);
            if (string.IsNullOrWhiteSpace(raw))
                throw new InvalidOperationException($"ConnectionStrings:{name} is not configured.");

            var csb = new NpgsqlConnectionStringBuilder(raw)
            {
                MaxPoolSize = Math.Min(new NpgsqlConnectionStringBuilder(raw).MaxPoolSize, Math.Max(_maxPoolSize, 2)),
                Timeout = 10,
                CommandTimeout = string.Equals(name, "SyncLedgerDb", StringComparison.OrdinalIgnoreCase) ? 15 : 120,
                CancellationTimeout = 2000
            };

            if (string.Equals(name, "V1Source", StringComparison.OrdinalIgnoreCase))
            {
                csb.ApplicationName = "clinicez-v1-sync-reader";
            }
            else
            {
                csb.ApplicationName = $"clinicez-v1-sync-{name.ToLowerInvariant()}";
            }

            slot = NpgsqlDataSource.Create(csb.ConnectionString);
            return slot;
        }
    }

    private NpgsqlConnection CreateHealthProbeConnection(string name)
    {
        var raw = _config.GetConnectionString(name);
        if (string.IsNullOrWhiteSpace(raw))
            throw new InvalidOperationException($"ConnectionStrings:{name} is not configured.");

        var csb = new NpgsqlConnectionStringBuilder(raw)
        {
            Pooling = false,
            Timeout = 3,
            CommandTimeout = 3,
            CancellationTimeout = 500,
            ApplicationName = $"clinicez-v1-sync-probe-{name.ToLowerInvariant()}"
        };
        return new NpgsqlConnection(csb.ConnectionString);
    }

    public async Task<(bool V1Ok, bool ClinicOk, bool PatientOk, bool LedgerOk, bool TriggersOk, int TriggerTables, long MaxSeq)> ProbeHealthAsync(CancellationToken ct)
    {
        static CancellationTokenSource CreateProbeCts(CancellationToken outer)
        {
            var cts = CancellationTokenSource.CreateLinkedTokenSource(outer);
            cts.CancelAfter(TimeSpan.FromSeconds(3));
            return cts;
        }

        async Task<(bool Ok, bool TriggersOk, int TriggerTables, long MaxSeq)> ProbeV1Async()
        {
            if (!HasV1Source) return (false, false, 0, 0);
            try
            {
                return await Task.Run(async () =>
                {
                    using var probeCts = CreateProbeCts(ct);
                    var tok = probeCts.Token;
                    await using var conn = CreateHealthProbeConnection("V1Source");
                    await conn.OpenAsync(tok);
                    await using var cmd = new NpgsqlCommand("SELECT 1", conn) { CommandTimeout = 3 };
                    await cmd.ExecuteScalarAsync(tok);

                    // Query pg_trigger (not information_schema.triggers, which PostgreSQL hides from SELECT-only roles like v1_sync_reader)
                    await using var trigCmd = new NpgsqlCommand("""
                        SELECT COUNT(DISTINCT c.relname)
                        FROM pg_trigger t
                        JOIN pg_class c ON c.oid = t.tgrelid
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public'
                          AND t.tgname = 'trg_v1_sync_capture'
                          AND NOT t.tgisinternal
                        """, conn) { CommandTimeout = 3 };
                    var triggerTables = Convert.ToInt32(await trigCmd.ExecuteScalarAsync(tok));
                    var triggersOk = triggerTables > 0;

                    long maxSeq = 0;
                    if (triggersOk)
                    {
                        try
                        {
                            await using var seqCmd = new NpgsqlCommand(
                                "SELECT COALESCE(MAX(seq), 0) FROM _v1_sync.changelog", conn) { CommandTimeout = 3 };
                            maxSeq = Convert.ToInt64(await seqCmd.ExecuteScalarAsync(tok));
                        }
                        catch (PostgresException ex) when (ex.SqlState is "42P01" or "3F000" or "42501")
                        {
                            triggersOk = false;
                            maxSeq = 0;
                        }
                    }

                    return (true, triggersOk, triggerTables, maxSeq);
                }, ct).WaitAsync(TimeSpan.FromSeconds(4), ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "V1Source health probe failed.");
                return (false, false, 0, 0);
            }
        }

        async Task<bool> ProbeSimpleAsync(bool configured, string name)
        {
            if (!configured) return false;
            try
            {
                return await Task.Run(async () =>
                {
                    using var probeCts = CreateProbeCts(ct);
                    var tok = probeCts.Token;
                    await using var conn = CreateHealthProbeConnection(name);
                    await conn.OpenAsync(tok);
                    await using var cmd = new NpgsqlCommand("SELECT 1", conn) { CommandTimeout = 3 };
                    await cmd.ExecuteScalarAsync(tok);
                    return true;
                }, ct).WaitAsync(TimeSpan.FromSeconds(4), ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "{Label} health probe failed.", name);
                return false;
            }
        }

        var v1Task = ProbeV1Async();
        var clinicTask = ProbeSimpleAsync(HasClinicDb, "ClinicDb");
        var patientTask = ProbeSimpleAsync(HasPatientDb, "PatientDb");
        var ledgerTask = ProbeSimpleAsync(HasSyncLedgerDb, "SyncLedgerDb");

        await Task.WhenAll(v1Task, clinicTask, patientTask, ledgerTask);

        var (v1Ok, triggersOk, triggerTables, maxSeq) = v1Task.Result;
        return (v1Ok, clinicTask.Result, patientTask.Result, ledgerTask.Result, triggersOk, triggerTables, maxSeq);
    }

    public async ValueTask DisposeAsync()
    {
        if (_v1Source is not null) await _v1Source.DisposeAsync();
        if (_clinicDb is not null) await _clinicDb.DisposeAsync();
        if (_patientDb is not null) await _patientDb.DisposeAsync();
        if (_syncLedgerDb is not null) await _syncLedgerDb.DisposeAsync();
    }
}
