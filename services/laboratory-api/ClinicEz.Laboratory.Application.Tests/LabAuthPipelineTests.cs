using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Api.Authorization;
using ClinicEz.Laboratory.Api.Controllers;
using ClinicEz.Laboratory.Api.Middlewares;
using ClinicEz.Laboratory.Application.Common.Exceptions;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Requisitions.Commands;
using ClinicEz.Laboratory.Domain.Constants;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Infrastructure.Auth;
using ClinicEz.Laboratory.Infrastructure.Context;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.LocalAuth;
using ClinicEz.Shared.Middlewares;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>
/// End-to-end HTTP tests of the laboratory's facility-local auth pipeline (secure-by-default fallback policy, per-service
/// token isolation, token-version/active checks, permission enforcement, claim-only <see cref="LabContext"/>) using an
/// in-process test server and the real controllers. No network or identity provider involved.
/// </summary>
public class LabAuthPipelineTests
{
    private static readonly Guid LabId = Guid.Parse("11111111-aaaa-aaaa-aaaa-111111111111");

    private sealed class TestApp : IAsyncDisposable
    {
        public required WebApplication App { get; init; }
        public required HttpClient Client { get; init; }
        public required IStaffAccessCache AccessCache { get; init; }
        public IFacilityTokenService Tokens => App.Services.GetRequiredService<IFacilityTokenService>();

        /// <summary>Registers the staff member in the (fake) database and returns a valid session token for them.</summary>
        public string Session(IEnumerable<string> permissions, int version = 0, bool active = true, Guid? staffId = null, params Claim[] extra)
        {
            var id = staffId ?? Guid.NewGuid();
            AccessCache.GetAsync(id, Arg.Any<CancellationToken>())
                .Returns(Task.FromResult<StaffAccessInfo?>(new StaffAccessInfo(active, version, permissions.ToList())));
            return Token(id, version, extra);
        }

        public string Token(Guid staffId, int version, params Claim[] extra)
        {
            var claims = new List<Claim>
            {
                new(LabClaimTypes.Subject, staffId.ToString()),
                new(LabClaimTypes.TenantId, "tenant-a"),
                new(LabClaimTypes.LaboratoryId, LabId.ToString()),
                new(LabClaimTypes.TokenVersion, version.ToString())
            };
            claims.AddRange(extra);
            return Tokens.CreateAccessToken(claims).Token;
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.StopAsync();
            await App.DisposeAsync();
        }
    }

    private static async Task<TestApp> StartAsync(string audience = "clinicez-lab", string? signingKey = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:SigningKey"] = signingKey ?? Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            ["Jwt:Audience"] = audience,
            ["Jwt:Issuer"] = audience
        });

        var accessCache = Substitute.For<IStaffAccessCache>();
        accessCache.GetAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns(Task.FromResult<StaffAccessInfo?>(null));

        builder.Services.AddHttpContextAccessor();
        builder.Services.AddFacilityLocalAuth(builder.Configuration, audience, LabTokenEvents.OnTokenValidated);
        builder.Services.AddSingleton(accessCache);
        builder.Services.AddScoped<ILabContext, LabContext>();
        builder.Services.AddSingleton(Substitute.For<ISender>());
        builder.Services.AddSingleton(Substitute.For<IAnalyzerFeedService>());
        builder.Services.AddSingleton(Substitute.For<ILabAuthService>());
        builder.Services.AddControllers().AddApplicationPart(typeof(HasPermissionAttribute).Assembly);
        builder.Services.AddExceptionHandler<LabExceptionHandler>();
        builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
        builder.Services.AddProblemDetails();

        var app = builder.Build();
        app.UseExceptionHandler();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseMiddleware<LabScopeMiddleware>();
        app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();
        app.MapGet("/secure", () => Results.Ok("secret"));
        app.MapGet("/whoami", (ILabContext ctx) => Results.Ok(new
        {
            tenant = ctx.TenantId,
            laboratory = ctx.LaboratoryId,
            staff = ctx.StaffId,
            canVerify = ctx.HasPermission(LabPermissions.ReportsVerify),
            canRead = ctx.HasPermission(LabPermissions.ResultsRead)
        }));
        app.MapControllers();
        await app.StartAsync();
        return new TestApp { App = app, Client = app.GetTestClient(), AccessCache = accessCache };
    }

    private static HttpRequestMessage Request(HttpMethod method, string url, string? bearer = null, params (string Name, string Value)[] headers)
    {
        var request = new HttpRequestMessage(method, url);
        if (method == HttpMethod.Post)
        {
            // Valid-enough body for every POST under test, so model binding passes and the permission filter decides.
            request.Content = new StringContent("{\"accessionNumber\":\"ACC-1\",\"temporaryPassword\":\"Passw0rd-12345\"}", System.Text.Encoding.UTF8, "application/json");
        }
        if (bearer is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        foreach (var (name, value) in headers) request.Headers.TryAddWithoutValidation(name, value);
        return request;
    }

    private static HttpRequestMessage Get(string url, string? bearer = null, params (string Name, string Value)[] headers) =>
        Request(HttpMethod.Get, url, bearer, headers);

    private static async Task<HttpStatusCode> StatusAsync(TestApp app, HttpRequestMessage request) =>
        (await app.Client.SendAsync(request)).StatusCode;

    // ── authentication ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task ProtectedEndpoints_Return401_WithoutCredentials()
    {
        await using var app = await StartAsync();

        (await StatusAsync(app, Get("/secure"))).Should().Be(HttpStatusCode.Unauthorized);
        (await StatusAsync(app, Get("/api/v1/results/catalog"))).Should().Be(HttpStatusCode.Unauthorized);
        (await StatusAsync(app, Get("/api/v1/requisitions"))).Should().Be(HttpStatusCode.Unauthorized);
        (await StatusAsync(app, Get("/api/v1/staff"))).Should().Be(HttpStatusCode.Unauthorized);
        (await StatusAsync(app, Get("/api/v1/auth/me"))).Should().Be(HttpStatusCode.Unauthorized);
        (await StatusAsync(app, Request(HttpMethod.Post, "/api/v1/auth/change-password"))).Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task OnlyHealthAndAuthBootstrapEndpoints_AreReachableAnonymously()
    {
        await using var app = await StartAsync();
        var auth = app.App.Services.GetRequiredService<ILabAuthService>();
        auth.GetStatusAsync(Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Returns(new AuthStatusDto(true, LabLicenseStatus.Active, false, "Test Laboratory"));

        (await StatusAsync(app, Get("/health"))).Should().Be(HttpStatusCode.OK);
        var status = await app.Client.SendAsync(Get("/api/v1/auth/status"));
        status.StatusCode.Should().Be(HttpStatusCode.OK);
        (await status.Content.ReadAsStringAsync()).Should().Contain("\"succeeded\":true").And.Contain("Test Laboratory");
    }

    [Fact]
    public async Task ValidSessionToken_IsAccepted_ForGarbageAndTamperedTokens401()
    {
        await using var app = await StartAsync();
        var valid = app.Session(new[] { LabPermissions.ResultsRead });

        (await StatusAsync(app, Get("/secure", valid))).Should().Be(HttpStatusCode.OK);
        (await StatusAsync(app, Get("/secure", "not.a.jwt"))).Should().Be(HttpStatusCode.Unauthorized);

        var tampered = valid[..^3] + (valid.EndsWith("AAA") ? "BBB" : "AAA");
        (await StatusAsync(app, Get("/secure", tampered))).Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ClinicToken_IsRejectedByTheLaboratory()
    {
        // Each service has its own audience and its own signing key: clinic users are not authorised in the laboratory.
        await using var clinic = await StartAsync("clinicez-clinic");
        await using var laboratory = await StartAsync("clinicez-lab");

        var clinicToken = clinic.Session(LabPermissions.All);
        var labToken = laboratory.Session(LabPermissions.All);

        (await StatusAsync(clinic, Get("/secure", clinicToken))).Should().Be(HttpStatusCode.OK);
        (await StatusAsync(laboratory, Get("/secure", labToken))).Should().Be(HttpStatusCode.OK);
        (await StatusAsync(laboratory, Get("/secure", clinicToken))).Should().Be(HttpStatusCode.Unauthorized);
        (await StatusAsync(laboratory, Get("/api/v1/results/catalog", clinicToken))).Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task TokenWithWrongAudience_IsRejected_EvenWithTheSameKey()
    {
        var sharedKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        await using var clinic = await StartAsync("clinicez-clinic", sharedKey);
        await using var laboratory = await StartAsync("clinicez-lab", sharedKey);

        var clinicToken = clinic.Session(LabPermissions.All);

        (await StatusAsync(laboratory, Get("/secure", clinicToken))).Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task TokenOfADifferentKey_WithTheLabAudience_IsRejected()
    {
        await using var attacker = await StartAsync("clinicez-lab");
        await using var laboratory = await StartAsync("clinicez-lab");

        (await StatusAsync(laboratory, Get("/secure", attacker.Session(LabPermissions.All)))).Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Session_IsRejected_WhenTokenVersionRevokedStaffDeactivatedOrUnknown()
    {
        await using var app = await StartAsync();

        // Version bumped after the token was issued (password change / revoke-sessions).
        var staleId = Guid.NewGuid();
        var stale = app.Session(new[] { LabPermissions.ResultsRead }, version: 0, staffId: staleId);
        app.AccessCache.GetAsync(staleId, Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<StaffAccessInfo?>(new StaffAccessInfo(true, 1, new[] { LabPermissions.ResultsRead })));
        (await StatusAsync(app, Get("/secure", stale))).Should().Be(HttpStatusCode.Unauthorized);

        var deactivated = app.Session(new[] { LabPermissions.ResultsRead }, active: false);
        (await StatusAsync(app, Get("/secure", deactivated))).Should().Be(HttpStatusCode.Unauthorized);

        var unknown = app.Token(Guid.NewGuid(), 0);
        (await StatusAsync(app, Get("/secure", unknown))).Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── tenant / facility / permissions come from the token only ────────────────────

    [Fact]
    public async Task LabContext_IgnoresForgedHeaders_ForAuthenticatedStaff()
    {
        await using var app = await StartAsync();
        var token = app.Session(new[] { LabPermissions.ResultsRead });

        var response = await app.Client.SendAsync(Get("/whoami", token,
            ("X-Tenant-Id", "victim-tenant"),
            ("X-Staff-Id", "33333333-cccc-cccc-cccc-333333333333"),
            ("X-Permissions", "*," + LabPermissions.ReportsVerify)));
        var json = await response.Content.ReadAsStringAsync();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        json.Should().Contain("tenant-a").And.Contain(LabId.ToString());
        json.Should().NotContain("victim-tenant").And.NotContain("33333333-cccc");
        json.Should().Contain("\"canRead\":true").And.Contain("\"canVerify\":false");
    }

    [Fact]
    public async Task ForeignFacilityHeader_IsRejectedWith403_ForStaffTokens()
    {
        await using var app = await StartAsync();
        var token = app.Session(new[] { LabPermissions.ResultsRead });

        (await StatusAsync(app, Get("/whoami", token, ("X-Facility-Id", "22222222-bbbb-bbbb-bbbb-222222222222"))))
            .Should().Be(HttpStatusCode.Forbidden);
        (await StatusAsync(app, Get("/whoami", token, ("X-Facility-Id", LabId.ToString()))))
            .Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ForgedPermissionsHeader_DoesNotGrantAccess_ToProtectedActions()
    {
        await using var app = await StartAsync();
        var token = app.Session(new[] { LabPermissions.ResultsRead });

        (await StatusAsync(app, Request(HttpMethod.Post, "/api/v1/analyzers/simulate", token,
            ("X-Permissions", "*"), ("X-Permissions", LabPermissions.AnalyzersFeed))))
            .Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task PermissionClaimsInsideTheToken_AreIgnored_PermissionsComeFromTheDatabase()
    {
        await using var app = await StartAsync();
        // The database says: results:read only. The (signed) token claims more.
        var token = app.Session(new[] { LabPermissions.ResultsRead }, extra: new Claim(LabClaimTypes.Permission, LabPermissions.AnalyzersFeed));

        (await StatusAsync(app, Request(HttpMethod.Post, "/api/v1/analyzers/simulate", token))).Should().Be(HttpStatusCode.Forbidden);
    }

    // ── permission enforcement ──────────────────────────────────────────────────────

    [Fact]
    public async Task PermissionPolicy_AllowsGrantedAndDeniesMissingPermissions_OnRealControllers()
    {
        await using var app = await StartAsync();
        var reader = app.Session(LabRolePermissions.For(LabStaffRole.Phlebotomist));
        var tech = app.Session(LabRolePermissions.For(LabStaffRole.MedicalTechnologist));

        (await StatusAsync(app, Get("/api/v1/requisitions", reader))).Should().Be(HttpStatusCode.OK);
        (await StatusAsync(app, Get("/api/v1/results/catalog", reader))).Should().Be(HttpStatusCode.Forbidden);
        (await StatusAsync(app, Get("/api/v1/results/catalog", tech))).Should().Be(HttpStatusCode.OK);
        (await StatusAsync(app, Get("/api/v1/staff", tech))).Should().Be(HttpStatusCode.OK, "medical technologists can read the staff roster");
        (await StatusAsync(app, Request(HttpMethod.Post, $"/api/v1/staff/{Guid.NewGuid()}/credentials", tech)))
            .Should().Be(HttpStatusCode.Forbidden, "only administrators manage credentials");
    }

    [Fact]
    public async Task ForbiddenResponse_UsesTheApiResponseEnvelope()
    {
        await using var app = await StartAsync();
        var token = app.Session(Array.Empty<string>());

        var response = await app.Client.SendAsync(Get("/api/v1/results/catalog", token));
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        body.GetProperty("succeeded").GetBoolean().Should().BeFalse();
        body.GetProperty("message").GetString().Should().Contain(LabPermissions.ResultsRead);
        body.GetProperty("errors").GetArrayLength().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task MeEndpoint_ReturnsCurrentUser_FromTheSession()
    {
        await using var app = await StartAsync();
        var staffId = Guid.NewGuid();
        var token = app.Session(new[] { LabPermissions.ResultsRead }, staffId: staffId);
        var auth = app.App.Services.GetRequiredService<ILabAuthService>();
        auth.GetCurrentUserAsync(staffId, Arg.Any<CancellationToken>()).Returns(
            new AuthUserDto(staffId, "Mia Medtech", "MedicalTechnologist", "Medical Technologist", LabId, "tenant-a", "Lab", Array.Empty<string>(), false));

        var response = await app.Client.SendAsync(Get("/api/v1/auth/me", token));
        var json = await response.Content.ReadAsStringAsync();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        json.Should().Contain("Mia Medtech").And.Contain(LabPermissions.ResultsRead);
    }

    [Fact]
    public void EveryControllerAction_RequiresAPermission_UnlessItIsAnIntentionallyPublicAuthOrLicenseEndpoint()
    {
        var apiAssembly = typeof(HasPermissionAttribute).Assembly;
        var controllers = apiAssembly.GetTypes().Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract).ToList();
        controllers.Should().NotBeEmpty();

        var publicActions = new List<string>();
        var unguarded = new List<string>();

        foreach (var controller in controllers)
        {
            var classAnon = controller.GetCustomAttributes<AllowAnonymousAttribute>(true).Any();
            var classPermission = controller.GetCustomAttributes<HasPermissionAttribute>(true).Any();

            foreach (var action in controller.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                         .Where(m => m.GetCustomAttributes().OfType<IActionHttpMethodProvider>().Any()))
            {
                var name = $"{controller.Name}.{action.Name}";
                var anonymous = classAnon || action.GetCustomAttributes<AllowAnonymousAttribute>(true).Any();
                var permission = classPermission || action.GetCustomAttributes<HasPermissionAttribute>(true).Any();

                if (anonymous) publicActions.Add(name);
                else if (!permission && controller != typeof(AuthController)) unguarded.Add(name);
            }
        }

        publicActions.Should().BeEquivalentTo(new[]
        {
            "AuthController.GetStatus", "AuthController.Login", "AuthController.Refresh", "AuthController.Logout", "AuthController.Bootstrap",
            "LicenseController.GetLicenseStatus", "LicenseController.ApplyLicense"
        });
        unguarded.Should().BeEmpty("every non-public action must declare the permission it needs");
    }

    [Fact]
    public void ProtectedAuthActions_AreNotAnonymous()
    {
        foreach (var name in new[] { nameof(AuthController.Me), nameof(AuthController.ChangePassword) })
        {
            typeof(AuthController).GetMethod(name)!.GetCustomAttributes<AllowAnonymousAttribute>(true).Should().BeEmpty(name);
        }
    }

    // ── payment gate / claim endpoints ──────────────────────────────────────────────

    private static HttpRequestMessage JsonPost(string url, string bearer, string json)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        return request;
    }

    [Fact]
    public async Task ClaimRejectAndPaymentRefresh_RequireTheRequisitionsManagePermission()
    {
        await using var app = await StartAsync();
        var phlebotomist = app.Session(LabRolePermissions.For(LabStaffRole.Phlebotomist));
        var clerk = app.Session(LabRolePermissions.For(LabStaffRole.LabClerk));
        var pathologist = app.Session(LabRolePermissions.For(LabStaffRole.Pathologist));
        var id = Guid.NewGuid();
        const string claimBody = "{\"token\":\"abc123\"}";
        const string rejectBody = "{\"reason\":\"Test not offered\"}";

        foreach (var denied in new[] { phlebotomist, pathologist })
        {
            (await StatusAsync(app, JsonPost("/api/v1/requisitions/claim", denied, claimBody))).Should().Be(HttpStatusCode.Forbidden);
            (await StatusAsync(app, JsonPost($"/api/v1/requisitions/{id}/reject", denied, rejectBody))).Should().Be(HttpStatusCode.Forbidden);
            (await StatusAsync(app, JsonPost($"/api/v1/requisitions/{id}/payment/refresh", denied, "{}"))).Should().Be(HttpStatusCode.Forbidden);
        }

        (await StatusAsync(app, JsonPost("/api/v1/requisitions/claim", clerk, claimBody))).Should().Be(HttpStatusCode.OK);
        (await StatusAsync(app, JsonPost($"/api/v1/requisitions/{id}/reject", clerk, rejectBody))).Should().Be(HttpStatusCode.OK);
        (await StatusAsync(app, JsonPost($"/api/v1/requisitions/{id}/payment/refresh", clerk, "{}"))).Should().Be(HttpStatusCode.OK);

        var sender = app.App.Services.GetRequiredService<ISender>();
        await sender.Received(1).Send(Arg.Is<ClaimLabOrderCommand>(c => c.Token == "abc123"), Arg.Any<CancellationToken>());
        await sender.Received(1).Send(Arg.Is<RejectLabOrderCommand>(c => c.RequisitionId == id && c.Reason == "Test not offered"), Arg.Any<CancellationToken>());
        await sender.Received(1).Send(Arg.Is<RefreshPaymentStatusCommand>(c => c.RequisitionId == id), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task UnpaidPrepaidOrder_IsAnHttp409_WithThePaymentRequiredCode()
    {
        await using var app = await StartAsync();
        var tech = app.Session(LabRolePermissions.For(LabStaffRole.MedicalTechnologist));
        var id = Guid.NewGuid();
        app.App.Services.GetRequiredService<ISender>()
            .Send(Arg.Any<AccessionSpecimenCommand>(), Arg.Any<CancellationToken>())
            .Returns<Task<ClinicEz.Laboratory.Application.Features.Requisitions.DTOs.LabRequisitionDto>>(_ => throw new PaymentRequiredException(id));

        var response = await app.Client.SendAsync(JsonPost($"/api/v1/requisitions/{id}/accession", tech, "{}"));
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        body.GetProperty("succeeded").GetBoolean().Should().BeFalse();
        body.GetProperty("errors")[0].GetProperty("code").GetString().Should().Be("payment_required");
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound, 404, LabExceptionHandler.ClaimNotFound)]
    [InlineData(HttpStatusCode.Conflict, 409, LabExceptionHandler.ClaimAlreadyRedeemed)]
    [InlineData(HttpStatusCode.Gone, 410, LabExceptionHandler.ClaimExpired)]
    [InlineData(HttpStatusCode.Forbidden, 403, LabExceptionHandler.ClaimForbidden)]
    [InlineData(HttpStatusCode.UnprocessableEntity, 422, LabExceptionHandler.ClaimWrongFacilityType)]
    [InlineData(HttpStatusCode.BadGateway, 502, LabExceptionHandler.ClaimUnavailable)]
    public async Task ClaimFailures_MapToFriendlyFixedMessages_NeverTheRawHubMessage(HttpStatusCode hubStatus, int expectedStatus, string expectedCode)
    {
        await using var app = await StartAsync();
        var clerk = app.Session(LabRolePermissions.For(LabStaffRole.LabClerk));
        app.App.Services.GetRequiredService<ISender>()
            .Send(Arg.Any<ClaimLabOrderCommand>(), Arg.Any<CancellationToken>())
            .Returns<Task<ClaimLabOrderResult>>(_ => throw new HubClaimException(hubStatus, "Hub claim call failed: internal-hub-detail"));

        var response = await app.Client.SendAsync(JsonPost("/api/v1/requisitions/claim", clerk, "{\"token\":\"abc123\"}"));
        var json = await response.Content.ReadAsStringAsync();
        var body = System.Text.Json.JsonDocument.Parse(json).RootElement;

        ((int)response.StatusCode).Should().Be(expectedStatus);
        body.GetProperty("errors")[0].GetProperty("code").GetString().Should().Be(expectedCode);
        json.Should().NotContain("internal-hub-detail");
    }
}
