using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using ClinicEz.Billing.Api;
using ClinicEz.Billing.Api.Authorization;
using ClinicEz.Billing.Api.Controllers;
using ClinicEz.Billing.Application;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Infrastructure;
using ClinicEz.Billing.Infrastructure.Auth;
using ClinicEz.Billing.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Billing.Tests;

public class BillingWebAuthTests
{
    private static readonly string SampleCredential = string.Concat("fixture", "-cred-", "98765A!");
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private sealed class TestHost : IAsyncDisposable
    {
        public required WebApplication App { get; init; }
        public required HttpClient Client { get; init; }

        public async Task<Guid> SeedCashierAsync(string tenantId = "tenant-a", string facilityId = "clinic-1", string email = "cash@x.test")
        {
            await using var scope = App.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var hasher = scope.ServiceProvider.GetRequiredService<IFacilityPasswordHasher>();
            var now = DateTime.UtcNow;

            if (!await db.BillingFacilities.AnyAsync(f => f.TenantId == tenantId && f.FacilityId == facilityId))
            {
                db.BillingFacilities.Add(new BillingFacility
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    FacilityId = facilityId,
                    FacilityType = FacilityType.Clinic,
                    FirstSeenUtc = now,
                    LastSeenUtc = now
                });
            }

            var staff = new BillingStaff
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                FacilityId = facilityId,
                Email = email,
                FullName = "Cashier User",
                PasswordHash = hasher.Hash(SampleCredential),
                Role = StaffRole.Cashier,
                IsActive = true,
                CreatedAtUtc = now
            };
            db.BillingStaff.Add(staff);
            await db.SaveChangesAsync();
            return staff.Id;
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.StopAsync();
            await App.DisposeAsync();
        }
    }

    private static async Task<TestHost> StartAsync()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = Environments.Development });
        builder.WebHost.UseTestServer();
        var config = new Dictionary<string, string?>
        {
            ["Jwt:SigningKey"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            ["Jwt:Audience"] = "clinicez-billing",
            ["Jwt:Issuer"] = "clinicez-billing",
            ["Jwt:AccessTokenMinutes"] = "600",
            ["DbSchema"] = "public",
            ["Messaging:Service"] = "billing",
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Enabled"] = "false",
            ["Auth:RateLimitPerMinute"] = "100"
        };
        builder.Configuration.AddInMemoryCollection(config);

        var dbName = $"Billing_WebAuth_{Guid.NewGuid()}";
        builder.Services
            .AddApiServices()
            .AddApplicationServices()
            .AddInfrastructureServices(builder.Configuration, o => o.UseInMemoryDatabase(dbName));
        builder.Services.AddFacilityLocalAuth(builder.Configuration, "clinicez-billing", BillingTokenEvents.OnTokenValidated);
        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(FacilityLocalAuthExtensions.AuthRateLimitPolicy, httpContext =>
                RateLimitPartition.GetFixedWindowLimiter(
                    httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = 100, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
        builder.Services.AddControllers().AddApplicationPart(typeof(HasPermissionAttribute).Assembly);

        var app = builder.Build();
        app.UseExceptionHandler();
        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseInternalServiceGuard();
        app.UseMiddleware<BillingScopeMiddleware>();
        app.UseReadOnlyGrace();
        app.MapControllers();
        await app.StartAsync();
        return new TestHost { App = app, Client = app.GetTestClient() };
    }

    private static string ExtractCookieValue(HttpResponseMessage response, string cookieName)
    {
        response.Headers.TryGetValues("Set-Cookie", out var values).Should().BeTrue();
        var match = values!.FirstOrDefault(v => v.StartsWith($"{cookieName}=", StringComparison.Ordinal));
        match.Should().NotBeNullOrWhiteSpace();
        return match!.Split(';')[0][(cookieName.Length + 1)..];
    }

    [Fact]
    public async Task WebLogin_SetsHttpOnlyCookie_AndCookieTokenIsRejectedAsBearer_ButAcceptedByRefresh()
    {
        await using var host = await StartAsync();
        await host.SeedCashierAsync();

        using var loginReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/login")
        {
            Content = new StringContent(JsonSerializer.Serialize(new { tenantId = "tenant-a", facilityId = "clinic-1", email = "cash@x.test", password = SampleCredential }, Json), Encoding.UTF8, "application/json")
        };
        loginReq.Headers.Add("X-Client-Platform", "web");

        using var loginRes = await host.Client.SendAsync(loginReq);
        loginRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var cookieHeader = string.Join("; ", loginRes.Headers.GetValues("Set-Cookie"));
        cookieHeader.Should().Contain($"{AuthController.SessionCookieName}=");
        cookieHeader.Should().Contain("httponly");
        cookieHeader.Should().Contain("samesite=lax");
        cookieHeader.Should().Contain("path=/api/v1/auth");
        cookieHeader.Should().NotContain("expires=");

        var cookieToken = ExtractCookieValue(loginRes, AuthController.SessionCookieName);
        var loginBody = JsonDocument.Parse(await loginRes.Content.ReadAsStringAsync()).RootElement.GetProperty("data");
        var accessToken = loginBody.GetProperty("accessToken").GetString()!;
        var accessExpires = loginBody.GetProperty("expiresAtUtc").GetDateTime();
        accessExpires.Should().BeBefore(DateTime.UtcNow.AddMinutes(20));

        // 1. Access token works on /api/v1/auth/me
        using var meReq = new HttpRequestMessage(HttpMethod.Get, "/api/v1/auth/me");
        meReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var meRes = await host.Client.SendAsync(meReq);
        meRes.StatusCode.Should().Be(HttpStatusCode.OK);

        // 2. Cookie token MUST NOT be accepted as a direct Bearer token on protected endpoints
        using var replayReq = new HttpRequestMessage(HttpMethod.Get, "/api/v1/auth/me");
        replayReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cookieToken);
        using var replayRes = await host.Client.SendAsync(replayReq);
        replayRes.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // 3. /api/v1/auth/refresh accepts the cookie and mints a fresh access token
        using var refreshReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh")
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
        refreshReq.Headers.Add("X-Client-Platform", "web");
        refreshReq.Headers.Add("Cookie", $"{AuthController.SessionCookieName}={cookieToken}");
        using var refreshRes = await host.Client.SendAsync(refreshReq);
        refreshRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var refreshedData = JsonDocument.Parse(await refreshRes.Content.ReadAsStringAsync()).RootElement.GetProperty("data");
        var refreshedToken = refreshedData.GetProperty("accessToken").GetString()!;
        refreshedToken.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Refresh_AfterTokenVersionBump_Returns401_AndClearsCookie()
    {
        await using var host = await StartAsync();
        var staffId = await host.SeedCashierAsync();

        using var loginReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/login")
        {
            Content = new StringContent(JsonSerializer.Serialize(new { tenantId = "tenant-a", facilityId = "clinic-1", email = "cash@x.test", password = SampleCredential }, Json), Encoding.UTF8, "application/json")
        };
        loginReq.Headers.Add("X-Client-Platform", "web");
        using var loginRes = await host.Client.SendAsync(loginReq);
        var cookieToken = ExtractCookieValue(loginRes, AuthController.SessionCookieName);

        // Bump TokenVersion (e.g. admin revoked cashier session)
        await using (var scope = host.App.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var staff = await db.BillingStaff.SingleAsync(s => s.Id == staffId);
            staff.TokenVersion += 1;
            await db.SaveChangesAsync();
        }

        using var refreshReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh")
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
        refreshReq.Headers.Add("X-Client-Platform", "web");
        refreshReq.Headers.Add("Cookie", $"{AuthController.SessionCookieName}={cookieToken}");
        using var refreshRes = await host.Client.SendAsync(refreshReq);

        refreshRes.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        var clearedCookie = string.Join("; ", refreshRes.Headers.GetValues("Set-Cookie"));
        clearedCookie.Should().Contain($"{AuthController.SessionCookieName}=;");
    }

    [Fact]
    public async Task WebLogout_ClearsSessionCookie_AndNonWebLoginSetsNoCookie()
    {
        await using var host = await StartAsync();
        await host.SeedCashierAsync();

        // Non-web login sets no cookie and keeps shift lifetime
        using var nativeReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/login")
        {
            Content = new StringContent(JsonSerializer.Serialize(new { tenantId = "tenant-a", facilityId = "clinic-1", email = "cash@x.test", password = SampleCredential }, Json), Encoding.UTF8, "application/json")
        };
        nativeReq.Headers.Add("X-Client-Platform", "ios");
        using var nativeRes = await host.Client.SendAsync(nativeReq);
        nativeRes.StatusCode.Should().Be(HttpStatusCode.OK);
        nativeRes.Headers.Contains("Set-Cookie").Should().BeFalse();

        // Web logout clears cookie
        using var logoutReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/logout")
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
        logoutReq.Headers.Add("X-Client-Platform", "web");
        using var logoutRes = await host.Client.SendAsync(logoutReq);
        logoutRes.StatusCode.Should().Be(HttpStatusCode.OK);
        string.Join("; ", logoutRes.Headers.GetValues("Set-Cookie")).Should().Contain($"{AuthController.SessionCookieName}=;");
    }
}
