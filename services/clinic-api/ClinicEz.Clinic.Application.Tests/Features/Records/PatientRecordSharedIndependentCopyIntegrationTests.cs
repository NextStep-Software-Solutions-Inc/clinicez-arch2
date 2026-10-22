using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Amazon.S3;
using Amazon.S3.Model;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services.Storage;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Records;

public sealed class PatientRecordSharedIndependentCopyIntegrationTests
{
    private const string TenantA = "tenant_metro_health";
    private const string TenantB = "tenant_st_luke";
    private const string MasterSecret = "clinic-encryption-master-secret-at-least-32-chars!";
    private static readonly byte[] OriginalPlaintext = Encoding.UTF8.GetBytes(
        "%PDF-1.4 CONFIDENTIAL CLINICAL LAB REPORT: Fasting Blood Sugar 92 mg/dL, HbA1c 5.4%");

    private readonly Guid _clinicIdA = Guid.NewGuid();
    private readonly Guid _clinicIdB = Guid.NewGuid();
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();
    private readonly ConcurrentDictionary<string, byte[]> _sharedS3Bucket = new();
    private readonly ClinicEncryptionService _clinicEncryption;
    private readonly S3ClinicStorageAdapter _storageAdapter;

    public PatientRecordSharedIndependentCopyIntegrationTests()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                [ClinicEncryptionKeyRing.MasterSecretKey] = MasterSecret
            })
            .Build();
        var keyRing = ClinicEncryptionKeyRing.FromConfiguration(config);
        _clinicEncryption = new ClinicEncryptionService(keyRing);

        var mockS3 = Substitute.For<IAmazonS3>();
        mockS3.PutObjectAsync(Arg.Any<PutObjectRequest>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var req = call.Arg<PutObjectRequest>();
                using var ms = new MemoryStream();
                req.InputStream.CopyTo(ms);
                _sharedS3Bucket[req.Key] = ms.ToArray();
                return new PutObjectResponse { HttpStatusCode = HttpStatusCode.OK };
            });

        mockS3.GetObjectAsync(Arg.Any<GetObjectRequest>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var req = call.Arg<GetObjectRequest>();
                if (!_sharedS3Bucket.TryGetValue(req.Key, out var bytes))
                    throw new AmazonS3Exception("NotFound") { StatusCode = HttpStatusCode.NotFound };

                return new GetObjectResponse
                {
                    HttpStatusCode = HttpStatusCode.OK,
                    ResponseStream = new MemoryStream(bytes)
                };
            });

        _storageAdapter = new S3ClinicStorageAdapter(mockS3, "clinicez-storage-bucket", NullLogger<S3ClinicStorageAdapter>.Instance);
    }

    [Fact]
    public async Task PatientRecordShared_SavesIndependentCMKCopy_SurvivesPatientSideDeletion_AndDecryptsSuccessfully()
    {
        // -----------------------------------------------------------------------------------------
        // ARRANGE: Setup Clinic A, Patient, and Booking
        // -----------------------------------------------------------------------------------------
        MessagingTestKit.SeedClinic(_db, _clinicIdA, TenantA);
        var syncPatientId = Guid.NewGuid();
        var patient = Phase3TestKit.NewPatient(_clinicIdA, TenantA, syncPatientId);
        _db.Patients.Add(patient);

        var draftId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = TenantA,
            ClinicId = _clinicIdA,
            PatientId = patient.Id,
            PatientName = "Maria Santos",
            DraftId = draftId
        };
        _db.Appointments.Add(appointment);
        await _db.SaveChangesAsync();

        var fileId = Guid.NewGuid();
        var patientStorageKey = $"patients/{syncPatientId}/records/{fileId}.cez";
        var clinicStorageKey = $"tenants/{TenantA}/clinics/{_clinicIdA}/records/{fileId}.cez";

        // 1. Simulate Patient API storing the record in the shared bucket under the patient prefix
        var fakePatientCiphertext = Encoding.UTF8.GetBytes("PATIENT_PMK_WRAPPED_ENCRYPTED_BLOB");
        _sharedS3Bucket[patientStorageKey] = fakePatientCiphertext;

        // 2. Setup HTTP handler delivering the decrypted plaintext stream from patient-api
        var stubHttp = new StubPlaintextHttpHandler(OriginalPlaintext);
        var httpClientFactory = Substitute.For<IHttpClientFactory>();
        httpClientFactory.CreateClient(PatientRecordSharedHandler.HttpClientName)
            .Returns(new HttpClient(stubHttp));

        var handler = new PatientRecordSharedHandler(
            _db,
            MessagingTestKit.Recipient(_db),
            httpClientFactory,
            _clinicEncryption,
            _storageAdapter,
            NullLogger<PatientRecordSharedHandler>.Instance);

        var payload = new PatientRecordSharedPayload
        {
            DraftId = draftId,
            PatientId = syncPatientId,
            FileId = fileId,
            FileName = "blood_sugar_report.pdf",
            MimeType = "application/pdf",
            SizeBytes = OriginalPlaintext.Length,
            DocumentTypeCode = "lab",
            DownloadUrl = "https://patient-api.example.test/stream/abc?sig=1",
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(15)
        };

        var messageContext = MessagingTestKit.Delivered(
            InteropTypes.PatientRecordShared,
            Party.ForPatient(syncPatientId.ToString()),
            MessagingTestKit.ClinicParty(TenantA, _clinicIdA),
            draftId,
            payload);

        // -----------------------------------------------------------------------------------------
        // ACT 1: Deliver shared record to Clinic A
        // -----------------------------------------------------------------------------------------
        await handler.HandleAsync(payload, messageContext, CancellationToken.None);

        // -----------------------------------------------------------------------------------------
        // ASSERT 1: Verify Clinic A created independent CMK-encrypted attachment
        // -----------------------------------------------------------------------------------------
        _sharedS3Bucket.Should().ContainKey(clinicStorageKey);
        var clinicCiphertext = _sharedS3Bucket[clinicStorageKey];
        clinicCiphertext.Should().NotEqual(OriginalPlaintext);
        clinicCiphertext.Should().NotEqual(fakePatientCiphertext);

        var attachment = await _db.RecordAttachments.IgnoreQueryFilters().SingleAsync(a => a.Id == fileId);
        attachment.ClinicId.Should().Be(_clinicIdA);
        attachment.PatientId.Should().Be(patient.Id);
        attachment.StorageUri.Should().Be(clinicStorageKey);
        attachment.EncryptionAlgorithm.Should().Be("AES-256-GCM");
        attachment.EncryptionIvBase64.Should().NotBeNullOrWhiteSpace();
        attachment.EncryptionTagBase64.Should().NotBeNullOrWhiteSpace();
        attachment.WrappedKeyJson.Should().NotBeNullOrWhiteSpace();

        // -----------------------------------------------------------------------------------------
        // ACT 2: Simulate Patient calling DELETE /patients/{patientId}/records/{fileId}
        // -----------------------------------------------------------------------------------------
        _sharedS3Bucket.TryRemove(patientStorageKey, out _).Should().BeTrue("patient file is deleted");

        // -----------------------------------------------------------------------------------------
        // ASSERT 2: Independent Copy Guarantee
        // -----------------------------------------------------------------------------------------
        // (a) Patient copy is permanently gone
        _sharedS3Bucket.Should().NotContainKey(patientStorageKey);

        // (b) Clinic A copy remains 100% intact
        _sharedS3Bucket.Should().ContainKey(clinicStorageKey);
        var preservedClinicCiphertext = await _storageAdapter.ReadEncryptedFileAsync(clinicStorageKey);
        preservedClinicCiphertext.Should().Equal(clinicCiphertext);

        // (c) Clinic A can decrypt its copy back to the exact original plaintext
        var decryptedPlaintext = await _clinicEncryption.DecryptAsync(
            preservedClinicCiphertext,
            attachment.EncryptionIvBase64!,
            attachment.EncryptionTagBase64!,
            attachment.WrappedKeyJson!,
            TenantA,
            _clinicIdA);

        decryptedPlaintext.Should().Equal(OriginalPlaintext);
        Encoding.UTF8.GetString(decryptedPlaintext).Should().Be(
            "%PDF-1.4 CONFIDENTIAL CLINICAL LAB REPORT: Fasting Blood Sugar 92 mg/dL, HbA1c 5.4%");

        // (d) Cryptographic Isolation: Clinic B cannot decrypt Clinic A's attachment
        var actWrongClinic = () => _clinicEncryption.DecryptAsync(
            preservedClinicCiphertext,
            attachment.EncryptionIvBase64!,
            attachment.EncryptionTagBase64!,
            attachment.WrappedKeyJson!,
            TenantB,
            _clinicIdB);

        await actWrongClinic.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task PatientRecordShared_WithFileBase64_StoresCMKCopyDirectlyWithoutNetworkDownload()
    {
        // Arrange
        MessagingTestKit.SeedClinic(_db, _clinicIdA, TenantA);
        var syncPatientId = Guid.NewGuid();
        var patient = Phase3TestKit.NewPatient(_clinicIdA, TenantA, syncPatientId);
        _db.Patients.Add(patient);

        var draftId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = TenantA,
            ClinicId = _clinicIdA,
            PatientId = patient.Id,
            PatientName = "Maria Santos",
            DraftId = draftId
        };
        _db.Appointments.Add(appointment);
        await _db.SaveChangesAsync();

        var fileId = Guid.NewGuid();
        var clinicStorageKey = $"tenants/{TenantA}/clinics/{_clinicIdA}/records/{fileId}.cez";

        var httpClientFactory = Substitute.For<IHttpClientFactory>();

        var handler = new PatientRecordSharedHandler(
            _db,
            MessagingTestKit.Recipient(_db),
            httpClientFactory,
            _clinicEncryption,
            _storageAdapter,
            NullLogger<PatientRecordSharedHandler>.Instance);

        var payload = new PatientRecordSharedPayload
        {
            DraftId = draftId,
            PatientId = syncPatientId,
            FileId = fileId,
            FileName = "cbc_report.pdf",
            MimeType = "application/pdf",
            SizeBytes = OriginalPlaintext.Length,
            DocumentTypeCode = "lab",
            FileBase64 = Convert.ToBase64String(OriginalPlaintext),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(15)
        };

        var messageContext = MessagingTestKit.Delivered(
            InteropTypes.PatientRecordShared,
            Party.ForPatient(syncPatientId.ToString()),
            MessagingTestKit.ClinicParty(TenantA, _clinicIdA),
            draftId,
            payload);

        // Act
        await handler.HandleAsync(payload, messageContext, CancellationToken.None);

        // Assert: HTTP client was never contacted
        httpClientFactory.DidNotReceiveWithAnyArgs().CreateClient(default!);

        // Assert: Stored in clinic bucket under CMK
        _sharedS3Bucket.Should().ContainKey(clinicStorageKey);
        var storedCiphertext = await _storageAdapter.ReadEncryptedFileAsync(clinicStorageKey);

        var attachment = await _db.RecordAttachments.IgnoreQueryFilters().SingleAsync(a => a.Id == fileId);
        var decrypted = await _clinicEncryption.DecryptAsync(
            storedCiphertext,
            attachment.EncryptionIvBase64!,
            attachment.EncryptionTagBase64!,
            attachment.WrappedKeyJson!,
            TenantA,
            _clinicIdA);

        decrypted.Should().Equal(OriginalPlaintext);
    }

    [Fact]
    public async Task ExternalLabResult_StoresIndependentCMKCopy_AndDecryptsSuccessfully()
    {
        // Arrange
        MessagingTestKit.SeedClinic(_db, _clinicIdA, TenantA);
        var syncPatientId = Guid.NewGuid();
        var patient = Phase3TestKit.NewPatient(_clinicIdA, TenantA, syncPatientId);
        _db.Patients.Add(patient);

        var order = Phase3TestKit.NewLabOrder(_clinicIdA, TenantA, patient.Id);
        _db.LabOrders.Add(order);
        await _db.SaveChangesAsync();

        var realFileStore = new ClinicEz.Clinic.Infrastructure.Services.LabResultFileStore(_clinicEncryption, _storageAdapter);
        var intake = Phase3TestKit.Intake(_db, realFileStore);
        var grants = Phase3TestKit.Grants(_db);
        var handler = new LabResultExternalSubmittedHandler(
            _db,
            MessagingTestKit.Recipient(_db),
            grants,
            intake,
            NullLogger<LabResultExternalSubmittedHandler>.Instance);

        var payload = new ExternalLabResultUploadedEvent
        {
            RequisitionId = order.Id,
            PatientId = syncPatientId,
            FileBase64 = Convert.ToBase64String(OriginalPlaintext),
            FileName = "holter.pdf",
            ContentType = "application/pdf",
            DocumentType = "PDF",
            ExternalLabName = "Cardio Diagnostic Center"
        };

        var context = MessagingTestKit.Delivered(
            InteropTypes.LabResultExternalSubmitted,
            Party.ForPatient(syncPatientId.ToString()),
            MessagingTestKit.ClinicParty(TenantA, _clinicIdA),
            order.Id,
            payload);

        // Act
        await handler.HandleAsync(payload, context, CancellationToken.None);

        // Assert
        var result = await _db.LabResults.IgnoreQueryFilters().SingleAsync(r => r.LabOrderId == order.Id);
        result.StorageKey.Should().StartWith($"tenants/{TenantA}/clinics/{_clinicIdA}/lab-results/").And.EndWith(".cez");
        _sharedS3Bucket.Should().ContainKey(result.StorageKey);

        var ciphertext = await _storageAdapter.ReadEncryptedFileAsync(result.StorageKey);
        ciphertext.Should().NotEqual(OriginalPlaintext);

        var decrypted = await realFileStore.ReadAsync(result, CancellationToken.None);
        decrypted.Should().Equal(OriginalPlaintext);
    }

    [Fact]
    public async Task PatientRecordShared_WithInvalidBase64_CatchesFormatExceptionAndSafelyDrops()
    {
        // Arrange
        MessagingTestKit.SeedClinic(_db, _clinicIdA, TenantA);
        var syncPatientId = Guid.NewGuid();
        var patient = Phase3TestKit.NewPatient(_clinicIdA, TenantA, syncPatientId);
        _db.Patients.Add(patient);

        var draftId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = TenantA,
            ClinicId = _clinicIdA,
            PatientId = patient.Id,
            PatientName = "Maria Santos",
            DraftId = draftId
        };
        _db.Appointments.Add(appointment);
        await _db.SaveChangesAsync();

        var fileId = Guid.NewGuid();
        var clinicStorageKey = $"tenants/{TenantA}/clinics/{_clinicIdA}/records/{fileId}.cez";

        var httpClientFactory = Substitute.For<IHttpClientFactory>();

        var handler = new PatientRecordSharedHandler(
            _db,
            MessagingTestKit.Recipient(_db),
            httpClientFactory,
            _clinicEncryption,
            _storageAdapter,
            NullLogger<PatientRecordSharedHandler>.Instance);

        var payload = new PatientRecordSharedPayload
        {
            DraftId = draftId,
            PatientId = syncPatientId,
            FileId = fileId,
            FileName = "malformed.pdf",
            MimeType = "application/pdf",
            SizeBytes = 100,
            DocumentTypeCode = "lab",
            FileBase64 = "!!THIS_IS_NOT_VALID_BASE64@@#$%",
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(15)
        };

        var messageContext = MessagingTestKit.Delivered(
            InteropTypes.PatientRecordShared,
            Party.ForPatient(syncPatientId.ToString()),
            MessagingTestKit.ClinicParty(TenantA, _clinicIdA),
            draftId,
            payload);

        // Act: should not throw FormatException
        var act = () => handler.HandleAsync(payload, messageContext, CancellationToken.None);
        await act.Should().NotThrowAsync();

        // Assert: No file written to storage or DB
        _sharedS3Bucket.Should().NotContainKey(clinicStorageKey);
        var attachment = await _db.RecordAttachments.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == fileId);
        attachment.Should().BeNull();
    }

    [Fact]
    public async Task PatientRecordShared_WithEmptyBase64AndExpiredDownloadUrl_LogsWarningAndSafelyDrops()
    {
        // Arrange
        MessagingTestKit.SeedClinic(_db, _clinicIdA, TenantA);
        var syncPatientId = Guid.NewGuid();
        var patient = Phase3TestKit.NewPatient(_clinicIdA, TenantA, syncPatientId);
        _db.Patients.Add(patient);

        var draftId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = TenantA,
            ClinicId = _clinicIdA,
            PatientId = patient.Id,
            PatientName = "Maria Santos",
            DraftId = draftId
        };
        _db.Appointments.Add(appointment);
        await _db.SaveChangesAsync();

        var fileId = Guid.NewGuid();
        var clinicStorageKey = $"tenants/{TenantA}/clinics/{_clinicIdA}/records/{fileId}.cez";

        var httpClientFactory = Substitute.For<IHttpClientFactory>();

        var handler = new PatientRecordSharedHandler(
            _db,
            MessagingTestKit.Recipient(_db),
            httpClientFactory,
            _clinicEncryption,
            _storageAdapter,
            NullLogger<PatientRecordSharedHandler>.Instance);

        var payload = new PatientRecordSharedPayload
        {
            DraftId = draftId,
            PatientId = syncPatientId,
            FileId = fileId,
            FileName = "expired.pdf",
            MimeType = "application/pdf",
            SizeBytes = 100,
            DocumentTypeCode = "lab",
            FileBase64 = "",
            DownloadUrl = "https://patient-api.example.test/stream/expired?sig=1",
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-5) // EXPIRED!
        };

        var messageContext = MessagingTestKit.Delivered(
            InteropTypes.PatientRecordShared,
            Party.ForPatient(syncPatientId.ToString()),
            MessagingTestKit.ClinicParty(TenantA, _clinicIdA),
            draftId,
            payload);

        // Act
        var act = () => handler.HandleAsync(payload, messageContext, CancellationToken.None);
        await act.Should().NotThrowAsync();

        // Assert: HTTP client was never contacted
        httpClientFactory.DidNotReceiveWithAnyArgs().CreateClient(default!);

        // Assert: No file stored
        _sharedS3Bucket.Should().NotContainKey(clinicStorageKey);
    }

    private sealed class StubPlaintextHttpHandler : HttpMessageHandler
    {
        private readonly byte[] _content;
        public StubPlaintextHttpHandler(byte[] content) => _content = content;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(_content)
            };
            response.Content.Headers.ContentLength = _content.LongLength;
            response.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
            return Task.FromResult(response);
        }
    }
}
