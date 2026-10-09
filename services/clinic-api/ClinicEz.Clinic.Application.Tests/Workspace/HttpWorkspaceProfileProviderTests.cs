using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Workspace;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Workspace;

public sealed class HttpWorkspaceProfileProviderTests : IDisposable
{
    private sealed class ManualClock : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 10, 9, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan by) => _now += by;
    }

    private sealed class FakePortal : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public string? LastIfNoneMatch { get; private set; }
        public Func<HttpRequestMessage, HttpResponseMessage> Respond { get; set; } = _ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            LastIfNoneMatch = request.Headers.IfNoneMatch.ToString();
            return Task.FromResult(Respond(request));
        }
    }

    private sealed class Factory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private readonly string _dir = Path.Combine(Path.GetTempPath(), "wp-cache-" + Guid.NewGuid().ToString("N"));
    private readonly ManualClock _clock = new();
    private readonly FakePortal _portal = new();

    public void Dispose()
    {
        if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true);
    }

    private HttpWorkspaceProfileProvider NewProvider() => new(
        new Factory(_portal),
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Services:PortalApiUrl"] = "http://portal.test",
            ["WorkspaceProfile:CachePath"] = _dir,
            ["WorkspaceProfile:CacheSeconds"] = "300"
        }).Build(),
        NullLogger<HttpWorkspaceProfileProvider>.Instance,
        _clock);

    private static HttpResponseMessage Ok(long version, string name = "Metro Health", string? accent = "#0284C7")
    {
        var json = $$"""
            {"tenantSlug":"metro","version":{{version}},"displayName":"{{name}}","logoUrl":null,"accentColorHex":{{(accent == null ? "null" : $"\"{accent}\"")}},
             "timeZoneId":"Asia/Manila","locale":"en-PH","dateFormat":"MMM d, yyyy","currencyCode":"PHP"}
            """;
        var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
        response.Headers.ETag = new System.Net.Http.Headers.EntityTagHeaderValue($"\"{version}\"");
        return response;
    }

    [Fact]
    public async Task Get_FetchesOnce_ThenServesFromCacheWithinFreshnessWindow()
    {
        _portal.Respond = _ => Ok(1);
        var provider = NewProvider();

        var first = await provider.GetAsync("metro");
        _clock.Advance(TimeSpan.FromMinutes(4));
        var second = await provider.GetAsync("metro");

        Assert.Equal("Metro Health", first!.DisplayName);
        Assert.Same(first, second);
        Assert.Equal(1, _portal.Calls);
    }

    [Fact]
    public async Task Get_AfterWindow_Revalidates_WithIfNoneMatch_AndKeepsProfileOn304()
    {
        _portal.Respond = _ => Ok(7);
        var provider = NewProvider();
        var first = await provider.GetAsync("metro");

        _clock.Advance(TimeSpan.FromMinutes(6));
        _portal.Respond = _ => new HttpResponseMessage(HttpStatusCode.NotModified);
        var second = await provider.GetAsync("metro");

        Assert.Equal("\"7\"", _portal.LastIfNoneMatch);
        Assert.Same(first, second);
        Assert.Equal(2, _portal.Calls);
    }

    [Fact]
    public async Task Get_AfterChange_ReturnsNewProfile()
    {
        _portal.Respond = _ => Ok(1);
        var provider = NewProvider();
        await provider.GetAsync("metro");

        provider.Invalidate("metro");
        _portal.Respond = _ => Ok(2, name: "Renamed");
        var updated = await provider.GetAsync("metro");

        Assert.Equal("Renamed", updated!.DisplayName);
        Assert.Equal(2, updated.Version);
    }

    [Fact]
    public async Task Get_WhenPortalDown_ServesLastKnownCopy_AndBacksOffRetries()
    {
        _portal.Respond = _ => Ok(1);
        var provider = NewProvider();
        await provider.GetAsync("metro");

        _clock.Advance(TimeSpan.FromMinutes(10));
        _portal.Respond = _ => throw new HttpRequestException("portal unreachable");
        var stale = await provider.GetAsync("metro");
        var callsAfterFailure = _portal.Calls;
        await provider.GetAsync("metro"); // within the 30s backoff: no new call

        Assert.Equal("Metro Health", stale!.DisplayName);
        Assert.Equal(callsAfterFailure, _portal.Calls);
    }

    [Fact]
    public async Task Get_WhenPortalDown_AndNothingCached_ReturnsNull_WithoutThrowing()
    {
        _portal.Respond = _ => throw new HttpRequestException("portal unreachable");

        Assert.Null(await NewProvider().GetAsync("metro"));
    }

    [Fact]
    public async Task Get_UnknownWorkspace_ReturnsNull()
    {
        _portal.Respond = _ => new HttpResponseMessage(HttpStatusCode.NotFound);

        Assert.Null(await NewProvider().GetAsync("ghost"));
    }

    [Fact]
    public async Task LastKnownCopy_SurvivesRestart_ForOfflineOnPremFacilities()
    {
        _portal.Respond = _ => Ok(3, accent: "#059669");
        await NewProvider().GetAsync("metro");

        // "restart": new provider instance, portal unreachable
        _portal.Respond = _ => throw new HttpRequestException("offline");
        var restarted = NewProvider();

        var viaAsync = await restarted.GetAsync("metro");
        var viaCache = NewProvider().TryGetCached("metro");

        Assert.Equal("#059669", viaAsync!.AccentColorHex);
        Assert.Equal(3, viaCache!.Version);
    }

    [Fact]
    public void TryGetCached_NeverCallsThePortal()
    {
        _portal.Respond = _ => Ok(1);

        Assert.Null(NewProvider().TryGetCached("metro"));
        Assert.Equal(0, _portal.Calls);
    }

    [Fact]
    public async Task Get_RequestsTheAnonymousProfileEndpoint_AtConfiguredPortal()
    {
        Uri? seen = null;
        _portal.Respond = r => { seen = r.RequestUri; return Ok(1); };

        await NewProvider().GetAsync("metro co");

        Assert.Equal("http://portal.test/api/v1/tenants/metro%20co/workspace-profile", seen!.AbsoluteUri);
    }
}
