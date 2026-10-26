using System;
using System.IdentityModel.Tokens.Jwt;
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
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Guest;

[Collection("GuestTeleconsultTests")]
public class PublicGuestTeleconsultEndpointsTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly IInteropPublisher _publisher;
    private readonly IConfiguration _configuration;
    private readonly IGuestVerificationService _verificationService;

    public PublicGuestTeleconsultEndpointsTests()
    {
        _publisher = new InteropPublisher(_context);

        var configValues = new Dictionary<string, string?>
        {
            ["LiveKit:ApiKey"] = "devkey",
            ["LiveKit:ApiSecret"] = "secretsecretsecretsecretsecretsecret32bytes!",
            ["LiveKit:Url"] = "wss://livekit.clinicez.test"
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
    public async Task HandleAsync_NullRequest_ReturnsBadRequest()
    {
        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            null!,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    }

    [Theory]
    [InlineData("1990/05/15")]
    [InlineData("15-05-1990")]
    [InlineData("May 15, 1990")]
    [InlineData("not-a-date")]
    public async Task HandleAsync_InvalidDobFormat_ReturnsBadRequest(string invalidDob)
    {
        var request = new GuestTeleconsultVerifyRequest("valid-token-123", invalidDob, "123456");

        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            request,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(valueResult.Value);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("INVALID_FORMAT", apiResponse.ErrorCode);
    }

    [Theory]
    [InlineData("12345")] // 5 digits
    [InlineData("1234567")] // 7 digits
    [InlineData("abcdef")] // letters
    [InlineData("12 456")] // space
    public async Task HandleAsync_InvalidOtpFormat_ReturnsBadRequest(string invalidOtp)
    {
        var request = new GuestTeleconsultVerifyRequest("valid-token-123", "1990-05-15", invalidOtp);

        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            request,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(valueResult.Value);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("INVALID_FORMAT", apiResponse.ErrorCode);
    }

    [Fact]
    public async Task HandleAsync_MissingToken_ReturnsBadRequest()
    {
        var request = new GuestTeleconsultVerifyRequest("", "1990-05-15", "123456");

        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            request,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    }

    [Fact]
    public async Task HandleAsync_NonExistentToken_ReturnsUnauthorized()
    {
        var request = new GuestTeleconsultVerifyRequest("non-existent-token-xyz", "1990-05-15", "123456");

        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            request,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        var unauthorized = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status401Unauthorized, unauthorized.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(valueResult.Value);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("GUEST_INVITE_NOT_FOUND", apiResponse.ErrorCode);
    }

    [Fact]
    public async Task HandleAsync_WrongCredentials_ReturnsUnauthorized_WithRemainingAttempts()
    {
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "secret-guest-token-1";
        const string correctDob = "1988-11-23";
        const string correctOtp = "654321";

        GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-1",
            "fac-1",
            callId,
            inviteToken,
            correctDob,
            correctOtp,
            DateTime.UtcNow.AddMinutes(30));

        // Submit with incorrect OTP
        var request = new GuestTeleconsultVerifyRequest(inviteToken, correctDob, "999999");

        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            request,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        var unauthorized = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status401Unauthorized, unauthorized.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(valueResult.Value);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("INVALID_VERIFICATION_CREDENTIALS", apiResponse.ErrorCode);
    }

    [Fact]
    public async Task HandleAsync_FiveFailedAttempts_PermanentlyLocksOut_Returns423Locked()
    {
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "secret-guest-lockout-token";
        const string correctDob = "1992-04-10";
        const string correctOtp = "112233";

        GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-1",
            "fac-1",
            callId,
            inviteToken,
            correctDob,
            correctOtp,
            DateTime.UtcNow.AddMinutes(30));

        // Perform 5 failed attempts
        for (int i = 1; i <= 5; i++)
        {
            var wrongRequest = new GuestTeleconsultVerifyRequest(inviteToken, correctDob, "000000");
            var res = await PublicGuestTeleconsultEndpoints.HandleAsync(
                wrongRequest,
                _verificationService,
                NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
                CancellationToken.None);

            var status = Assert.IsAssignableFrom<IStatusCodeHttpResult>(res);
            if (i < 5)
            {
                Assert.Equal(StatusCodes.Status401Unauthorized, status.StatusCode);
            }
            else
            {
                // 5th failed attempt locks out!
                Assert.Equal(StatusCodes.Status423Locked, status.StatusCode);
            }
        }

        // Even with the CORRECT credentials, subsequent attempt is permanently locked out (423 Locked)
        var correctRequest = new GuestTeleconsultVerifyRequest(inviteToken, correctDob, correctOtp);
        var lockedResult = await PublicGuestTeleconsultEndpoints.HandleAsync(
            correctRequest,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        var lockedStatus = Assert.IsAssignableFrom<IStatusCodeHttpResult>(lockedResult);
        Assert.Equal(StatusCodes.Status423Locked, lockedStatus.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(lockedResult);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(valueResult.Value);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("GUEST_INVITE_LOCKED_OUT", apiResponse.ErrorCode);
    }

    [Fact]
    public async Task HandleAsync_ExpiredInvite_Returns410Gone()
    {
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "expired-token-123";
        const string dob = "1995-08-20";
        const string otp = "778899";

        GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-1",
            "fac-1",
            callId,
            inviteToken,
            dob,
            otp,
            DateTime.UtcNow.AddMinutes(-5)); // Expired 5 minutes ago

        var request = new GuestTeleconsultVerifyRequest(inviteToken, dob, otp);
        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            request,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        var goneResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status410Gone, goneResult.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(valueResult.Value);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("GUEST_INVITE_EXPIRED", apiResponse.ErrorCode);
    }

    [Fact]
    public async Task HandleAsync_ValidCredentials_Returns200Ok_WithZeroPhiRoomAndGuestToken()
    {
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "valid-guest-teleconsult-token";
        const string dob = "1985-02-14";
        const string otp = "554433";

        GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-metro",
            "fac-clinic-1",
            callId,
            inviteToken,
            dob,
            otp,
            DateTime.UtcNow.AddMinutes(45));

        var request = new GuestTeleconsultVerifyRequest(inviteToken, dob, otp);
        var result = await PublicGuestTeleconsultEndpoints.HandleAsync(
            request,
            _verificationService,
            NullLogger<PublicGuestTeleconsultEndpoints>.Instance,
            CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status200OK, okResult.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<GuestTeleconsultVerifyResponse>>(valueResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);

        var data = apiResponse.Data!;
        Assert.True(data.Success);
        Assert.Equal(callId, data.CallId);

        // Verify Zero-PHI Room Name convention: call-{CallId:N}
        Assert.Matches(@"^call-[0-9a-fA-F]{32}$", data.RoomName);
        Assert.Equal($"call-{callId:N}", data.RoomName);

        // Verify LiveKit Guest Token is a valid JWT with Zero-PHI identity
        Assert.NotNull(data.GuestToken);
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(data.GuestToken);

        var expectedIdentity = $"guest:otp-{inviteId:N}";
        Assert.Equal(expectedIdentity, jwt.Subject);

        // Verify ZERO patient name, zero DOB, zero clinical diagnosis in token claims
        Assert.DoesNotContain(jwt.Claims, c => c.Type == "name" || c.Type == "dob" || c.Type == "diagnosis");
    }
}
