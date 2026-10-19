using System;
using System.Net;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using FluentAssertions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;
using ClinicEz.Patient.Api.Endpoints.Patients;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Common.Exceptions;
using ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Patient.Api.Tests.Security;

public sealed class ClaimIntakeEndpointTests : IAsyncLifetime
{
    private const string AuthenticatedUser = "user_clerk_test_123";

    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await PatientApiTestHost.StartAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private Task<HttpResponseMessage> PostAsync(string path, object payload, string? user)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(payload)
        };
        if (user is not null)
            request.Headers.Add(PatientApiTestHost.UserHeader, user);

        return _host.Client.SendAsync(request);
    }

    [Fact]
    public async Task ClaimIntake_WhenUnauthenticated_ReturnsUnauthorized()
    {
        var payload = new ClaimIntakeRequest("valid.claim.token");

        var response = await PostAsync("/api/v1/patients/claim-intake", payload, user: null);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task ClaimIntake_WhenValidRequest_CallsMediatRAndReturns200()
    {
        var expectedResult = new ClaimIntakeResultDto(
            PatientId: Guid.NewGuid(),
            ClinicEzId: "CE-TEST-0001",
            FirstName: "Juan",
            LastName: "Rizal",
            RelationshipType: "Self",
            ClinicMembershipStatus: "Active");

        _host.Sender.Send(Arg.Any<ClaimIntakeCommand>(), Arg.Any<CancellationToken>())
            .Returns(expectedResult);

        var payload = new ClaimIntakeRequest(
            ClaimToken: "valid.claim.token",
            Sex: "Male",
            ContactNumber: "09171234567");

        var response = await PostAsync("/api/v1/patients/claim-intake", payload, AuthenticatedUser);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<ClaimIntakeResultDto>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data!.RelationshipType.Should().Be("Self");
        body.Data.ClinicMembershipStatus.Should().Be("Active");
        body.Data.ClinicEzId.Should().Be("CE-TEST-0001");

        await _host.Sender.Received(1).Send(
            Arg.Is<ClaimIntakeCommand>(c =>
                c.ClerkUserId == AuthenticatedUser &&
                c.ClaimToken == "valid.claim.token"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ClaimIntake_WhenMedicalPrivacyGuardrailBlocked_Returns422WithErrorCode()
    {
        _host.Sender.Send(Arg.Any<ClaimIntakeCommand>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new MedicalPrivacyGuardrailException());

        var payload = new ClaimIntakeRequest(ClaimToken: "unrelated.adult.token");

        var response = await PostAsync("/api/v1/patients/claim-intake", payload, AuthenticatedUser);

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeFalse();
        body.ErrorCode.Should().Be("MEDICAL_PRIVACY_GUARDRAIL_BLOCKED");
        body.Message.Should().Contain("medical privacy");
    }

    [Fact]
    public async Task ClaimIntake_WhenTokenValidationFails_Returns400()
    {
        _host.Sender.Send(Arg.Any<ClaimIntakeCommand>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new ValidationException("Claim token has expired."));

        var payload = new ClaimIntakeRequest(ClaimToken: "expired.claim.token");

        var response = await PostAsync("/api/v1/patients/claim-intake", payload, AuthenticatedUser);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeFalse();
    }

    [Fact]
    public async Task ClaimIntake_WhenTokenExpired_Returns400BadRequest()
    {
        _host.Sender.Send(Arg.Any<ClaimIntakeCommand>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new ValidationException("Claim token has expired."));

        var payload = new ClaimIntakeRequest(ClaimToken: "eyJhbGciOiJIUzI1NiJ9.expired.token");

        var response = await PostAsync("/api/v1/patients/claim-intake", payload, AuthenticatedUser);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeFalse();
        body.ErrorCode.Should().Be("VALIDATION_ERROR");
        body.Message.Should().Contain("expired");
    }

    [Fact]
    public async Task ClaimIntake_WhenTokenAlteredSignature_Returns400BadRequest()
    {
        _host.Sender.Send(Arg.Any<ClaimIntakeCommand>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new ValidationException("Tampered token. HMAC signature mismatch."));

        var payload = new ClaimIntakeRequest(ClaimToken: "validpayload.altered_signature_here");

        var response = await PostAsync("/api/v1/patients/claim-intake", payload, AuthenticatedUser);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeFalse();
        body.ErrorCode.Should().Be("VALIDATION_ERROR");
        body.Message.Should().Contain("Tampered token");
    }

    [Theory]
    [InlineData("not-a-token-without-dot")]
    [InlineData("part1.part2.part3")]
    [InlineData("invalid_base64_payload???.signature")]
    public async Task ClaimIntake_WhenTokenMalformedBase64Url_Returns400BadRequest(string malformedToken)
    {
        _host.Sender.Send(Arg.Any<ClaimIntakeCommand>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new ValidationException("Token format must be <payload>.<signature>."));

        var payload = new ClaimIntakeRequest(ClaimToken: malformedToken);

        var response = await PostAsync("/api/v1/patients/claim-intake", payload, AuthenticatedUser);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeFalse();
        body.ErrorCode.Should().Be("VALIDATION_ERROR");
    }
}
