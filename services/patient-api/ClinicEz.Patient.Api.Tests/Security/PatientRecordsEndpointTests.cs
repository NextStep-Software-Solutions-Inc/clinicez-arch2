using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Records.Commands;
using ClinicEz.Patient.Application.Features.Records.DTOs;
using ClinicEz.Patient.Application.Features.Records.Queries;
using ClinicEz.Shared.Common;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Api.Tests.Security;

public sealed class PatientRecordsEndpointTests : IAsyncLifetime
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

    private HttpRequestMessage Build(string method, string relativePath, string? user, HttpContent? content = null)
    {
        var path = $"/api/v1/patients/{_patientId}/{relativePath}";
        var req = new HttpRequestMessage(new HttpMethod(method), path) { Content = content };
        if (user is not null) req.Headers.Add(PatientApiTestHost.UserHeader, user);
        return req;
    }

    private static MultipartFormDataContent ValidRecordMultipart(byte[] bytes, string contentType, string fileName)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        var content = new MultipartFormDataContent
        {
            { file, "file", fileName },
            { new StringContent(Guid.NewGuid().ToString()), "documentTypeId" },
            { new StringContent("Blood Test Result"), "title" },
            { new StringContent("2026-10-20"), "documentDate" },
            { new StringContent("St. Luke Clinic"), "facilityName" },
            { new StringContent("Routine check"), "notes" }
        };
        return content;
    }

    [Fact]
    public async Task UploadRecord_ByIntruder_Returns403Forbidden()
    {
        var content = ValidRecordMultipart("%PDF-1.4"u8.ToArray(), "application/pdf", "cbc.pdf");
        var res = await _host.Client.SendAsync(Build("POST", "records", Intruder, content));

        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task UploadRecord_Unauthenticated_Returns401Unauthorized()
    {
        var content = ValidRecordMultipart("%PDF-1.4"u8.ToArray(), "application/pdf", "cbc.pdf");
        var res = await _host.Client.SendAsync(Build("POST", "records", null, content));

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task UploadRecord_ValidFile_Returns201Created_AndDispatchesCommand()
    {
        var fileBytes = "%PDF-1.4 test report"u8.ToArray();
        var content = ValidRecordMultipart(fileBytes, "application/pdf", "test-report.pdf");

        var expectedDto = new FileRecordDto(
            Id: Guid.NewGuid(),
            ClientId: Guid.NewGuid(),
            FileName: "test-report.pdf",
            MimeType: "application/pdf",
            Extension: ".pdf",
            SizeBytes: fileBytes.Length,
            DocumentTypeId: Guid.NewGuid(),
            DocumentTypeName: "Lab Result",
            Title: "Blood Test Result",
            DocumentDate: new DateOnly(2026, 10, 20),
            FacilityName: "St. Luke Clinic",
            Notes: "Routine check",
            UploadedAt: DateTime.UtcNow,
            StorageKey: $"patients/{_patientId}/records/{Guid.NewGuid()}.cez"
        );

        _host.Sender.Send(Arg.Any<UploadPatientRecordCommand>(), Arg.Any<CancellationToken>())
            .Returns(expectedDto);

        var res = await _host.Client.SendAsync(Build("POST", "records", Owner, content));

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        await _host.Sender.Received(1).Send(
            Arg.Is<UploadPatientRecordCommand>(c =>
                c.PatientId == _patientId &&
                c.FileName == "test-report.pdf" &&
                c.ContentType == "application/pdf" &&
                c.Title == "Blood Test Result"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task UploadRecord_Exceeding25MB_Returns413PayloadTooLarge()
    {
        var oversized = new byte[25 * 1024 * 1024 + 1];
        var content = ValidRecordMultipart(oversized, "application/pdf", "huge.pdf");

        var res = await _host.Client.SendAsync(Build("POST", "records", Owner, content));

        res.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task UploadRecord_UnsupportedMimeType_Returns415UnsupportedMediaType()
    {
        var content = ValidRecordMultipart([1, 2, 3], "application/x-msdownload", "payload.exe");

        var res = await _host.Client.SendAsync(Build("POST", "records", Owner, content));

        res.StatusCode.Should().Be(HttpStatusCode.UnsupportedMediaType);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task GetRecords_ByOwner_Returns200OK_WithRecordsList()
    {
        _host.Sender.Send(Arg.Is<GetPatientRecordsQuery>(q => q.PatientId == _patientId), Arg.Any<CancellationToken>())
            .Returns(new List<FileRecordDto>());

        var res = await _host.Client.SendAsync(Build("GET", "records", Owner));

        res.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task StreamRecord_ByOwner_ReturnsDecryptedStream()
    {
        var fileId = Guid.NewGuid();
        var plaintextBytes = "%PDF-1.4 streamable data"u8.ToArray();

        _host.Sender.Send(Arg.Is<StreamPatientRecordQuery>(q => q.PatientId == _patientId && q.FileId == fileId), Arg.Any<CancellationToken>())
            .Returns(new DecryptedFileStreamResult(
                Stream: new MemoryStream(plaintextBytes),
                ContentType: "application/pdf",
                FileName: "test.pdf"
            ));

        var res = await _host.Client.SendAsync(Build("GET", $"records/{fileId}/stream", Owner));

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        res.Content.Headers.ContentType!.MediaType.Should().Be("application/pdf");
        res.Content.Headers.ContentDisposition!.FileName.Should().Be("test.pdf");
        (await res.Content.ReadAsByteArrayAsync()).Should().Equal(plaintextBytes);
    }

    [Fact]
    public async Task StreamLabResult_ByOwner_ReturnsDecryptedLabResultStream()
    {
        var reportId = Guid.NewGuid();
        var pdfBytes = "%PDF-1.4 Official Lab Report"u8.ToArray();

        _host.Sender.Send(Arg.Is<StreamLabResultReportQuery>(q => q.PatientId == _patientId && q.ReportId == reportId), Arg.Any<CancellationToken>())
            .Returns(new DecryptedFileStreamResult(
                Stream: new MemoryStream(pdfBytes),
                ContentType: "application/pdf",
                FileName: "lab-report.pdf"
            ));

        var res = await _host.Client.SendAsync(Build("GET", $"documents/lab-results/{reportId}/stream", Owner));

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        res.Content.Headers.ContentType!.MediaType.Should().Be("application/pdf");
        (await res.Content.ReadAsByteArrayAsync()).Should().Equal(pdfBytes);
    }

    [Fact]
    public async Task DeleteRecord_ByOwner_Returns204NoContent()
    {
        var fileId = Guid.NewGuid();

        var res = await _host.Client.SendAsync(Build("DELETE", $"records/{fileId}", Owner));

        res.StatusCode.Should().Be(HttpStatusCode.NoContent);
        await _host.Sender.Received(1).Send(
            Arg.Is<DeletePatientRecordCommand>(c => c.PatientId == _patientId && c.FileId == fileId),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DeleteRecord_ByIntruder_Returns403Forbidden()
    {
        var fileId = Guid.NewGuid();

        var res = await _host.Client.SendAsync(Build("DELETE", $"records/{fileId}", Intruder));

        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task GetRecords_ByIntruder_Returns403Forbidden()
    {
        var res = await _host.Client.SendAsync(Build("GET", "records", Intruder));

        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task GetRecords_Unauthenticated_Returns401Unauthorized()
    {
        var res = await _host.Client.SendAsync(Build("GET", "records", null));

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task StreamRecord_ByIntruder_Returns403Forbidden()
    {
        var fileId = Guid.NewGuid();
        var res = await _host.Client.SendAsync(Build("GET", $"records/{fileId}/stream", Intruder));

        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task StreamRecord_Unauthenticated_Returns401Unauthorized()
    {
        var fileId = Guid.NewGuid();
        var res = await _host.Client.SendAsync(Build("GET", $"records/{fileId}/stream", null));

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task StreamLabResult_ByIntruder_Returns403Forbidden()
    {
        var reportId = Guid.NewGuid();
        var res = await _host.Client.SendAsync(Build("GET", $"documents/lab-results/{reportId}/stream", Intruder));

        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task StreamLabResult_Unauthenticated_Returns401Unauthorized()
    {
        var reportId = Guid.NewGuid();
        var res = await _host.Client.SendAsync(Build("GET", $"documents/lab-results/{reportId}/stream", null));

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task DeleteRecord_Unauthenticated_Returns401Unauthorized()
    {
        var fileId = Guid.NewGuid();
        var res = await _host.Client.SendAsync(Build("DELETE", $"records/{fileId}", null));

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task UploadRecord_Exact25MBBoundary_Returns201Created()
    {
        var exact25Mb = new byte[25 * 1024 * 1024];
        var content = ValidRecordMultipart(exact25Mb, "application/pdf", "exact25mb.pdf");

        var expectedDto = new FileRecordDto(
            Id: Guid.NewGuid(),
            ClientId: Guid.NewGuid(),
            FileName: "exact25mb.pdf",
            MimeType: "application/pdf",
            Extension: ".pdf",
            SizeBytes: exact25Mb.Length,
            DocumentTypeId: Guid.NewGuid(),
            DocumentTypeName: "Lab Result",
            Title: "Blood Test Result",
            DocumentDate: new DateOnly(2026, 10, 20),
            FacilityName: "St. Luke Clinic",
            Notes: "Routine check",
            UploadedAt: DateTime.UtcNow,
            StorageKey: $"patients/{_patientId}/records/{Guid.NewGuid()}.cez"
        );

        _host.Sender.Send(Arg.Any<UploadPatientRecordCommand>(), Arg.Any<CancellationToken>())
            .Returns(expectedDto);

        var res = await _host.Client.SendAsync(Build("POST", "records", Owner, content));

        res.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task UploadRecord_EmptyFile_Returns400BadRequest()
    {
        var content = ValidRecordMultipart([], "application/pdf", "empty.pdf");

        var res = await _host.Client.SendAsync(Build("POST", "records", Owner, content));

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task UploadRecord_MissingFile_Returns400BadRequest()
    {
        var content = new MultipartFormDataContent
        {
            { new StringContent(Guid.NewGuid().ToString()), "documentTypeId" },
            { new StringContent("Missing file title"), "title" }
        };

        var res = await _host.Client.SendAsync(Build("POST", "records", Owner, content));

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Theory]
    [InlineData("application/x-msdownload", "payload.exe")]
    [InlineData("application/x-sh", "exploit.sh")]
    [InlineData("application/x-bat", "script.bat")]
    [InlineData("text/html", "xss.html")]
    [InlineData("application/javascript", "script.js")]
    [InlineData("application/octet-stream", "binary.bin")]
    [InlineData("video/mp4", "movie.mp4")]
    [InlineData("audio/mpeg", "recording.mp3")]
    public async Task UploadRecord_VariousUnsupportedMimeTypes_Returns415(string mimeType, string fileName)
    {
        var content = ValidRecordMultipart([1, 2, 3], mimeType, fileName);

        var res = await _host.Client.SendAsync(Build("POST", "records", Owner, content));

        res.StatusCode.Should().Be(HttpStatusCode.UnsupportedMediaType);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Theory]
    [InlineData("application/pdf", "doc.pdf")]
    [InlineData("image/jpeg", "scan.jpg")]
    [InlineData("image/png", "chart.png")]
    [InlineData("image/webp", "photo.webp")]
    [InlineData("image/heic", "camera.heic")]
    public async Task UploadRecord_SupportedMimeTypes_Returns201Created(string mimeType, string fileName)
    {
        var content = ValidRecordMultipart("%PDF-sample"u8.ToArray(), mimeType, fileName);

        var expectedDto = new FileRecordDto(
            Id: Guid.NewGuid(),
            ClientId: Guid.NewGuid(),
            FileName: fileName,
            MimeType: mimeType,
            Extension: Path.GetExtension(fileName),
            SizeBytes: 10,
            DocumentTypeId: Guid.NewGuid(),
            DocumentTypeName: "Clinical Record",
            Title: "Test",
            DocumentDate: new DateOnly(2026, 10, 20),
            FacilityName: "Clinic",
            Notes: null,
            UploadedAt: DateTime.UtcNow,
            StorageKey: $"patients/{_patientId}/records/{Guid.NewGuid()}.cez"
        );

        _host.Sender.Send(Arg.Any<UploadPatientRecordCommand>(), Arg.Any<CancellationToken>())
            .Returns(expectedDto);

        var res = await _host.Client.SendAsync(Build("POST", "records", Owner, content));

        res.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task StreamRecord_RangeRequest_Returns206PartialContent_WithCorrectRangeAndBytes()
    {
        var fileId = Guid.NewGuid();
        var plaintextBytes = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"u8.ToArray();

        _host.Sender.Send(Arg.Is<StreamPatientRecordQuery>(q => q.PatientId == _patientId && q.FileId == fileId), Arg.Any<CancellationToken>())
            .Returns(new DecryptedFileStreamResult(
                Stream: new MemoryStream(plaintextBytes),
                ContentType: "application/pdf",
                FileName: "test.pdf"
            ));

        var req = Build("GET", $"records/{fileId}/stream", Owner);
        req.Headers.Range = new RangeHeaderValue(0, 9);

        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.PartialContent);
        res.Headers.AcceptRanges.Should().Contain("bytes");
        res.Content.Headers.ContentRange.Should().NotBeNull();
        res.Content.Headers.ContentRange!.From.Should().Be(0);
        res.Content.Headers.ContentRange.To.Should().Be(9);
        res.Content.Headers.ContentRange.Length.Should().Be(plaintextBytes.Length);

        var receivedBytes = await res.Content.ReadAsByteArrayAsync();
        receivedBytes.Should().Equal("0123456789"u8.ToArray());
    }

    [Fact]
    public async Task StreamRecord_RangeRequest_OffsetSlice_ReturnsCorrectSlice()
    {
        var fileId = Guid.NewGuid();
        var plaintextBytes = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"u8.ToArray();

        _host.Sender.Send(Arg.Is<StreamPatientRecordQuery>(q => q.PatientId == _patientId && q.FileId == fileId), Arg.Any<CancellationToken>())
            .Returns(new DecryptedFileStreamResult(
                Stream: new MemoryStream(plaintextBytes),
                ContentType: "application/pdf",
                FileName: "test.pdf"
            ));

        var req = Build("GET", $"records/{fileId}/stream", Owner);
        req.Headers.Range = new RangeHeaderValue(10, 19);

        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.PartialContent);
        res.Content.Headers.ContentRange!.From.Should().Be(10);
        res.Content.Headers.ContentRange.To.Should().Be(19);

        var receivedBytes = await res.Content.ReadAsByteArrayAsync();
        receivedBytes.Should().Equal("ABCDEFGHIJ"u8.ToArray());
    }

    [Fact]
    public async Task StreamRecord_RangeRequest_UnsatisfiableRange_Returns416()
    {
        var fileId = Guid.NewGuid();
        var plaintextBytes = "0123456789"u8.ToArray();

        _host.Sender.Send(Arg.Is<StreamPatientRecordQuery>(q => q.PatientId == _patientId && q.FileId == fileId), Arg.Any<CancellationToken>())
            .Returns(new DecryptedFileStreamResult(
                Stream: new MemoryStream(plaintextBytes),
                ContentType: "application/pdf",
                FileName: "test.pdf"
            ));

        var req = Build("GET", $"records/{fileId}/stream", Owner);
        req.Headers.Range = new RangeHeaderValue(5000, 6000);

        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.RequestedRangeNotSatisfiable);
    }

    [Fact]
    public async Task StreamLabResult_RangeRequest_Returns206PartialContent_WithCorrectRangeAndBytes()
    {
        var reportId = Guid.NewGuid();
        var pdfBytes = "%PDF-1.4 Official Lab Report Content Here"u8.ToArray();

        _host.Sender.Send(Arg.Is<StreamLabResultReportQuery>(q => q.PatientId == _patientId && q.ReportId == reportId), Arg.Any<CancellationToken>())
            .Returns(new DecryptedFileStreamResult(
                Stream: new MemoryStream(pdfBytes),
                ContentType: "application/pdf",
                FileName: "lab-report.pdf"
            ));

        var req = Build("GET", $"documents/lab-results/{reportId}/stream", Owner);
        req.Headers.Range = new RangeHeaderValue(0, 4);

        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.PartialContent);
        res.Headers.AcceptRanges.Should().Contain("bytes");
        res.Content.Headers.ContentRange!.From.Should().Be(0);
        res.Content.Headers.ContentRange.To.Should().Be(4);

        var receivedBytes = await res.Content.ReadAsByteArrayAsync();
        receivedBytes.Should().Equal("%PDF-"u8.ToArray());
    }

    [Fact]
    public async Task StreamLabResult_RangeRequest_UnsatisfiableRange_Returns416()
    {
        var reportId = Guid.NewGuid();
        var pdfBytes = "%PDF-1.4 Official Lab Report"u8.ToArray();

        _host.Sender.Send(Arg.Is<StreamLabResultReportQuery>(q => q.PatientId == _patientId && q.ReportId == reportId), Arg.Any<CancellationToken>())
            .Returns(new DecryptedFileStreamResult(
                Stream: new MemoryStream(pdfBytes),
                ContentType: "application/pdf",
                FileName: "lab-report.pdf"
            ));

        var req = Build("GET", $"documents/lab-results/{reportId}/stream", Owner);
        req.Headers.Range = new RangeHeaderValue(99999, 100000);

        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.RequestedRangeNotSatisfiable);
    }
}

