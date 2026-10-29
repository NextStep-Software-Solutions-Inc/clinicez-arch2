using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Records.Commands;
using ClinicEz.Clinic.Application.Features.Records.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class RecordAttachmentHandlerTests
{
    [Fact]
    public async Task UploadAndEncryptRecordAttachment_SavesCiphertextAndCreatesVerifiedRecord()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var tenantId = "tenant_test";

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = TestDbHelper.CreateRepository<RecordAttachment>(context, sieve);

        var encryptionService = Substitute.For<IClinicEncryptionService>();
        var storageService = Substitute.For<IClinicStorageService>();

        var rawFileBytes = Encoding.UTF8.GetBytes("Official outside chest x-ray findings: normal heart, clear lungs.");
        var mockCiphertext = new byte[] { 0xDE, 0xAD, 0xBE, 0xEF };

        encryptionService.EncryptAsync(rawFileBytes, tenantId, clinicId, Arg.Any<CancellationToken>())
            .Returns(new ClinicEncryptedPayload(
                Ciphertext: mockCiphertext,
                IvBase64: "dGVzdEl2MTIzNA==",
                TagBase64: "dGVzdFRhZzEyMzQ1Njc4OQ==",
                EncryptedHash: "sha256hash123",
                EncryptedSizeBytes: mockCiphertext.Length,
                WrappedKeyJson: "{\"key\":\"wrapped\"}",
                EncryptionAlgorithm: "AES-256-GCM"
            ));

        var handler = new UploadAndEncryptRecordAttachmentCommandHandler(repo, uow, clinicContext, encryptionService, storageService);

        var command = new UploadAndEncryptRecordAttachmentCommand(
            PatientId: patientId,
            ConsultationId: null,
            RecordType: "OutsideChestXRay",
            Title: "Chest X-Ray PA View",
            FileName: "xray_film.pdf",
            ContentType: "application/pdf",
            FileBytes: rawFileBytes,
            Notes: "Verified at physical clinic",
            UploadedByStaffId: Guid.NewGuid(),
            UploadedByStaffName: "Nurse Joy"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientId.Should().Be(patientId);
        result.ClinicId.Should().Be(clinicId);
        result.VerificationStatus.Should().Be("Verified");
        result.EncryptionAlgorithm.Should().Be("AES-256-GCM");
        result.EncryptionKeyId.Should().Be("cmk-v1");
        result.EncryptedSizeBytes.Should().Be(mockCiphertext.Length);
        result.EncryptedHash.Should().Be("sha256hash123");

        // Verify storage save was called with the ciphertext
        await storageService.Received(1).SaveEncryptedFileAsync(
            Arg.Is<string>(k => k.Contains(tenantId) && k.Contains(clinicId.ToString()) && k.EndsWith(".cez")),
            mockCiphertext,
            Arg.Any<CancellationToken>()
        );

        // Verify database persistence
        var dbEntity = await context.RecordAttachments.FirstOrDefaultAsync(a => a.Id == result.Id);
        dbEntity.Should().NotBeNull();
        dbEntity!.VerificationStatus.Should().Be("Verified");
        dbEntity.UploadedByStaffName.Should().Be("Nurse Joy");
    }

    [Fact]
    public async Task IntakePatientSharedFile_UpsertsPendingVerificationRecordWithEncryption()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var sharedFileId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = TestDbHelper.CreateRepository<RecordAttachment>(context, sieve);

        var encryptionService = Substitute.For<IClinicEncryptionService>();
        var storageService = Substitute.For<IClinicStorageService>();

        var rawFileBytes = Encoding.UTF8.GetBytes("Patient mobile vault outside lab report.");
        var mockCiphertext = new byte[] { 0x01, 0x02, 0x03, 0x04 };

        encryptionService.EncryptAsync(rawFileBytes, tenantId, clinicId, Arg.Any<CancellationToken>())
            .Returns(new ClinicEncryptedPayload(
                Ciphertext: mockCiphertext,
                IvBase64: "aXYxMjM0NQ==",
                TagBase64: "dGFnMTIzNDU2Nzg5MA==",
                EncryptedHash: "hash-intake",
                EncryptedSizeBytes: mockCiphertext.Length,
                WrappedKeyJson: "{\"dek\":\"wrapped\"}",
                EncryptionAlgorithm: "AES-256-GCM"
            ));

        var handler = new IntakePatientSharedFileCommandHandler(repo, uow, clinicContext, encryptionService, storageService);

        var command = new IntakePatientSharedFileCommand(
            PatientId: patientId,
            AppointmentId: null,
            ConsultationId: null,
            FileId: sharedFileId,
            RecordType: "LabResult",
            Title: "CBC Blood Test",
            FileName: "cbc_report.pdf",
            ContentType: "application/pdf",
            FileBytes: rawFileBytes,
            Notes: "Shared during online booking draft"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Id.Should().Be(sharedFileId);
        result.PatientId.Should().Be(patientId);
        result.ClinicId.Should().Be(clinicId);
        result.VerificationStatus.Should().Be("PendingVerification");
        result.EncryptionAlgorithm.Should().Be("AES-256-GCM");

        await storageService.Received(1).SaveEncryptedFileAsync(
            $"tenants/{tenantId}/clinics/{clinicId}/records/{sharedFileId}.cez",
            mockCiphertext,
            Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public async Task DownloadRecordAttachment_WhenEncrypted_DecryptsAndReturnsPlaintext()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();
        var tenantId = "tenant_test";

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = TestDbHelper.CreateRepository<RecordAttachment>(context, sieve);

        var encryptionService = Substitute.For<IClinicEncryptionService>();
        var storageService = Substitute.For<IClinicStorageService>();

        var expectedPlaintext = Encoding.UTF8.GetBytes("Decrypted confidential medical content.");
        var mockCiphertext = new byte[] { 0xAA, 0xBB, 0xCC, 0xDD };
        var storageKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{attachmentId}.cez";

        var attachment = new RecordAttachment
        {
            Id = attachmentId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            RecordType = "OutsideChestXRay",
            Title = "X-Ray PA Film",
            FileName = "xray.pdf",
            ContentType = "application/pdf",
            FileSizeBytes = expectedPlaintext.Length,
            StorageUri = storageKey,
            VerificationStatus = "Verified",
            EncryptionAlgorithm = "AES-256-GCM",
            EncryptionKeyId = "cmk-v1",
            EncryptionIvBase64 = "ivBase64",
            EncryptionTagBase64 = "tagBase64",
            WrappedKeyJson = "{\"wrapped\":\"key\"}"
        };

        await context.RecordAttachments.AddAsync(attachment);
        await context.SaveChangesAsync();

        storageService.FileExistsAsync(storageKey, Arg.Any<CancellationToken>())
            .Returns(true);
        storageService.ReadEncryptedFileAsync(storageKey, Arg.Any<CancellationToken>())
            .Returns(mockCiphertext);

        encryptionService.DecryptAsync(mockCiphertext, "ivBase64", "tagBase64", "{\"wrapped\":\"key\"}", tenantId, clinicId, Arg.Any<CancellationToken>())
            .Returns(expectedPlaintext);

        var handler = new DownloadRecordAttachmentQueryHandler(repo, clinicContext, encryptionService, storageService);

        // Act
        var result = await handler.Handle(new DownloadRecordAttachmentQuery(attachmentId), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result!.FileName.Should().Be("xray.pdf");
        result.ContentType.Should().Be("application/pdf");
        result.FileBytes.Should().Equal(expectedPlaintext);
    }

    [Fact]
    public async Task DownloadRecordAttachment_WrongClinic_ReturnsNullDueToTenancyIsolation()
    {
        // Arrange
        var thisClinicId = Guid.NewGuid();
        var otherClinicId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(thisClinicId);
        clinicContext.TenantId.Returns("tenant_a");

        var (context, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = TestDbHelper.CreateRepository<RecordAttachment>(context, sieve);

        var encryptionService = Substitute.For<IClinicEncryptionService>();
        var storageService = Substitute.For<IClinicStorageService>();

        // Attachment belongs to otherClinicId
        var attachment = new RecordAttachment
        {
            Id = attachmentId,
            TenantId = "tenant_b",
            ClinicId = otherClinicId,
            PatientId = Guid.NewGuid(),
            RecordType = "LabResult",
            Title = "Blood Test",
            FileName = "lab.pdf",
            StorageUri = "records/other.cez",
            VerificationStatus = "Verified"
        };

        await context.RecordAttachments.AddAsync(attachment);
        await context.SaveChangesAsync();

        var handler = new DownloadRecordAttachmentQueryHandler(repo, clinicContext, encryptionService, storageService);

        // Act
        var result = await handler.Handle(new DownloadRecordAttachmentQuery(attachmentId), CancellationToken.None);

        // Assert: Access rejected due to jurisdictional boundary
        result.Should().BeNull();
    }

    [Fact]
    public async Task DownloadRecordAttachment_StorageFileNotFound_ReturnsNull()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant_test");

        var (context, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = TestDbHelper.CreateRepository<RecordAttachment>(context, sieve);

        var encryptionService = Substitute.For<IClinicEncryptionService>();
        var storageService = Substitute.For<IClinicStorageService>();

        var attachment = new RecordAttachment
        {
            Id = attachmentId,
            TenantId = "tenant_test",
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            RecordType = "LabResult",
            Title = "Blood Test",
            FileName = "lab.pdf",
            StorageUri = "missing/path/file.cez",
            VerificationStatus = "Verified"
        };

        await context.RecordAttachments.AddAsync(attachment);
        await context.SaveChangesAsync();

        storageService.FileExistsAsync("missing/path/file.cez", Arg.Any<CancellationToken>())
            .Returns(false);

        var handler = new DownloadRecordAttachmentQueryHandler(repo, clinicContext, encryptionService, storageService);

        // Act
        var result = await handler.Handle(new DownloadRecordAttachmentQuery(attachmentId), CancellationToken.None);

        // Assert
        result.Should().BeNull();
    }
}
