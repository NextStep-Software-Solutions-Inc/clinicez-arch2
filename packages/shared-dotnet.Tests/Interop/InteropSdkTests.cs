using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Background;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Tests.Interop;

public sealed record Ping(string Text);

public sealed class PingCounter
{
    public int Handled;
    public bool Fail;
}

public sealed class PingHandler : IInteropHandler<Ping>
{
    private readonly PingCounter _counter;
    public PingHandler(PingCounter counter) => _counter = counter;

    public Task HandleAsync(Ping payload, InteropMessageContext context, CancellationToken ct)
    {
        if (_counter.Fail) throw new InvalidOperationException("boom");
        _counter.Handled++;
        return Task.CompletedTask;
    }
}

public sealed class TestDbContext : DbContext, IInteropDbContext
{
    public TestDbContext(DbContextOptions<TestDbContext> options) : base(options) { }
    public DbSet<InteropOutboxMessage> InteropOutbox => Set<InteropOutboxMessage>();
    public DbSet<InteropInboxMessage> InteropInbox => Set<InteropInboxMessage>();
    protected override void OnModelCreating(ModelBuilder modelBuilder) => modelBuilder.ApplyInteropModel();
}

/// <summary>Builds a service container wired exactly like a real service, on the in-process hub.</summary>
internal sealed class InteropHarness : IDisposable
{
    public const string Service = InteropServices.Laboratory;

    public ServiceProvider Provider { get; }
    public InProcessHub Hub => Provider.GetRequiredService<InProcessHub>();
    public PingCounter Counter => Provider.GetRequiredService<PingCounter>();

    public InteropHarness(string? type = "test.ping")
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = Service,
            ["Messaging:Enabled"] = "false"
        }).Build();

        var dbName = Guid.NewGuid().ToString();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<PingCounter>();
        services.AddDbContext<TestDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddInterop<TestDbContext>(config, b => b.Handle<Ping, PingHandler>("test.ping"));
        Provider = services.BuildServiceProvider();
    }

    public static Party Lab => Party.ForFacility("tenant-a", "lab-1", FacilityType.Laboratory);
    public static Party Clinic => Party.ForFacility("tenant-a", "clinic-1", FacilityType.Clinic);

    public async Task<InteropEnvelope> PublishAsync(string text = "hi", Party? to = null, TimeSpan? ttl = null, bool save = true)
    {
        using var scope = Provider.CreateScope();
        var publisher = scope.ServiceProvider.GetRequiredService<IInteropPublisher>();
        var envelope = publisher.Enqueue("test.ping", Clinic, to ?? Lab, Guid.NewGuid(), new Ping(text), ttl: ttl);
        if (save) await scope.ServiceProvider.GetRequiredService<TestDbContext>().SaveChangesAsync();
        return envelope;
    }

    public InteropRelayService Relay => Provider.GetRequiredService<InteropRelayService>();
    public InteropInboxPollerService Poller => Provider.GetRequiredService<InteropInboxPollerService>();
    public InteropDispatcher Dispatcher => Provider.GetRequiredService<InteropDispatcher>();

    public async Task<List<InteropOutboxMessage>> OutboxAsync()
    {
        using var scope = Provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<TestDbContext>().InteropOutbox.AsNoTracking().ToListAsync();
    }

    public void Dispose() => Provider.Dispose();
}

public class InteropSdkTests
{
    [Fact]
    public async Task Publish_without_save_writes_nothing()
    {
        using var h = new InteropHarness();
        await h.PublishAsync(save: false);

        (await h.OutboxAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task Relay_ships_committed_rows_once_and_marks_them_dispatched()
    {
        using var h = new InteropHarness();
        var envelope = await h.PublishAsync();

        (await h.Relay.RunOnceAsync(default)).Should().Be(1);
        (await h.Relay.RunOnceAsync(default)).Should().Be(0);

        h.Hub.Sent.Should().ContainSingle().Which.MessageId.Should().Be(envelope.MessageId);
        (await h.OutboxAsync()).Single().DispatchedAtUtc.Should().NotBeNull();
    }

    [Fact]
    public async Task Poller_dispatches_to_handler_and_acks()
    {
        using var h = new InteropHarness();
        await h.PublishAsync();
        await h.Relay.RunOnceAsync(default);

        (await h.Poller.RunOnceAsync(0, default)).Should().Be(1);

        h.Counter.Handled.Should().Be(1);
        h.Hub.Pending(InteropHarness.Service).Should().Be(0);
    }

    [Fact]
    public async Task Redelivered_message_is_handled_only_once()
    {
        using var h = new InteropHarness();
        var envelope = await h.PublishAsync();

        (await h.Dispatcher.DispatchAsync(envelope, default)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await h.Dispatcher.DispatchAsync(envelope, default)).Outcome.Should().Be(DispatchOutcome.Duplicate);

        h.Counter.Handled.Should().Be(1);
    }

    [Fact]
    public async Task Failing_handler_is_nacked_and_redelivered_then_succeeds()
    {
        using var h = new InteropHarness();
        await h.PublishAsync();
        await h.Relay.RunOnceAsync(default);

        h.Counter.Fail = true;
        await h.Poller.RunOnceAsync(0, default);
        h.Hub.Pending(InteropHarness.Service).Should().Be(1);

        h.Counter.Fail = false;
        await h.Poller.RunOnceAsync(0, default);
        h.Counter.Handled.Should().Be(1);
        h.Hub.Pending(InteropHarness.Service).Should().Be(0);
    }

    [Fact]
    public async Task Persistently_failing_message_is_dead_lettered_by_the_hub()
    {
        using var h = new InteropHarness();
        h.Hub.MaxAttempts = 3;
        await h.PublishAsync();
        await h.Relay.RunOnceAsync(default);

        h.Counter.Fail = true;
        for (var i = 0; i < 3; i++) await h.Poller.RunOnceAsync(0, default);

        h.Hub.DeadLetters.Should().ContainSingle();
        h.Hub.Pending(InteropHarness.Service).Should().Be(0);
    }

    [Fact]
    public async Task Expired_message_is_dropped_without_running_the_handler()
    {
        using var h = new InteropHarness();
        var expired = InteropEnvelope.Create("test.ping", InteropHarness.Clinic, InteropHarness.Lab, Guid.NewGuid(),
            new Ping("late"), ttl: TimeSpan.FromMilliseconds(-1));

        var result = await h.Dispatcher.DispatchAsync(expired, default);

        result.Outcome.Should().Be(DispatchOutcome.Expired);
        result.ShouldAck.Should().BeTrue();
        h.Counter.Handled.Should().Be(0);
    }

    [Fact]
    public async Task Unknown_type_is_not_acked()
    {
        using var h = new InteropHarness();
        var unknown = InteropEnvelope.Create("nobody.handles.this", InteropHarness.Clinic, InteropHarness.Lab, Guid.NewGuid(), new Ping("x"));

        var result = await h.Dispatcher.DispatchAsync(unknown, default);

        result.Outcome.Should().Be(DispatchOutcome.NoHandler);
        result.ShouldAck.Should().BeFalse();
    }

    [Fact]
    public async Task Hub_rejection_dead_letters_the_outbox_row_permanently()
    {
        using var h = new InteropHarness();
        var envelope = await h.PublishAsync();
        // Replace the row with one whose payload the hub rejects as expired.
        using (var scope = h.Provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TestDbContext>();
            var row = await db.InteropOutbox.SingleAsync();
            row.EnvelopeJson = (envelope with { ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1) }).ToJson();
            await db.SaveChangesAsync();
        }

        await h.Relay.RunOnceAsync(default);
        await h.Relay.RunOnceAsync(default);

        var row2 = (await h.OutboxAsync()).Single();
        row2.DeadLetteredAtUtc.Should().NotBeNull();
        row2.DispatchedAtUtc.Should().BeNull();
        h.Hub.Sent.Should().BeEmpty();
    }

    [Fact]
    public void Duplicate_send_is_reported_as_duplicate_not_delivered_twice()
    {
        var hub = new InProcessHub();
        var envelope = InteropEnvelope.Create("test.ping", InteropHarness.Clinic, InteropHarness.Lab, Guid.NewGuid(), new Ping("x"));

        hub.Send(envelope).Status.Should().Be(SendResult.Accepted);
        hub.Send(envelope).Status.Should().Be(SendResult.Duplicate);
        hub.Pending(InteropServices.Laboratory).Should().Be(1);
    }

    [Fact]
    public void Envelope_round_trips_through_json()
    {
        var envelope = InteropEnvelope.Create("test.ping", InteropHarness.Clinic, InteropHarness.Lab, Guid.NewGuid(), new Ping("x"), schemaVersion: 2);

        var copy = InteropEnvelope.FromJson(envelope.ToJson());

        copy.MessageId.Should().Be(envelope.MessageId);
        copy.From.FacilityId.Should().Be("clinic-1");
        copy.To.FacilityType.Should().Be(FacilityType.Laboratory);
        copy.SchemaVersion.Should().Be(2);
        copy.GetPayload<Ping>().Text.Should().Be("x");
    }

    [Fact]
    public void Missing_hub_configuration_fails_fast_with_no_fallback_secret()
    {
        var options = new InteropOptions { Transport = "Hub", HubUrl = "https://hub", ClientId = "c" };

        var act = options.Validate;

        act.Should().Throw<InvalidOperationException>().WithMessage("*ClientSecret*Service*");
    }

    [Fact]
    public void Option_validation_runs_at_host_start()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "Hub"
        }).Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<TestDbContext>(o => o.UseInMemoryDatabase("x"));
        services.AddInterop<TestDbContext>(config);
        using var provider = services.BuildServiceProvider();

        var act = () => provider.GetRequiredService<IOptions<InteropOptions>>().Value;

        act.Should().Throw<InvalidOperationException>().WithMessage("*Messaging:HubUrl*");
    }

    [Fact]
    public void Publisher_rejects_unresolvable_destination()
    {
        using var h = new InteropHarness();
        using var scope = h.Provider.CreateScope();
        var publisher = scope.ServiceProvider.GetRequiredService<IInteropPublisher>();

        var act = () => publisher.Enqueue("test.ping", InteropHarness.Clinic, new Party { Kind = PartyKind.Facility }, Guid.NewGuid(), new Ping("x"));

        act.Should().Throw<InvalidOperationException>();
    }
}
