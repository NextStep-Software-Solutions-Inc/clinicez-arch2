using System;
using System.Collections.Generic;
using System.Net;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Api.Middlewares;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.LocalAuth;
using ClinicEz.Shared.Licensing;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>
/// The clinic's part of the shared entitlement machinery: the license store / facility registry on <c>ClinicSettings</c>, the
/// <c>entitlements.changed</c> and heartbeat wiring, the entitlement version kept by license activation, and read-only grace
/// enforcement in a real pipeline.
/// </summary>
public class ClinicEntitlementsTests
{
    private const string Tenant = "tenant-clinic";
    private static readonly Guid ClinicGuid = new("cccccccc-0000-0000-0000-000000000001");
    private static readonly Guid OtherClinicGuid = new("cccccccc-0000-0000-0000-000000000002");
    private static Party ClinicParty => Party.ForFacility(Tenant, ClinicGuid.ToString(), FacilityType.Clinic);

    private static string Token(
        int version,
        DateTime? expires = null,
        DateTime? graceUntil = null,
        int maxStaff = 8,
        string plan = "Standard",
        Guid? facilityId = null) =>
        new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = facilityId ?? ClinicGuid,
            TenantId = Tenant,
            FacilityName = "Apex Family Clinic",
            FacilityType = "Clinic",
            PlanTier = plan,
            EntitlementVersion = version,
            ExpiresAtUtc = expires ?? DateTime.UtcNow.AddDays(30),
            ReadOnlyGraceUntil = graceUntil,
            Limits = new FacilityLimits { MaxStaff = maxStaff }
        });

    private static ClinicSettings Settings(string? token = null, int version = 0, bool deleted = false, Guid? id = null, string tenant = Tenant) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenant,
        ClinicId = id ?? ClinicGuid,
        ClinicName = "Apex Family Clinic",
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
            ClinicParty,
            Guid.NewGuid(),
            new EntitlementsChangedEvent { TenantId = Tenant, FacilityId = ClinicGuid, LicenseToken = token });

    private static ApplicationDbContext CreateDb(string dbName)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["DbSchema"] = "public" })
            .Build();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(dbName).Options;
        return new ApplicationDbContext(options, config);
    }

    private static FacilityLicensePayload PayloadOf(string token, Guid? facilityId = null) =>
        new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem)
            .Validate(token, facilityId ?? ClinicGuid, Tenant).Payload!;

    // ── store + registry ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Store_ReadsAndReplacesTheLicense()
    {
        var db = CreateDb($"Clinic_StoreDb_{Guid.NewGuid()}");
        db.ClinicSettings.Add(Settings("old-token", version: 1));
        await db.SaveChangesAsync();
        var store = new ClinicLicenseStore(db);
        var token = Token(version: 4, maxStaff: 20, plan: "Enterprise", expires: new DateTime(2027, 5, 1, 0, 0, 0, DateTimeKind.Utc));

        (await store.GetAsync(Tenant, ClinicGuid, default)).Should().Be(new HeldFacilityLicense("old-token", 1));
        await store.SaveAsync(Tenant, ClinicGuid, new FacilityLicenseUpdate(token, PayloadOf(token)), default);

        var saved = await db.ClinicSettings.IgnoreQueryFilters().SingleAsync();
        saved.LicenseToken.Should().Be(token);
        saved.EntitlementVersion.Should().Be(4);
        saved.PlanTier.Should().Be("Enterprise");
        saved.MaxStaffLimit.Should().Be(20);
        saved.LicenseExpiresAt.Should().Be(new DateTime(2027, 5, 1, 0, 0, 0, DateTimeKind.Utc));
        saved.UpdatedBy.Should().Be("SystemEntitlements");
    }

    [Fact]
    public async Task Store_DoesNotHoldOtherTenantsOtherClinicsOrDeletedClinics()
    {
        var db = CreateDb($"Clinic_StoreDb_{Guid.NewGuid()}");
        var deleted = Guid.NewGuid();
        db.ClinicSettings.AddRange(Settings("t"), Settings("gone", deleted: true, id: deleted));
        await db.SaveChangesAsync();
        var store = new ClinicLicenseStore(db);

        (await store.GetAsync("tenant-other", ClinicGuid, default)).Should().BeNull();
        (await store.GetAsync(Tenant, OtherClinicGuid, default)).Should().BeNull("another clinic of the same tenant is not this one");
        (await store.GetAsync(Tenant, deleted, default)).Should().BeNull();
    }

    [Fact]
    public async Task Store_SaveOnlyChangesTheAddressedClinic_EvenWithinOneTenant()
    {
        var db = CreateDb($"Clinic_StoreDb_{Guid.NewGuid()}");
        db.ClinicSettings.AddRange(Settings("clinic-one", version: 1), Settings("clinic-two", version: 1, id: OtherClinicGuid));
        await db.SaveChangesAsync();
        var store = new ClinicLicenseStore(db);
        var token = Token(version: 5);

        await store.SaveAsync(Tenant, ClinicGuid, new FacilityLicenseUpdate(token, PayloadOf(token)), default);

        (await store.GetAsync(Tenant, ClinicGuid, default))!.EntitlementVersion.Should().Be(5);
        (await store.GetAsync(Tenant, OtherClinicGuid, default)).Should().Be(new HeldFacilityLicense("clinic-two", 1));
    }

    [Fact]
    public async Task Store_SaveForAnUnprovisionedClinic_Throws()
    {
        var store = new ClinicLicenseStore(CreateDb($"Clinic_StoreDb_{Guid.NewGuid()}"));
        var token = Token(version: 1);

        var save = () => store.SaveAsync(Tenant, ClinicGuid, new FacilityLicenseUpdate(token, PayloadOf(token)), default);

        await save.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task Registry_ListsEveryProvisionedClinic_WithItsLicenseExpiry()
    {
        var db = CreateDb($"Clinic_RegistryDb_{Guid.NewGuid()}");
        var expiry = new DateTime(2027, 2, 1, 0, 0, 0, DateTimeKind.Utc);
        var second = Guid.NewGuid();
        var first = Settings("a");
        first.LicenseExpiresAt = expiry;
        first.IsWorkspaceEligible = true;
        db.ClinicSettings.AddRange(first, Settings("b", id: second, tenant: "tenant-two"), Settings("c", deleted: true, id: Guid.NewGuid()));
        await db.SaveChangesAsync();

        var entries = await new ClinicLicenseStore(db).ListAsync(default);

        entries.Should().BeEquivalentTo(new[]
        {
            new FacilityRegistryEntry(Tenant, ClinicGuid, FacilityType.Clinic, expiry, true),
            new FacilityRegistryEntry("tenant-two", second, FacilityType.Clinic, null, false)
        });
    }

    // ── wiring through the real dispatcher ──────────────────────────────────────────────

    private static ServiceProvider BuildProvider(string dbName)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Clinic,
            ["Messaging:Enabled"] = "false",
            ["DbSchema"] = "public"
        }).Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddHttpContextAccessor();
        services.AddScoped<IClinicContext, ClinicContext>();
        services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddFacilityEntitlements<ClinicLicenseStore>();
        services.AddFacilityHeartbeat<ClinicLicenseStore>();
        services.AddInterop<ApplicationDbContext>(config, h => h.HandleEntitlementsChanged());
        return services.BuildServiceProvider();
    }

    private static async Task SeedAsync(ServiceProvider provider, params ClinicSettings[] settings)
    {
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.ClinicSettings.AddRange(settings);
        await db.SaveChangesAsync();
    }

    private static async Task<ClinicSettings> ReadSettingsAsync(ServiceProvider provider)
    {
        using var scope = provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>()
            .ClinicSettings.IgnoreQueryFilters().AsNoTracking().SingleAsync();
    }

    [Fact]
    public async Task EntitlementsChanged_FromThePortal_UpdatesTheClinicsLicense_AndIgnoresStaleOnes()
    {
        await using var provider = BuildProvider($"Clinic_EntDb_{Guid.NewGuid()}");
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
        await using var provider = BuildProvider($"Clinic_EntDb_{Guid.NewGuid()}");
        await SeedAsync(provider, Settings("old", version: 1));
        var dispatcher = provider.GetRequiredService<InteropDispatcher>();
        var lab = Party.ForFacility("tenant-x", Guid.NewGuid().ToString(), FacilityType.Laboratory);
        var foreign = new FacilityLicenseSigner(
                System.Security.Cryptography.ECDsa.Create(System.Security.Cryptography.ECCurve.NamedCurves.nistP256).ExportECPrivateKeyPem())
            .SignLicense(new FacilityLicensePayload { FacilityId = ClinicGuid, TenantId = Tenant, EntitlementVersion = 9 });

        await dispatcher.DispatchAsync(Entitlements(Token(version: 5), from: lab), default);
        await dispatcher.DispatchAsync(Entitlements(foreign), default);

        (await ReadSettingsAsync(provider)).LicenseToken.Should().Be("old");
    }

    [Fact]
    public async Task EntitlementsChanged_ForAnotherClinicsLicense_ChangesNothing()
    {
        await using var provider = BuildProvider($"Clinic_EntDb_{Guid.NewGuid()}");
        await SeedAsync(provider, Settings("old", version: 1));
        var dispatcher = provider.GetRequiredService<InteropDispatcher>();

        await dispatcher.DispatchAsync(Entitlements(Token(version: 7, facilityId: OtherClinicGuid)), default);

        var settings = await ReadSettingsAsync(provider);
        settings.LicenseToken.Should().Be("old", "a license minted for another clinic is not bound to this one");
        settings.EntitlementVersion.Should().Be(1);
    }

    [Fact]
    public async Task Heartbeat_QueuesOneMessagePerProvisionedClinic_FromTheClinicToThePortal()
    {
        await using var provider = BuildProvider($"Clinic_HeartbeatDb_{Guid.NewGuid()}");
        await SeedAsync(provider, Settings("t"));

        (await provider.GetRequiredService<FacilityHeartbeatService>().RunOnceAsync(default)).Should().Be(1);

        using var scope = provider.CreateScope();
        var outbox = await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().InteropOutbox.SingleAsync();
        outbox.Type.Should().Be(InteropTypes.FacilityHeartbeat);
        var envelope = InteropEnvelope.FromJson(outbox.EnvelopeJson);
        envelope.From.Should().Be(ClinicParty);
        envelope.To.Should().Be(Party.Portal);
    }

    // ── the version kept by activation and provisioning ─────────────────────────────────

    [Fact]
    public async Task ApplyLicense_KeepsTheEntitlementVersionOfTheToken_ForNewAndExistingSettings()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns(Tenant);
        clinicContext.ClinicId.Returns(ClinicGuid);
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = new Repository<ClinicSettings>(context, sieve);
        var controller = new LicenseController(
            settingsRepo, new Repository<StaffMember>(context, sieve), new FacilityLicenseValidator(), clinicContext, uow,
            Substitute.For<ITenantLookupService>());

        await controller.ApplyLicense(new ApplyLicenseRequest(Token(version: 3)), CancellationToken.None);
        (await context.ClinicSettings.IgnoreQueryFilters().SingleAsync()).EntitlementVersion.Should().Be(3);

        await controller.ApplyLicense(new ApplyLicenseRequest(Token(version: 6)), CancellationToken.None);
        var saved = await context.ClinicSettings.IgnoreQueryFilters().SingleAsync();
        saved.EntitlementVersion.Should().Be(6);
        saved.LicenseToken.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task FacilityProvisioning_KeepsTheEntitlementVersionOfTheIssuedLicense()
    {
        var db = CreateDb($"Clinic_ProvisionDb_{Guid.NewGuid()}");
        var handler = new ClinicEz.Clinic.Infrastructure.Messaging.FacilityCreatedHandler(
            db, new InteropPublisher(db), new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<ClinicEz.Clinic.Infrastructure.Messaging.FacilityCreatedHandler>.Instance);
        var message = new FacilityCreatedEvent
        {
            ResourceId = ClinicGuid,
            TenantId = Tenant,
            FacilityType = FacilityType.Clinic,
            Name = "Apex Family Clinic",
            LicenseToken = Token(version: 4)
        };

        await handler.HandleAsync(message,
            MessagingTestKit.Delivered(InteropTypes.FacilityLicenseIssued, Party.Portal, ClinicParty, Guid.NewGuid(), message),
            default);

        (await db.ClinicSettings.IgnoreQueryFilters().SingleAsync()).EntitlementVersion.Should().Be(4);
    }

    // ── read-only grace in a real pipeline ──────────────────────────────────────────────

    /// <summary>Staff identity of the test pipeline: <c>X-Test-Clinic</c> carries the clinic of the signed token claims.</summary>
    private const string TestClinicHeader = "X-Test-Clinic";
    private const string TestInternalHeader = "X-Test-Internal";

    private static async Task<(WebApplication App, HttpClient Client)> StartPipelineAsync(string? token, bool provisioned = true)
    {
        var dbName = $"Clinic_GraceDb_{Guid.NewGuid()}";
        var seed = CreateDb(dbName);
        if (provisioned) seed.ClinicSettings.Add(Settings(token));
        seed.ClinicSettings.Add(Settings(Token(1, facilityId: OtherClinicGuid), id: OtherClinicGuid));
        await seed.SaveChangesAsync();

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = Environments.Development });
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["DbSchema"] = "public" });
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<IClinicContext, ClinicContext>();
        builder.Services.AddScoped(_ => CreateDb(dbName));
        builder.Services.AddFacilityEntitlements<ClinicLicenseStore>();
        builder.Services.AddApiServices();

        var app = builder.Build();
        app.Use((context, next) =>
        {
            if (context.Request.Headers.TryGetValue(TestClinicHeader, out var clinic))
            {
                var claims = new List<Claim>
                {
                    new(ClinicClaimTypes.TenantId, Tenant),
                    new(ClinicClaimTypes.ClinicId, clinic.ToString())
                };
                if (context.Request.Headers.ContainsKey(TestInternalHeader))
                {
                    claims.Add(new Claim(FacilityAuthSchemes.InternalClaim, "true"));
                }
                context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Facility"));
            }
            return next();
        });
        app.UseReadOnlyGrace();
        app.MapGet("/api/v1/patients", () => Results.Ok("patients"));
        app.MapPost("/api/v1/patients", () => Results.Ok("registered"));
        app.MapPost("/api/v1/license/apply", () => Results.Ok("applied"));
        app.MapPost("/api/v1/clinic/license/apply", () => Results.Ok("applied"));
        app.MapPost("/api/v1/auth/login", () => Results.Ok("signed-in"));
        app.MapPost("/api/v1/public/lab-upload/token", () => Results.Ok("uploaded"));
        app.MapPost("/api/v1/public/rx-verify/token/dispense", () => Results.Ok("dispensed"));
        app.MapGet("/api/v1/documents/verify/RX-1", () => Results.Ok("verified"));
        app.MapPost("/api/v1/patients/public/student-intake", () => Results.Ok("intake"));
        app.MapGet("/health", () => Results.Ok("healthy"));
        await app.StartAsync();
        return (app, app.GetTestClient());
    }

    private static async Task<string> ErrorCodeAsync(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("errors")[0].GetProperty("code").GetString()!;
    }

    private static Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string url, Guid? staffOfClinic = null, bool internalService = false)
    {
        var request = new HttpRequestMessage(method, url);
        if (method != HttpMethod.Get) request.Content = new StringContent("{}");
        if (staffOfClinic is { } clinic) request.Headers.Add(TestClinicHeader, clinic.ToString());
        if (internalService) request.Headers.Add(TestInternalHeader, "1");
        return client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> StaffGet(HttpClient client, string url) => SendAsync(client, HttpMethod.Get, url, ClinicGuid);
    private static Task<HttpResponseMessage> StaffPost(HttpClient client, string url) => SendAsync(client, HttpMethod.Post, url, ClinicGuid);

    [Fact]
    public async Task ActiveLicense_AllowsWrites()
    {
        var (app, client) = await StartPipelineAsync(Token(1));
        await using var _ = app;

        (await StaffGet(client, "/api/v1/patients")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await StaffPost(client, "/api/v1/patients")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ExpiredWithinGrace_AllowsReads_RejectsWrites_AndKeepsLicenseAndSignInReachable()
    {
        var (app, client) = await StartPipelineAsync(Token(1, expires: DateTime.UtcNow.AddDays(-3), graceUntil: DateTime.UtcNow.AddDays(11)));
        await using var _ = app;

        (await StaffGet(client, "/api/v1/patients")).StatusCode.Should().Be(HttpStatusCode.OK);
        var write = await StaffPost(client, "/api/v1/patients");
        write.StatusCode.Should().Be(HttpStatusCode.PaymentRequired);
        (await ErrorCodeAsync(write)).Should().Be(LicenseErrorCodes.ReadOnly);
        (await StaffPost(client, "/api/v1/license/apply")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await StaffPost(client, "/api/v1/clinic/license/apply")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await StaffPost(client, "/api/v1/auth/login")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ExpiredBeyondGrace_BlocksEverythingButLicenseAndSignIn()
    {
        var (app, client) = await StartPipelineAsync(Token(1, expires: DateTime.UtcNow.AddDays(-40), graceUntil: DateTime.UtcNow.AddDays(-26)));
        await using var _ = app;

        var read = await StaffGet(client, "/api/v1/patients");
        read.StatusCode.Should().Be(HttpStatusCode.PaymentRequired);
        (await ErrorCodeAsync(read)).Should().Be(LicenseErrorCodes.Expired);
        (await StaffPost(client, "/api/v1/license/apply")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await StaffPost(client, "/api/v1/clinic/license/apply")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await StaffPost(client, "/api/v1/auth/login")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await StaffGet(client, "/health")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ExpiredBeyondGrace_KeepsThePublicPatientAndVerificationEndpointsReachable()
    {
        var (app, client) = await StartPipelineAsync(Token(1, expires: DateTime.UtcNow.AddDays(-40), graceUntil: DateTime.UtcNow.AddDays(-26)));
        await using var _ = app;

        (await StaffPost(client, "/api/v1/public/lab-upload/token")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await StaffPost(client, "/api/v1/public/rx-verify/token/dispense")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await StaffGet(client, "/api/v1/documents/verify/RX-1")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await StaffPost(client, "/api/v1/patients/public/student-intake")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task TamperedLicense_IsBlocked()
    {
        var (app, client) = await StartPipelineAsync("not.a-signed-license");
        await using var _ = app;

        var response = await StaffGet(client, "/api/v1/patients");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await ErrorCodeAsync(response)).Should().Be(LicenseErrorCodes.Tampered);
    }

    [Fact]
    public async Task UnprovisionedOrUnlicensedClinic_IsNotSubjectToGraceEnforcement()
    {
        var (unprovisionedApp, unprovisioned) = await StartPipelineAsync(null, provisioned: false);
        await using var _1 = unprovisionedApp;
        var (unlicensedApp, unlicensed) = await StartPipelineAsync(null);
        await using var _2 = unlicensedApp;

        (await StaffPost(unprovisioned, "/api/v1/patients")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await StaffPost(unlicensed, "/api/v1/patients")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AnExpiredClinic_DoesNotRestrictAnotherClinicOfTheSameTenant()
    {
        var (app, client) = await StartPipelineAsync(Token(1, expires: DateTime.UtcNow.AddDays(-40), graceUntil: DateTime.UtcNow.AddDays(-26)));
        await using var _ = app;

        (await StaffPost(client, "/api/v1/patients")).StatusCode.Should().Be(HttpStatusCode.PaymentRequired);
        (await SendAsync(client, HttpMethod.Post, "/api/v1/patients", OtherClinicGuid)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AnonymousRequests_AreNeverEnforced_EvenWhenAClinicHintNamesAnExpiredClinic()
    {
        var (app, client) = await StartPipelineAsync(Token(1, expires: DateTime.UtcNow.AddDays(-40), graceUntil: DateTime.UtcNow.AddDays(-26)));
        await using var _ = app;
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/patients") { Content = new StringContent("{}") };
        request.Headers.Add("X-Clinic-Id", ClinicGuid.ToString());
        request.Headers.Add("X-Tenant-Id", Tenant);

        var response = await client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK, "the workspace hint is not an authenticated clinic");
    }

    [Fact]
    public async Task TrustedInternalServices_AreNotSubjectToTheClinicsGraceEnforcement()
    {
        var (app, client) = await StartPipelineAsync(Token(1, expires: DateTime.UtcNow.AddDays(-40), graceUntil: DateTime.UtcNow.AddDays(-26)));
        await using var _ = app;

        (await SendAsync(client, HttpMethod.Post, "/api/v1/patients", ClinicGuid, internalService: true)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── which clinic a request belongs to ───────────────────────────────────────────────

    private static ClinicLicenseState StateOver(ApplicationDbContext db) =>
        new(new ClinicLicenseStore(db), new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem));

    private static DefaultHttpContext RequestFor(DefaultHttpContext http)
    {
        var accessor = new HttpContextAccessor { HttpContext = http };
        var scope = new ClinicContext(accessor, new ConfigurationBuilder().Build());
        http.RequestServices = new ServiceCollection().AddSingleton<IClinicContext>(scope).BuildServiceProvider();
        return http;
    }

    [Fact]
    public async Task LicenseState_ForAnonymousRequests_HasNoClinic_AndIsNotEnforced()
    {
        var db = CreateDb($"Clinic_StateDb_{Guid.NewGuid()}");
        db.ClinicSettings.Add(Settings(Token(1, expires: DateTime.UtcNow.AddDays(-40), graceUntil: DateTime.UtcNow.AddDays(-26))));
        await db.SaveChangesAsync();
        var http = new DefaultHttpContext();
        http.Request.Headers["X-Clinic-Id"] = ClinicGuid.ToString();

        (await StateOver(db).GetAsync(RequestFor(http), default)).Should().BeNull();
    }

    [Fact]
    public async Task LicenseState_ForAStaffSession_IsResolvedFromTheTokenClaims_NotFromHeaders()
    {
        var db = CreateDb($"Clinic_StateDb_{Guid.NewGuid()}");
        db.ClinicSettings.Add(Settings(Token(1, expires: DateTime.UtcNow.AddDays(-3), graceUntil: DateTime.UtcNow.AddDays(11))));
        db.ClinicSettings.Add(Settings(Token(1, facilityId: OtherClinicGuid), id: OtherClinicGuid));
        await db.SaveChangesAsync();
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
            [
                new Claim(ClinicClaimTypes.TenantId, Tenant),
                new Claim(ClinicClaimTypes.ClinicId, ClinicGuid.ToString())
            ], "Facility"))
        };
        http.Request.Headers["X-Clinic-Id"] = OtherClinicGuid.ToString();

        var state = await StateOver(db).GetAsync(RequestFor(http), default);

        state.Should().NotBeNull();
        state!.IsReadOnlyGrace.Should().BeTrue("the session's clinic is in grace; the header naming a healthy clinic is ignored");
    }

    [Fact]
    public async Task LicenseState_ForAStaffTokenWithoutAClinic_IsNotEnforced()
    {
        var db = CreateDb($"Clinic_StateDb_{Guid.NewGuid()}");
        db.ClinicSettings.Add(Settings(Token(1, expires: DateTime.UtcNow.AddDays(-40), graceUntil: DateTime.UtcNow.AddDays(-26))));
        await db.SaveChangesAsync();
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClinicClaimTypes.TenantId, Tenant)], "Facility"))
        };

        (await StateOver(db).GetAsync(RequestFor(http), default)).Should().BeNull("an unresolved clinic maps to a sentinel that matches no license");
    }
}
