using System.Reflection;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Interop.Facility;

/// <summary>
/// Tells the portal each provisioned facility is alive: every <c>Messaging:HeartbeatMinutes</c> (default 15, 0 disables) it
/// queues one <c>facility.heartbeat</c> per facility from that facility's own address to the portal, in the service's
/// transactional outbox. The envelope sender identifies the facility, so the payload carries no id. A heartbeat that could not
/// be delivered in time is useless, so it expires after two intervals instead of piling up behind an outage.
/// </summary>
public sealed class FacilityHeartbeatService : BackgroundService
{
    public const string IntervalSetting = "Messaging:HeartbeatMinutes";
    public const int DefaultIntervalMinutes = 15;

    private readonly IServiceScopeFactory _scopes;
    private readonly InteropOptions _options;
    private readonly ILogger<FacilityHeartbeatService> _logger;
    private readonly int _intervalMinutes;
    private readonly string _appVersion;

    public FacilityHeartbeatService(
        IServiceScopeFactory scopes,
        IConfiguration configuration,
        IOptions<InteropOptions> options,
        ILogger<FacilityHeartbeatService> logger)
    {
        _scopes = scopes;
        _options = options.Value;
        _logger = logger;
        _intervalMinutes = configuration.GetValue(IntervalSetting, DefaultIntervalMinutes);
        _appVersion = Assembly.GetEntryAssembly()?.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                      ?? Assembly.GetEntryAssembly()?.GetName().Version?.ToString()
                      ?? "unknown";
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled || _intervalMinutes <= 0) return;

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(_intervalMinutes));
        try
        {
            do
            {
                try
                {
                    await RunOnceAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Facility heartbeat iteration failed.");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    /// <summary>Queues one heartbeat per provisioned facility and commits them. Returns how many were queued. Public for tests.</summary>
    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        using var scope = _scopes.CreateScope();
        var registry = scope.ServiceProvider.GetRequiredService<IFacilityRegistry>();
        var publisher = scope.ServiceProvider.GetRequiredService<IInteropPublisher>();
        var db = scope.ServiceProvider.GetRequiredService<IInteropDbContext>();

        var facilities = await registry.ListAsync(ct);
        if (facilities.Count == 0) return 0;

        var ttl = TimeSpan.FromMinutes(Math.Max(_intervalMinutes, 1) * 2);
        var clock = DateTime.UtcNow;
        foreach (var facility in facilities)
        {
            publisher.Enqueue(
                InteropTypes.FacilityHeartbeat,
                Party.ForFacility(facility.TenantId, facility.FacilityId.ToString(), facility.FacilityType),
                Party.Portal,
                Guid.NewGuid(),
                new FacilityHeartbeatPayload
                {
                    AppVersion = _appVersion,
                    LicenseExpiresAt = facility.LicenseExpiresAt,
                    ClockUtc = clock,
                    IsWorkspaceEligible = facility.IsWorkspaceEligible
                },
                ttl: ttl);
        }

        await db.SaveChangesAsync(ct);
        return facilities.Count;
    }
}
