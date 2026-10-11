using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Background;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Shared.Tests.Interop;

public sealed class ResponderLog
{
    public List<(string Method, string Path, InteropMessageContext Context)> Calls { get; } = new();
    public bool Throw { get; set; }
}

public sealed class GamotTestResponder : IInteropResponder<GamotLookupRequestedPayload, GamotLookupRespondedPayload>
{
    private readonly ResponderLog _log;
    public GamotTestResponder(ResponderLog log) => _log = log;

    public Task<GamotLookupRespondedPayload> RespondAsync(GamotLookupRequestedPayload request, InteropMessageContext context, CancellationToken ct)
    {
        if (_log.Throw) throw new InvalidOperationException("boom");
        _log.Calls.Add((request.Method, request.Path, context));
        return Task.FromResult(new GamotLookupRespondedPayload { StatusCode = 200, ContentType = "application/json", Body = $"{{\"path\":\"{request.Path}\"}}" });
    }
}

public sealed class PhilHealthTestResponder : IInteropResponder<PhilHealthRequestPayload, PhilHealthResponsePayload>
{
    private readonly ResponderLog _log;
    public PhilHealthTestResponder(ResponderLog log) => _log = log;

    public Task<PhilHealthResponsePayload> RespondAsync(PhilHealthRequestPayload request, InteropMessageContext context, CancellationToken ct)
    {
        _log.Calls.Add(("POST", request.Operation, context));
        return Task.FromResult(new PhilHealthResponsePayload { StatusCode = 200, Body = $"{{\"tenant\":\"{context.From.TenantId}\"}}" });
    }
}

/// <summary>One service host (requester or responder) on a hub shared with the others.</summary>
internal sealed class RequestHost : IDisposable
{
    public ServiceProvider Provider { get; }
    public ResponderLog Log => Provider.GetRequiredService<ResponderLog>();
    public IInteropRequestClient Client => Provider.GetRequiredService<IInteropRequestClient>();
    public InteropRequestClient ClientImpl => Provider.GetRequiredService<InteropRequestClient>();
    public InteropRelayService Relay => Provider.GetRequiredService<InteropRelayService>();
    public InteropInboxPollerService Poller => Provider.GetRequiredService<InteropInboxPollerService>();
    public InteropDispatcher Dispatcher => Provider.GetRequiredService<InteropDispatcher>();

    public RequestHost(InProcessHub hub, string service, Action<InteropHandlerBuilder> handlers)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = service,
            ["Messaging:Enabled"] = "true",
            ["Messaging:RelayIntervalMs"] = "20"
        }).Build();

        var dbName = Guid.NewGuid().ToString();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddSingleton(hub);
        services.AddSingleton<ResponderLog>();
        services.AddDbContext<TestDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddInterop<TestDbContext>(config, handlers);
        Provider = services.BuildServiceProvider();
    }

    public async Task<List<InteropOutboxMessage>> OutboxAsync()
    {
        using var scope = Provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<TestDbContext>().InteropOutbox.AsNoTracking().ToListAsync();
    }

    public async Task ForgetInboxAsync()
    {
        using var scope = Provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TestDbContext>();
        db.InteropInbox.RemoveRange(db.InteropInbox);
        await db.SaveChangesAsync();
    }

    public void Dispose() => Provider.Dispose();
}

public class InteropRequestReplyTests
{
    private const string Tenant = "tenant-a";
    private static readonly Party Clinic = Party.ForFacility(Tenant, "clinic-1", FacilityType.Clinic);
    private static readonly Party Pharmacy = Party.ForFacility(Tenant, "pharmacy-1", FacilityType.Pharmacy);

    private static RequestHost NewRequester(InProcessHub hub) => new(hub, InteropServices.Clinic, h => h
        .HandleReply(InteropTypes.GamotLookupResponded)
        .HandleReply(InteropTypes.PhilHealthResponse));

    private static RequestHost NewPharmacy(InProcessHub hub) => new(hub, InteropServices.Pharmacy, h => h
        .Respond<GamotLookupRequestedPayload, GamotLookupRespondedPayload, GamotTestResponder>(
            InteropTypes.GamotLookupRequested, InteropTypes.GamotLookupResponded));

    private static RequestHost NewProxy(InProcessHub hub) => new(hub, InteropServices.Philhealth, h => h
        .Respond<PhilHealthRequestPayload, PhilHealthResponsePayload, PhilHealthTestResponder>(
            InteropTypes.PhilHealthRequest, InteropTypes.PhilHealthResponse));

    /// <summary>Moves messages between the hosts until cancelled, like the hosted services do against a real hub.</summary>
    private static Task Pump(CancellationToken stop, params RequestHost[] hosts) => Task.Run(async () =>
    {
        while (!stop.IsCancellationRequested)
        {
            foreach (var host in hosts)
            {
                await host.Relay.RunOnceAsync(CancellationToken.None);
                await host.Poller.RunOnceAsync(0, CancellationToken.None);
            }
            await Task.Delay(5);
        }
    });

    private static async Task<Guid> WaitForCorrelationAsync(RequestHost host)
    {
        for (var i = 0; i < 200; i++)
        {
            var rows = await host.OutboxAsync();
            if (rows.Count > 0) return rows[0].CorrelationId;
            await Task.Delay(10);
        }
        throw new TimeoutException("request never reached the outbox");
    }

    [Fact]
    public async Task Request_RoundTrips_ToThePeer_AndBack_WithSameCorrelation()
    {
        var hub = new InProcessHub();
        using var clinic = NewRequester(hub);
        using var pharmacy = NewPharmacy(hub);
        using var stop = new CancellationTokenSource();
        var pump = Pump(stop.Token, clinic, pharmacy);

        var reply = await clinic.Client.RequestAsync<GamotLookupRequestedPayload, GamotLookupRespondedPayload>(
            InteropTypes.GamotLookupRequested, InteropTypes.GamotLookupResponded, Clinic, Pharmacy,
            new GamotLookupRequestedPayload { Method = "GET", Path = "drugs/search", Query = "q=para" },
            TimeSpan.FromSeconds(5));
        stop.Cancel();
        await pump;

        reply.StatusCode.Should().Be(200);
        reply.Body.Should().Contain("drugs/search");

        pharmacy.Log.Calls.Should().ContainSingle().Which.Context.From.Should().Be(Clinic);
        var sent = hub.Sent;
        sent.Should().HaveCount(2);
        sent[0].Type.Should().Be(InteropTypes.GamotLookupRequested);
        sent[1].Type.Should().Be(InteropTypes.GamotLookupResponded);
        sent[1].CorrelationId.Should().Be(sent[0].CorrelationId);
        sent[1].From.Should().Be(Pharmacy);
        sent[1].To.Should().Be(Clinic);
        clinic.ClientImpl.PendingCount.Should().Be(0);
    }

    [Fact]
    public async Task PlatformService_Replies_ToTheRequestingFacility_AndSeesItsTenant()
    {
        var hub = new InProcessHub();
        using var clinic = NewRequester(hub);
        using var proxy = NewProxy(hub);
        using var stop = new CancellationTokenSource();
        var pump = Pump(stop.Token, clinic, proxy);

        var reply = await clinic.Client.RequestAsync<PhilHealthRequestPayload, PhilHealthResponsePayload>(
            InteropTypes.PhilHealthRequest, InteropTypes.PhilHealthResponse, Clinic, Party.PhilHealth,
            new PhilHealthRequestPayload { Operation = PhilHealthOperations.YakapPinValidate, Argument = "12-345" },
            TimeSpan.FromSeconds(5));
        stop.Cancel();
        await pump;

        reply.Body.Should().Contain(Tenant);
        hub.Sent[1].From.Should().Be(Party.PhilHealth);
        hub.Sent[1].To.Should().Be(Clinic);
    }

    [Fact]
    public async Task NoReply_ThrowsTypedTimeout_AndForgetsThePendingCall()
    {
        var hub = new InProcessHub();
        using var clinic = NewRequester(hub);

        var act = () => clinic.Client.RequestAsync<GamotLookupRequestedPayload, GamotLookupRespondedPayload>(
            InteropTypes.GamotLookupRequested, InteropTypes.GamotLookupResponded, Clinic, Pharmacy,
            new GamotLookupRequestedPayload { Path = "drugs/search" }, TimeSpan.FromMilliseconds(150));

        var ex = (await act.Should().ThrowAsync<InteropRequestTimeoutException>()).Which;
        ex.RequestType.Should().Be(InteropTypes.GamotLookupRequested);
        ex.Message.Should().NotContain("drugs/search");
        clinic.ClientImpl.PendingCount.Should().Be(0);
        (await clinic.OutboxAsync()).Should().ContainSingle().Which.ExpiresIsSet();
    }

    [Fact]
    public async Task Cancellation_IsNotReportedAsTimeout()
    {
        var hub = new InProcessHub();
        using var clinic = NewRequester(hub);
        using var cts = new CancellationTokenSource(100);

        var act = () => clinic.Client.RequestAsync<GamotLookupRequestedPayload, GamotLookupRespondedPayload>(
            InteropTypes.GamotLookupRequested, InteropTypes.GamotLookupResponded, Clinic, Pharmacy,
            new GamotLookupRequestedPayload { Path = "x" }, TimeSpan.FromSeconds(30), cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
        clinic.ClientImpl.PendingCount.Should().Be(0);
    }

    [Fact]
    public async Task RedeliveredRequest_RunsTheHandlerOnce_AndQueuesOneReply()
    {
        var hub = new InProcessHub();
        using var pharmacy = NewPharmacy(hub);
        var request = InteropEnvelope.Create(InteropTypes.GamotLookupRequested, Clinic, Pharmacy, Guid.NewGuid(),
            new GamotLookupRequestedPayload { Path = "drugs/1" });

        (await pharmacy.Dispatcher.DispatchAsync(request, CancellationToken.None)).Outcome.Should().Be(DispatchOutcome.Handled);
        // Crash between "handled" and "recorded in the inbox": the hub redelivers the same message.
        await pharmacy.ForgetInboxAsync();
        (await pharmacy.Dispatcher.DispatchAsync(request, CancellationToken.None)).Outcome.Should().Be(DispatchOutcome.Handled);

        pharmacy.Log.Calls.Should().ContainSingle();
        var outbox = await pharmacy.OutboxAsync();
        outbox.Should().ContainSingle().Which.Type.Should().Be(InteropTypes.GamotLookupResponded);
        outbox[0].CorrelationId.Should().Be(request.CorrelationId);
    }

    [Fact]
    public async Task ResponderFailure_SendsNoReply_AndLeavesTheRequestForRedelivery()
    {
        var hub = new InProcessHub();
        using var pharmacy = NewPharmacy(hub);
        pharmacy.Log.Throw = true;
        var request = InteropEnvelope.Create(InteropTypes.GamotLookupRequested, Clinic, Pharmacy, Guid.NewGuid(),
            new GamotLookupRequestedPayload { Path = "drugs/1" });

        var result = await pharmacy.Dispatcher.DispatchAsync(request, CancellationToken.None);

        result.Outcome.Should().Be(DispatchOutcome.Failed);
        result.ShouldAck.Should().BeFalse();
        (await pharmacy.OutboxAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task ReplyFromAnotherParty_IsIgnored_ButTheAwaitedPartyCompletesTheCall()
    {
        var hub = new InProcessHub();
        using var clinic = NewRequester(hub);

        var call = clinic.Client.RequestAsync<GamotLookupRequestedPayload, GamotLookupRespondedPayload>(
            InteropTypes.GamotLookupRequested, InteropTypes.GamotLookupResponded, Clinic, Pharmacy,
            new GamotLookupRequestedPayload { Path = "x" }, TimeSpan.FromSeconds(5));
        var correlation = await WaitForCorrelationAsync(clinic);

        var impostor = Party.ForFacility(Tenant, "pharmacy-evil", FacilityType.Pharmacy);
        var forged = InteropEnvelope.Create(InteropTypes.GamotLookupResponded, impostor, Clinic, correlation,
            new GamotLookupRespondedPayload { StatusCode = 200, Body = "forged" });
        await clinic.Dispatcher.DispatchAsync(forged, CancellationToken.None);
        call.IsCompleted.Should().BeFalse();

        var genuine = InteropEnvelope.Create(InteropTypes.GamotLookupResponded, Pharmacy, Clinic, correlation,
            new GamotLookupRespondedPayload { StatusCode = 200, Body = "genuine" });
        await clinic.Dispatcher.DispatchAsync(genuine, CancellationToken.None);

        (await call).Body.Should().Be("genuine");
    }

    [Fact]
    public async Task ReplyAfterTimeout_IsAcknowledgedAndDropped()
    {
        var hub = new InProcessHub();
        using var clinic = NewRequester(hub);
        var late = InteropEnvelope.Create(InteropTypes.GamotLookupResponded, Pharmacy, Clinic, Guid.NewGuid(),
            new GamotLookupRespondedPayload { StatusCode = 200 });

        var result = await clinic.Dispatcher.DispatchAsync(late, CancellationToken.None);

        result.ShouldAck.Should().BeTrue();
    }
}

internal static class OutboxAssertions
{
    /// <summary>A request must not outlive its caller's patience on the hub.</summary>
    public static void ExpiresIsSet(this InteropOutboxMessage row) =>
        InteropEnvelope.FromJson(row.EnvelopeJson).ExpiresAtUtc.Should().NotBeNull();
}
