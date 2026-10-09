using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Api.Authorization;
using ClinicEz.Pharmacy.Api.Controllers;
using ClinicEz.Pharmacy.Domain.Constants;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Auth;
using ClinicEz.Pharmacy.Infrastructure.Context;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Xunit;

namespace ClinicEz.Pharmacy.Application.Tests;

/// <summary>
/// End-to-end HTTP tests of the pharmacy facility-local auth pipeline using the REAL controllers, <c>[HasPermission]</c> filters,
/// token events and scope middleware in an in-process test server (MediatR and the database are substituted).
/// No network or identity provider involved.
/// </summary>
public class PharmacyAuthPipelineTests
{
    private const string InternalKey = "internal-service-secret-key";
    private const string Audience = "clinicez-pharmacy";
    private static readonly Guid PharmacyA = Guid.Parse("11111111-aaaa-aaaa-aaaa-111111111111");

    private sealed class TestApp : IAsyncDisposable
    {
        public required WebApplication App { get; init; }
        public required HttpClient Client { get; init; }
        public required ISender Sender { get; init; }
        public required IPharmacyAuthService Auth { get; init; }
        public required Dictionary<Guid, StaffAccessInfo> Staff { get; init; }
        public IFacilityTokenService Tokens => App.Services.GetRequiredService<IFacilityTokenService>();

        /// <summary>Registers a staff member in the (substituted) access cache and returns a signed session token for them.</summary>
        public string StaffToken(PharmacyStaffRole role, int version = 0, bool active = true, Guid? pharmacy = null, string tenant = "tenant-a")
        {
            var id = Guid.NewGuid();
            Staff[id] = new StaffAccessInfo(active, version, PharmacyRolePermissions.For(role));
            return Tokens.CreateAccessToken(new[]
            {
                new Claim(PharmacyClaimTypes.Subject, id.ToString()),
                new Claim(PharmacyClaimTypes.TenantId, tenant),
                new Claim(PharmacyClaimTypes.PharmacyId, (pharmacy ?? PharmacyA).ToString()),
                new Claim(PharmacyClaimTypes.TokenVersion, version.ToString())
            }).Token;
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.StopAsync();
            await App.DisposeAsync();
        }
    }

    private static async Task<TestApp> StartAsync(string audience = Audience, string? signingKey = null)
    {
        var staff = new Dictionary<Guid, StaffAccessInfo>();
        var cache = Substitute.For<IStaffAccessCache>();
        cache.GetAsync(Arg.Any<Guid>(), Arg.Any<System.Threading.CancellationToken>())
            .Returns(call => Task.FromResult(staff.TryGetValue(call.Arg<Guid>(), out var info) ? info : null));

        var sender = Substitute.For<ISender>();
        sender.Send<ClinicEz.Pharmacy.Application.Features.Staff.DTOs.PharmacyStaffMemberDto>(Arg.Any<IRequest<ClinicEz.Pharmacy.Application.Features.Staff.DTOs.PharmacyStaffMemberDto>>(), Arg.Any<System.Threading.CancellationToken>())
            .Returns(new ClinicEz.Pharmacy.Application.Features.Staff.DTOs.PharmacyStaffMemberDto(Guid.NewGuid(), "tenant-a", PharmacyA, "Sam", "Staff", null, null, PharmacyStaffRole.Cashier, null, null, null, null, true, DateTime.UtcNow));
        var auth = Substitute.For<IPharmacyAuthService>();
        auth.GetStatusAsync(default, default).ReturnsForAnyArgs(new AuthStatusDto(true, "Active", false, "Test"));
        auth.LoginAsync(default!, default).ReturnsForAnyArgs(AuthOutcome.Fail(AuthFailure.InvalidRequest, "reached"));
        auth.RefreshAsync(default, default).ReturnsForAnyArgs(AuthOutcome.Fail(AuthFailure.InvalidRequest, "reached"));
        auth.BootstrapAsync(default!, default).ReturnsForAnyArgs(AuthOutcome.Fail(AuthFailure.InvalidRequest, "reached"));
        auth.SetTemporaryPasswordAsync(default, default, default, default)
            .ReturnsForAnyArgs(new AuthOutcome(true, null, AuthFailure.None, null));
        auth.RevokeSessionsAsync(default, default, default).ReturnsForAnyArgs(true);

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:SigningKey"] = signingKey ?? Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            ["Jwt:Audience"] = audience,
            ["Jwt:Issuer"] = audience,
            ["Internal:ApiKey"] = InternalKey
        });
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddFacilityLocalAuth(builder.Configuration, audience, PharmacyTokenEvents.OnTokenValidated);
        builder.Services.AddScoped<IPharmacyContext, PharmacyContext>();
        builder.Services.AddSingleton(cache);
        builder.Services.AddSingleton(sender);
        builder.Services.AddSingleton(auth);
        builder.Services.AddSingleton(Substitute.For<IWorkspaceResolver>());
        builder.Services.AddControllers().AddApplicationPart(typeof(HasPermissionAttribute).Assembly);

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseMiddleware<PharmacyScopeMiddleware>();
        app.MapGet("/health", () => Results.Ok("ok")).AllowAnonymous();
        app.MapGet("/whoami", (IPharmacyContext ctx) => Results.Ok(new
        {
            tenant = ctx.TenantId,
            pharmacy = ctx.PharmacyId,
            staff = ctx.StaffId,
            internalService = ctx.IsInternalService,
            canInventory = ctx.HasPermission(PharmacyPermissions.InventoryRead),
            canManageStaff = ctx.HasPermission(PharmacyPermissions.StaffManage)
        }));
        app.MapControllers();
        await app.StartAsync();
        return new TestApp { App = app, Client = app.GetTestClient(), Sender = sender, Auth = auth, Staff = staff };
    }

    private static HttpRequestMessage Req(HttpMethod method, string url, string? bearer = null, object? body = null, params (string Name, string Value)[] headers)
    {
        var request = new HttpRequestMessage(method, url);
        if (bearer is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        foreach (var (name, value) in headers) request.Headers.TryAddWithoutValidation(name, value);
        if (body is not null) request.Content = JsonContent.Create(body);
        return request;
    }

    // Valid request bodies so [ApiController] model validation never short-circuits the permission filter.
    private static readonly object DispenseBody = new { prescriptionOrderId = Guid.NewGuid(), pharmacistName = "Pat", pharmacistPrcLicense = "PRC-1", hciAccreditationNumber = "HCI-1" };
    private static readonly object ReverseBody = new { reason = "wrong item", reversedBy = "Pat" };
    private static readonly object UpscGenerateBody = new { prescriptionOrderId = Guid.NewGuid(), prescriptionOrderItemId = Guid.NewGuid(), hciAccreditationNumber = "HCI-1" };
    private static readonly object UpscValidateBody = new { uniquePrescriptionSecurityCode = "UPSC-1" };
    private static readonly object BatchBody = new { inventoryItemId = Guid.NewGuid(), batchNumber = "B-1", expiryDate = DateTime.UtcNow.AddYears(1), quantityReceived = 5 };
    private static readonly object StaffBody = new { firstName = "Sam", lastName = "Staff", role = 3 };
    private static readonly object TempPasswordBody = new { temporaryPassword = "Temp-Pass-12345" };
    private static readonly object ClaimBody = new { token = "claim-token-1" };
    private static readonly object PartialAcceptBody = new { acceptedItemIds = new[] { Guid.NewGuid() }, reason = "Out of stock" };
    private static readonly object RejectBody = new { reason = "Not dispensable here" };
    private static readonly object PaymentPolicyBody = new { paymentPolicy = "Postpaid" };

    private static (HttpMethod Method, string Url, object? Body, string Permission) Route(string method, string url, object? body, string permission) =>
        (new HttpMethod(method), url, body, permission);

    private static readonly (HttpMethod Method, string Url, object? Body, string Permission)[] GamotRoutes =
    {
        Route("GET", "/api/v1/gamot/formulary", null, PharmacyPermissions.GamotRead),
        Route("GET", "/api/v1/gamot/ledger/123456789012", null, PharmacyPermissions.GamotRead),
        Route("POST", "/api/v1/gamot/upsc/generate", UpscGenerateBody, PharmacyPermissions.GamotGenerate),
        Route("POST", "/api/v1/gamot/upsc/validate", UpscValidateBody, PharmacyPermissions.GamotValidate),
        Route("POST", "/api/v1/gamot/dispense", DispenseBody, PharmacyPermissions.GamotDispense),
        Route("POST", "/api/v1/gamot/transactions/22222222-2222-2222-2222-222222222222/reverse", ReverseBody, PharmacyPermissions.GamotReverse)
    };

    private static readonly (HttpMethod Method, string Url, object? Body, string Permission)[] NonGamotRoutes =
    {
        Route("GET", "/api/v1/staff", null, PharmacyPermissions.StaffRead),
        Route("GET", "/api/v1/pharmacy/staff", null, PharmacyPermissions.StaffRead),
        Route("POST", "/api/v1/staff", StaffBody, PharmacyPermissions.StaffManage),
        Route("POST", "/api/v1/staff/33333333-3333-3333-3333-333333333333/credentials", TempPasswordBody, PharmacyPermissions.StaffManage),
        Route("POST", "/api/v1/staff/33333333-3333-3333-3333-333333333333/revoke-sessions", null, PharmacyPermissions.StaffManage),
        Route("GET", "/api/v1/inventory", null, PharmacyPermissions.InventoryRead),
        Route("POST", "/api/v1/inventory/batches", BatchBody, PharmacyPermissions.InventoryReceive),
        Route("POST", "/api/v1/inventory/seed", null, PharmacyPermissions.InventoryManage),
        Route("GET", "/api/v1/prescriptions", null, PharmacyPermissions.PrescriptionsRead),
        Route("GET", "/api/v1/prescriptions/44444444-4444-4444-4444-444444444444", null, PharmacyPermissions.PrescriptionsRead),
        Route("POST", "/api/v1/prescriptions/44444444-4444-4444-4444-444444444444/dispense", new { }, PharmacyPermissions.PrescriptionsDispense),
        Route("GET", "/api/v1/prescriptions/by-prescription/55555555-5555-5555-5555-555555555555", null, PharmacyPermissions.PrescriptionsRead),
        Route("POST", "/api/v1/prescriptions/claim", ClaimBody, PharmacyPermissions.PrescriptionsClaim),
        Route("POST", "/api/v1/prescriptions/44444444-4444-4444-4444-444444444444/accept", new { }, PharmacyPermissions.PrescriptionsReview),
        Route("POST", "/api/v1/prescriptions/44444444-4444-4444-4444-444444444444/partial-accept", PartialAcceptBody, PharmacyPermissions.PrescriptionsReview),
        Route("POST", "/api/v1/prescriptions/44444444-4444-4444-4444-444444444444/reject", RejectBody, PharmacyPermissions.PrescriptionsReview),
        Route("GET", "/api/v1/settings", null, PharmacyPermissions.PrescriptionsRead),
        Route("PUT", "/api/v1/settings/payment-policy", PaymentPolicyBody, PharmacyPermissions.StaffManage)
    };

    private static IEnumerable<(HttpMethod Method, string Url, object? Body, string Permission)> AllRoutes => GamotRoutes.Concat(NonGamotRoutes);

    private static bool Reached(HttpResponseMessage r) =>
        r.StatusCode != HttpStatusCode.Unauthorized && r.StatusCode != HttpStatusCode.Forbidden;

    // ── secure by default ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task EveryProtectedEndpoint_Returns401_WithoutCredentials()
    {
        await using var app = await StartAsync();

        foreach (var (method, url, body, _) in AllRoutes)
        {
            var response = await app.Client.SendAsync(Req(method, url, null, body));
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized, $"{method} {url} must require a session");
        }

        (await app.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/auth/me"))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/auth/change-password", null, new { currentPassword = "a", newPassword = "b" })))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        app.Sender.ReceivedCalls().Should().BeEmpty("no handler may run for an unauthenticated request");
    }

    [Fact]
    public async Task PublicEndpoints_AreReachableWithoutCredentials()
    {
        await using var app = await StartAsync();

        (await app.Client.SendAsync(Req(HttpMethod.Get, "/health"))).StatusCode.Should().Be(HttpStatusCode.OK);
        (await app.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/auth/status"))).StatusCode.Should().Be(HttpStatusCode.OK);
        (await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/auth/login", null, new { email = "a@b.c", password = "x" })))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest, "the controller is reached (and answers with its own envelope)");
        (await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/auth/refresh", null, new { refreshToken = "x" })))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/auth/bootstrap", null, new { licenseToken = "x", password = "y" })))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/auth/logout", null, new { refreshToken = "x" })))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AuthFailureEnvelope_UsesApiResponseShape()
    {
        await using var app = await StartAsync();

        var response = await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/auth/login", null, new { email = "a@b.c", password = "x" }));
        var json = await response.Content.ReadAsStringAsync();

        json.Should().Contain("\"succeeded\":false").And.Contain("\"message\":\"reached\"").And.Contain("\"errors\"");
    }

    [Fact]
    public async Task ForgedOrGarbageTokens_AreRejected()
    {
        await using var app = await StartAsync();

        (await app.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/inventory", "not.a.jwt"))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var valid = app.StaffToken(PharmacyStaffRole.ChiefPharmacist);
        var tampered = valid[..^3] + (valid.EndsWith("AAA") ? "BBB" : "AAA");
        (await app.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/inventory", tampered))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── per-service token isolation ─────────────────────────────────────────────────────

    [Fact]
    public async Task ClinicToken_IsRejectedByPharmacy()
    {
        // Different audience, issuer AND signing key: a clinic session is worthless in the pharmacy.
        await using var clinic = await StartAsync("clinicez-clinic");
        await using var pharmacy = await StartAsync(Audience);

        var clinicToken = clinic.Tokens.CreateAccessToken(new[]
        {
            new Claim("sub", Guid.NewGuid().ToString()),
            new Claim("tenant_id", "tenant-a"),
            new Claim("clinic_id", PharmacyA.ToString()),
            new Claim("ver", "0")
        }).Token;

        (await pharmacy.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/inventory", clinicToken))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await pharmacy.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/gamot/formulary", clinicToken))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await pharmacy.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/auth/me", clinicToken))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ClinicToken_IsRejectedByPharmacy_EvenWithTheSameSigningKey()
    {
        var sharedKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        await using var clinic = await StartAsync("clinicez-clinic", sharedKey);
        await using var pharmacy = await StartAsync(Audience, sharedKey);

        var clinicToken = clinic.Tokens.CreateAccessToken(new[] { new Claim("sub", Guid.NewGuid().ToString()), new Claim("ver", "0") }).Token;

        (await pharmacy.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/inventory", clinicToken))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task PharmacyToken_IsAccepted()
    {
        await using var app = await StartAsync();

        var response = await app.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/inventory", app.StaffToken(PharmacyStaffRole.InventoryClerk)));

        response.StatusCode.Should().NotBe(HttpStatusCode.Unauthorized).And.NotBe(HttpStatusCode.Forbidden);
    }

    // ── session validity (token version / deactivation) ─────────────────────────────────

    [Fact]
    public async Task Token_WithStaleVersion_OrDeactivatedStaff_OrUnknownStaff_IsRejected()
    {
        await using var app = await StartAsync();

        var stale = app.StaffToken(PharmacyStaffRole.ChiefPharmacist, version: 1);
        // The database moved on to version 2 (e.g. password change / revoke sessions).
        var staffId = Guid.Parse(new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(stale).Subject);
        app.Staff[staffId] = app.Staff[staffId] with { TokenVersion = 2 };
        (await app.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/inventory", stale))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var inactive = app.StaffToken(PharmacyStaffRole.ChiefPharmacist, active: false);
        (await app.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/inventory", inactive))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var unknown = app.StaffToken(PharmacyStaffRole.ChiefPharmacist);
        app.Staff.Clear();
        (await app.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/inventory", unknown))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── permission policy ───────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(PharmacyStaffRole.ChiefPharmacist)]
    [InlineData(PharmacyStaffRole.StaffPharmacist)]
    [InlineData(PharmacyStaffRole.PharmacyAssistant)]
    [InlineData(PharmacyStaffRole.Cashier)]
    [InlineData(PharmacyStaffRole.InventoryClerk)]
    public async Task EachRole_CanCallExactlyTheRoutesItsPermissionsAllow(PharmacyStaffRole role)
    {
        await using var app = await StartAsync();
        var token = app.StaffToken(role);
        var granted = PharmacyRolePermissions.For(role);

        foreach (var (method, url, body, permission) in AllRoutes)
        {
            var response = await app.Client.SendAsync(Req(method, url, token, body));
            if (granted.Contains(permission))
                Reached(response).Should().BeTrue($"{role} holds {permission} so {method} {url} must be reachable (got {(int)response.StatusCode})");
            else
                response.StatusCode.Should().Be(HttpStatusCode.Forbidden, $"{role} lacks {permission} so {method} {url} must be refused");
        }
    }

    [Fact]
    public async Task ForbiddenResponse_UsesApiResponseEnvelope_AndNeverRunsTheHandler()
    {
        await using var app = await StartAsync();
        var token = app.StaffToken(PharmacyStaffRole.Cashier);

        var response = await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/gamot/dispense", token, DispenseBody));
        var json = await response.Content.ReadAsStringAsync();

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        json.Should().Contain("\"succeeded\":false").And.Contain(PharmacyPermissions.GamotDispense);
        app.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task ForgedPermissionHeaders_AreIgnored_ForAuthenticatedStaff()
    {
        await using var app = await StartAsync();
        var token = app.StaffToken(PharmacyStaffRole.InventoryClerk);

        var seed = await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/inventory/seed", token, null,
            ("X-Permissions", "*"), ("X-Permissions-List", PharmacyPermissions.InventoryManage), ("X-Staff-Role", "ChiefPharmacist")));
        var staff = await app.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/staff", token, null, ("X-Permissions", "*")));

        seed.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        staff.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        app.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task TenantAndFacilityHeaders_AreIgnored_ForAuthenticatedStaff()
    {
        await using var app = await StartAsync();
        var token = app.StaffToken(PharmacyStaffRole.ChiefPharmacist);

        var response = await app.Client.SendAsync(Req(HttpMethod.Get, "/whoami", token, null,
            ("X-Tenant-Id", "victim-tenant"),
            ("X-Facility-Id", PharmacyA.ToString()),
            ("X-Permissions", "*")));
        var json = await response.Content.ReadAsStringAsync();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        json.Should().Contain("tenant-a").And.Contain(PharmacyA.ToString());
        json.Should().NotContain("victim-tenant");
        json.Should().Contain("\"internalService\":false");
    }

    [Fact]
    public async Task StaffWithAFacilityHeaderForAnotherPharmacy_IsRefused()
    {
        await using var app = await StartAsync();
        var token = app.StaffToken(PharmacyStaffRole.ChiefPharmacist);

        var response = await app.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/staff", token, null,
            ("X-Facility-Id", "99999999-9999-9999-9999-999999999999")));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        app.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task StaffAdministration_UsesThePharmacyAndTenantFromTheToken_NotFromHeaders()
    {
        await using var app = await StartAsync();
        var token = app.StaffToken(PharmacyStaffRole.ChiefPharmacist);

        var response = await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/staff", token, StaffBody,
            ("X-Tenant-Id", "victim-tenant")));

        response.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
        var command = app.Sender.ReceivedCalls()
            .Select(c => c.GetArguments()[0])
            .OfType<ClinicEz.Pharmacy.Application.Features.Staff.Commands.CreatePharmacyStaffMemberCommand>()
            .Single();
        command.TenantId.Should().Be("tenant-a");
        command.PharmacyId.Should().Be(PharmacyA);

        await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/staff/33333333-3333-3333-3333-333333333333/credentials", token, TempPasswordBody));
        await app.Auth.Received(1).SetTemporaryPasswordAsync(Guid.Parse("33333333-3333-3333-3333-333333333333"), PharmacyA, "Temp-Pass-12345", Arg.Any<System.Threading.CancellationToken>());
    }

    // ── internal service key ────────────────────────────────────────────────────────────

    [Fact]
    public async Task InternalKey_AuthenticatesServices_AndWrongKeyIsRejected()
    {
        await using var app = await StartAsync();

        (await app.Client.SendAsync(Req(HttpMethod.Get, "/whoami", null, null, (FacilityAuthSchemes.InternalKeyHeader, InternalKey))))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        (await app.Client.SendAsync(Req(HttpMethod.Get, "/whoami", null, null, (FacilityAuthSchemes.InternalKeyHeader, "wrong-key"))))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await app.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/gamot/formulary", null, null, (FacilityAuthSchemes.InternalKeyHeader, "wrong-key"))))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task InternalKey_CanCallEveryGamotEndpoint()
    {
        await using var app = await StartAsync();

        foreach (var (method, url, body, _) in GamotRoutes)
        {
            var response = await app.Client.SendAsync(Req(method, url, null, body,
                (FacilityAuthSchemes.InternalKeyHeader, InternalKey), ("X-Tenant-Id", "tenant-from-clinic"), ("X-Facility-Id", PharmacyA.ToString())));
            Reached(response).Should().BeTrue($"the internal service must reach {method} {url} (got {(int)response.StatusCode})");
        }
    }

    [Fact]
    public async Task InternalKey_IsDeniedOnStaffAuthInventoryAndPrescriptionEndpoints()
    {
        await using var app = await StartAsync();

        foreach (var (method, url, body, _) in NonGamotRoutes)
        {
            var response = await app.Client.SendAsync(Req(method, url, null, body, (FacilityAuthSchemes.InternalKeyHeader, InternalKey)));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden, $"the internal key must not unlock {method} {url}");
        }

        // Personal-session endpoints are meaningless for a service principal.
        (await app.Client.SendAsync(Req(HttpMethod.Get, "/api/v1/auth/me", null, null, (FacilityAuthSchemes.InternalKeyHeader, InternalKey))))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/auth/change-password", null, new { currentPassword = "a", newPassword = "b" }, (FacilityAuthSchemes.InternalKeyHeader, InternalKey))))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        app.Sender.ReceivedCalls().Should().BeEmpty();
        app.Auth.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task InternalKey_HonoursTenantAndFacilityHeaders_AndHasGamotPermissionsOnly()
    {
        await using var app = await StartAsync();

        var response = await app.Client.SendAsync(Req(HttpMethod.Get, "/whoami", null, null,
            (FacilityAuthSchemes.InternalKeyHeader, InternalKey),
            ("X-Tenant-Id", "tenant-from-clinic"),
            ("X-Facility-Id", "44444444-dddd-dddd-dddd-444444444444")));
        var json = await response.Content.ReadAsStringAsync();

        json.Should().Contain("tenant-from-clinic").And.Contain("44444444-dddd");
        json.Should().Contain("\"internalService\":true").And.Contain("\"canInventory\":false").And.Contain("\"canManageStaff\":false");
    }

    [Fact]
    public async Task GamotRoutes_ReachTheHandler_WithTheRightStaffRole_AndNotWithoutIt()
    {
        await using var app = await StartAsync();
        var pharmacist = app.StaffToken(PharmacyStaffRole.StaffPharmacist);
        var clerk = app.StaffToken(PharmacyStaffRole.InventoryClerk);

        (await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/gamot/dispense", pharmacist, DispenseBody))).StatusCode
            .Should().NotBe(HttpStatusCode.Forbidden);
        app.Sender.ReceivedCalls().Should().HaveCount(1);

        (await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/gamot/dispense", clerk, DispenseBody))).StatusCode
            .Should().Be(HttpStatusCode.Forbidden);
        app.Sender.ReceivedCalls().Should().HaveCount(1);
    }

    // ── prescription review / claim / settings endpoints ────────────────────────────────

    [Fact]
    public async Task ReviewClaimAndSettingsEndpoints_BuildTheExpectedCommands()
    {
        await using var app = await StartAsync();
        var chief = app.StaffToken(PharmacyStaffRole.ChiefPharmacist);
        var orderId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var itemId = Guid.NewGuid();

        await app.Client.SendAsync(Req(HttpMethod.Post, $"/api/v1/prescriptions/{orderId}/accept", chief, new { }));
        await app.Client.SendAsync(Req(HttpMethod.Post, $"/api/v1/prescriptions/{orderId}/partial-accept", chief, new { acceptedItemIds = new[] { itemId }, reason = "Out of stock" }));
        await app.Client.SendAsync(Req(HttpMethod.Post, $"/api/v1/prescriptions/{orderId}/reject", chief, new { reason = "Not dispensable" }));
        await app.Client.SendAsync(Req(HttpMethod.Post, "/api/v1/prescriptions/claim", chief, new { token = "abc123" }));
        await app.Client.SendAsync(Req(HttpMethod.Put, "/api/v1/settings/payment-policy", chief, new { paymentPolicy = "postpaid" }));

        var commands = app.Sender.ReceivedCalls().Select(c => c.GetArguments()[0]).ToList();
        commands.OfType<ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands.AcceptPrescriptionCommand>().Single().PrescriptionId.Should().Be(orderId);
        var partial = commands.OfType<ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands.PartiallyAcceptPrescriptionCommand>().Single();
        partial.AcceptedItemIds.Should().Equal(itemId);
        partial.Reason.Should().Be("Out of stock");
        commands.OfType<ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands.RejectPrescriptionCommand>().Single().Reason.Should().Be("Not dispensable");
        commands.OfType<ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands.ClaimPrescriptionCommand>().Single().Token.Should().Be("abc123");
        commands.OfType<ClinicEz.Pharmacy.Application.Features.Settings.UpdatePaymentPolicyCommand>().Single().PaymentPolicy.Should().Be(PharmacyPaymentPolicy.Postpaid);
    }

    [Theory]
    [InlineData("Free")]
    [InlineData("7")]
    [InlineData("")]
    public async Task UpdatePaymentPolicy_WithAnUnknownPolicy_IsRejected_AndNeverRunsTheHandler(string policy)
    {
        await using var app = await StartAsync();
        var token = app.StaffToken(PharmacyStaffRole.ChiefPharmacist);

        var act = async () => await app.Client.SendAsync(
            Req(HttpMethod.Put, "/api/v1/settings/payment-policy", token, new { paymentPolicy = policy }));

        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.BadRequestException>();
        app.Sender.ReceivedCalls().Should().BeEmpty();
    }
}