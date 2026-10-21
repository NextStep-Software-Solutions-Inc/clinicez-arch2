using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Moq.Protected;
using Xunit;

namespace ClinicEz.Portal.Tests.Security;

public class TurnstileValidatorTests
{
    private static (CloudflareTurnstileValidator Validator, Mock<HttpMessageHandler> HandlerMock) CreateValidator(
        bool enabled = true,
        string secretKey = CloudflareTurnstileValidator.OfficialTestSecretKeyPass,
        string environment = "Production")
    {
        var configValues = new Dictionary<string, string?>
        {
            ["Turnstile:Enabled"] = enabled.ToString(),
            ["Turnstile:SecretKey"] = secretKey,
            ["Turnstile:VerifyUrl"] = CloudflareTurnstileValidator.DefaultVerifyUrl
        };

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configValues)
            .Build();

        var hostEnvMock = new Mock<IHostEnvironment>();
        hostEnvMock.Setup(h => h.EnvironmentName).Returns(environment);

        var handlerMock = new Mock<HttpMessageHandler>();
        var httpClient = new HttpClient(handlerMock.Object);

        var validator = new CloudflareTurnstileValidator(
            httpClient,
            configuration,
            hostEnvMock.Object,
            NullLogger<CloudflareTurnstileValidator>.Instance);

        return (validator, handlerMock);
    }

    [Fact]
    public async Task ValidateAsync_WhenDisabled_AlwaysReturnsTrue()
    {
        var (validator, _) = CreateValidator(enabled: false);

        var resultEmpty = await validator.ValidateAsync(string.Empty);
        var resultNull = await validator.ValidateAsync(null);
        var resultRandom = await validator.ValidateAsync("random-token");

        Assert.True(resultEmpty);
        Assert.True(resultNull);
        Assert.True(resultRandom);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task ValidateAsync_WhenTokenMissingOrEmpty_ReturnsFalse(string? token)
    {
        var (validator, _) = CreateValidator(enabled: true);

        var result = await validator.ValidateAsync(token);

        Assert.False(result);
    }

    [Theory]
    [InlineData("test-pass-token")]
    [InlineData("XXXX.DUMMY.PASS.TEST")]
    [InlineData("xxxx.dummy.pass.456")]
    public async Task ValidateAsync_WithDeterministicTestPassTokens_ReturnsTrue(string token)
    {
        var (validator, _) = CreateValidator(enabled: true);

        var result = await validator.ValidateAsync(token);

        Assert.True(result);
    }

    [Theory]
    [InlineData("test-fail-token")]
    [InlineData("XXXX.DUMMY.FAIL.TEST")]
    [InlineData("xxxx.dummy.fail.789")]
    public async Task ValidateAsync_WithDeterministicTestFailTokens_ReturnsFalse(string token)
    {
        var (validator, _) = CreateValidator(enabled: true);

        var result = await validator.ValidateAsync(token);

        Assert.False(result);
    }

    [Fact]
    public async Task ValidateAsync_WhenCloudflareReturnsSuccess_ReturnsTrue()
    {
        var (validator, handlerMock) = CreateValidator(enabled: true);

        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent("{\"success\": true, \"challenge_ts\": \"2026-10-21T12:00:00Z\", \"hostname\": \"example.com\"}")
            });

        var result = await validator.ValidateAsync("valid-remote-turnstile-token", "1.2.3.4");

        Assert.True(result);
    }

    [Fact]
    public async Task ValidateAsync_WhenCloudflareReturnsFailure_ReturnsFalse()
    {
        var (validator, handlerMock) = CreateValidator(enabled: true);

        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent("{\"success\": false, \"error-codes\": [\"invalid-input-response\"]}")
            });

        var result = await validator.ValidateAsync("rejected-token", "1.2.3.4");

        Assert.False(result);
    }

    [Fact]
    public async Task ValidateAsync_WhenCloudflareReturnsNonSuccessStatusCode_ReturnsFalse()
    {
        var (validator, handlerMock) = CreateValidator(enabled: true);

        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.InternalServerError
            });

        var result = await validator.ValidateAsync("sample-token", "1.2.3.4");

        Assert.False(result);
    }

    [Fact]
    public async Task PublicJoinEndpoint_WhenTurnstileTokenInvalid_ReturnsForbidden403()
    {
        var turnstileValidatorMock = new Mock<ITurnstileValidator>();
        turnstileValidatorMock
            .Setup(v => v.ValidateAsync(It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var payload = new ClinicEz.Shared.Interop.Contracts.PatientJoinRequestedPayload
        {
            TenantSlug = "test-tenant",
            FacilitySlug = "test-facility",
            JoinCode = "JC-100",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = "Male",
            ContactNumber = "+639123456789",
            TurnstileToken = "invalid-token"
        };

        var result = await ClinicEz.Portal.Api.Endpoints.PublicJoinEndpoints.HandleAsync(
            payload: payload,
            context: Mock.Of<IApplicationDbContext>(),
            publisher: Mock.Of<ClinicEz.Shared.Interop.IInteropPublisher>(),
            settingsService: Mock.Of<ISystemSettingsService>(),
            frontendUrlProvider: Mock.Of<IFrontendUrlProvider>(),
            logger: NullLogger<ClinicEz.Portal.Api.Endpoints.PublicJoinEndpoints>.Instance,
            turnstileValidator: turnstileValidatorMock.Object);

        Assert.NotNull(result);
        var jsonResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, jsonResult.StatusCode);
    }

    [Fact]
    public async Task PublicJoinEndpoint_WhenTurnstileTokenValid_ProceedsPastBotGuard()
    {
        var turnstileValidatorMock = new Mock<ITurnstileValidator>();
        turnstileValidatorMock
            .Setup(v => v.ValidateAsync(It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        // Future date of birth to trigger validation right after bot guard
        var payload = new ClinicEz.Shared.Interop.Contracts.PatientJoinRequestedPayload
        {
            TenantSlug = "test-tenant",
            FacilitySlug = "test-facility",
            JoinCode = "JC-100",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            Sex = "Male",
            ContactNumber = "+639123456789",
            TurnstileToken = "valid-token"
        };

        var result = await ClinicEz.Portal.Api.Endpoints.PublicJoinEndpoints.HandleAsync(
            payload: payload,
            context: Mock.Of<IApplicationDbContext>(),
            publisher: Mock.Of<ClinicEz.Shared.Interop.IInteropPublisher>(),
            settingsService: Mock.Of<ISystemSettingsService>(),
            frontendUrlProvider: Mock.Of<IFrontendUrlProvider>(),
            logger: NullLogger<ClinicEz.Portal.Api.Endpoints.PublicJoinEndpoints>.Instance,
            turnstileValidator: turnstileValidatorMock.Object);

        Assert.NotNull(result);
        // It passed bot guard and hit future DOB validation (400 Bad Request) instead of 403 Forbidden
        var badRequestResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequestResult.StatusCode);
    }
}
