using System.Net;
using System.Text.Json;
using ClinicEz.Pharmacy.Api.Middleware;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Context;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using ClinicEz.Pharmacy.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Sieve.Services;

namespace ClinicEz.Pharmacy.Application.Tests;

/// <summary>
/// The pharmacy's part of the shared entitlement machinery: the license store / facility registry on <c>PharmacySettings</c>,
/// the <c>entitlements.changed</c> and heartbeat wiring, and read-only grace enforcement in a real pipeline.
/// </summary>
public class PharmacyEntitlementsTests
{
    private const string Tenant = "tenant-pharmacy";
    private static readonly Guid PharmacyGuid = new("aaaaaaaa-0000-0000-0000-000000000001");
    private static Party PharmacyParty => Party.ForFacility(Tenant, PharmacyGuid.ToString(), FacilityType.Pharmacy);

    private static string Token(
        int version,
        DateTime? expires = null,
        DateTime? graceUntil = null,
        int maxStaff = 8,
        string plan = "Standard",
        Guid? facilityId = null) =>
        new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = facilityId ?? PharmacyGuid,
            TenantId = Tenant,
            FacilityName = "Rizal Community Pharmacy",
            FacilityType = "Pharmacy",
            PlanTier = plan,
            EntitlementVersion = version,
            ExpiresAtUtc = expires ?? DateTime.UtcNow.AddDays(30),
            ReadOnlyGraceUntil = graceUntil,
            Limits = new FacilityLimits { MaxStaff = maxStaff }
        });

    private static PharmacySettings Settings(string? token = null, int version = 0, bool deleted = false, Guid? id = null, string tenant = Tenant) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenant,
        PharmacyId = id ?? PharmacyGuid,
        PharmacyName = "Rizal Community Pharmacy",
        LicenseToken = token,
        EntitlementVersion = version,
        IsDeleted = deleted,
        CreatedAt = DateTime.UtcNow,
        CreatedBy = "test"
    };

    private static InteropEnvelope Entitlements(string token, Party? from = null) =>
        InteropEnvelope.Create(
            InteropTypes.EntitlementsChanged,
            from ?? Party.Portal,
            PharmacyParty,
            Guid.NewGuid(),
            new EntitlementsChangedEvent { TenantId = Tenant, FacilityId = PharmacyGuid, LicenseToken = token });

    // ── store + registry ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Store_ReadsAndReplacesTheLicense_AcrossTenantScopes()
    {
        var db = PharmacyTestDbHelper.CreateContext($"Pharmacy_StoreDb_{Guid.NewGuid()}", new TestPharmacyScope(string.Empty, Guid.Empty));
        db.PharmacySettings.Add(Settings("old-token", version: 1));
        await db.SaveChangesAsync();
        var store = new PharmacyLicenseStore(db);
        var token = Token(version: 4, maxStaff: 20, plan: "Enterprise", expires: new DateTime(2027, 5, 1, 0, 0, 0, DateTimeKind.Utc));
        var payload = new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem)
            .Validate(token, PharmacyGuid, Tenant).Payload!;

        (await store.GetAsync(Tenant, PharmacyGuid, default)).Should().Be(new HeldFacilityLicense("old-token", 1));
        await store.SaveAsync(Tenant, PharmacyGuid, new FacilityLicenseUpdate(token, payload), default);

        var saved = await db.PharmacySettings.IgnoreQueryFilters().SingleAsync();
        saved.LicenseToken.Should().Be(token);
        saved.EntitlementVersion.Should().Be(4);
        saved.PlanTier.Should().Be("Enterprise");
        saved.MaxStaffLimit.Should().Be(20);
        saved.LicenseExpiresAt.Should().Be(new DateTime(2027, 5, 1, 0, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public async Task Store_DoesNotHoldOtherTenantsOrUnprovisionedOrDeletedPharmacies()
    {
        var db = PharmacyTestDbHelper.CreateContext($"Pharmacy_StoreDb_{Guid.NewGuid()}", new TestPharmacyScope(string.Empty, Guid.Empty));
        var deleted = Guid.NewGuid();
        db.PharmacySettings.AddRange(Settings("t"), Settings("gone", deleted: true, id: deleted));
        await db.SaveChangesAsync();
        var store = new PharmacyLicenseStore(db);

        (await store.GetAsync("tenant-other", PharmacyGuid, default)).Should().BeNull();
        (await store.GetAsync(Tenant, Guid.NewGuid(), default)).Should().BeNull();
        (await store.GetAsync(Tenant, deleted, default)).Should().BeNull();
    }

    [Fact]
    public async Task Registry_ListsEveryProvisionedPharmacy_WithItsLicenseExpiry()
    {
        var db = PharmacyTestDbHelper.CreateContext($"Pharmacy_RegistryDb_{Guid.NewGuid()}", new TestPharmacyScope(string.Empty, Guid.Empty));
        var expiry = new DateTime(2027, 2, 1, 0, 0, 0, DateTimeKind.Utc);
        var second = Guid.NewGuid();
        var first = Settings("a");
        first.LicenseExpiresAt = expiry;
        db.PharmacySettings.AddRange(first, Settings("b", id: second, tenant: "tenant-two"), Settings("c", deleted: true, id: Guid.NewGuid()));
        await db.SaveChangesAsync();

        var entries = await new PharmacyLicenseStore(db).ListAsync(default);

        entries.Should().BeEquivalentTo(new[]
        {
            new FacilityRegistryEntry(Tenant, PharmacyGuid, FacilityType.Pharmacy, expiry),
            new FacilityRegistryEntry("tenant-two", second, FacilityType.Pharmacy, null)
        });
    }

    // ── wiring through the real dispatcher ──────────────────────────────────────────────

    private static ServiceProvider BuildProvider(string dbName)
    {
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
        services.AddFacilityEntitlements<PharmacyLicenseStore>();
        services.AddFacilityHeartbeat<PharmacyLicenseStore>();
        services.AddInterop<ApplicationDbContext>(config, h => h.HandleEntitlementsChanged());
        return services.BuildServiceProvider();
    }

    private static async Task SeedAsync(ServiceProvider provider, params PharmacySettings[] settings)
    {
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.PharmacySettings.AddRange(settings);
        await db.SaveChangesAsync();
    }

    private static async Task<PharmacySettings> ReadSettingsAsync(ServiceProvider provider)
    {
        using var scope = provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>()
            .PharmacySettings.IgnoreQueryFilters().AsNoTracking().SingleAsync();
    }

    [Fact]
    public async Task EntitlementsChanged_FromThePortal_UpdatesThePharmacysLicense_AndIgnoresStaleOnes()
    {
        await using var provider = BuildProvider($"Pharmacy_EntDb_{Guid.NewGuid()}");
        await SeedAsync(provider, Settings("old", version: 1));
        var dispatcher = provider.GetRequiredService<InteropDispatcher>();
        var current = Token(version: 3, maxStaff: 15, plan: "Enterprise");

        (await dispatcher.DispatchAsync(Entitlements(current), default)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await dispatcher.DispatchAsync(Entitlements(Token(version: 2, maxStaff: 2)), default)).Outcome.Should().Be(DispatchOutcome.Handled);

        var settings = await ReadSettingsAsync(provider);
        settings.LicenseToken.Should().Be(current);
        settings.EntitlementVersion.Should().Be(3);
        settings.MaxStaffLimit.Should().Be(15);
        settings.PlanTier.Should().Be("Enterprise");
    }

    [Fact]
    public async Task EntitlementsChanged_FromAFacility_OrWithAForeignSignature_ChangesNothing()
    {
        await using var provider = BuildProvider($"Pharmacy_EntDb_{Guid.NewGuid()}");
        await SeedAsync(provider, Settings("old", version: 1));
        var dispatcher = provider.GetRequiredService<InteropDispatcher>();
        var clinic = Party.ForFacility("tenant-x", Guid.NewGuid().ToString(), FacilityType.Clinic);
        var foreign = new FacilityLicenseSigner(
                System.Security.Cryptography.ECDsa.Create(System.Security.Cryptography.ECCurve.NamedCurves.nistP256).ExportECPrivateKeyPem())
            .SignLicense(new FacilityLicensePayload { FacilityId = PharmacyGuid, TenantId = Tenant, EntitlementVersion = 9 });

        await dispatcher.DispatchAsync(Entitlements(Token(version: 5), from: clinic), default);
        await dispatcher.DispatchAsync(Entitlements(foreign), default);

        (await ReadSettingsAsync(provider)).LicenseToken.Should().Be("old");
    }

    [Fact]
    public async Task Heartbeat_QueuesOneMessagePerProvisionedPharmacy_FromThePharmacyToThePortal()
    {
        await using var provider = BuildProvider($"Pharmacy_HeartbeatDb_{Guid.NewGuid()}");
        await SeedAsync(provider, Settings("t"));

        (await provider.GetRequiredService<FacilityHeartbeatService>().RunOnceAsync(default)).Should().Be(1);

        using var scope = provider.CreateScope();
        var outbox = await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().InteropOutbox.SingleAsync();
        outbox.Type.Should().Be(InteropTypes.FacilityHeartbeat);
        var envelope = InteropEnvelope.FromJson(outbox.EnvelopeJson);
        envelope.From.Should().Be(PharmacyParty);
        envelope.To.Should().Be(Party.Portal);
    }

    // ── read-only grace in a real pipeline ──────────────────────────────────────────────

    private static async Task<(WebApplication App, HttpClient Client)> StartPipelineAsync(string? token, bool provisioned = true)
    {
        var dbName = $"Pharmacy_GraceDb_{Guid.NewGuid()}";
        var scope = new TestPharmacyScope(Tenant, PharmacyGuid);
        var seed = PharmacyTestDbHelper.CreateContext(dbName, scope);
        if (provisioned) seed.PharmacySettings.Add(Settings(token));
        await seed.SaveChangesAsync();

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddScoped(_ => PharmacyTestDbHelper.CreateContext(dbName, scope));
        builder.Services.AddSingleton<IPharmacyContext>(scope);
        builder.Services.AddFacilityEntitlements<PharmacyLicenseStore>();
        builder.Services.AddReadOnlyGrace<PharmacyLicenseState>("/api/v1/auth", "/api/v1/license", "/health");

        var app = builder.Build();
        app.UseReadOnlyGrace();
        app.MapGet("/api/v1/prescriptions", () => Results.Ok("queue"));
        app.MapPost("/api/v1/prescriptions/{id}/dispense", (string id) => Results.Ok("dispensed"));
        app.MapPost("/api/v1/license/apply", () => Results.Ok("applied"));
        app.MapPost("/api/v1/auth/login", () => Results.Ok("signed-in"));
        await app.StartAsync();
        return (app, app.GetTestClient());
    }

    private static async Task<string> ErrorCodeAsync(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("errors")[0].GetProperty("code").GetString()!;
    }

    private static Task<HttpResponseMessage> PostAsync(HttpClient client, string url) => client.PostAsync(url, new StringContent("{}"));

    [Fact]
    public async Task ActiveLicense_AllowsWrites()
    {
        var (app, client) = await StartPipelineAsync(Token(1));
        await using var _ = app;

        (await client.GetAsync("/api/v1/prescriptions")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await PostAsync(client, "/api/v1/prescriptions/1/dispense")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ExpiredWithinGrace_AllowsReads_RejectsWrites_AndKeepsLicenseAndSignInReachable()
    {
        var (app, client) = await StartPipelineAsync(Token(1, expires: DateTime.UtcNow.AddDays(-3), graceUntil: DateTime.UtcNow.AddDays(11)));
        await using var _ = app;

        (await client.GetAsync("/api/v1/prescriptions")).StatusCode.Should().Be(HttpStatusCode.OK);
        var write = await PostAsync(client, "/api/v1/prescriptions/1/dispense");
        write.StatusCode.Should().Be(HttpStatusCode.PaymentRequired);
        (await ErrorCodeAsync(write)).Should().Be(LicenseErrorCodes.ReadOnly);
        (await PostAsync(client, "/api/v1/license/apply")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await PostAsync(client, "/api/v1/auth/login")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ExpiredBeyondGrace_BlocksEverythingButLicenseAndSignIn()
    {
        var (app, client) = await StartPipelineAsync(Token(1, expires: DateTime.UtcNow.AddDays(-40), graceUntil: DateTime.UtcNow.AddDays(-26)));
        await using var _ = app;

        var read = await client.GetAsync("/api/v1/prescriptions");
        read.StatusCode.Should().Be(HttpStatusCode.PaymentRequired);
        (await ErrorCodeAsync(read)).Should().Be(LicenseErrorCodes.Expired);
        (await PostAsync(client, "/api/v1/license/apply")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task TamperedLicense_IsBlocked()
    {
        var (app, client) = await StartPipelineAsync("not.a-signed-license");
        await using var _ = app;

        var response = await client.GetAsync("/api/v1/prescriptions");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await ErrorCodeAsync(response)).Should().Be(LicenseErrorCodes.Tampered);
    }

    [Fact]
    public async Task UnprovisionedOrUnlicensedPharmacy_IsNotSubjectToGraceEnforcement()
    {
        var (unprovisionedApp, unprovisioned) = await StartPipelineAsync(null, provisioned: false);
        await using var _1 = unprovisionedApp;
        var (unlicensedApp, unlicensed) = await StartPipelineAsync(null);
        await using var _2 = unlicensedApp;

        (await PostAsync(unprovisioned, "/api/v1/prescriptions/1/dispense")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await PostAsync(unlicensed, "/api/v1/prescriptions/1/dispense")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task LicenseState_ForAnonymousRequests_HasNoFacility_AndIsNotEnforced()
    {
        var db = PharmacyTestDbHelper.CreateContext($"Pharmacy_StateDb_{Guid.NewGuid()}", new TestPharmacyScope(Tenant, PharmacyGuid));
        var state = new PharmacyLicenseState(new PharmacyLicenseStore(db), new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem));
        var anonymousScope = new TestPharmacyScope(string.Empty, PharmacyContext.UnauthenticatedPharmacyId);
        var context = new DefaultHttpContext
        {
            RequestServices = new ServiceCollection().AddSingleton<IPharmacyContext>(anonymousScope).BuildServiceProvider()
        };

        (await state.GetAsync(context, default)).Should().BeNull();
    }
}
