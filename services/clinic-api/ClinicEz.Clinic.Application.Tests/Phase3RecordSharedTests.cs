using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class PatientRecordSharedHandlerTests
{
    private const string Tenant = "tenant-records";
    private static readonly byte[] FileBytes = System.Text.Encoding.ASCII.GetBytes("%PDF-1.4 lab result");
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();
    private readonly IClinicEncryptionService _encryption = Substitute.For<IClinicEncryptionService>();
    private readonly IClinicStorageService _storage = Substitute.For<IClinicStorageService>();
    private readonly StubHttpHandler _http = new();

    public PatientRecordSharedHandlerTests()
    {
        _encryption.EncryptAsync(Arg.Any<byte[]>(), Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(call => new ClinicEncryptedPayload(call.Arg<byte[]>().Reverse().ToArray(), "iv", "tag", "hash", call.Arg<byte[]>().LongLength, "{}"));
    }

    private PatientRecordSharedHandler Handler()
    {
        var factory = Substitute.For<IHttpClientFactory>();
        factory.CreateClient(Arg.Any<string>()).Returns(_ => new HttpClient(_http, disposeHandler: false));
        return new PatientRecordSharedHandler(_db, MessagingTestKit.Recipient(_db), factory, _encryption, _storage, NullLogger<PatientRecordSharedHandler>.Instance);
    }

    private (ClinicPatient Patient, Guid DraftId) Seed(bool withAppointment = true)
    {
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        var patient = Phase3TestKit.NewPatient(_clinicId, Tenant, Guid.NewGuid());
        _db.Patients.Add(patient);
        var draftId = Guid.NewGuid();
        if (withAppointment)
        {
            _db.Appointments.Add(new Appointment
            {
                Id = Guid.NewGuid(), TenantId = Tenant, ClinicId = _clinicId, PatientId = patient.Id, PatientName = "Maria Santos", DraftId = draftId
            });
        }

        _db.SaveChanges();
        return (patient, draftId);
    }

    private PatientRecordSharedPayload Payload(ClinicPatient patient, Guid draftId) => new()
    {
        DraftId = draftId,
        PatientId = patient.SyncPatientId!.Value,
        FileId = Guid.NewGuid(),
        FileName = "cbc.pdf",
        MimeType = "application/pdf",
        SizeBytes = FileBytes.Length,
        DocumentTypeCode = "lab",
        DownloadUrl = "https://files.example.test/signed/abc?sig=1",
        ExpiresAtUtc = DateTime.UtcNow.AddMinutes(10)
    };

    private Task Deliver(PatientRecordSharedPayload payload, Party? from = null, Guid? correlation = null) =>
        Handler().HandleAsync(payload,
            MessagingTestKit.Delivered(InteropTypes.PatientRecordShared, from ?? Party.ForPatient(payload.PatientId.ToString()),
                MessagingTestKit.ClinicParty(Tenant, _clinicId), correlation ?? payload.DraftId, payload),
            CancellationToken.None);

    private Task<int> Attachments() => _db.RecordAttachments.IgnoreQueryFilters().CountAsync();

    [Fact]
    public async Task Downloads_Encrypts_And_Stores_The_File_Against_The_Patients_Booking()
    {
        var (patient, draftId) = Seed();
        _http.Respond(HttpStatusCode.OK, FileBytes);
        var payload = Payload(patient, draftId);

        await Deliver(payload);

        var attachment = await _db.RecordAttachments.IgnoreQueryFilters().SingleAsync();
        attachment.Id.Should().Be(payload.FileId);
        attachment.PatientId.Should().Be(patient.Id);
        attachment.ClinicId.Should().Be(_clinicId);
        attachment.EncryptionIvBase64.Should().Be("iv");
        attachment.VerificationStatus.Should().Be("PendingVerification");
        attachment.StorageUri.Should().Be($"tenants/{Tenant}/clinics/{_clinicId}/records/{payload.FileId}.cez");
        await _storage.Received(1).SaveEncryptedFileAsync(attachment.StorageUri, Arg.Any<byte[]>(), Arg.Any<CancellationToken>());
        _http.Requests.Should().ContainSingle().Which.RequestUri!.Host.Should().Be("files.example.test");
    }

    [Fact]
    public async Task A_Booking_That_Has_Not_Arrived_Yet_Throws_So_The_Message_Is_Retried()
    {
        var (patient, draftId) = Seed(withAppointment: false);

        var act = () => Deliver(Payload(patient, draftId));

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("*will be retried*");
        (await Attachments()).Should().Be(0);
        _http.Requests.Should().BeEmpty("nothing is downloaded before the booking is known");
    }

    [Fact]
    public async Task A_Redelivered_File_Is_Not_Downloaded_Twice()
    {
        var (patient, draftId) = Seed();
        _http.Respond(HttpStatusCode.OK, FileBytes);
        var payload = Payload(patient, draftId);

        await Deliver(payload);
        await Deliver(payload);

        _http.Requests.Should().ContainSingle();
        (await Attachments()).Should().Be(1);
    }

    [Fact]
    public async Task A_Failed_Download_Is_Logged_And_Dropped_Without_A_Row()
    {
        var (patient, draftId) = Seed();
        _http.Respond(HttpStatusCode.Forbidden, Array.Empty<byte>());

        await Deliver(Payload(patient, draftId));

        (await Attachments()).Should().Be(0);
    }

    [Fact]
    public async Task An_Expired_Link_Is_Dropped_Without_Contacting_The_Server()
    {
        var (patient, draftId) = Seed();

        await Deliver(Payload(patient, draftId) with { ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1) });

        _http.Requests.Should().BeEmpty();
        (await Attachments()).Should().Be(0);
    }

    [Theory]
    [InlineData("ftp://files.example.test/x")]
    [InlineData("file:///etc/passwd")]
    [InlineData("not a url")]
    [InlineData("")]
    public async Task Only_Http_Links_Are_Followed(string url)
    {
        var (patient, draftId) = Seed();

        await Deliver(Payload(patient, draftId) with { DownloadUrl = url });

        _http.Requests.Should().BeEmpty();
        (await Attachments()).Should().Be(0);
    }

    [Theory]
    [InlineData(0L)]
    [InlineData(-5L)]
    [InlineData(26L * 1024 * 1024)]
    public async Task A_File_Outside_The_Size_Range_Is_Ignored(long size)
    {
        var (patient, draftId) = Seed();

        await Deliver(Payload(patient, draftId) with { SizeBytes = size });

        _http.Requests.Should().BeEmpty();
        (await Attachments()).Should().Be(0);
    }

    [Fact]
    public async Task A_Body_Larger_Than_The_Limit_Is_Dropped_Even_When_The_Header_Lied()
    {
        var (patient, draftId) = Seed();
        _http.Respond(HttpStatusCode.OK, new byte[25 * 1024 * 1024 + 1], declareLength: false);

        await Deliver(Payload(patient, draftId));

        (await Attachments()).Should().Be(0);
    }

    [Fact]
    public async Task A_Sender_That_Is_Not_The_Patient_Or_A_Mismatched_Draft_Is_Ignored()
    {
        var (patient, draftId) = Seed();
        var payload = Payload(patient, draftId);

        await Deliver(payload, Party.ForPatient(Guid.NewGuid().ToString()));
        await Deliver(payload, MessagingTestKit.LabParty());
        await Deliver(payload, correlation: Guid.NewGuid());

        _http.Requests.Should().BeEmpty();
        (await Attachments()).Should().Be(0);
    }

    [Fact]
    public async Task A_File_Id_Already_Owned_By_Another_Patient_Is_Not_Overwritten()
    {
        var (patient, draftId) = Seed();
        var other = Phase3TestKit.NewPatient(_clinicId, Tenant, Guid.NewGuid());
        var payload = Payload(patient, draftId);
        _db.Patients.Add(other);
        _db.RecordAttachments.Add(new ClinicRecordAttachment
        {
            Id = payload.FileId, TenantId = Tenant, ClinicId = _clinicId, PatientId = other.Id, Title = "t", FileName = "f", StorageUri = "u"
        });
        await _db.SaveChangesAsync();

        await Deliver(payload);

        _http.Requests.Should().BeEmpty();
        (await _db.RecordAttachments.IgnoreQueryFilters().SingleAsync()).PatientId.Should().Be(other.Id);
    }

    [Fact]
    public async Task A_Patient_Of_Another_Clinic_Does_Not_Satisfy_The_Booking_Check()
    {
        var (patient, draftId) = Seed(withAppointment: false);
        var otherClinic = Guid.NewGuid();
        _db.Appointments.Add(new Appointment
        {
            Id = Guid.NewGuid(), TenantId = Tenant, ClinicId = otherClinic, PatientId = patient.Id, PatientName = "Maria Santos", DraftId = draftId
        });
        await _db.SaveChangesAsync();

        var act = () => Deliver(Payload(patient, draftId));

        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    private sealed class StubHttpHandler : HttpMessageHandler
    {
        private HttpStatusCode _status = HttpStatusCode.OK;
        private byte[] _body = Array.Empty<byte>();
        private bool _declareLength = true;

        public System.Collections.Generic.List<HttpRequestMessage> Requests { get; } = new();

        public void Respond(HttpStatusCode status, byte[] body, bool declareLength = true)
        {
            _status = status;
            _body = body;
            _declareLength = declareLength;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            var content = new StreamContent(new System.IO.MemoryStream(_body));
            if (_declareLength)
            {
                content.Headers.ContentLength = _body.LongLength;
            }

            return Task.FromResult(new HttpResponseMessage(_status) { Content = content });
        }
    }
}
