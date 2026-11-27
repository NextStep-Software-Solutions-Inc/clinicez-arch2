using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Auth;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services.ConflictDiff;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.V1Sync.Tests;

public sealed class ConflictDiffUnitAndAuthTests
{
    private sealed class StubHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "ClinicEz.V1Sync.Api";
        public string ContentRootPath { get; set; } = "/";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class DummyHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }

    private static IConfiguration BuildConfig(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    [Theory]
    [InlineData(null, null, FieldDiffClassification.Unchanged)]
    [InlineData("", "   ", FieldDiffClassification.Unchanged)]
    [InlineData(null, "Juan", FieldDiffClassification.V2FilledEmpty)]
    [InlineData("   ", "09171234567", FieldDiffClassification.V2FilledEmpty)]
    [InlineData("Juan", null, FieldDiffClassification.V2ClearedValue)]
    [InlineData("Juan", "", FieldDiffClassification.V2ClearedValue)]
    [InlineData("Male", "Male", FieldDiffClassification.Unchanged)]
    [InlineData("juan  dela   cruz", "Juan Dela Cruz", FieldDiffClassification.FormatOnly)]
    [InlineData("36.5", "36.50", FieldDiffClassification.FormatOnly)]
    [InlineData("0917-123-4567", "09171234567", FieldDiffClassification.FormatOnly)]
    [InlineData("{\"b\":1,\"a\":2}", "{\"a\":2,\"b\":1}", FieldDiffClassification.FormatOnly)]
    [InlineData("Juan", "Pedro", FieldDiffClassification.Modified)]
    [InlineData("120", "130", FieldDiffClassification.Modified)]
    public void Classifier_ClassifiesAllFieldDeltaTypesAccurately(
        string? v1, string? v2, string expectedClassification)
    {
        ConflictFieldClassifier.Classify(v1, v2).Should().Be(expectedClassification);
    }

    [Fact]
    public void Masker_PreservesSafeEnumsAndMasksPiiMeasurementsAndClinicalNotes()
    {
        // Safe enums & booleans shown directly
        ConflictFieldMasker.MaskPreview("sex", FieldSensitivity.SafeEnumOrBool, "Male").Should().Be("Male");
        ConflictFieldMasker.MaskPreview("isSmoker", FieldSensitivity.SafeEnumOrBool, "true").Should().Be("true");
        ConflictFieldMasker.MaskPreview("smoking_status", FieldSensitivity.SafeEnumOrBool, "CurrentSmoker").Should().Be("CurrentSmoker");

        // Null / blank returns null
        ConflictFieldMasker.MaskPreview("firstName", FieldSensitivity.PiiMasked, "   ").Should().BeNull();

        // PII never leaks raw content
        var maskedName = ConflictFieldMasker.MaskPreview("firstName", FieldSensitivity.PiiMasked, "Maria Clara");
        maskedName.Should().NotBeNull();
        maskedName.Should().NotContain("Maria");
        maskedName.Should().NotContain("Clara");
        maskedName.Should().StartWith("M***");

        var maskedEmail = ConflictFieldMasker.MaskPreview("email", FieldSensitivity.PiiMasked, "maria.clara@clinicez.ph");
        maskedEmail.Should().NotBeNull();
        maskedEmail.Should().NotContain("maria.clara");
        maskedEmail.Should().NotContain("clinicez");
        maskedEmail.Should().Contain("@***.ph");

        var maskedDob = ConflictFieldMasker.MaskPreview("date_of_birth", FieldSensitivity.PiiMasked, "1995-04-12");
        maskedDob.Should().Be("****-**-**");

        var maskedMobile = ConflictFieldMasker.MaskPreview("mobile", FieldSensitivity.PiiMasked, "09171234567");
        maskedMobile.Should().NotContain("09171234567");
        maskedMobile.Should().NotContain("4567");

        // Clinical measurements masked in Tier 1
        var maskedBp = ConflictFieldMasker.MaskPreview("systolicBp", FieldSensitivity.ClinicalMeasurement, "142");
        maskedBp.Should().Be("[Clinical value · masked]");
        maskedBp.Should().NotContain("142");

        // Free-text clinical notes redacted in Tier 1
        var maskedNote = ConflictFieldMasker.MaskPreview("notes", FieldSensitivity.ClinicalNote, "Patient reports mild chest tightness.");
        maskedNote.Should().Contain("[Clinical note · redacted");
        maskedNote.Should().NotContain("chest");

        // Structured JSON reports key count only
        var maskedJson = ConflictFieldMasker.MaskPreview("customFields", FieldSensitivity.StructuredJson, """{"student_id":"2026-1001","program":"BSIT"}""");
        maskedJson.Should().Be("[Structured JSON · 2 keys]");
        maskedJson.Should().NotContain("2026-1001");
        maskedJson.Should().NotContain("BSIT");
    }

    [Fact]
    public void Masker_BuildJsonSubFieldDiffs_MasksByDefaultAndRevealsOnlyWhenAuthorized()
    {
        var v1 = """{"student_id":"2026-1001","program":"BSIT","legacy_only":"OLD"}""";
        var v2 = """{"student_id":"2026-9999","program":"BSIT","v2_added":"NEWVAL"}""";

        var masked = ConflictFieldMasker.BuildJsonSubFieldDiffs(v1, v2, revealValues: false)!;
        masked.Should().HaveCount(4);

        var studentDiff = masked.Should().ContainSingle(d => d.Key == "student_id").Subject;
        studentDiff.Classification.Should().Be(FieldDiffClassification.Modified);
        studentDiff.V1Preview.Should().NotContain("2026-1001");
        studentDiff.V2Preview.Should().NotContain("2026-9999");
        studentDiff.V1Value.Should().BeNull();
        studentDiff.V2Value.Should().BeNull();

        masked.Should().ContainSingle(d => d.Key == "legacy_only" && d.Classification == FieldDiffClassification.V2ClearedValue);
        masked.Should().ContainSingle(d => d.Key == "v2_added" && d.Classification == FieldDiffClassification.V2FilledEmpty);
        masked.Should().ContainSingle(d => d.Key == "program" && d.Classification == FieldDiffClassification.Unchanged);

        var revealed = ConflictFieldMasker.BuildJsonSubFieldDiffs(v1, v2, revealValues: true)!;
        var revealedStudent = revealed.Should().ContainSingle(d => d.Key == "student_id").Subject;
        revealedStudent.V1Value.Should().Be("2026-1001");
        revealedStudent.V2Value.Should().Be("2026-9999");
    }

    [Fact]
    public void CsvSanitizer_NeutralizesSpreadsheetFormulaInjectionAndQuotesSpecialChars()
    {
        ConflictFieldMasker.SanitizeCsvCell("=CMD|' /C calc'!A0").Should().Be("'=CMD|' /C calc'!A0");
        ConflictFieldMasker.SanitizeCsvCell("+1+1").Should().Be("'+1+1");
        ConflictFieldMasker.SanitizeCsvCell("-2+3").Should().Be("'-2+3");
        ConflictFieldMasker.SanitizeCsvCell("@SUM(A1:A2)").Should().Be("'@SUM(A1:A2)");
        ConflictFieldMasker.SanitizeCsvCell("Clinic, \"Main\"").Should().Be("\"Clinic, \"\"Main\"\"\"");
    }

    [Fact]
    public void FormatReportCsv_ContainsZeroPhiAndExpectedGovernanceColumns()
    {
        var report = new ConflictReviewReportResponse(
            BindingId: Guid.Parse("11111111-1111-1111-1111-111111111111"),
            BindingName: "=Malicious, Clinic",
            Track: SyncTrack.Track2Patient,
            StatusFilter: SyncConflictStatus.Open,
            TotalConflicts: 1,
            Truncated: false,
            GeneratedAtUtc: new DateTimeOffset(2026, 11, 27, 8, 0, 0, TimeSpan.Zero),
            Items:
            [
                new ConflictReviewReportItemDto(
                    ConflictId: Guid.Parse("22222222-2222-2222-2222-222222222222"),
                    EntityType: "PatientAccount",
                    V1Id: "11207",
                    V2Id: Guid.Parse("33333333-3333-3333-3333-333333333333"),
                    ConflictType: SyncConflictType.V2Modified,
                    Status: SyncConflictStatus.Open,
                    InspectorMode: ConflictInspectorMode.FieldDiff,
                    V1RecordStatus: ConflictRecordStatus.Active,
                    V2RecordStatus: ConflictRecordStatus.Active,
                    IsStale: true,
                    V1UpdatedAtUtc: new DateTimeOffset(2026, 11, 25, 1, 0, 0, TimeSpan.Zero),
                    V2UpdatedAtUtc: new DateTimeOffset(2026, 11, 26, 2, 0, 0, TimeSpan.Zero),
                    ChangedFields: ["mobile", "email"],
                    FieldClassifications:
                    [
                        new("mobile", FieldDiffClassification.V2FilledEmpty),
                        new("email", FieldDiffClassification.Modified)
                    ],
                    ResolvedBy: null,
                    ResolvedAtUtc: null,
                    CreatedAtUtc: new DateTimeOffset(2026, 11, 26, 3, 0, 0, TimeSpan.Zero))
            ]);

        var csv = ConflictDiffService.FormatReportCsv(report);
        var lines = csv.Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries);
        lines.Should().HaveCount(2);
        lines[0].Should().Contain("field_classifications");
        lines[1].Should().Contain("\"'=Malicious, Clinic\"");
        lines[1].Should().Contain("mobile:V2_FILLED_EMPTY; email:MODIFIED");
        lines[1].Should().Contain(",true,");
    }

    [Fact]
    public void AuthorizeBreakGlassMfa_ValidatesClerkFvaAndAmrClaimsAndFailsClosed()
    {
        var prodGuard = new V1SyncAdminGuard(
            new DummyHttpClientFactory(),
            BuildConfig(new Dictionary<string, string?> { ["V1Sync:AllowBreakGlassWithoutMfaInDev"] = "true" }),
            new StubHostEnvironment(Environments.Production),
            NullLogger<V1SyncAdminGuard>.Instance);

        // 1. Unauthenticated principal -> 403 even if dev override config is set in Production
        var anonCtx = new DefaultHttpContext();
        prodGuard.AuthorizeBreakGlassMfa(anonCtx).Should().Be((false, 403, "Break-glass unmasked view requires active Multi-Factor Authentication (MFA) on your admin session."));

        // 2. Clerk fva=[0, -1] (2nd factor NOT verified) -> 403
        var noMfaCtx = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim("sub", "user_1"), new Claim("fva", "0"), new Claim("fva", "-1")],
                "Bearer"))
        };
        prodGuard.AuthorizeBreakGlassMfa(noMfaCtx).Allowed.Should().BeFalse();

        // 3. Clerk fva=[0, 12] (2nd factor verified 12 mins ago) -> 200
        var fvaMultiCtx = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim("sub", "user_1"), new Claim("fva", "0"), new Claim("fva", "12")],
                "Bearer"))
        };
        prodGuard.AuthorizeBreakGlassMfa(fvaMultiCtx).Allowed.Should().BeTrue();

        // 4. Clerk fva as single JSON array string "[1, 0]" -> 200
        var fvaJsonCtx = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim("sub", "user_1"), new Claim("fva", "[1, 0]")],
                "Bearer"))
        };
        prodGuard.AuthorizeBreakGlassMfa(fvaJsonCtx).Allowed.Should().BeTrue();

        // 5. OIDC amr claim with "totp" -> 200; "pwd" only -> 403
        var amrTotpCtx = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim("sub", "user_1"), new Claim("amr", "pwd"), new Claim("amr", "totp")],
                "Bearer"))
        };
        prodGuard.AuthorizeBreakGlassMfa(amrTotpCtx).Allowed.Should().BeTrue();

        var amrPwdOnlyCtx = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim("sub", "user_1"), new Claim("amr", "pwd")],
                "Bearer"))
        };
        prodGuard.AuthorizeBreakGlassMfa(amrPwdOnlyCtx).Allowed.Should().BeFalse();

        // 6. Development defaults to fail-closed when AllowBreakGlassWithoutMfaInDev is false
        var devFailClosedGuard = new V1SyncAdminGuard(
            new DummyHttpClientFactory(),
            BuildConfig(new Dictionary<string, string?> { ["V1Sync:AllowBreakGlassWithoutMfaInDev"] = "false" }),
            new StubHostEnvironment(Environments.Development),
            NullLogger<V1SyncAdminGuard>.Instance);
        devFailClosedGuard.AuthorizeBreakGlassMfa(anonCtx).Allowed.Should().BeFalse();

        // 7. Development with explicit AllowBreakGlassWithoutMfaInDev=true allows local testing
        var devOverrideGuard = new V1SyncAdminGuard(
            new DummyHttpClientFactory(),
            BuildConfig(new Dictionary<string, string?> { ["V1Sync:AllowBreakGlassWithoutMfaInDev"] = "true" }),
            new StubHostEnvironment(Environments.Development),
            NullLogger<V1SyncAdminGuard>.Instance);
        devOverrideGuard.AuthorizeBreakGlassMfa(anonCtx).Allowed.Should().BeTrue();
    }

    private sealed class TestHeaderAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, "user_test_admin") };
            if (Request.Headers.TryGetValue("X-Test-Fva", out var fva))
            {
                claims.Add(new Claim("fva", fva.ToString()));
            }
            var identity = new ClaimsIdentity(claims, "TestScheme");
            var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), "TestScheme");
            return Task.FromResult(AuthenticateResult.Success(ticket));
        }
    }

    [Fact]
    public async Task ConflictDetailAndReportEndpoints_EnforceMfaReasonFormatAndNoStoreCacheHeaders()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
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
                    ["V1Sync:LocalAdminKey"] = "test-admin-key",
                    ["V1Sync:AllowBreakGlassWithoutMfaInDev"] = "false",
                });
            });
            builder.ConfigureServices(services =>
            {
                services.AddAuthentication("TestScheme")
                    .AddScheme<AuthenticationSchemeOptions, TestHeaderAuthHandler>("TestScheme", _ => { });
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-V1-Sync-Admin-Key", "test-admin-key");

        var conflictId = Guid.NewGuid();
        var bindingId = Guid.NewGuid();

        // 1. revealValues=true without MFA claim -> 403 Forbidden + Cache-Control: no-store
        using var noMfaResp = await client.GetAsync($"/api/v1/v1-sync/conflicts/{conflictId}/detail?revealValues=true&reason=Verify+patient+record");
        noMfaResp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        noMfaResp.Headers.CacheControl?.NoStore.Should().BeTrue();

        // 2. revealValues=true WITH MFA claim but short reason (< 5 chars) -> 400 BadRequest + Cache-Control: no-store
        using var shortReasonReq = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/v1/v1-sync/conflicts/{conflictId}/detail?revealValues=true&reason=abc");
        shortReasonReq.Headers.Add("X-Test-Fva", "[0, 4]");
        using var shortReasonResp = await client.SendAsync(shortReasonReq);
        shortReasonResp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        shortReasonResp.Headers.CacheControl?.NoStore.Should().BeTrue();

        // 3. Report with unsupported format -> 400 BadRequest + Cache-Control: no-store
        using var badFormatResp = await client.GetAsync($"/api/v1/v1-sync/bindings/{bindingId}/conflicts/report?format=xml");
        badFormatResp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        badFormatResp.Headers.CacheControl?.NoStore.Should().BeTrue();
    }
}
