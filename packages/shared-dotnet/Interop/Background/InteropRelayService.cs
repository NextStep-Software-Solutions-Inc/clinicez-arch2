using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Interop.Background;

/// <summary>
/// Ships committed outbox rows to the hub. A row stays in the outbox until the hub accepts it, so a
/// hub or network outage never loses a message; failures back off exponentially (capped at 5 minutes)
/// and are retried forever. Only a hub "rejected" verdict (unknown target, policy) dead-letters a row.
/// </summary>
public sealed class InteropRelayService : BackgroundService
{
    private static readonly TimeSpan MaxBackoff = TimeSpan.FromMinutes(5);

    private readonly IServiceScopeFactory _scopes;
    private readonly InteropOptions _options;
    private readonly EnvelopeSigner _signer;
    private readonly ILogger<InteropRelayService> _logger;
    private DateTime _nextCleanupUtc = DateTime.UtcNow;

    public InteropRelayService(IServiceScopeFactory scopes, IOptions<InteropOptions> options, EnvelopeSigner signer, ILogger<InteropRelayService> logger)
    {
        _scopes = scopes;
        _signer = signer;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled) return;

        while (!stoppingToken.IsCancellationRequested)
        {
            var shipped = 0;
            try
            {
                shipped = await RunOnceAsync(stoppingToken);
                if (DateTime.UtcNow >= _nextCleanupUtc)
                {
                    _nextCleanupUtc = DateTime.UtcNow.AddHours(1);
                    await CleanupAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Interop relay iteration failed.");
            }

            if (shipped == 0)
                await Task.Delay(_options.RelayIntervalMs, stoppingToken);
        }
    }

    /// <summary>Ship one batch of due outbox rows. Returns how many were handled. Public for tests.</summary>
    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IInteropDbContext>();
        var hub = scope.ServiceProvider.GetRequiredService<IHubClient>();

        var now = DateTime.UtcNow;
        var due = await db.InteropOutbox
            .Where(x => x.DispatchedAtUtc == null && x.DeadLetteredAtUtc == null && x.NextAttemptAtUtc <= now)
            .OrderBy(x => x.CreatedAtUtc)
            .Take(_options.BatchSize)
            .ToListAsync(ct);
        if (due.Count == 0) return 0;

        var envelopes = due.Select(x => _signer.Sign(InteropEnvelope.FromJson(x.EnvelopeJson))).ToList();

        IReadOnlyList<SendResult> results;
        try
        {
            results = await hub.SendAsync(envelopes, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            foreach (var row in due) MarkFailed(row, ex.Message);
            await db.SaveChangesAsync(ct);
            _logger.LogWarning(ex, "Hub unreachable; {Count} message(s) stay queued.", due.Count);
            return 0;
        }

        var byId = results.ToDictionary(r => r.MessageId);
        foreach (var row in due)
        {
            if (!byId.TryGetValue(row.MessageId, out var result))
            {
                MarkFailed(row, "Hub returned no result for this message.");
            }
            else if (result.IsSuccess)
            {
                row.DispatchedAtUtc = DateTime.UtcNow;
                row.LastError = null;
            }
            else
            {
                row.DeadLetteredAtUtc = DateTime.UtcNow;
                row.LastError = result.Reason ?? "Rejected by hub.";
                _logger.LogError("Hub rejected interop message {MessageId} ({Type}): {Reason}", row.MessageId, row.Type, row.LastError);
            }
        }

        await db.SaveChangesAsync(ct);
        return due.Count;
    }

    private static void MarkFailed(InteropOutboxMessage row, string error)
    {
        row.AttemptCount++;
        row.LastError = error.Length <= 2000 ? error : error[..2000];
        var delay = TimeSpan.FromSeconds(Math.Min(Math.Pow(2, Math.Min(row.AttemptCount, 12)), MaxBackoff.TotalSeconds));
        row.NextAttemptAtUtc = DateTime.UtcNow + delay;
    }

    /// <summary>Purge shipped outbox rows and old inbox rows past their retention.</summary>
    public async Task CleanupAsync(CancellationToken ct)
    {
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IInteropDbContext>();
        var outboxCutoff = DateTime.UtcNow.AddDays(-_options.OutboxRetentionDays);
        var inboxCutoff = DateTime.UtcNow.AddDays(-_options.InboxRetentionDays);

        await db.InteropOutbox.Where(x => x.DispatchedAtUtc != null && x.DispatchedAtUtc < outboxCutoff).ExecuteDeleteAsync(ct);
        await db.InteropInbox.Where(x => x.ProcessedAtUtc < inboxCutoff).ExecuteDeleteAsync(ct);
    }
}
