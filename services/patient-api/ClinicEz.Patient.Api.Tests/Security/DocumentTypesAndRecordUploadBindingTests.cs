using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Features.DocumentTypes.DTOs;
using ClinicEz.Patient.Application.Features.DocumentTypes.Queries;
using ClinicEz.Patient.Application.Features.Records.Commands;
using ClinicEz.Patient.Application.Features.Records.DTOs;
using ClinicEz.Shared.Common;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Api.Tests.Security;

public sealed class DocumentTypesAndRecordUploadBindingTests : IAsyncLifetime
{
    private const string Owner = "user_owner";
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

    [Fact]
    public async Task GetDocumentTypes_Authenticated_Returns200WithApiResponseEnvelope()
    {
        var certId = Guid.NewGuid();
        var expected = new List<DocumentTypeDto>
        {
            new(
                Id: certId,
                Code: "medical-certificate",
                Label: "Medical Certificate",
                Description: "Fit-to-work certificates",
                SupportedExtensions: ["pdf", "jpg", "png"],
                SupportedMimeTypes: ["application/pdf", "image/*"],
                NativePreviewKind: "pdf",
                IsActive: true,
                SortOrder: 10,
                ServerUpdatedAt: DateTime.UtcNow)
        };

        _host.Sender.Send(Arg.Any<GetDocumentTypesQuery>(), Arg.Any<CancellationToken>())
            .Returns(expected);

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/document-types");
        req.Headers.Add(PatientApiTestHost.UserHeader, Owner);

        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var envelope = await res.Content.ReadFromJsonAsync<ApiResponse<List<DocumentTypeDto>>>();
        envelope.Should().NotBeNull();
        envelope!.Succeeded.Should().BeTrue();
        envelope.Data.Should().ContainSingle(d => d.Id == certId && d.Code == "medical-certificate");
    }

    [Fact]
    public async Task GetDocumentTypes_Unauthenticated_Returns401Unauthorized()
    {
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/document-types");
        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task UploadRecord_WithLegacyCategorySlug_ResolvesDocumentTypeAndReturns201Created()
    {
        var fileBytes = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4 };
        var file = new ByteArrayContent(fileBytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");

        var content = new MultipartFormDataContent
        {
            { file, "file", "medical-cert.jpg" },
            { new StringContent("certificate"), "documentTypeId" },
            { new StringContent("Medical Certificate"), "title" }
        };

        var canonicalCertId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        _host.Sender.Send(Arg.Any<UploadPatientRecordCommand>(), Arg.Any<CancellationToken>())
            .Returns(new FileRecordDto(
                Id: Guid.NewGuid(),
                ClientId: Guid.NewGuid(),
                FileName: "medical-cert.jpg",
                MimeType: "image/jpeg",
                Extension: "jpg",
                SizeBytes: fileBytes.Length,
                DocumentTypeId: canonicalCertId,
                DocumentTypeName: "Medical certificate",
                Title: "Medical Certificate",
                DocumentDate: null,
                FacilityName: null,
                Notes: null,
                UploadedAt: DateTime.UtcNow,
                StorageKey: $"patients/{_patientId}/records/{Guid.NewGuid()}.cez"));

        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{_patientId}/records")
        {
            Content = content
        };
        req.Headers.Add(PatientApiTestHost.UserHeader, Owner);

        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        await _host.Sender.Received(1).Send(
            Arg.Is<UploadPatientRecordCommand>(c =>
                c.PatientId == _patientId &&
                c.DocumentTypeId == canonicalCertId &&
                c.DocumentTypeCode == "medical-certificate"),
            Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("unknown-invalid-slug")]
    public async Task UploadRecord_WithInvalidDocumentTypeId_Returns400BadRequest_Never500(string invalidDocType)
    {
        var fileBytes = "%PDF-1.4 sample"u8.ToArray();
        var file = new ByteArrayContent(fileBytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");

        var content = new MultipartFormDataContent
        {
            { file, "file", "report.pdf" },
            { new StringContent(invalidDocType), "documentTypeId" },
            { new StringContent("Sample Report"), "title" }
        };

        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{_patientId}/records")
        {
            Content = content
        };
        req.Headers.Add(PatientApiTestHost.UserHeader, Owner);

        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }
}
