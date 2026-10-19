using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Workspace;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Sieve.Services;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Context;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using Xunit;

namespace ClinicEz.Pharmacy.Application.Tests;

/// <summary>workspace.profile.updated in the pharmacy: the shared handler writes the profile to this service's own database.</summary>
public class PharmacyWorkspaceProfileTests
{
    private const string Tenant = "tenant-pharmacy";
    private const string OtherTenant = "tenant-other";
    private static readonly Guid PharmacyGuid = new("aaaaaaaa-0000-0000-0000-000000000001");

    private static Party PharmacyParty(string tenant = Tenant) =>
        Party.ForFacility(tenant, PharmacyGuid.ToString(), FacilityType.Pharmacy);

    private static WorkspaceProfile Profile(long version, string name = "Rizal Health", string slug = "rizal") =>
        new(slug, version, name, null, "#0A7", "Asia/Manila", "en-PH", "dd/MM/yyyy", "PHP", "Dr. Cruz", "dpo@rizal.example");

    private static InteropEnvelope Envelope(WorkspaceProfile profile, string tenant = Tenant, Party? from = null, Party? to = null) =>
        InteropEnvelope.Create(
            InteropTypes.WorkspaceProfileUpdated,
            from ?? Party.Portal,
            to ?? PharmacyParty(tenant),
            Guid.NewGuid(),
            new WorkspaceProfileUpdatedEvent { TenantId = tenant, TenantSlug = profile.TenantSlug, Version = profile.Version, Profile = profile });

    private static ServiceProvider BuildProvider()
    {
        var dbName = $"Pharmacy_WorkspaceDb_{Guid.NewGuid()}";
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Pharmacy,
            ["Messaging:Enabled"] = "false",
            ["DbSchema"] = "pharmacy_dashboard"
        }).Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddHttpContextAccessor();
        services.AddScoped<PharmacyContext>();
        services.AddScoped<IPharmacyContext>(sp => sp.GetRequiredService<PharmacyContext>());
        services.AddScoped<IPharmacyScopeSetter>(sp => sp.GetRequiredService<PharmacyContext>());
        services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddSingleton(Substitute.For<ISieveProcessor>());
        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddWorkspaceProfile<ApplicationDbContext>();
        services.AddInterop<ApplicationDbContext>(config, h => h.HandleWorkspaceProfileUpdated());
        return services.BuildServiceProvider();
    }

    private static async Task<DispatchResult> DispatchAsync(ServiceProvider provider, InteropEnvelope envelope) =>
        await provider.GetRequiredService<InteropDispatcher>().DispatchAsync(envelope, default);

    private static async Task<WorkspaceProfile?> ReadAsync(ServiceProvider provider, string tenant)
    {
        using var scope = provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IWorkspaceProfileStore>().GetAsync(tenant, default);
    }

    [Fact]
    public async Task Provider_IsEmpty_UntilTheFirstMessageArrives()
    {
        await using var provider = BuildProvider();

        (await provider.GetRequiredService<IWorkspaceProfileProvider>().GetAsync(Tenant)).Should().BeNull();
    }

    [Fact]
    public async Task ProfileFromThePortal_IsStored_AndServedByIdOrSlug()
    {
        await using var provider = BuildProvider();

        (await DispatchAsync(provider, Envelope(Profile(3)))).Outcome.Should().Be(DispatchOutcome.Handled);

        var reader = provider.GetRequiredService<IWorkspaceProfileProvider>();
        (await reader.GetAsync(Tenant)).Should().Be(Profile(3));
        (await reader.GetAsync("RIZAL")).Should().Be(Profile(3));
    }

    [Fact]
    public async Task NewerVersions_Replace_ButRedeliveredAndOlderOnesAreIdempotent()
    {
        await using var provider = BuildProvider();
        var reader = provider.GetRequiredService<IWorkspaceProfileProvider>();

        await DispatchAsync(provider, Envelope(Profile(2, "Second")));
        await DispatchAsync(provider, Envelope(Profile(2, "Second")));
        await DispatchAsync(provider, Envelope(Profile(1, "First")));
        (await reader.GetAsync(Tenant))!.DisplayName.Should().Be("Second");

        await DispatchAsync(provider, Envelope(Profile(5, "Fifth")));
        (await reader.GetAsync(Tenant))!.Version.Should().Be(5);

        using var scope = provider.CreateScope();
        (await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().WorkspaceProfiles.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task ProfileAddressedToAnotherTenantsFacility_IsIgnored()
    {
        await using var provider = BuildProvider();

        await DispatchAsync(provider, Envelope(Profile(1), Tenant, to: PharmacyParty(OtherTenant)));

        (await ReadAsync(provider, Tenant)).Should().BeNull();
        (await ReadAsync(provider, OtherTenant)).Should().BeNull();
    }

    [Fact]
    public async Task ProfileFromAnyoneButThePortal_IsIgnored()
    {
        await using var provider = BuildProvider();
        var clinic = Party.ForFacility(Tenant, Guid.NewGuid().ToString(), FacilityType.Clinic);

        await DispatchAsync(provider, Envelope(Profile(1), from: clinic));

        (await ReadAsync(provider, Tenant)).Should().BeNull();
    }

    [Fact]
    public async Task EachTenantKeepsItsOwnProfile()
    {
        await using var provider = BuildProvider();

        await DispatchAsync(provider, Envelope(Profile(1, "Mine", "mine")));
        await DispatchAsync(provider, Envelope(Profile(9, "Theirs", "theirs"), OtherTenant));

        (await ReadAsync(provider, Tenant))!.DisplayName.Should().Be("Mine");
        (await ReadAsync(provider, OtherTenant))!.DisplayName.Should().Be("Theirs");
    }

    [Fact]
    public async Task MessageWithoutAProfile_FromAnOldPortal_ChangesNothing()
    {
        await using var provider = BuildProvider();
        var legacy = InteropEnvelope.Create(
            InteropTypes.WorkspaceProfileUpdated, Party.Portal, PharmacyParty(), Guid.NewGuid(),
            new WorkspaceProfileUpdatedEvent { TenantId = Tenant, TenantSlug = "rizal", Version = 4 });

        await DispatchAsync(provider, legacy);

        (await ReadAsync(provider, Tenant)).Should().BeNull();
    }
}
