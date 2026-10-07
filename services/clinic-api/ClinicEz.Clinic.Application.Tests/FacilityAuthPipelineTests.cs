using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>
/// End-to-end HTTP tests of the facility-local auth pipeline (secure-by-default fallback policy, per-service token isolation,
/// internal key, claim-only ClinicContext) using an in-process test server. No network or identity provider involved.
/// </summary>
public class FacilityAuthPipelineTests
{
    private const string InternalKey = "internal-service-secret-key";

    private sealed class TestApp : IAsyncDisposable
    {
        public required WebApplication App { get; init; }
        public required HttpClient Client { get; init; }
        public IFacilityTokenService Tokens => App.Services.GetRequiredService<IFacilityTokenService>();

        public string Token(params Claim[] extra)
        {
            var claims = new List<Claim>
            {
                new(ClinicClaimTypes.Subject, Guid.NewGuid().ToString()),
                new(ClinicClaimTypes.TenantId, "tenant-a"),
                new(ClinicClaimTypes.ClinicId, "11111111-aaaa-aaaa-aaaa-111111111111")
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

    private static async Task<TestApp> StartAsync(string audience)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:SigningKey"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            ["Jwt:Audience"] = audience,
            ["Jwt:Issuer"] = audience,
            ["Internal:ApiKey"] = InternalKey
        });
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddFacilityLocalAuth(builder.Configuration, audience);
        builder.Services.AddScoped<ClinicEz.Clinic.Domain.Interfaces.IClinicContext, ClinicContext>();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGet("/secure", () => Results.Ok("secret"));
        app.MapGet("/open", () => Results.Ok("open")).AllowAnonymous();
        app.MapGet("/whoami", (ClinicEz.Clinic.Domain.Interfaces.IClinicContext ctx) => Results.Ok(new
        {
            tenant = ctx.TenantId,
            clinic = ctx.ClinicId,
            staff = ctx.StaffId,
            canSign = ctx.HasPermission(ClinicPermissions.ConsultationsSign),
            canRead = ctx.HasPermission(ClinicPermissions.PatientsRead)
        }));
        await app.StartAsync();
        return new TestApp { App = app, Client = app.GetTestClient() };
    }

    private static HttpRequestMessage Get(string url, string? bearer = null, params (string Name, string Value)[] headers)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        if (bearer is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        foreach (var (name, value) in headers) request.Headers.TryAddWithoutValidation(name, value);
        return request;
    }

    [Fact]
    public async Task ProtectedEndpoint_Returns401_WithoutCredentials()
    {
        await using var app = await StartAsync("clinicez-clinic");

        (await app.Client.SendAsync(Get("/secure"))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await app.Client.SendAsync(Get("/open"))).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ProtectedEndpoint_AcceptsValidSessionToken()
    {
        await using var app = await StartAsync("clinicez-clinic");

        var response = await app.Client.SendAsync(Get("/secure", app.Token()));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ForgedOrGarbageTokens_AreRejected()
    {
        await using var app = await StartAsync("clinicez-clinic");

        (await app.Client.SendAsync(Get("/secure", "not.a.jwt"))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var valid = app.Token();
        var tampered = valid[..^3] + (valid.EndsWith("AAA") ? "BBB" : "AAA");
        (await app.Client.SendAsync(Get("/secure", tampered))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ClinicToken_IsRejectedByOtherFacilityServices()
    {
        // Each service has its own audience and its own signing key: clinic users are not authorised in the laboratory.
        await using var clinic = await StartAsync("clinicez-clinic");
        await using var laboratory = await StartAsync("clinicez-lab");
        await using var pharmacy = await StartAsync("clinicez-pharmacy");

        var clinicToken = clinic.Token();

        (await clinic.Client.SendAsync(Get("/secure", clinicToken))).StatusCode.Should().Be(HttpStatusCode.OK);
        (await laboratory.Client.SendAsync(Get("/secure", clinicToken))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await pharmacy.Client.SendAsync(Get("/secure", clinicToken))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task TokenWithWrongAudience_IsRejected_EvenWithTheSameKey()
    {
        var sharedKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));

        async Task<TestApp> Start(string audience)
        {
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:SigningKey"] = sharedKey, ["Jwt:Audience"] = audience, ["Jwt:Issuer"] = audience });
            builder.Services.AddFacilityLocalAuth(builder.Configuration, audience);
            var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapGet("/secure", () => Results.Ok("secret"));
            await app.StartAsync();
            return new TestApp { App = app, Client = app.GetTestClient() };
        }

        await using var clinic = await Start("clinicez-clinic");
        await using var lab = await Start("clinicez-lab");

        (await lab.Client.SendAsync(Get("/secure", clinic.Token()))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task InternalKey_AuthenticatesServices_AndWrongKeyIsRejected()
    {
        await using var app = await StartAsync("clinicez-clinic");

        (await app.Client.SendAsync(Get("/secure", null, (FacilityAuthSchemes.InternalKeyHeader, InternalKey))))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        (await app.Client.SendAsync(Get("/secure", null, (FacilityAuthSchemes.InternalKeyHeader, "wrong-key"))))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ClinicContext_IgnoresForgedHeaders_ForAuthenticatedStaff()
    {
        await using var app = await StartAsync("clinicez-clinic");
        var token = app.Token(new Claim(ClinicClaimTypes.Permission, ClinicPermissions.PatientsRead));

        var response = await app.Client.SendAsync(Get("/whoami", token,
            ("X-Tenant-Id", "victim-tenant"),
            ("X-Clinic-Id", "22222222-bbbb-bbbb-bbbb-222222222222"),
            ("X-Staff-Id", "33333333-cccc-cccc-cccc-333333333333"),
            ("X-Permissions", "*")));
        var json = await response.Content.ReadAsStringAsync();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        json.Should().Contain("tenant-a").And.Contain("11111111-aaaa-aaaa-aaaa-111111111111");
        json.Should().NotContain("victim-tenant").And.NotContain("22222222-bbbb");
        json.Should().Contain("\"canRead\":true").And.Contain("\"canSign\":false");
    }

    [Fact]
    public async Task ClinicContext_InternalService_GetsMinimalPermissions_AndTrustsTenantHeader()
    {
        await using var app = await StartAsync("clinicez-clinic");

        var response = await app.Client.SendAsync(Get("/whoami", null,
            (FacilityAuthSchemes.InternalKeyHeader, InternalKey),
            ("X-Tenant-Id", "tenant-from-portal"),
            ("X-Clinic-Id", "44444444-dddd-dddd-dddd-444444444444")));
        var json = await response.Content.ReadAsStringAsync();

        json.Should().Contain("tenant-from-portal").And.Contain("44444444-dddd");
        json.Should().Contain("\"canRead\":true").And.Contain("\"canSign\":false");
    }
}
