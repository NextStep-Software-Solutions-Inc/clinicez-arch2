using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Features.Guest;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Adversarial;

/// <summary>
/// Challenger Adversarial Test Suite for Milestone M5:
/// Empirically stress-tests guest teleconsultation verification, brute-force lockout,
/// permanent lockout persistence, expired invite rejection, rate limiting enforcement,
/// and LiveKit Zero-PHI token opacity.
/// </summary>
[Collection("GuestTeleconsultTests")]
public sealed class GuestTeleconsultAdversarialTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly IInteropPublisher _publisher;
    private readonly IConfiguration _configuration;
    private readonly IGuestVerificationService _verificationService;

    public GuestTeleconsultAdversarialTests()
    {
        _publisher = new InteropPublisher(_context);

        var configValues = new Dictionary<string, string?>
        {
            ["Media:ApiKey"] = "test-media-broker-key",
            ["Media:ApiSecret"] = "test-media-broker-secret-32-chars-long!",
            ["Media:RelayUrl"] = "wss://media.clinicez.internal"
        };
        _configuration = new ConfigurationBuilder().AddInMemoryCollection(configValues).Build();

        _verificationService = new GuestVerificationService(
            _publisher,
            _configuration,
            NullLogger<GuestVerificationService>.Instance);

        GuestVerificationService.ClearStore();
    }

    public void Dispose()
    {
        GuestVerificationService.ClearStore();
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task BruteForceAttack_FiveFailedAttempts_IncrementsAttemptCounter_AndLocksOutOnFifth()
    {
        // Arrange
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "adversarial-invite-token-bf";
        const string correctDob = "1988-12-01";
        const string correctOtp = "842190";

        var storedInvite = GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-alpha",
            "fac-clinic-99",
            callId,
            inviteToken,
            correctDob,
            correctOtp,
            DateTime.UtcNow.AddHours(2));

        Assert.Equal(0, storedInvite.AttemptCount);
        Assert.False(storedInvite.IsLockedOut);

        // Act & Assert: Submit 5 incorrect attempts
        for (int attempt = 1; attempt <= 5; attempt++)
        {
            var wrongOtp = $"{100000 + attempt}"; // e.g. 100001, 100002...
            var request = new GuestTeleconsultVerifyRequest(inviteToken, correctDob, wrongOtp);

            var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
                request,
                _verificationService,
                NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
                CancellationToken.None);

            if (attempt < 5)
            {
                // Attempts 1 to 4: HTTP 401 Unauthorized, remaining attempts decreasing
                var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
                Assert.Equal(StatusCodes.Status401Unauthorized, statusResult.StatusCode);

                var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
                var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(valueResult.Value);
                Assert.False(apiResponse.Succeeded);
                Assert.Equal("INVALID_VERIFICATION_CREDENTIALS", apiResponse.ErrorCode);

                var expectedRemaining = 5 - attempt;
                Assert.Contains($"{expectedRemaining} attempts remaining", apiResponse.Message ?? "");
                Assert.Equal(attempt, storedInvite.AttemptCount);
                Assert.False(storedInvite.IsLockedOut);
            }
            else
            {
                // Attempt 5: HTTP 423 Locked, IsLockedOut == true, remaining attempts == 0
                var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
                Assert.Equal(StatusCodes.Status423Locked, statusResult.StatusCode);

                var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
                var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(valueResult.Value);
                Assert.False(apiResponse.Succeeded);
                Assert.Equal("GUEST_INVITE_LOCKED_OUT", apiResponse.ErrorCode);

                Assert.Equal(5, storedInvite.AttemptCount);
                Assert.True(storedInvite.IsLockedOut);
            }
        }
    }

    [Fact]
    public async Task BruteForceAttack_VariedCredentialFailures_AllCountTowardsThreshold()
    {
        // Arrange: Test combination of wrong DOB, wrong OTP, and both wrong
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "adversarial-invite-varied-failures";
        const string correctDob = "1991-03-25";
        const string correctOtp = "556677";

        var stored = GuestVerificationService.RegisterInvite(
            inviteId, "tenant-test", "fac-test", callId, inviteToken, correctDob, correctOtp, DateTime.UtcNow.AddHours(1));

        // 1. Correct DOB, wrong OTP
        var r1 = await PublicGuestTeleconsultEndpoints.HandleAsync(
            new(inviteToken, correctDob, "000001"), _verificationService, NullLogger<PublicGuestTeleconsultEndpoints>.Instance, CancellationToken.None);
        Assert.Equal(StatusCodes.Status401Unauthorized, Assert.IsAssignableFrom<IStatusCodeHttpResult>(r1).StatusCode);
        Assert.Equal(1, stored.AttemptCount);

        // 2. Wrong DOB, correct OTP
        var r2 = await PublicGuestTeleconsultEndpoints.HandleAsync(
            new(inviteToken, "1990-01-01", correctOtp), _verificationService, NullLogger<PublicGuestTeleconsultEndpoints>.Instance, CancellationToken.None);
        Assert.Equal(StatusCodes.Status401Unauthorized, Assert.IsAssignableFrom<IStatusCodeHttpResult>(r2).StatusCode);
        Assert.Equal(2, stored.AttemptCount);

        // 3. Both wrong DOB and wrong OTP
        var r3 = await PublicGuestTeleconsultEndpoints.HandleAsync(
            new(inviteToken, "1985-12-12", "999999"), _verificationService, NullLogger<PublicGuestTeleconsultEndpoints>.Instance, CancellationToken.None);
        Assert.Equal(StatusCodes.Status401Unauthorized, Assert.IsAssignableFrom<IStatusCodeHttpResult>(r3).StatusCode);
        Assert.Equal(3, stored.AttemptCount);

        // 4. Correct DOB, wrong OTP
        var r4 = await PublicGuestTeleconsultEndpoints.HandleAsync(
            new(inviteToken, correctDob, "111111"), _verificationService, NullLogger<PublicGuestTeleconsultEndpoints>.Instance, CancellationToken.None);
        Assert.Equal(StatusCodes.Status401Unauthorized, Assert.IsAssignableFrom<IStatusCodeHttpResult>(r4).StatusCode);
        Assert.Equal(4, stored.AttemptCount);

        // 5. Final failed attempt triggers permanent lockout
        var r5 = await PublicGuestTeleconsultEndpoints.HandleAsync(
            new(inviteToken, correctDob, "222222"), _verificationService, NullLogger<PublicGuestTeleconsultEndpoints>.Instance, CancellationToken.None);
        Assert.Equal(StatusCodes.Status423Locked, Assert.IsAssignableFrom<IStatusCodeHttpResult>(r5).StatusCode);
        Assert.Equal(5, stored.AttemptCount);
        Assert.True(stored.IsLockedOut);
    }

    [Fact]
    public async Task PermanentLockout_SixthAttemptWithCorrectCredentials_IsImmediatelyRejectedWith423()
    {
        // Arrange
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "adversarial-invite-perm-lockout";
        const string correctDob = "1979-05-20";
        const string correctOtp = "998877";

        var storedInvite = GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-beta",
            "fac-clinic-01",
            callId,
            inviteToken,
            correctDob,
            correctOtp,
            DateTime.UtcNow.AddMinutes(45));

        // Exhaust 5 failed attempts
        for (int i = 1; i <= 5; i++)
        {
            var wrongRequest = new GuestTeleconsultVerifyRequest(inviteToken, "1980-01-01", "000000");
            await PublicGuestTeleconsultEndpoints.HandleAsync(
                wrongRequest,
                _verificationService,
                NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
                CancellationToken.None);
        }

        Assert.True(storedInvite.IsLockedOut);
        Assert.Equal(5, storedInvite.AttemptCount);

        // Act: 6th attempt with 100% CORRECT credentials
        var correctRequest = new GuestTeleconsultVerifyRequest(inviteToken, correctDob, correctOtp);
        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            correctRequest,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        // Assert: MUST BE REJECTED with HTTP 423 Locked (Permanent Lockout)
        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status423Locked, statusResult.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(valueResult.Value);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("GUEST_INVITE_LOCKED_OUT", apiResponse.ErrorCode);
        Assert.Contains("permanently locked", apiResponse.Message ?? "", StringComparison.OrdinalIgnoreCase);

        // Verify no token was minted
        Assert.Null(apiResponse.Data?.GuestToken);
    }

    [Fact]
    public async Task ExpiredInvite_Returns410Gone()
    {
        // Arrange
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "adversarial-invite-expired-token";
        const string dob = "1992-10-15";
        const string otp = "456789";

        // Expired 10 minutes ago
        GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-delta",
            "fac-clinic-expired",
            callId,
            inviteToken,
            dob,
            otp,
            DateTime.UtcNow.AddMinutes(-10));

        // Act
        var request = new GuestTeleconsultVerifyRequest(inviteToken, dob, otp);
        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            request,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        // Assert: HTTP 410 Gone
        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status410Gone, statusResult.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(valueResult.Value);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("GUEST_INVITE_EXPIRED", apiResponse.ErrorCode);
        Assert.Contains("expired", apiResponse.Message ?? "", StringComparison.OrdinalIgnoreCase);
        Assert.Null(apiResponse.Data?.GuestToken);
    }

    [Theory]
    [InlineData("1990/01/01", "123456")] // slash DOB
    [InlineData("1990-1-1", "123456")] // unpadded DOB
    [InlineData("not-a-date", "123456")] // string DOB
    [InlineData("1990-01-01; DROP TABLE", "123456")] // SQL injection DOB
    [InlineData("1990-01-01", "12345")] // 5-digit OTP
    [InlineData("1990-01-01", "1234567")] // 7-digit OTP
    [InlineData("1990-01-01", "<script>")] // XSS OTP
    [InlineData("1990-01-01", "abcdef")] // alpha OTP
    public async Task MalformedInput_Returns400BadRequest_AndDoesNotConsumeAttempts(string dob, string otp)
    {
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string token = "adversarial-malformed-test-token";
        var stored = GuestVerificationService.RegisterInvite(
            inviteId, "tenant-f", "fac-f", callId, token, "1990-01-01", "123456", DateTime.UtcNow.AddHours(1));

        var request = new GuestTeleconsultVerifyRequest(token, dob, otp);
        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            request,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, statusResult.StatusCode);

        // Attempt counter must NOT increment on malformed input validation failure
        Assert.Equal(0, stored.AttemptCount);
    }

    [Fact]
    public async Task LiveKitToken_OpacityVerification_StrictlyFollowsConventions_AndRejectsPhi()
    {
        // Arrange
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "adversarial-livekit-token-test";
        const string dob = "1983-07-04";
        const string otp = "332211";

        GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-livekit",
            "fac-clinic-lk",
            callId,
            inviteToken,
            dob,
            otp,
            DateTime.UtcNow.AddHours(1));

        // Act
        var request = new GuestTeleconsultVerifyRequest(inviteToken, dob, otp);
        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            request,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        // Assert
        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status200OK, statusResult.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(valueResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);

        var responseData = apiResponse.Data!;
        Assert.True(responseData.Success);

        // Room name must strictly match ^call-[0-9a-fA-F\-]{32,36}$
        Assert.NotNull(responseData.RoomName);
        Assert.Matches(@"^call-[0-9a-fA-F\-]{32,36}$", responseData.RoomName);
        Assert.Equal($"call-{callId:N}", responseData.RoomName);

        // Token must be present and parseable as JWT
        Assert.NotNull(responseData.GuestToken);
        var handler = new JwtSecurityTokenHandler();
        Assert.True(handler.CanReadToken(responseData.GuestToken), "Guest token must be a readable JWT");

        var jwt = handler.ReadJwtToken(responseData.GuestToken);

        // Participant identity (Subject) must strictly match ^guest:otp-[0-9a-zA-Z\-_]{1,64}$
        var participantIdentity = jwt.Subject;
        Assert.NotNull(participantIdentity);
        Assert.Matches(@"^guest:otp-[0-9a-zA-Z\-_]{1,64}$", participantIdentity);
        Assert.Equal($"guest:otp-{inviteId:N}", participantIdentity);

        // Inspect video grant claim inside JWT
        var videoClaim = jwt.Claims.FirstOrDefault(c => c.Type == "video");
        Assert.NotNull(videoClaim);
        using var doc = JsonDocument.Parse(videoClaim.Value);
        var root = doc.RootElement;
        Assert.True(root.TryGetProperty("room", out var roomProp));
        Assert.Matches(@"^call-[0-9a-fA-F\-]{32,36}$", roomProp.GetString()!);
        Assert.Equal($"call-{callId:N}", roomProp.GetString());

        // Zero-PHI assertion: Ensure NO claims contain patient names, MRNs, DOBs, or clinical diagnosis text
        var forbiddenKeywords = new[]
        {
            "patient", "mrn", "dob", "birth", "diagnosis", "clinical", "soap",
            "doctor", "nurse", "prescription", "condition", "illness", "icd10"
        };

        foreach (var claim in jwt.Claims)
        {
            var claimTypeLower = claim.Type.ToLowerInvariant();
            var claimValueLower = claim.Value.ToLowerInvariant();

            foreach (var kw in forbiddenKeywords)
            {
                Assert.DoesNotContain(kw, claimTypeLower);
                if (claim.Type != "video") // video claim has 'room'
                {
                    Assert.DoesNotContain(kw, claimValueLower);
                }
            }
        }
    }

    [Fact]
    public async Task RateLimiting_Exceeding10PermitsPerMinute_TriggersHttp429TooManyRequests()
    {
        // Arrange: Spin up an in-memory WebApplication with RateLimiter and the PublicGuestTeleconsultEndpoints
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();

        builder.Services.AddRouting();
        builder.Services.AddSingleton(_verificationService);
        builder.Services.AddLogging();

        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy("GuestVerifyRateLimiter", httpContext =>
                System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
                    httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 10,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));
        });

        await using var app = builder.Build();
        app.UseRouting();
        app.UseRateLimiter();

        new PublicGuestTeleconsultEndpoints().MapEndpoint(app);

        await app.StartAsync();

        var client = app.GetTestClient();

        // Register a test invite
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string token = "rate-limit-test-token";
        GuestVerificationService.RegisterInvite(
            inviteId, "tenant-rl", "fac-clinic-rl", callId, token, "1990-01-01", "123456", DateTime.UtcNow.AddHours(1));

        var requestPayload = new GuestTeleconsultVerifyRequest(token, "1990-01-01", "000000");

        // Act & Assert:
        // First 10 requests should be admitted through the rate limiter (returning 401 Unauthorized for wrong OTP)
        for (int i = 1; i <= 10; i++)
        {
            var response = await client.PostAsJsonAsync("/portal/guest/teleconsult/verify", requestPayload);
            // Must NOT be rate-limited (429) yet
            Assert.NotEqual(HttpStatusCode.TooManyRequests, response.StatusCode);
        }

        // The 11th request in the same window MUST be rejected with HTTP 429 Too Many Requests
        var rateLimitedResponse = await client.PostAsJsonAsync("/portal/guest/teleconsult/verify", requestPayload);
        Assert.Equal(HttpStatusCode.TooManyRequests, rateLimitedResponse.StatusCode);
    }

    [Fact]
    public async Task RateLimiting_DistinctClientIps_HaveIndependentPermitPartitions()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();

        builder.Services.AddRouting();
        builder.Services.AddSingleton(_verificationService);
        builder.Services.AddLogging();

        builder.Services.Configure<ForwardedHeadersOptions>(opts =>
        {
            opts.ForwardedHeaders = ForwardedHeaders.XForwardedFor;
            opts.KnownIPNetworks.Clear();
            opts.KnownProxies.Clear();
        });

        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy("GuestVerifyRateLimiter", httpContext =>
                System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
                    httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 10,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));
        });

        await using var app = builder.Build();
        app.UseForwardedHeaders();
        app.UseRouting();
        app.UseRateLimiter();

        new PublicGuestTeleconsultEndpoints().MapEndpoint(app);

        await app.StartAsync();

        var client = app.GetTestClient();

        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string token = "partition-test-token";
        GuestVerificationService.RegisterInvite(
            inviteId, "tenant-part", "fac-part", callId, token, "1990-01-01", "123456", DateTime.UtcNow.AddHours(1));

        var requestPayload = new GuestTeleconsultVerifyRequest(token, "1990-01-01", "000000");

        // Exhaust IP 1 (192.0.2.10) with 10 requests
        for (int i = 1; i <= 10; i++)
        {
            using var msg = new HttpRequestMessage(HttpMethod.Post, "/portal/guest/teleconsult/verify")
            {
                Content = JsonContent.Create(requestPayload)
            };
            msg.Headers.Add("X-Forwarded-For", "192.0.2.10");
            var response = await client.SendAsync(msg);
            Assert.NotEqual(HttpStatusCode.TooManyRequests, response.StatusCode);
        }

        // 11th request from IP 1 is rate limited
        using var exhaustedMsg = new HttpRequestMessage(HttpMethod.Post, "/portal/guest/teleconsult/verify")
        {
            Content = JsonContent.Create(requestPayload)
        };
        exhaustedMsg.Headers.Add("X-Forwarded-For", "192.0.2.10");
        var exhaustedRes = await client.SendAsync(exhaustedMsg);
        Assert.Equal(HttpStatusCode.TooManyRequests, exhaustedRes.StatusCode);

        // Register a second invite for IP 2 to prove fresh partition
        var inviteId2 = Guid.NewGuid();
        var callId2 = Guid.NewGuid();
        const string token2 = "partition-test-token-2";
        GuestVerificationService.RegisterInvite(
            inviteId2, "tenant-part", "fac-part", callId2, token2, "1990-01-01", "123456", DateTime.UtcNow.AddHours(1));

        var requestPayload2 = new GuestTeleconsultVerifyRequest(token2, "1990-01-01", "000000");

        // Request from IP 2 (192.0.2.20) for invite 2 MUST BE ADMITTED (fresh partition -> 401 Unauthorized, NOT 429)
        using var freshMsg = new HttpRequestMessage(HttpMethod.Post, "/portal/guest/teleconsult/verify")
        {
            Content = JsonContent.Create(requestPayload2)
        };
        freshMsg.Headers.Add("X-Forwarded-For", "192.0.2.20");
        var freshRes = await client.SendAsync(freshMsg);
        Assert.Equal(HttpStatusCode.Unauthorized, freshRes.StatusCode);

        // Cross-validation: Request from IP 2 for the locked-out invite 1 is admitted through rate limiter
        // but rejected by business logic as HTTP 423 Locked, proving lockout is global across all IPs!
        using var lockedCrossIpMsg = new HttpRequestMessage(HttpMethod.Post, "/portal/guest/teleconsult/verify")
        {
            Content = JsonContent.Create(requestPayload)
        };
        lockedCrossIpMsg.Headers.Add("X-Forwarded-For", "192.0.2.20");
        var lockedCrossIpRes = await client.SendAsync(lockedCrossIpMsg);
        Assert.Equal(HttpStatusCode.Locked, lockedCrossIpRes.StatusCode);
    }

    [Theory]
    [InlineData("mc-2026-0001")]
    [InlineData("ref-2026-0001")]
    [InlineData("rx-2026-0001")]
    [InlineData("lab-2026-0001")]
    [InlineData("sec-sha256-abcdef123456")]
    public async Task VerifyGuest_WithMismatchedDocumentPrefix_ReturnsBadRequestAndDocumentKindMismatch(string mismatchedToken)
    {
        var result = await _verificationService.VerifyGuestAsync(mismatchedToken, "1990-01-01", "123456");
        Assert.False(result.Success);
        Assert.Equal("DOCUMENT_KIND_MISMATCH", result.ErrorCode);
        Assert.Contains("clinical document", result.ErrorMessage);
    }

    [Fact]
    public async Task VerifyGuest_WithRxVerificationToken_ReturnsBadRequestAndDocumentKindMismatch()
    {
        var rxToken = "01938561726374829102938475610293.01938561726374829102938475610294";
        var result = await _verificationService.VerifyGuestAsync(rxToken, "1990-01-01", "123456");
        Assert.False(result.Success);
        Assert.Equal("DOCUMENT_KIND_MISMATCH", result.ErrorCode);
        Assert.Contains("e-prescription verification token", result.ErrorMessage);
    }

    [Fact]
    public async Task VerifyGuest_WithLabUploadToken_ReturnsBadRequestAndDocumentKindMismatch()
    {
        var labToken = "01938561726374829102938475610293.uL7jZ_3xR_yT9aBcDeFgHi";
        var result = await _verificationService.VerifyGuestAsync(labToken, "1990-01-01", "123456");
        Assert.False(result.Success);
        Assert.Equal("DOCUMENT_KIND_MISMATCH", result.ErrorCode);
        Assert.Contains("laboratory upload token", result.ErrorMessage);
    }
}
