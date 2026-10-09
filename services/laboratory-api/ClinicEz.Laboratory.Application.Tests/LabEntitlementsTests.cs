using System.Net;
using System.Security.Claims;
using System.Text.Json;
using ClinicEz.Laboratory.Api.Middlewares;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Infrastructure.Context;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Laboratory.Infrastructure.Persistence.Repositories;
using ClinicEz.Laboratory.Infrastructure.Services;
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

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>
/// The laboratory's part of the shared entitlement machinery: the license store / facility registry on <c>LabSettings</c>,
/// the <c>entitlements.changed</c> and heartbeat wiring, and read-only grace enforcement in a real pipeline.
/// </summary>
public class LabEntitlementsTests
{
    private const string Tenant = "tenant-lab";
    private static readonly Guid LabGuid = new("bbbbbbbb-0000-0000-0000-000000000001");
    private static readonly Guid OtherLabGuid = new("bbbbbbbb-0000-0000-0000-000000000002");
    private static Party LabParty => Party.ForFacility(Tenant, LabGuid.ToString(), FacilityType.Laboratory);

    private static string Token(
        int version,
        DateTime? expires = null,
        DateTime? graceUntil = null,
        int maxStaff = 8,
        int maxAnalyzers = 2,
        string plan = "Standard",
        Guid? facilityId = null) =>
        new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = facilityId ?? LabGuid,
            TenantId = Tenant,
            FacilityName = "Rizal Diagnostic Laboratory",
            FacilityType = "Laboratory",
            PlanTier = plan,
            EntitlementVersion = version,
            ExpiresAtUtc = expires ?? DateTime.UtcNow.AddDays(30),
            ReadOnlyGraceUntil = graceUntil,
            Limits = new FacilityLimits { MaxStaff = maxStaff, MaxAnalyzers = maxAnalyzers }
        });

    private static LabSettings Settings(string? token = null, int version = 0, bool deleted = false, Guid? id = null, string tenant = Tenant) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenant,
        LaboratoryId = id ?? LabGuid,
        LaboratoryName = "Rizal Diagnostic Laboratory",
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
            LabParty,
            Guid.NewGuid(),
            new EntitlementsChangedEvent { TenantId = Tenant, FacilityId = LabGuid, LicenseToken = token });

    private static ApplicationDbContext CreateDb(string dbName, ILabContext? labContext = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["DbSchema"] = "laboratory_dashboard" })
            .Build();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(dbName).Options;
        return new ApplicationDbContext(options, config, labContext);
    }

    private static ILabContext NewLabContext() => new LabContext(new HttpContextAccessor());

    // ── store + registry ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Store_ReadsAndReplacesTheLicense_AcrossLabScopes()
    {
        var labContext = NewLabContext();
        var db = CreateDb($"Lab_StoreDb_{Guid.NewGuid()}", labContext);
        db.LabSettings.Add(Settings("old-token", version: 1));
        await db.SaveChangesAsync();
        var store = new LabLicenseStore(db, labContext);
        var token = Token(version: 4, maxStaff: 20, maxAnalyzers: 6, plan: "Enterprise", expires: new DateTime(2027, 5, 1, 0, 0, 0, DateTimeKind.Utc));
        var payload = new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem)
            .Validate(token, LabGuid, Tenant).Payload!;

        (await store.GetAsync(Tenant, LabGuid, default)).Should().Be(new HeldFacilityLicense("old-token", 1));
        await store.SaveAsync(Tenant, LabGuid, new FacilityLicenseUpdate(token, payload), default);

        var saved = await db.LabSettings.IgnoreQueryFilters().SingleAsync();
        saved.LicenseToken.Should().Be(token);
        saved.EntitlementVersion.Should().Be(4);
        saved.PlanTier.Should().Be("Enterprise");
        saved.MaxStaffLimit.Should().Be(20);
        saved.MaxAnalyzersLimit.Should().Be(6);
        saved.LicenseExpiresAt.Should().Be(new DateTime(2027, 5, 1, 0, 0, 0, DateTimeKind.Utc));
        labContext.ScopeKind.Should().Be(LabScopeKind.None, "the store only enters the laboratory's scope for the duration of the save");
    }

    [Fact]
    public async Task Store_DoesNotHoldOtherTenantsOtherLabsUnprovisionedOrDeletedLaboratories()
    {
        var db = CreateDb($"Lab_StoreDb_{Guid.NewGuid()}");
        var deleted = Guid.NewGuid();
        db.LabSettings.AddRange(Settings("t"), Settings("gone", deleted: true, id: deleted));
        await db.SaveChangesAsync();
        var store = new LabLicenseStore(db, NewLabContext());

        (await store.GetAsync("tenant-other", LabGuid, default)).Should().BeNull();
        (await store.GetAsync(Tenant, OtherLabGuid, default)).Should().BeNull("another laboratory of the same tenant is not this one");
        (await store.GetAsync(Tenant, deleted, default)).Should().BeNull();
    }

    [Fact]
    public async Task Store_SaveOnlyChangesTheAddressedLaboratory_EvenWithinOneTenant()
    {
        var labContext = NewLabContext();
        var db = CreateDb($"Lab_StoreDb_{Guid.NewGuid()}", labContext);
        db.LabSettings.AddRange(Settings("lab-one", version: 1), Settings("lab-two", version: 1, id: OtherLabGuid));
        await db.SaveChangesAsync();
        var store = new LabLicenseStore(db, labContext);
        var token = Token(version: 5);
        var payload = new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem)
            .Validate(token, LabGuid, Tenant).Payload!;

        await store.SaveAsync(Tenant, LabGuid, new FacilityLicenseUpdate(token, payload), default);

        (await store.GetAsync(Tenant, LabGuid, default))!.EntitlementVersion.Should().Be(5);
        (await store.GetAsync(Tenant, OtherLabGuid, default)).Should().Be(new HeldFacilityLicense("lab-two", 1));
    }

    [Fact]
    public async Task Store_SaveForAnUnprovisionedLaboratory_Throws()
    {
        var db = CreateDb($"Lab_StoreDb_{Guid.NewGuid()}");
        var store = new LabLicenseStore(db, NewLabContext());
        var token = Token(version: 1);
        var payload = new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem)
            .Validate(token, LabGuid, Tenant).Payload!;

        var save = () => store.SaveAsync(Tenant, LabGuid, new FacilityLicenseUpdate(token, payload), default);

        await save.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task Registry_ListsEveryProvisionedLaboratory_WithItsLicenseExpiry()
    {
        var db = CreateDb($"Lab_RegistryDb_{Guid.NewGuid()}");
        var expiry = new DateTime(2027, 2, 1, 0, 0, 0, DateTimeKind.Utc);
        var second = Guid.NewGuid();
        var first = Settings("a");
        first.LicenseExpiresAt = expiry;
        db.LabSettings.AddRange(first, Settings("b", id: second, tenant: "tenant-two"), Settings("c", deleted: true, id: Guid.NewGuid()));
        await db.SaveChangesAsync();

        var entries = await new LabLicenseStore(db, NewLabContext()).ListAsync(default);

        entries.Should().BeEquivalentTo(new[]
        {
            new FacilityRegistryEntry(Tenant, LabGuid, FacilityType.Laboratory, expiry),
            new FacilityRegistryEntry("tenant-two", second, FacilityType.Laboratory, null)
        });
    }

    // ── wiring through the real dispatcher ──────────────────────────────────────────────

    private static ServiceProvider BuildProvider(string dbName)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Laboratory,
            ["Messaging:Enabled"] = "false",
            ["DbSchema"] = "laboratory_dashboard"
        }).Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddHttpContextAccessor();
        services.AddScoped<ILabContext, LabContext>();
        services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddScoped(_ => Substitute.For<ISieveProcessor>());
        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddFacilityEntitlements<LabLicenseStore>();
        services.AddFacilityHeartbeat<LabLicenseStore>();
        services.AddInterop<ApplicationDbContext>(config, h => h.HandleEntitlementsChanged());
        return services.BuildServiceProvider();
    }

    private static async Task SeedAsync(ServiceProvider provider, params LabSettings[] settings)
    {
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.LabSettings.AddRange(settings);
        await db.SaveChangesAsync();
    }

    private static async Task<LabSettings> ReadSettingsAsync(ServiceProvider provider)
    {
        using var scope = provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>()
            .LabSettings.IgnoreQueryFilters().AsNoTracking().SingleAsync();
    }

    [Fact]
    public async Task EntitlementsChanged_FromThePortal_UpdatesTheLaboratorysLicense_AndIgnoresStaleOnes()
    {
        await using var provider = BuildProvider($"Lab_EntDb_{Guid.NewGuid()}");
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
        await using var provider = BuildProvider($"Lab_EntDb_{Guid.NewGuid()}");
        await SeedAsync(provider, Settings("old", version: 1));
        var dispatcher = provider.GetRequiredService<InteropDispatcher>();
        var clinic = Party.ForFacility("tenant-x", Guid.NewGuid().ToString(), FacilityType.Clinic);
        var foreign = new FacilityLicenseSigner(
                System.Security.Cryptography.ECDsa.Create(System.Security.Cryptography.ECCurve.NamedCurves.nistP256).ExportECPrivateKeyPem())
            .SignLicense(new FacilityLicensePayload { FacilityId = LabGuid, TenantId = Tenant, EntitlementVersion = 9 });

        await dispatcher.DispatchAsync(Entitlements(Token(version: 5), from: clinic), default);
        await dispatcher.DispatchAsync(Entitlements(foreign), default);

        (await ReadSettingsAsync(provider)).LicenseToken.Should().Be("old");
    }

    [Fact]
    public async Task EntitlementsChanged_ForAnotherLaboratorysLicense_ChangesNothing()
    {
        await using var provider = BuildProvider($"Lab_EntDb_{Guid.NewGuid()}");
        await SeedAsync(provider, Settings("old", version: 1));
        var dispatcher = provider.GetRequiredService<InteropDispatcher>();
        var forOtherLab = Token(version: 7, facilityId: OtherLabGuid);

        await dispatcher.DispatchAsync(Entitlements(forOtherLab), default);

        var settings = await ReadSettingsAsync(provider);
        settings.LicenseToken.Should().Be("old", "a license minted for another laboratory is not bound to this one");
        settings.EntitlementVersion.Should().Be(1);
    }

    [Fact]
    public async Task Heartbeat_QueuesOneMessagePerProvisionedLaboratory_FromTheLaboratoryToThePortal()
    {
        await using var provider = BuildProvider($"Lab_HeartbeatDb_{Guid.NewGuid()}");
        await SeedAsync(provider, Settings("t"));

        (await provider.GetRequiredService<FacilityHeartbeatService>().RunOnceAsync(default)).Should().Be(1);

        using var scope = provider.CreateScope();
        var outbox = await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().InteropOutbox.SingleAsync();
        outbox.Type.Should().Be(InteropTypes.FacilityHeartbeat);
        var envelope = InteropEnvelope.FromJson(outbox.EnvelopeJson);
        envelope.From.Should().Be(LabParty);
        envelope.To.Should().Be(Party.Portal);
    }

    // ── read-only grace in a real pipeline ──────────────────────────────────────────────

    /// <summary>
    /// A pipeline for one request laboratory (<paramref name="requestLab"/>, default the first). Another laboratory of the same
    /// tenant is always seeded alongside it with a healthy license.
    /// </summary>
    private static async Task<(WebApplication App, HttpClient Client)> StartPipelineAsync(
        string? token, bool provisioned = true, Guid? requestLab = null)
    {
        var dbName = $"Lab_GraceDb_{Guid.NewGuid()}";
        var scope = Substitute.For<ILabContext>();
        scope.TenantId.Returns(Tenant);
        scope.LaboratoryId.Returns(requestLab ?? LabGuid);

        var seed = CreateDb(dbName);
        if (provisioned) seed.LabSettings.Add(Settings(token));
        seed.LabSettings.Add(Settings(Token(1, facilityId: OtherLabGuid), id: OtherLabGuid));
        await seed.SaveChangesAsync();

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddScoped(_ => CreateDb(dbName));
        builder.Services.AddSingleton(scope);
        builder.Services.AddFacilityEntitlements<LabLicenseStore>();
        builder.Services.AddReadOnlyGrace<LabLicenseState>("/api/v1/auth", "/api/v1/license", "/api/v1/laboratory/license", "/health");

        var app = builder.Build();
        app.UseReadOnlyGrace();
        app.MapGet("/api/v1/requisitions", () => Results.Ok("worklist"));
        app.MapPost("/api/v1/requisitions/1/accession", () => Results.Ok("accessioned"));
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

        (await client.GetAsync("/api/v1/requisitions")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await PostAsync(client, "/api/v1/requisitions/1/accession")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ExpiredWithinGrace_AllowsReads_RejectsWrites_AndKeepsLicenseAndSignInReachable()
    {
        var (app, client) = await StartPipelineAsync(Token(1, expires: DateTime.UtcNow.AddDays(-3), graceUntil: DateTime.UtcNow.AddDays(11)));
        await using var _ = app;

        (await client.GetAsync("/api/v1/requisitions")).StatusCode.Should().Be(HttpStatusCode.OK);
        var write = await PostAsync(client, "/api/v1/requisitions/1/accession");
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

        var read = await client.GetAsync("/api/v1/requisitions");
        read.StatusCode.Should().Be(HttpStatusCode.PaymentRequired);
        (await ErrorCodeAsync(read)).Should().Be(LicenseErrorCodes.Expired);
        (await PostAsync(client, "/api/v1/license/apply")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task TamperedLicense_IsBlocked()
    {
        var (app, client) = await StartPipelineAsync("not.a-signed-license");
        await using var _ = app;

        var response = await client.GetAsync("/api/v1/requisitions");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await ErrorCodeAsync(response)).Should().Be(LicenseErrorCodes.Tampered);
    }

    [Fact]
    public async Task UnprovisionedOrUnlicensedLaboratory_IsNotSubjectToGraceEnforcement()
    {
        var (unprovisionedApp, unprovisioned) = await StartPipelineAsync(null, provisioned: false);
        await using var _1 = unprovisionedApp;
        var (unlicensedApp, unlicensed) = await StartPipelineAsync(null);
        await using var _2 = unlicensedApp;

        (await PostAsync(unprovisioned, "/api/v1/requisitions/1/accession")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await PostAsync(unlicensed, "/api/v1/requisitions/1/accession")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AnExpiredLaboratory_DoesNotRestrictAnotherLaboratoryOfTheSameTenant()
    {
        var expired = Token(1, expires: DateTime.UtcNow.AddDays(-40), graceUntil: DateTime.UtcNow.AddDays(-26));
        var (blockedApp, blocked) = await StartPipelineAsync(expired);
        await using var _1 = blockedApp;
        var (otherApp, other) = await StartPipelineAsync(expired, requestLab: OtherLabGuid);
        await using var _2 = otherApp;

        (await PostAsync(blocked, "/api/v1/requisitions/1/accession")).StatusCode.Should().Be(HttpStatusCode.PaymentRequired);
        (await PostAsync(other, "/api/v1/requisitions/1/accession")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── which laboratory a request belongs to ───────────────────────────────────────────

    private static DefaultHttpContext RequestFor(ILabContext scope) => new()
    {
        RequestServices = new ServiceCollection().AddSingleton(scope).BuildServiceProvider()
    };

    private static LabLicenseState StateOver(ApplicationDbContext db) =>
        new(new LabLicenseStore(db, NewLabContext()), new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem));

    [Fact]
    public async Task LicenseState_ForAnonymousRequests_HasNoLaboratory_AndIsNotEnforced()
    {
        var db = CreateDb($"Lab_StateDb_{Guid.NewGuid()}");
        db.LabSettings.Add(Settings(Token(1, expires: DateTime.UtcNow.AddDays(-40), graceUntil: DateTime.UtcNow.AddDays(-26))));
        await db.SaveChangesAsync();
        var anonymous = new LabContext(new HttpContextAccessor { HttpContext = new DefaultHttpContext() });

        (await StateOver(db).GetAsync(RequestFor(anonymous), default)).Should().BeNull();
    }

    [Fact]
    public async Task LicenseState_ForAStaffSession_IsResolvedFromTheTokenClaims_NotFromHeaders()
    {
        var db = CreateDb($"Lab_StateDb_{Guid.NewGuid()}");
        db.LabSettings.Add(Settings(Token(1, expires: DateTime.UtcNow.AddDays(-3), graceUntil: DateTime.UtcNow.AddDays(11))));
        db.LabSettings.Add(Settings(Token(1, facilityId: OtherLabGuid), id: OtherLabGuid));
        await db.SaveChangesAsync();
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
            [
                new Claim(LabClaimTypes.TenantId, Tenant),
                new Claim(LabClaimTypes.LaboratoryId, LabGuid.ToString())
            ], "Facility"))
        };
        http.Request.Headers["X-Facility-Id"] = OtherLabGuid.ToString();
        var staff = new LabContext(new HttpContextAccessor { HttpContext = http });

        var state = await StateOver(db).GetAsync(RequestFor(staff), default);

        state.Should().NotBeNull();
        state!.IsReadOnlyGrace.Should().BeTrue("the session's laboratory is in grace; the header naming a healthy laboratory is ignored");
    }
}
