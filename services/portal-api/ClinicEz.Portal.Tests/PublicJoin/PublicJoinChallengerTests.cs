using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Services;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Security.ClaimTokens;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.PublicJoin;

/// <summary>
/// Empirical adversarial probe battery executed by o13_challenger_m1_2.
/// Stress-tests TTL settings, email dispatch edge cases, zero SMS guarantee,
/// XSS sanitization, brand color (#0D6963), and claim URL format.
/// </summary>
public sealed class PublicJoinChallengerTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly IInteropPublisher _publisher;
    private readonly SystemSettingsService _settingsService;
    private readonly FixedFrontendUrl _frontendUrlProvider;
    private readonly ClaimTokenService _claimTokenService;
    private readonly EmailTemplateRenderer _emailRenderer = new();
    private readonly Tenant _tenant;
    private readonly Facility _clinic;

    public PublicJoinChallengerTests()
    {
        _publisher = new InteropPublisher(_context);
        _settingsService = new SystemSettingsService(_context, new MemoryCache(new MemoryCacheOptions()), NullLogger<SystemSettingsService>.Instance);
        _frontendUrlProvider = new FixedFrontendUrl("https://portal.clinicez.test");
        _claimTokenService = new ClaimTokenService();

        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "adversarial-tenant",
            Name = "Adversarial Health Network",
            OwnerId = "owner-adv",
            Email = "admin@advhealth.ph"
        };

        _clinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Slug = "probe-clinic",
            Name = "Probe Diagnostics Clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        };

        _context.Tenants.Add(_tenant);
        _context.Facilities.Add(_clinic);
        _context.SaveChanges();

        _context.InteropOutbox.RemoveRange(_context.InteropOutbox);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private static PatientJoinRequestedPayload CreatePayload(string? email = "patient@advhealth.ph") => new()
    {
        TenantSlug = "adversarial-tenant",
        FacilitySlug = "probe-clinic",
        JoinCode = "ADVJOIN99",
        FirstName = "Maria",
        LastName = "Santos",
        ContactNumber = "+639178889999",
        DateOfBirth = new DateOnly(1995, 8, 20),
        Sex = "F",
        Email = email,
        MemberType = "MM"
    };

    [Theory]
    [InlineData("24", 24)]
    [InlineData("72", 72)]
    [InlineData("12", 12)]
    public async Task Probe1_TtlSettings_CustomValues_DirectlyGovernExpirationInTokenAndResponse(string ttlConfigValue, int expectedHours)
    {
        await _settingsService.UpdateSettingsAsync(new Dictionary<string, string>
        {
            ["JoinClaim:TtlHours"] = ttlConfigValue
        }, "ChallengerProbe");

        var payload = CreatePayload("ttl-patient@advhealth.ph");
        var beforeUtc = DateTime.UtcNow.AddHours(expectedHours).AddSeconds(-5);

        var result = await PublicJoinEndpoints.HandleAsync(
            payload,
            _context,
            _publisher,
            _settingsService,
            _frontendUrlProvider,
            NullLogger<PublicJoinEndpoints>.Instance,
            _claimTokenService,
            configuration: null,
            hostEnvironment: null,
            CancellationToken.None);

        var afterUtc = DateTime.UtcNow.AddHours(expectedHours).AddSeconds(5);

        var accepted = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var claimToken = accepted.Value!.GetType().GetProperty("ClaimToken")?.GetValue(accepted.Value) as string;
        var expiresAt = (DateTime)accepted.Value!.GetType().GetProperty("ExpiresAt")!.GetValue(accepted.Value)!;

        Assert.NotNull(claimToken);
        Assert.InRange(expiresAt, beforeUtc, afterUtc);

        // Verify the issued token's cryptographic claims mirror the exact expiration window
        var validation = _claimTokenService.ValidateToken(claimToken);
        Assert.True(validation.IsValid);
        Assert.InRange(validation.Claims!.ExpiresAtUtc, beforeUtc, afterUtc);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-12")]
    [InlineData("invalid_int")]
    public async Task Probe1_TtlSettings_ZeroOrNegativeOrMalformed_SafelyFallbacksTo48Hours(string invalidTtl)
    {
        await _settingsService.UpdateSettingsAsync(new Dictionary<string, string>
        {
            ["JoinClaim:TtlHours"] = invalidTtl
        }, "ChallengerProbe");

        var payload = CreatePayload("fallback@advhealth.ph");
        var beforeUtc = DateTime.UtcNow.AddHours(48).AddSeconds(-5);

        var result = await PublicJoinEndpoints.HandleAsync(
            payload,
            _context,
            _publisher,
            _settingsService,
            _frontendUrlProvider,
            NullLogger<PublicJoinEndpoints>.Instance,
            _claimTokenService,
            configuration: null,
            hostEnvironment: null,
            CancellationToken.None);

        var afterUtc = DateTime.UtcNow.AddHours(48).AddSeconds(5);

        var accepted = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var expiresAt = (DateTime)accepted.Value!.GetType().GetProperty("ExpiresAt")!.GetValue(accepted.Value)!;
        var claimToken = accepted.Value!.GetType().GetProperty("ClaimToken")?.GetValue(accepted.Value) as string;

        Assert.InRange(expiresAt, beforeUtc, afterUtc);

        var validation = _claimTokenService.ValidateToken(claimToken!);
        Assert.True(validation.IsValid);
        Assert.InRange(validation.Claims!.ExpiresAtUtc, beforeUtc, afterUtc);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\r\n")]
    public async Task Probe2_EmailDispatching_EmptyOrWhitespaceEmail_OmitsEmailEnvelopeEntirely(string? blankEmail)
    {
        var payload = CreatePayload(blankEmail);

        var result = await PublicJoinEndpoints.HandleAsync(
            payload,
            _context,
            _publisher,
            _settingsService,
            _frontendUrlProvider,
            NullLogger<PublicJoinEndpoints>.Instance,
            _claimTokenService,
            configuration: null,
            hostEnvironment: null,
            CancellationToken.None);

        var accepted = Assert.IsAssignableFrom<IValueHttpResult>(result);
        Assert.NotNull(accepted.Value);

        var allEnvelopes = TestSupport.Outbox(_context);
        // Only patient.join.requested envelope must exist
        Assert.Single(allEnvelopes);
        Assert.Equal(InteropTypes.PatientJoinRequested, allEnvelopes[0].Type);

        var emailEnvelopes = TestSupport.Outbox(_context, InteropTypes.NotificationEmailRequested);
        Assert.Empty(emailEnvelopes);
    }

    [Fact]
    public async Task Probe2_EmailDispatching_UntrimmedEmail_IsSanitizedAndTrimmedInEnvelope()
    {
        var payload = CreatePayload("   spaces.around@advhealth.ph   ");

        var result = await PublicJoinEndpoints.HandleAsync(
            payload,
            _context,
            _publisher,
            _settingsService,
            _frontendUrlProvider,
            NullLogger<PublicJoinEndpoints>.Instance,
            _claimTokenService,
            configuration: null,
            hostEnvironment: null,
            CancellationToken.None);

        var emailEnvelope = Assert.Single(TestSupport.Outbox(_context, InteropTypes.NotificationEmailRequested));
        var emailPayload = emailEnvelope.GetPayload<NotificationEmailRequestedPayload>();

        Assert.Equal("spaces.around@advhealth.ph", emailPayload.To);
        Assert.Equal(EmailTemplateKeys.PatientClaimInvitation, emailPayload.TemplateKey);
    }

    [Fact]
    public async Task Probe3_ZeroSms_GuaranteedAcrossAllJoinInvocations()
    {
        var testEmails = new[] { "patient1@advhealth.ph", null, "   ", "patient2@advhealth.ph" };

        foreach (var email in testEmails)
        {
            _context.InteropOutbox.RemoveRange(_context.InteropOutbox);
            await _context.SaveChangesAsync();

            var payload = CreatePayload(email);

            await PublicJoinEndpoints.HandleAsync(
                payload,
                _context,
                _publisher,
                _settingsService,
                _frontendUrlProvider,
                NullLogger<PublicJoinEndpoints>.Instance,
                _claimTokenService,
                configuration: null,
                hostEnvironment: null,
                CancellationToken.None);

            var envelopes = TestSupport.Outbox(_context);
            var anySmsEnvelope = envelopes.Any(e =>
                e.Type.Contains("sms", StringComparison.OrdinalIgnoreCase) ||
                (e.Payload.ValueKind == System.Text.Json.JsonValueKind.Object &&
                 e.Payload.EnumerateObject().Any(prop => prop.Name.Contains("sms", StringComparison.OrdinalIgnoreCase))));

            Assert.False(anySmsEnvelope, "No SMS envelope or payload must ever be generated by PublicJoinEndpoints.");
        }
    }

    [Fact]
    public void Probe4_EmailTemplate_XssPayloadsInFields_AreProperlyHtmlEncoded()
    {
        const string scriptInjection = "<script>alert('pwned')</script>";
        const string imgInjection = "St. Jude <img src=x onerror=alert(1)> Clinic";
        const string quoteInjection = "Maria \" onfocus=\"alert(1)\" Santos";

        var model = new Dictionary<string, string>
        {
            ["patientName"] = quoteInjection,
            ["facilityName"] = imgInjection,
            ["claimUrl"] = "https://portal.clinicez.test/claim?token=eyJhbGciOiJIUzI1NiJ9.test",
            ["ttlHours"] = "48",
            ["expiresAt"] = $"2026-10-15 12:00 UTC {scriptInjection}"
        };

        var rendered = _emailRenderer.Render(EmailTemplateKeys.PatientClaimInvitation, $"Subject {scriptInjection}", model);

        // Assert no executable raw tags exist in Html
        Assert.DoesNotContain("<script>", rendered.Html);
        Assert.DoesNotContain("</script>", rendered.Html);
        Assert.DoesNotContain("<img src=x", rendered.Html);
        Assert.DoesNotContain("\" onfocus=\"", rendered.Html);

        // Assert properly escaped equivalents exist
        Assert.Contains("&lt;script&gt;alert(&#39;pwned&#39;)&lt;/script&gt;", rendered.Html);
        Assert.Contains("&lt;img src=x onerror=alert(1)&gt;", rendered.Html);
        Assert.Contains("&quot; onfocus=&quot;alert(1)&quot;", rendered.Html);
    }

    [Fact]
    public void Probe4_EmailTemplate_TealBrandColor_IsStrictlyPresent()
    {
        var model = new Dictionary<string, string>
        {
            ["patientName"] = "Juan Dela Cruz",
            ["facilityName"] = "Central Clinic",
            ["claimUrl"] = "https://portal.clinicez.test/claim?token=token123",
            ["ttlHours"] = "48",
            ["expiresAt"] = "2026-10-15 12:00 UTC"
        };

        var rendered = _emailRenderer.Render(EmailTemplateKeys.PatientClaimInvitation, "Your Pass", model);

        // Verify Teal brand color #0D6963 from @clinicez/design-tokens is explicitly used
        Assert.Contains("#0D6963", rendered.Html);
        Assert.Contains("background: linear-gradient(135deg, #0D6963 0%, #084c47 100%)", rendered.Html);
        Assert.Contains("background-color: #0D6963", rendered.Html);
        Assert.Contains("color: #0D6963", rendered.Html);
    }

    [Fact]
    public async Task Probe4_EmailTemplate_ClaimUrlFormat_MatchesExpectedStructure()
    {
        var payload = CreatePayload("urlformat@advhealth.ph");

        var result = await PublicJoinEndpoints.HandleAsync(
            payload,
            _context,
            _publisher,
            _settingsService,
            _frontendUrlProvider,
            NullLogger<PublicJoinEndpoints>.Instance,
            _claimTokenService,
            configuration: null,
            hostEnvironment: null,
            CancellationToken.None);

        var emailEnvelope = Assert.Single(TestSupport.Outbox(_context, InteropTypes.NotificationEmailRequested));
        var emailPayload = emailEnvelope.GetPayload<NotificationEmailRequestedPayload>();
        var claimUrl = emailPayload.Model["claimUrl"];

        // Format must be: {baseUrl}/claim?token={token}
        var match = Regex.Match(claimUrl, @"^https://portal\.clinicez\.test/claim\?token=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$");
        Assert.True(match.Success, $"Claim URL did not match expected structure: {claimUrl}");

        var rawToken = Uri.UnescapeDataString(match.Groups[1].Value);
        var validation = _claimTokenService.ValidateToken(rawToken);
        Assert.True(validation.IsValid);
        Assert.Equal("Maria", validation.Claims?.FirstName);
        Assert.Equal("Santos", validation.Claims?.LastName);
        Assert.Equal("urlformat@advhealth.ph", validation.Claims?.Email);
    }

    [Theory]
    [InlineData("javascript:alert(document.cookie)")]
    [InlineData("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")]
    [InlineData("vbscript:MsgBox(1)")]
    [InlineData("/relative/claim?token=123")]
    public void Probe4_EmailTemplate_MaliciousOrNonHttpUrls_AreRejected(string badUrl)
    {
        var model = new Dictionary<string, string>
        {
            ["patientName"] = "Maria Santos",
            ["facilityName"] = "Central Clinic",
            ["claimUrl"] = badUrl,
            ["ttlHours"] = "48",
            ["expiresAt"] = "2026-10-15 12:00 UTC"
        };

        var ex = Assert.Throws<EmailTemplateException>(() =>
            _emailRenderer.Render(EmailTemplateKeys.PatientClaimInvitation, "Subject", model));

        Assert.Contains("must be an absolute http(s) URL", ex.Message);
    }
}
