using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Features.Communications.Commands;
using ClinicEz.Patient.Application.Features.Communications.DTOs;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Api.Tests.Communications;

public sealed class PatientCommunicationsEndpointTests : IAsyncLifetime
{
    private const string AuthenticatedUser = "user_patient_comms_181";

    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await PatientApiTestHost.StartAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private Task<HttpResponseMessage> PostRawJsonAsync(string path, string rawJson, string? user)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = new StringContent(rawJson, Encoding.UTF8, "application/json")
        };
        if (user is not null)
        {
            request.Headers.Add(PatientApiTestHost.UserHeader, user);
        }

        return _host.Client.SendAsync(request);
    }

    [Theory]
    [InlineData("\"Medical\"")]
    [InlineData("\"LabInquiry\"")]
    [InlineData("\"General\"")]
    [InlineData("\"NotACategory\"")]
    [InlineData("1")]
    public async Task SubmitPatientRequest_WithInvalidOrLegacyCategory_Returns400Not500(string categoryJsonLiteral)
    {
        var rawJson = $$"""
            {
              "tenantId": "tenant-1",
              "facilityId": "fac-1",
              "facilityType": "Clinic",
              "facilityName": "Primary Clinic",
              "category": {{categoryJsonLiteral}},
              "contentText": "Question about test results",
              "isEmergencyConfirmed": false
            }
            """;

        var response = await PostRawJsonAsync("/api/v1/patient/requests", rawJson, AuthenticatedUser);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeFalse();
        body.ErrorCode.Should().Be("BAD_REQUEST");
        body.TraceId.Should().NotBeNullOrWhiteSpace();
        body.Errors.Should().ContainSingle(e => e.Code == "INVALID_JSON");

        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Theory]
    [InlineData("PostVisitFollowUp", MessageCategory.PostVisitFollowUp)]
    [InlineData("PrescriptionRefill", MessageCategory.PrescriptionRefill)]
    [InlineData("LabResultQuestion", MessageCategory.LabResultQuestion)]
    [InlineData("Billing", MessageCategory.Billing)]
    [InlineData("Scheduling", MessageCategory.Scheduling)]
    [InlineData("Other", MessageCategory.Other)]
    public async Task SubmitPatientRequest_WithCanonicalCategory_DispatchesCommandAndReturns200(
        string categoryName,
        MessageCategory expectedCategory)
    {
        var expectedConversationId = Guid.NewGuid();
        _host.Sender.Send(Arg.Any<SubmitPatientInquiryCommand>(), Arg.Any<CancellationToken>())
            .Returns(new SubmitPatientInquiryResponse(
                IsEmergencyRedirect: false,
                RedirectMessage: null,
                ConversationId: expectedConversationId));

        var rawJson = $$"""
            {
              "tenantId": "tenant-1",
              "facilityId": "fac-1",
              "facilityType": "Pharmacy",
              "facilityName": "Mercury Rx Hub",
              "category": "{{categoryName}}",
              "contentText": "Can I pick up my maintenance refill today?",
              "isEmergencyConfirmed": false
            }
            """;

        var response = await PostRawJsonAsync("/api/v1/patient/requests", rawJson, AuthenticatedUser);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<SubmitPatientInquiryResponse>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().NotBeNull();
        body.Data!.ConversationId.Should().Be(expectedConversationId);
        body.Data.IsEmergencyRedirect.Should().BeFalse();

        await _host.Sender.Received(1).Send(
            Arg.Is<SubmitPatientInquiryCommand>(c =>
                c.ClerkUserId == AuthenticatedUser &&
                c.Category == expectedCategory &&
                c.FacilityType == "Pharmacy"),
            Arg.Any<CancellationToken>());
    }
}
