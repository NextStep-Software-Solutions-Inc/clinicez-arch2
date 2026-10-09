using ClinicEz.Shared.Interop;
using FluentAssertions;
using ClinicEz.Shared.Interop.Background;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>
/// One service hosted in-process from its REAL composition root (its own DI extensions and handler registry) with
/// <c>Messaging:Transport=Hub</c>, so every message goes over HTTP to the real hub. The relay and the poller are driven
/// explicitly with <c>RunOnceAsync</c> (hosted services are never started), which makes the whole cell deterministic.
/// </summary>
public abstract class ServiceHostBase : IDisposable
{
    protected ServiceHostBase(string service) => Service = service;

    /// <summary>The mailbox this service reads (<see cref="InteropServices"/>).</summary>
    public string Service { get; }

    public ServiceProvider Provider { get; protected set; } = null!;

    public InteropRelayService Relay => Provider.GetRequiredService<InteropRelayService>();

    public InteropInboxPollerService Poller => Provider.GetRequiredService<InteropInboxPollerService>();

    public InteropDispatcher Dispatcher => Provider.GetRequiredService<InteropDispatcher>();

    public InteropHandlerRegistry Registry => Provider.GetRequiredService<InteropHandlerRegistry>();

    public Task<int> RelayOnceAsync() => Relay.RunOnceAsync(CancellationToken.None);

    public Task<int> PollOnceAsync() => Poller.RunOnceAsync(0, CancellationToken.None);

    /// <summary>The messages this service queued (all of them, shipped or not).</summary>
    public async Task<List<InteropOutboxMessage>> OutboxAsync()
    {
        using var scope = Provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IInteropDbContext>();
        return await db.InteropOutbox.AsNoTracking().OrderBy(o => o.CreatedAtUtc).ToListAsync();
    }

    public async Task<List<InteropInboxMessage>> InboxAsync()
    {
        using var scope = Provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IInteropDbContext>();
        return await db.InteropInbox.AsNoTracking().ToListAsync();
    }

    public async Task<List<(string Type, InteropEnvelope Envelope, bool Dispatched, bool DeadLettered, string? Error)>> SentAsync()
    {
        var rows = await OutboxAsync();
        return rows
            .Select(r => (r.Type, InteropEnvelope.FromJson(r.EnvelopeJson), r.DispatchedAtUtc != null, r.DeadLetteredAtUtc != null, r.LastError))
            .ToList();
    }

    /// <summary>Every message the service queued reached the hub and none was dead-lettered.</summary>
    public async Task AssertNothingStuckAsync()
    {
        var stuck = (await SentAsync()).Where(m => !m.Dispatched || m.DeadLettered).Select(m => $"{m.Type}: {m.Error}").ToList();
        stuck.Should().BeEmpty($"{Service} must have delivered everything it queued");
    }

    protected static Dictionary<string, string?> BaseConfig(string service, string schema) => new()
    {
        ["DbSchema"] = schema,
        ["Messaging:Transport"] = "Hub",
        ["Messaging:HubUrl"] = "http://localhost",
        ["Messaging:ClientId"] = HubFixture.ClientId(service),
        ["Messaging:ClientSecret"] = HubFixture.Secret(service),
        ["Messaging:Service"] = service,
        ["Messaging:Enabled"] = "false",
        ["Messaging:PollWaitSeconds"] = "0"
    };

    /// <summary>Points every HttpClient of the host (the SDK's hub client included) at the in-memory hub server.</summary>
    protected static void RouteHttpToHub(IServiceCollection services, HubFixture hub) =>
        services.ConfigureHttpClientDefaults(b => b.ConfigurePrimaryHttpMessageHandler(hub.NewHandler));

    public virtual void Dispose() => Provider.Dispose();
}

/// <summary>Drives every service's relay and poller until nothing moves any more.</summary>
public static class Cell
{
    public static async Task PumpAsync(IEnumerable<ServiceHostBase> hosts, int maxRounds = 40)
    {
        var all = hosts.ToList();
        for (var round = 0; round < maxRounds; round++)
        {
            var work = 0;
            foreach (var host in all)
            {
                work += await host.RelayOnceAsync();
                work += await host.PollOnceAsync();
            }

            if (work == 0) return;
        }

        throw new InvalidOperationException($"The cell did not become quiescent within {maxRounds} pump rounds (a message ping-pong?).");
    }
}
