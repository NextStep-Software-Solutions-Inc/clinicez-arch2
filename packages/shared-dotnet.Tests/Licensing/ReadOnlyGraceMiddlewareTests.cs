using System.Text.Json;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Licensing;
using FluentAssertions;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Shared.Tests.Licensing;

public class ReadOnlyGraceMiddlewareTests
{
    private sealed class FakeState : IFacilityLicenseState
    {
        private readonly LicenseValidationResult? _result;
        public FakeState(LicenseValidationResult? result) => _result = result;
        public Task<LicenseValidationResult?> GetAsync(HttpContext context, CancellationToken ct) => Task.FromResult(_result);
    }

    private sealed class FixedFacilityState : FacilityLicenseStateBase
    {
        private readonly (string, Guid)? _facility;

        public FixedFacilityState((string, Guid)? facility, IFacilityLicenseStore store, IFacilityLicenseValidator validator)
            : base(store, validator) => _facility = facility;

        protected override (string TenantId, Guid FacilityId)? ResolveFacility(HttpContext context) => _facility;
    }

    private static readonly FacilityLicensePayload Payload = new() { FacilityId = Guid.NewGuid(), TenantId = "tenant-a" };

    private static LicenseValidationResult Grace(DateTime? until = null) =>
        LicenseValidationResult.Expired(Payload, "expired", isReadOnlyGrace: true, readOnlyGraceUntilUtc: until ?? DateTime.UtcNow.AddDays(5));

    private static LicenseValidationResult PastGrace() =>
        LicenseValidationResult.Expired(Payload, "expired", isReadOnlyGrace: false, readOnlyGraceUntilUtc: DateTime.UtcNow.AddDays(-1));

    private static async Task<(bool ReachedApp, DefaultHttpContext Context)> RunAsync(
        LicenseValidationResult? license,
        string method,
        string path = "/api/v1/items",
        params string[] exempt)
    {
        var options = new ReadOnlyGraceOptions();
        options.ExemptPathPrefixes.AddRange(exempt);
        var reached = false;
        var middleware = new ReadOnlyGraceMiddleware(_ => { reached = true; return Task.CompletedTask; }, global::Microsoft.Extensions.Options.Options.Create(options));
        var context = new DefaultHttpContext();
        context.Request.Method = method;
        context.Request.Path = path;
        context.Response.Body = new MemoryStream();

        await middleware.InvokeAsync(context, new FakeState(license));

        return (reached, context);
    }

    private static async Task<string> ErrorCodeAsync(HttpContext context)
    {
        context.Response.Body.Position = 0;
        using var json = await JsonDocument.ParseAsync(context.Response.Body);
        return json.RootElement.GetProperty("errors")[0].GetProperty("code").GetString()!;
    }

    [Theory]
    [InlineData("GET")]
    [InlineData("POST")]
    public async Task ValidLicense_PassesThrough(string method)
    {
        var (reached, context) = await RunAsync(LicenseValidationResult.Success(Payload), method);

        reached.Should().BeTrue();
        context.Response.StatusCode.Should().Be(200);
    }

    [Fact]
    public async Task NoFacilityContext_OrMissingLicense_PassesThrough()
    {
        (await RunAsync(null, "POST")).ReachedApp.Should().BeTrue();
        (await RunAsync(LicenseValidationResult.Missing(), "POST")).ReachedApp.Should().BeTrue();
    }

    [Theory]
    [InlineData("GET")]
    [InlineData("HEAD")]
    [InlineData("OPTIONS")]
    public async Task ReadOnlyGrace_AllowsReads_AndAnnouncesTheDeadline(string method)
    {
        var until = new DateTime(2026, 12, 1, 0, 0, 0, DateTimeKind.Utc);

        var (reached, context) = await RunAsync(Grace(until), method);

        reached.Should().BeTrue();
        context.Response.Headers[ReadOnlyGraceMiddleware.ReadOnlyUntilHeader].ToString().Should().StartWith("2026-12-01");
    }

    [Theory]
    [InlineData("POST")]
    [InlineData("PUT")]
    [InlineData("PATCH")]
    [InlineData("DELETE")]
    public async Task ReadOnlyGrace_RejectsAnythingThatChangesData_With402(string method)
    {
        var (reached, context) = await RunAsync(Grace(), method);

        reached.Should().BeFalse();
        context.Response.StatusCode.Should().Be(StatusCodes.Status402PaymentRequired);
        (await ErrorCodeAsync(context)).Should().Be(LicenseErrorCodes.ReadOnly);
    }

    [Fact]
    public async Task ReadOnlyGrace_StillAllowsExemptPaths_SoALicenseCanBeInstalled()
    {
        var (reached, _) = await RunAsync(Grace(), "POST", "/api/v1/license/apply", "/api/v1/license", "/api/v1/auth");

        reached.Should().BeTrue();
    }

    [Theory]
    [InlineData("GET")]
    [InlineData("POST")]
    public async Task BeyondGrace_BlocksEverythingExceptExemptPaths(string method)
    {
        var (reached, context) = await RunAsync(PastGrace(), method);
        var (exemptReached, _) = await RunAsync(PastGrace(), method, "/health", "/health");

        reached.Should().BeFalse();
        context.Response.StatusCode.Should().Be(StatusCodes.Status402PaymentRequired);
        (await ErrorCodeAsync(context)).Should().Be(LicenseErrorCodes.Expired);
        exemptReached.Should().BeTrue();
    }

    [Fact]
    public async Task TamperedLicense_IsBlocked_With403()
    {
        var (reached, context) = await RunAsync(LicenseValidationResult.Tampered("forged"), "GET");

        reached.Should().BeFalse();
        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
        (await ErrorCodeAsync(context)).Should().Be(LicenseErrorCodes.Tampered);
    }

    [Fact]
    public async Task ExemptPathMatching_RespectsSegmentBoundaries()
    {
        var (reached, _) = await RunAsync(PastGrace(), "GET", "/api/v1/licensed-data", "/api/v1/license");

        reached.Should().BeFalse("only whole path segments are exempt");
    }

    // ── state resolution from the store, with the real validator ────────────────────────

    private static string Token(Guid facilityId, DateTime expires, DateTime? graceUntil = null) =>
        new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = facilityId,
            TenantId = "tenant-a",
            ExpiresAtUtc = expires,
            ReadOnlyGraceUntil = graceUntil
        });

    private static FixedFacilityState StateFor(string? token, Guid facilityId, bool knownFacility = true, (string, Guid)? resolved = null)
    {
        var data = new Interop.FacilityData();
        if (knownFacility) data.Held[("tenant-a", facilityId)] = new HeldFacilityLicense(token, 1);
        return new FixedFacilityState(
            resolved ?? ("tenant-a", facilityId),
            new Interop.FakeLicenseStore(data),
            new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem));
    }

    [Fact]
    public async Task State_ReportsActive_ReadOnlyGrace_AndExpired_FromTheHeldToken()
    {
        var id = Guid.NewGuid();
        var ctx = new DefaultHttpContext();

        (await StateFor(Token(id, DateTime.UtcNow.AddDays(10)), id).GetAsync(ctx, default))!.IsValid.Should().BeTrue();

        var grace = await StateFor(Token(id, DateTime.UtcNow.AddDays(-2), DateTime.UtcNow.AddDays(12)), id).GetAsync(ctx, default);
        grace!.IsReadOnlyGrace.Should().BeTrue();
        grace.IsValid.Should().BeFalse();

        var expired = await StateFor(Token(id, DateTime.UtcNow.AddDays(-30), DateTime.UtcNow.AddDays(-16)), id).GetAsync(ctx, default);
        expired!.IsExpired.Should().BeTrue();
        expired.IsReadOnlyGrace.Should().BeFalse();
    }

    [Fact]
    public async Task State_IsNull_WithoutAFacility_OrForAFacilityTheServiceDoesNotHold()
    {
        var id = Guid.NewGuid();
        var ctx = new DefaultHttpContext();

        (await StateFor(null, id, resolved: (string.Empty, id)).GetAsync(ctx, default)).Should().BeNull();
        (await StateFor(null, id, resolved: ("tenant-a", Guid.Empty)).GetAsync(ctx, default)).Should().BeNull();
        (await StateFor(null, id, knownFacility: false).GetAsync(ctx, default)).Should().BeNull();
    }

    [Fact]
    public async Task State_ForAHeldFacilityWithoutAToken_IsMissing()
    {
        var id = Guid.NewGuid();

        var state = await StateFor(null, id).GetAsync(new DefaultHttpContext(), default);

        state!.IsMissing.Should().BeTrue();
    }
}
