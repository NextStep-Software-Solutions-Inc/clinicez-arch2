using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Application.Features.Billing;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Integrations;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Features.Ownership;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Persistence.Interceptors;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace ClinicEz.Portal.Tests.Support;

/// <summary>Builds the real context, publishers and handlers the way production wires them, on the in-memory provider.</summary>
internal static class TestSupport
{
    public static ApplicationDbContext NewContext(HubOptions? hub = null)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .AddInterceptors(new FacilityDirectoryInterceptor(Options.Create(hub ?? new HubOptions()), new SameBranchFacilityLinkService()))
            .Options;
        return new ApplicationDbContext(options);
    }

    public static IWorkspaceProfilePublisher ProfilePublisher(ApplicationDbContext context) =>
        new WorkspaceProfilePublisher(context, new InteropPublisher(context), new WebhookDispatcher(context));

    public static IFacilityProvisioningPublisher ProvisioningPublisher(ApplicationDbContext context) =>
        new FacilityProvisioningPublisher(context, new InteropPublisher(context));

    public static IStaffInvitationNotifier InvitationNotifier(ApplicationDbContext context, string? frontendUrl = "https://app.clinicez.test") =>
        new StaffInvitationNotifier(
            new NotificationService(new InteropPublisher(context)),
            new FixedFrontendUrl(frontendUrl),
            NullLogger<StaffInvitationNotifier>.Instance);

    public static CreateFacilityCommandHandler CreateFacilityHandler(
        ApplicationDbContext context,
        IEntitlementGuard guard,
        IConfiguration? configuration = null,
        IHubOnboardingService? onboarding = null)
    {
        var entitlements = Entitlements(context);
        return new(
            context,
            guard,
            entitlements,
            new FacilityAllocationService(context),
            new LicenseIssuer(new ClinicEz.Shared.Licensing.FacilityLicenseSigner(), Options.Create(new LicenseOptions()), TimeProvider.System),
            ProvisioningPublisher(context),
            new WebhookDispatcher(context),
            onboarding ?? new Mock<IHubOnboardingService>().Object,
            configuration ?? new ConfigurationBuilder().Build(),
            NullLogger<CreateFacilityCommandHandler>.Instance);
    }

    /// <summary>The real entitlement resolver over the plans of <see cref="Plans"/>, seeded on first use.</summary>
    public static IEntitlementService Entitlements(ApplicationDbContext context, TimeProvider? time = null)
    {
        var billing = Plans();
        PlanCatalog.SeedMissingAsync(context, billing, CancellationToken.None).GetAwaiter().GetResult();
        return new EntitlementService(context, Options.Create(billing), time ?? TimeProvider.System);
    }

    /// <summary>
    /// A small catalogue: <c>starter</c> (rank 1, one clinic and one branch, no cross-tenant interop) and <c>pro</c>
    /// (rank 2, generous limits, every feature). Everything else is unlimited so unrelated tests never hit a limit.
    /// </summary>
    public static BillingOptions Plans() => new()
    {
        DefaultPlanSlug = "starter",
        TrialDays = 14,
        Plans =
        [
            Plan("starter", 1, limits: new()
            {
                [EntitlementKeys.LimitClinics] = 3,
                [EntitlementKeys.LimitBranches] = 2,
                [EntitlementKeys.LimitMembers] = 5,
                [EntitlementKeys.PoolStaff] = 10,
                [EntitlementKeys.PoolStorageGb] = 2,
                [EntitlementKeys.PoolTerminals] = 3
            }, features: [EntitlementKeys.FeatureElectronicPrescriptions]),
            Plan("pro", 2, limits: new()
            {
                [EntitlementKeys.PoolStaff] = 40,
                [EntitlementKeys.PoolStorageGb] = 20,
                [EntitlementKeys.PoolTerminals] = 8
            }, features: [.. EntitlementKeys.Features])
        ]
    };

    private static PlanSeedOptions Plan(string slug, int rank, Dictionary<string, long> limits, List<string> features)
    {
        foreach (var key in EntitlementKeys.Limits.Where(k => !limits.ContainsKey(k)))
        {
            limits[key] = PlanSeedOptions.UnlimitedMarker;
        }

        return new PlanSeedOptions
        {
            Slug = slug,
            Name = slug,
            Rank = rank,
            Limits = limits,
            EnabledFeatures = features
        };
    }
    public static IOwnershipPolicy OwnershipPolicy(ApplicationDbContext context, int maxOwned = 1) =>
        new OwnershipPolicy(
            context,
            new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { ["Workspace:MaxOwnedPerUser"] = maxOwned.ToString() })
                .Build());

    public static IClerkMetadataSync NoClerkSync() => new Mock<IClerkMetadataSync>().Object;

    /// <summary>Seeds the plan catalogue and gives the workspace a subscription on <paramref name="planSlug"/>.</summary>
    public static async Task<Subscription> SeedSubscriptionAsync(
        ApplicationDbContext context,
        Guid tenantId,
        SubscriptionStatus status = SubscriptionStatus.Active,
        string planSlug = "pro",
        DateTime? periodEnd = null,
        DateTime? trialEndsAt = null)
    {
        Entitlements(context);
        var plan = await context.Plans.SingleAsync(p => p.Slug == planSlug);
        var subscription = new Subscription
        {
            TenantId = tenantId,
            PlanId = plan.Id,
            Plan = plan,
            Status = status,
            CurrentPeriodEnd = periodEnd ?? DateTime.UtcNow.AddDays(30),
            TrialEndsAt = trialEndsAt
        };
        context.Subscriptions.Add(subscription);
        await context.SaveChangesAsync();
        return subscription;
    }
    /// <summary>Outbox messages in the order the relay would ship them.</summary>
    public static List<InteropEnvelope> Outbox(ApplicationDbContext context, string? type = null) =>
        context.InteropOutbox
            .AsNoTracking()
            .AsEnumerable()
            .Where(m => type is null || m.Type == type)
            .OrderBy(m => m.CreatedAtUtc)
            .Select(m => InteropEnvelope.FromJson(m.EnvelopeJson))
            .ToList();

    public static List<T> OutboxPayloads<T>(ApplicationDbContext context, string type) =>
        Outbox(context, type).Select(e => e.GetPayload<T>()).ToList();
}

/// <summary>A clock tests move by hand.</summary>
internal sealed class TestClock(DateTimeOffset start) : TimeProvider
{
    private DateTimeOffset _now = start;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}
internal sealed class FixedFrontendUrl(string? url) : IFrontendUrlProvider
{
    public string? GetBaseUrl() => url;
}

/// <summary>Records what portal-api asks the hub admin API to do.</summary>
internal sealed class FakeHubAdminClient : IHubAdminClient
{
    public List<DirectoryCellUpsertedPayload> Cells { get; } = [];
    public List<(string CellId, CreateHubClientRequest Request)> CreatedClients { get; } = [];
    public List<string> RotatedClients { get; } = [];
    public List<string> RevokedClients { get; } = [];
    public Exception? FailRevokeWith { get; set; }
    public Exception? FailWith { get; set; }

    public Task UpsertCellAsync(DirectoryCellUpsertedPayload cell, CancellationToken ct)
    {
        ThrowIfFailing();
        Cells.Add(cell);
        return Task.CompletedTask;
    }

    public Task<HubClientCredentials> CreateClientAsync(string cellId, CreateHubClientRequest request, CancellationToken ct)
    {
        ThrowIfFailing();
        CreatedClients.Add((cellId, request));
        return Task.FromResult(new HubClientCredentials($"client-{CreatedClients.Count}", "created-secret", cellId, request.Service, request.Kind, $"created-signing-key-{CreatedClients.Count}"));
    }

    public Task<HubClientCredentials> RotateClientAsync(string clientId, CancellationToken ct)
    {
        ThrowIfFailing();
        RotatedClients.Add(clientId);
        return Task.FromResult(new HubClientCredentials(clientId, "rotated-secret", "cell", "clinic", HubClientKind.EdgeCell, "rotated-signing-key"));
    }

    public Task RevokeClientAsync(string clientId, CancellationToken ct)
    {
        if (FailRevokeWith is not null) throw FailRevokeWith;
        RevokedClients.Add(clientId);
        return Task.CompletedTask;
    }

    private void ThrowIfFailing()
    {
        if (FailWith is not null) throw FailWith;
    }
}
