using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Features.Documents;
using ClinicEz.Patient.Application.Features.Documents.Commands.MarkPrescriptionExternallyDispensed;
using ClinicEz.Patient.Application.Features.Documents.Commands.UploadLabResult;
using ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareCode;
using ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareToken;
using ClinicEz.Patient.Application.Features.Sharing.Commands.RevokeAccessGrant;
using ClinicEz.Patient.Application.Features.Sync.Queries.GetSyncChanges;
using FluentAssertions;
using NSubstitute;

namespace ClinicEz.Patient.Api.Tests.Security;

/// <summary>The sharing, document and sync endpoints: only the patient themself reaches them, and uploaded files are policed before the application sees them.</summary>
public sealed class SharingAndDocumentEndpointTests : IAsyncLifetime
{
    private const string Owner = "user_owner";
    private const string Intruder = "user_intruder";

    private readonly Guid _patientId = Guid.NewGuid();
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await PatientApiTestHost.StartAsync();
        _host.Patients
            .IsOwnedByAsync(Arg.Any<Guid>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(call => call.ArgAt<Guid>(0) == _patientId && call.ArgAt<string>(1) == Owner);
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    public static TheoryData<string, string> Routes => new()
    {
        { "POST", "share-tokens" },
        { "POST", "share-codes" },
        { "GET", "access-grants" },
        { "DELETE", "access-grants/{grant}" },
        { "GET", "access-log" },
        { "GET", "export" },
        { "GET", "sync/changes" },
        { "POST", "lab-requests/{grant}/results" },
        { "POST", "prescriptions/{grant}/external-dispense" }
    };

    private HttpRequestMessage Build(string method, string route, string? user, HttpContent? content = null)
    {
        var path = $"/api/v1/patients/{_patientId}/{route.Replace("{grant}", Guid.NewGuid().ToString())}";
        var request = new HttpRequestMessage(new HttpMethod(method), path) { Content = content };
        if (user is not null) request.Headers.Add(PatientApiTestHost.UserHeader, user);
        return request;
    }

    private static HttpContent EmptyContentFor(string method, string route) =>
        route switch
        {
            "share-tokens" or "share-codes" => JsonContent.Create(new { scopes = new[] { "Allergies" } }),
            _ when method == "POST" => new MultipartFormDataContent { { new StringContent("x"), "notes" } },
            _ => null!
        };

    [Theory]
    [MemberData(nameof(Routes))]
    public async Task Another_user_is_forbidden_and_the_application_is_never_reached(string method, string route)
    {
        var response = await _host.Client.SendAsync(Build(method, route, Intruder, EmptyContentFor(method, route)));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Theory]
    [MemberData(nameof(Routes))]
    public async Task An_unauthenticated_caller_is_unauthorized(string method, string route)
    {
        var response = await _host.Client.SendAsync(Build(method, route, user: null, EmptyContentFor(method, route)));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task The_owner_creating_a_share_token_reaches_the_command_with_the_requested_scopes()
    {
        var content = JsonContent.Create(new { scopes = new[] { "Allergies", "Vitals" }, purpose = "Consultation" });

        var response = await _host.Client.SendAsync(Build("POST", "share-tokens", Owner, content));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await _host.Sender.Received(1).Send(
            Arg.Is<CreateShareTokenCommand>(c => c.PatientId == _patientId && c.Scopes.SequenceEqual(new[] { "Allergies", "Vitals" })),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task The_owner_creating_a_share_token_passes_the_chosen_redemption_limit()
    {
        var content = JsonContent.Create(new { scopes = new[] { "Allergies" }, maxRedemptions = 3 });

        var response = await _host.Client.SendAsync(Build("POST", "share-tokens", Owner, content));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await _host.Sender.Received(1).Send(
            Arg.Is<CreateShareTokenCommand>(c => c.PatientId == _patientId && c.MaxRedemptions == 3), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task The_owner_creating_a_share_code_reaches_the_command_with_the_requested_scopes()
    {
        var content = JsonContent.Create(new { scopes = new[] { "Allergies", "Vitals" }, purpose = "Consultation" });

        var response = await _host.Client.SendAsync(Build("POST", "share-codes", Owner, content));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await _host.Sender.Received(1).Send(
            Arg.Is<CreateShareCodeCommand>(c =>
                c.PatientId == _patientId && c.Purpose == "Consultation" && c.Scopes.SequenceEqual(new[] { "Allergies", "Vitals" })),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task The_owner_revoking_a_grant_reaches_the_command()
    {
        var grantId = Guid.NewGuid();
        var request = new HttpRequestMessage(HttpMethod.Delete, $"/api/v1/patients/{_patientId}/access-grants/{grantId}");
        request.Headers.Add(PatientApiTestHost.UserHeader, Owner);

        var response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await _host.Sender.Received(1).Send(
            Arg.Is<RevokeAccessGrantCommand>(c => c.PatientId == _patientId && c.GrantId == grantId), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task The_owner_pulling_changes_passes_the_cursor_and_page_size()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/patients/{_patientId}/sync/changes?since=123&take=50");
        request.Headers.Add(PatientApiTestHost.UserHeader, Owner);

        var response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().NotBe(HttpStatusCode.Forbidden).And.NotBe(HttpStatusCode.Unauthorized);
        await _host.Sender.Received(1).Send(
            Arg.Is<GetSyncChangesQuery>(q => q.PatientId == _patientId && q.Since == "123" && q.Take == 50), Arg.Any<CancellationToken>());
    }

    private static MultipartFormDataContent File(string field, byte[] bytes, string contentType, string fileName)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, field, fileName } };
    }

    private Task<HttpResponseMessage> UploadAsync(byte[] bytes, string contentType, string fileName = "result.pdf") =>
        _host.Client.SendAsync(Build("POST", "lab-requests/{grant}/results", Owner, File("file", bytes, contentType, fileName)));

    [Fact]
    public async Task A_valid_result_upload_is_accepted_and_handed_to_the_application()
    {
        var response = await UploadAsync("%PDF-1.4"u8.ToArray(), "application/pdf");

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        await _host.Sender.Received(1).Send(
            Arg.Is<UploadLabResultCommand>(c => c.PatientId == _patientId && c.FileName == "result.pdf" && c.ContentType == "application/pdf"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task A_result_upload_without_a_file_is_a_bad_request()
    {
        var content = new MultipartFormDataContent { { new StringContent("note"), "notes" } };

        var response = await _host.Client.SendAsync(Build("POST", "lab-requests/{grant}/results", Owner, content));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task A_result_upload_over_the_limit_is_payload_too_large()
    {
        var response = await UploadAsync(new byte[PatientFileLimits.MaxFileBytes + 1], "application/pdf");

        response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task A_result_upload_of_an_unsupported_type_is_unsupported_media_type()
    {
        var response = await UploadAsync([1, 2, 3], "application/x-msdownload", "virus.exe");

        response.StatusCode.Should().Be(HttpStatusCode.UnsupportedMediaType);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task An_outside_dispense_without_a_receipt_reaches_the_command_with_its_form_fields()
    {
        var content = new MultipartFormDataContent
        {
            { new StringContent("Watsons"), "pharmacyName" },
            { new StringContent("Makati"), "branchLocation" },
            { new StringContent("OR-1"), "receiptNumber" }
        };

        var response = await _host.Client.SendAsync(Build("POST", "prescriptions/{grant}/external-dispense", Owner, content));

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        await _host.Sender.Received(1).Send(
            Arg.Is<MarkPrescriptionExternallyDispensedCommand>(c =>
                c.PatientId == _patientId && c.PharmacyName == "Watsons" && c.BranchLocation == "Makati" && c.ReceiptNumber == "OR-1" && c.Receipt == null),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task An_outside_dispense_receipt_of_an_unsupported_type_is_unsupported_media_type()
    {
        var content = File("receipt", [1, 2, 3], "text/html", "receipt.html");
        content.Add(new StringContent("Watsons"), "pharmacyName");

        var response = await _host.Client.SendAsync(Build("POST", "prescriptions/{grant}/external-dispense", Owner, content));

        response.StatusCode.Should().Be(HttpStatusCode.UnsupportedMediaType);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }
}
