using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Auth;
using ClinicEz.V1Sync.Api.Services.Storage;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.V1Sync.Tests;

public sealed class V1SyncAuthMiddlewareTests
{
    private sealed class StubHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "ClinicEz.V1Sync.Api";
        public string ContentRootPath { get; set; } = "/";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class FakeTimeProvider(DateTimeOffset initialUtc) : TimeProvider
    {
        private DateTimeOffset _utc = initialUtc;
        public void Advance(TimeSpan delta) => _utc = _utc.Add(delta);
        public override DateTimeOffset GetUtcNow() => _utc;
    }

    private sealed class CountingHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> responder)
        : HttpMessageHandler
    {
        public int CallCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            CallCount++;
            return Task.FromResult(responder(request));
        }
    }

    private sealed class SimpleHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static IConfiguration BuildConfig(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    [Fact]
    public async Task MissingPortalBaseUrl_InDevelopment_FailsClosedWith503()
    {
        var handler = new CountingHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        var guard = new V1SyncAdminGuard(
            new SimpleHttpClientFactory(handler),
            BuildConfig(new Dictionary<string, string?> { ["PortalApi:BaseUrl"] = "" }),
            new StubHostEnvironment(Environments.Development),
            NullLogger<V1SyncAdminGuard>.Instance);

        var ctx = new DefaultHttpContext();
        ctx.Request.Headers.Authorization = "Bearer test-token";

        var decision = await guard.AuthorizeAsync(ctx, CancellationToken.None);

        decision.Allowed.Should().BeFalse();
        decision.StatusCode.Should().Be(StatusCodes.Status503ServiceUnavailable);
        handler.CallCount.Should().Be(0);
    }

    [Fact]
    public async Task LoopbackLocalDevBypass_SucceedsOnlyWithoutForwardingHeadersInDevelopment()
    {
        var handler = new CountingHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        var cfg = BuildConfig(new Dictionary<string, string?>
        {
            ["V1Sync:AllowUnauthenticatedLocalDev"] = "true",
            ["PortalApi:BaseUrl"] = "http://portal-api:8080"
        });

        var devGuard = new V1SyncAdminGuard(
            new SimpleHttpClientFactory(handler),
            cfg,
            new StubHostEnvironment(Environments.Development),
            NullLogger<V1SyncAdminGuard>.Instance);

        // 1. Pure loopback without forwarding headers -> allowed
        var okCtx = new DefaultHttpContext();
        okCtx.Connection.RemoteIpAddress = IPAddress.Loopback;
        var okRes = await devGuard.AuthorizeAsync(okCtx, CancellationToken.None);
        okRes.Allowed.Should().BeTrue();
        okRes.Actor.Should().Be("local-dev-admin");

        // 2. X-Forwarded-For present -> rejected (401)
        var xffCtx = new DefaultHttpContext();
        xffCtx.Connection.RemoteIpAddress = IPAddress.Loopback;
        xffCtx.Request.Headers["X-Forwarded-For"] = "203.0.113.10";
        var xffRes = await devGuard.AuthorizeAsync(xffCtx, CancellationToken.None);
        xffRes.Allowed.Should().BeFalse();
        xffRes.StatusCode.Should().Be(StatusCodes.Status401Unauthorized);

        // 3. Forwarded header present -> rejected (401)
        var fwdCtx = new DefaultHttpContext();
        fwdCtx.Connection.RemoteIpAddress = IPAddress.IPv6Loopback;
        fwdCtx.Request.Headers["Forwarded"] = "for=203.0.113.10";
        var fwdRes = await devGuard.AuthorizeAsync(fwdCtx, CancellationToken.None);
        fwdRes.Allowed.Should().BeFalse();
        fwdRes.StatusCode.Should().Be(StatusCodes.Status401Unauthorized);

        // 4. Production environment -> loopback bypass ignored (401)
        var prodGuard = new V1SyncAdminGuard(
            new SimpleHttpClientFactory(handler),
            cfg,
            new StubHostEnvironment(Environments.Production),
            NullLogger<V1SyncAdminGuard>.Instance);
        var prodRes = await prodGuard.AuthorizeAsync(okCtx, CancellationToken.None);
        prodRes.Allowed.Should().BeFalse();
        prodRes.StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
    }

    [Fact]
    public async Task LoopbackLocalDevBypass_RejectsXRealIpHeaderInDevelopment()
    {
        var handler = new CountingHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        var cfg = BuildConfig(new Dictionary<string, string?>
        {
            ["V1Sync:AllowUnauthenticatedLocalDev"] = "true",
            ["PortalApi:BaseUrl"] = "http://portal-api:8080"
        });

        var devGuard = new V1SyncAdminGuard(
            new SimpleHttpClientFactory(handler),
            cfg,
            new StubHostEnvironment(Environments.Development),
            NullLogger<V1SyncAdminGuard>.Instance);

        var ctx = new DefaultHttpContext();
        ctx.Connection.RemoteIpAddress = IPAddress.Loopback;
        ctx.Request.Headers["X-Real-IP"] = "203.0.113.10";

        var res = await devGuard.AuthorizeAsync(ctx, CancellationToken.None);
        res.Allowed.Should().BeFalse();
        res.StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
    }

    [Fact]
    public async Task LocalAdminKey_AllowedOnlyInDevelopmentWithExactMatch()
    {
        var handler = new CountingHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        var cfg = BuildConfig(new Dictionary<string, string?>
        {
            ["V1Sync:LocalAdminKey"] = "secret-dev-key",
            ["PortalApi:BaseUrl"] = "http://portal-api:8080"
        });

        var devGuard = new V1SyncAdminGuard(
            new SimpleHttpClientFactory(handler),
            cfg,
            new StubHostEnvironment(Environments.Development),
            NullLogger<V1SyncAdminGuard>.Instance);

        var ctx = new DefaultHttpContext();
        ctx.Request.Headers["X-V1-Sync-Admin-Key"] = "secret-dev-key";
        var devRes = await devGuard.AuthorizeAsync(ctx, CancellationToken.None);
        devRes.Allowed.Should().BeTrue();
        devRes.Actor.Should().Be("local-admin-key");

        var prodGuard = new V1SyncAdminGuard(
            new SimpleHttpClientFactory(handler),
            cfg,
            new StubHostEnvironment(Environments.Production),
            NullLogger<V1SyncAdminGuard>.Instance);
        var prodRes = await prodGuard.AuthorizeAsync(ctx, CancellationToken.None);
        prodRes.Allowed.Should().BeFalse();
        prodRes.StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
    }

    [Fact]
    public async Task RbacCache_RespectsTtlExpiryAndMaxEntryBound()
    {
        var time = new FakeTimeProvider(new DateTimeOffset(2026, 11, 25, 10, 0, 0, TimeSpan.Zero));
        var handler = new CountingHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                """{"email":"admin@clinicez.test","isSuperAdmin":false,"permissions":["manage:migrations"]}""",
                Encoding.UTF8,
                "application/json")
        });

        var guard = new V1SyncAdminGuard(
            new SimpleHttpClientFactory(handler),
            BuildConfig(new Dictionary<string, string?> { ["PortalApi:BaseUrl"] = "http://portal-api:8080" }),
            new StubHostEnvironment(Environments.Production),
            NullLogger<V1SyncAdminGuard>.Instance,
            timeProvider: time,
            maxCacheEntries: 3);

        DefaultHttpContext CtxWithToken(string tok)
        {
            var c = new DefaultHttpContext();
            c.Request.Headers.Authorization = $"Bearer {tok}";
            return c;
        }

        // First call hits portal-api
        (await guard.AuthorizeAsync(CtxWithToken("tok-1"), CancellationToken.None)).Allowed.Should().BeTrue();
        handler.CallCount.Should().Be(1);

        // Cached within 60s
        time.Advance(TimeSpan.FromSeconds(30));
        (await guard.AuthorizeAsync(CtxWithToken("tok-1"), CancellationToken.None)).Allowed.Should().BeTrue();
        handler.CallCount.Should().Be(1);

        // Insert 3 more distinct tokens -> cache bound = 3
        await guard.AuthorizeAsync(CtxWithToken("tok-2"), CancellationToken.None);
        await guard.AuthorizeAsync(CtxWithToken("tok-3"), CancellationToken.None);
        await guard.AuthorizeAsync(CtxWithToken("tok-4"), CancellationToken.None);
        guard.CacheCount.Should().BeLessThanOrEqualTo(3);
        handler.CallCount.Should().Be(4);

        // Advance past 60s TTL -> must re-query portal-api
        time.Advance(TimeSpan.FromSeconds(61));
        (await guard.AuthorizeAsync(CtxWithToken("tok-4"), CancellationToken.None)).Allowed.Should().BeTrue();
        handler.CallCount.Should().Be(5);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, """{}""", false, 401)]
    [InlineData(HttpStatusCode.Forbidden, """{}""", false, 403)]
    [InlineData(HttpStatusCode.OK, """{"email":"staff@clinicez.test","isSuperAdmin":false,"permissions":["view:audit"]}""", false, 403)]
    [InlineData(HttpStatusCode.OK, """{"email":"super@clinicez.test","isSuperAdmin":true,"permissions":[]}""", true, 200)]
    public async Task PortalApiResponses_MapToExpectedStatusCodes(
        HttpStatusCode portalStatus, string body, bool expectedAllowed, int expectedCode)
    {
        var handler = new CountingHttpMessageHandler(_ => new HttpResponseMessage(portalStatus)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        });

        var guard = new V1SyncAdminGuard(
            new SimpleHttpClientFactory(handler),
            BuildConfig(new Dictionary<string, string?> { ["PortalApi:BaseUrl"] = "http://portal-api:8080" }),
            new StubHostEnvironment(Environments.Production),
            NullLogger<V1SyncAdminGuard>.Instance);

        var ctx = new DefaultHttpContext();
        ctx.Request.Headers.Authorization = "Bearer jwt-value";
        var res = await guard.AuthorizeAsync(ctx, CancellationToken.None);

        res.Allowed.Should().Be(expectedAllowed);
        res.StatusCode.Should().Be(expectedCode);
    }

    [Fact]
    public async Task DevelopmentEnvironment_ExposesScalarAndOpenApi_UsesCloudflareR2WhenServiceUrlCleared_AndKeepsAuthStrict()
    {
        using var devFactory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureAppConfiguration((_, cfg) =>
            {
                cfg.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:SyncLedgerDb"] = "",
                    ["ConnectionStrings:V1Source"] = "",
                    ["ConnectionStrings:ClinicDb"] = "",
                    ["ConnectionStrings:PatientDb"] = "",
                    ["V1Sync:AllowUnauthenticatedLocalDev"] = "false",
                    ["Track3Storage:ClinicR2:ServiceUrl"] = "",
                    ["Track3Storage:ClinicR2:AccountId"] = "dev-account-id",
                    ["Track3Storage:ClinicR2:BucketName"] = "clinicez-clinic-dev",
                    ["Track3Storage:ClinicR2:AccessKeyId"] = "ak-dev",
                    ["Track3Storage:ClinicR2:SecretAccessKey"] = "sk-dev",
                    ["Track3Storage:ClinicR2:Region"] = "auto",
                    ["Track3Storage:PatientR2:ServiceUrl"] = "",
                    ["Track3Storage:PatientR2:AccountId"] = "dev-account-id",
                    ["Track3Storage:PatientR2:BucketName"] = "clinicez-patient-dev",
                    ["Track3Storage:PatientR2:AccessKeyId"] = "ak-dev",
                    ["Track3Storage:PatientR2:SecretAccessKey"] = "sk-dev",
                    ["Track3Storage:PatientR2:Region"] = "auto",
                });
            });
        });

        using var client = devFactory.CreateClient();

        var scalarResp = await client.GetAsync("/scalar/v1");
        scalarResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var scalarHtml = await scalarResp.Content.ReadAsStringAsync();
        scalarHtml.Should().Contain("Clinic EZ v1 Migration");

        var openApiResp = await client.GetAsync("/openapi/v1.json");
        openApiResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var openApiJson = await openApiResp.Content.ReadAsStringAsync();
        openApiJson.Should().Contain("/api/v1/v1-sync/status");

        var statusResp = await client.GetAsync("/api/v1/v1-sync/status");
        statusResp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var r2Pool = devFactory.Services.GetRequiredService<Track3R2ClientPool>();
        r2Pool.ClinicEndpointKind.Should().Be("cloudflare-r2");
        r2Pool.PatientEndpointKind.Should().Be("cloudflare-r2");
        r2Pool.IsClinicConfigured.Should().BeTrue();
        r2Pool.IsPatientConfigured.Should().BeTrue();
    }
}
