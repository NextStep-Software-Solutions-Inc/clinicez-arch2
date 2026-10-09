using ClinicEz.Organization.Application.Interop;
using ClinicEz.Organization.Domain.Interfaces;
using ClinicEz.Organization.Infrastructure.Persistence;
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
using NSubstitute;
using Sieve.Services;

namespace ClinicEz.Organization.Tests;

/// <summary>The organization service wired like production, on the in-process hub and an in-memory database.</summary>
internal sealed class OrganizationInteropHost : IDisposable
{
    public ServiceProvider Provider { get; }
    public InProcessHub Hub => Provider.GetRequiredService<InProcessHub>();
    public InteropDispatcher Dispatcher => Provider.GetRequiredService<InteropDispatcher>();
    public InteropRelayService Relay => Provider.GetRequiredService<InteropRelayService>();

    public OrganizationInteropHost()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["DbSchema"] = "organization_dashboard",
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Organization,
            ["Messaging:Enabled"] = "false"
        }).Build();

        var dbName = $"Organization_InteropDb_{Guid.NewGuid()}";
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddScoped(_ => Substitute.For<ISieveProcessor>());
        services.AddScoped(_ => Substitute.For<IProductRepository>());
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddInterop<ApplicationDbContext>(config, handlers => handlers
            .Handle<FacilityCreatedEvent, FacilityLicenseIssuedHandler>(InteropTypes.FacilityLicenseIssued));
        Provider = services.BuildServiceProvider();
    }

    public async Task<List<InteropOutboxMessage>> OutboxAsync()
    {
        using var scope = Provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>()
            .InteropOutbox.AsNoTracking().ToListAsync();
    }

    public void Dispose() => Provider.Dispose();
}

public class FacilityLicenseIssuedHandlerTests
{
    private static InteropEnvelope Envelope(
        Party from, Party to, Guid resourceId, string tenantId, FacilityType type = FacilityType.Organization) =>
        InteropEnvelope.Create(InteropTypes.FacilityLicenseIssued, from, to, Guid.NewGuid(), new FacilityCreatedEvent
        {
            TenantId = tenantId,
            ResourceId = resourceId,
            FacilityType = type,
            Name = "Test Organization"
        });

    private static (Guid ResourceId, Party To) Organization(string tenantId = "tenant-org")
    {
        var id = Guid.NewGuid();
        return (id, Party.ForFacility(tenantId, id.ToString(), FacilityType.Organization));
    }

    [Fact]
    public async Task Same_message_delivered_twice_acknowledges_provisioning_once()
    {
        using var host = new OrganizationInteropHost();
        var (id, to) = Organization();
        var envelope = Envelope(Party.Portal, to, id, "tenant-org");

        (await host.Dispatcher.DispatchAsync(envelope, default)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await host.Dispatcher.DispatchAsync(envelope, default)).Outcome.Should().Be(DispatchOutcome.Duplicate);

        var outbox = await host.OutboxAsync();
        outbox.Should().ContainSingle().Which.Type.Should().Be(InteropTypes.FacilityProvisioned);
    }

    [Fact]
    public async Task Acknowledgement_is_committed_to_the_outbox_and_shipped_to_the_portal()
    {
        using var host = new OrganizationInteropHost();
        var (id, to) = Organization();
        var envelope = Envelope(Party.Portal, to, id, "tenant-org");

        await host.Dispatcher.DispatchAsync(envelope, default);
        (await host.Relay.RunOnceAsync(default)).Should().Be(1);

        var sent = host.Hub.Sent.Should().ContainSingle().Subject;
        sent.Type.Should().Be(InteropTypes.FacilityProvisioned);
        sent.From.Should().Be(to);
        sent.To.Should().Be(Party.Portal);
        sent.CorrelationId.Should().Be(envelope.CorrelationId);
        var payload = sent.GetPayload<FacilityProvisionedEvent>();
        payload.ResourceId.Should().Be(id);
        payload.Success.Should().BeTrue();
    }

    [Fact]
    public async Task Acknowledgement_is_not_committed_when_the_save_fails()
    {
        using var host = new OrganizationInteropHost();
        var (id, to) = Organization();
        var envelope = Envelope(Party.Portal, to, id, "tenant-org");
        var failingUnitOfWork = Substitute.For<IUnitOfWork>();
        failingUnitOfWork.SaveChangesAsync(Arg.Any<CancellationToken>())
            .Returns<Task<int>>(_ => throw new DbUpdateException("boom"));

        using (var scope = host.Provider.CreateScope())
        {
            var handler = new FacilityLicenseIssuedHandler(
                scope.ServiceProvider.GetRequiredService<IInteropPublisher>(),
                failingUnitOfWork,
                NullLogger<FacilityLicenseIssuedHandler>.Instance);

            var act = () => handler.HandleAsync(
                envelope.GetPayload<FacilityCreatedEvent>(), new InteropMessageContext(envelope), CancellationToken.None);

            await act.Should().ThrowAsync<DbUpdateException>();
        }

        (await host.OutboxAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task Message_from_a_facility_instead_of_the_control_plane_is_ignored()
    {
        using var host = new OrganizationInteropHost();
        var (id, to) = Organization();
        var spoofed = Party.ForFacility("tenant-a", Guid.NewGuid().ToString(), FacilityType.Clinic);

        var result = await host.Dispatcher.DispatchAsync(Envelope(spoofed, to, id, "tenant-org"), default);

        result.ShouldAck.Should().BeTrue();
        (await host.OutboxAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task Message_addressed_to_another_organization_or_tenant_is_ignored()
    {
        using var host = new OrganizationInteropHost();
        var (id, _) = Organization();
        var otherOrganization = Party.ForFacility("tenant-org", Guid.NewGuid().ToString(), FacilityType.Organization);
        var otherTenant = Party.ForFacility("other-tenant", id.ToString(), FacilityType.Organization);

        (await host.Dispatcher.DispatchAsync(Envelope(Party.Portal, otherOrganization, id, "tenant-org"), default)).ShouldAck.Should().BeTrue();
        (await host.Dispatcher.DispatchAsync(Envelope(Party.Portal, otherTenant, id, "tenant-org"), default)).ShouldAck.Should().BeTrue();

        (await host.OutboxAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task License_for_a_laboratory_is_not_handled_by_the_organization_service()
    {
        using var host = new OrganizationInteropHost();
        var id = Guid.NewGuid();
        var to = Party.ForFacility("tenant-org", id.ToString(), FacilityType.Laboratory);

        var result = await host.Dispatcher.DispatchAsync(
            Envelope(Party.Portal, to, id, "tenant-org", FacilityType.Laboratory), default);

        result.ShouldAck.Should().BeTrue();
        (await host.OutboxAsync()).Should().BeEmpty();
    }
}
