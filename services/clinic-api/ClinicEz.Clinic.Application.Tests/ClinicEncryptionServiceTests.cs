using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Records.Commands;
using ClinicEz.Clinic.Application.Features.Records.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services.Storage;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicEncryptionServiceTests
{
    private readonly ClinicEncryptionService _encryptionService;
    private readonly string _testTenantId = "tenant-st-luke";
    private readonly Guid _testClinicId = Guid.NewGuid();

    public ClinicEncryptionServiceTests()
    {
        _encryptionService = new ClinicEncryptionService();
    }

    [Fact]
    public async Task EncryptAsync_ShouldProduceValidCiphertextAndMetadata()
    {
        var plaintext = Encoding.UTF8.GetBytes("%PDF-1.7 Sample Medical Clearance Document Content 2026");

        var result = await _encryptionService.EncryptAsync(plaintext, _testTenantId, _testClinicId, CancellationToken.None);

        result.Should().NotBeNull();
        result.Ciphertext.Should().NotBeNull();
        result.Ciphertext.Length.Should().Be(plaintext.Length);
        result.Ciphertext.Should().NotEqual(plaintext); // Must be encrypted, not plaintext!

        result.IvBase64.Should().NotBeNullOrWhiteSpace();
        Convert.FromBase64String(result.IvBase64).Length.Should().Be(12);

        result.TagBase64.Should().NotBeNullOrWhiteSpace();
        Convert.FromBase64String(result.TagBase64).Length.Should().Be(16);

        result.EncryptedHash.Should().HaveLength(64); // SHA-256 hex string
        result.EncryptedSizeBytes.Should().Be(plaintext.Length);
        result.WrappedKeyJson.Should().Contain("AES-256-GCM");
        result.EncryptionAlgorithm.Should().Be("AES-256-GCM");
    }

    [Fact]
    public async Task DecryptAsync_ShouldRestoreOriginalPlaintext()
    {
        var originalText = "Confidential Patient Diagnostic Report: Normal pulmonary vascularity, no infiltrates.";
        var plaintext = Encoding.UTF8.GetBytes(originalText);

        var encrypted = await _encryptionService.EncryptAsync(plaintext, _testTenantId, _testClinicId, CancellationToken.None);

        var decryptedBytes = await _encryptionService.DecryptAsync(
            encrypted.Ciphertext,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            _testTenantId,
            _testClinicId,
            CancellationToken.None);

        var decryptedText = Encoding.UTF8.GetString(decryptedBytes);
        decryptedText.Should().Be(originalText);
    }

    [Fact]
    public async Task DecryptToStreamAsync_ShouldRestoreOriginalStreamContent()
    {
        var originalData = new byte[1024 * 64]; // 64 KB binary sample
        RandomNumberGenerator.Fill(originalData);

        using var inputStream = new MemoryStream(originalData);
        var encrypted = await _encryptionService.EncryptAsync(inputStream, _testTenantId, _testClinicId, CancellationToken.None);

        using var cipherStream = new MemoryStream(encrypted.Ciphertext);
        using var outputStream = await _encryptionService.DecryptToStreamAsync(
            cipherStream,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            _testTenantId,
            _testClinicId,
            CancellationToken.None);

        var outputBytes = outputStream.ToArray();
        outputBytes.Should().Equal(originalData);
    }

    [Fact]
    public async Task DecryptAsync_WithTamperedCiphertext_ShouldThrowCryptographicException()
    {
        var plaintext = Encoding.UTF8.GetBytes("Critical Diagnostic Values: Potassium 4.2 mEq/L");
        var encrypted = await _encryptionService.EncryptAsync(plaintext, _testTenantId, _testClinicId, CancellationToken.None);

        // Tamper with a single byte in ciphertext
        var tamperedCiphertext = (byte[])encrypted.Ciphertext.Clone();
        tamperedCiphertext[0] ^= 0xFF;

        var act = () => _encryptionService.DecryptAsync(
            tamperedCiphertext,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            _testTenantId,
            _testClinicId,
            CancellationToken.None);

        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task DecryptAsync_WithTamperedTag_ShouldThrowCryptographicException()
    {
        var plaintext = Encoding.UTF8.GetBytes("Standard Lab Results");
        var encrypted = await _encryptionService.EncryptAsync(plaintext, _testTenantId, _testClinicId, CancellationToken.None);

        var tagBytes = Convert.FromBase64String(encrypted.TagBase64);
        tagBytes[0] ^= 0xAA;
        var tamperedTagBase64 = Convert.ToBase64String(tagBytes);

        var act = () => _encryptionService.DecryptAsync(
            encrypted.Ciphertext,
            encrypted.IvBase64,
            tamperedTagBase64,
            encrypted.WrappedKeyJson,
            _testTenantId,
            _testClinicId,
            CancellationToken.None);

        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task DecryptAsync_WithDifferentClinicId_ShouldThrowCryptographicException()
    {
        var plaintext = Encoding.UTF8.GetBytes("Hospital Facility Secret Clearance");
        var encrypted = await _encryptionService.EncryptAsync(plaintext, _testTenantId, _testClinicId, CancellationToken.None);

        var differentClinicId = Guid.NewGuid();

        var act = () => _encryptionService.DecryptAsync(
            encrypted.Ciphertext,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            _testTenantId,
            differentClinicId, // Different clinic key!
            CancellationToken.None);

        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task DecryptAsync_WithDifferentTenantId_ShouldThrowCryptographicException()
    {
        var plaintext = Encoding.UTF8.GetBytes("Hospital Facility Secret Clearance");
        var encrypted = await _encryptionService.EncryptAsync(plaintext, _testTenantId, _testClinicId, CancellationToken.None);

        var differentTenantId = "tenant-other-hospital";

        var act = () => _encryptionService.DecryptAsync(
            encrypted.Ciphertext,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            differentTenantId, // Different tenant key!
            _testClinicId,
            CancellationToken.None);

        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task RecordsAttachment_UploadWithEncryptionMetadata_ShouldPersistAndReturnEncryptionDetails()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_testClinicId);
        clinicContext.TenantId.Returns(_testTenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicRecordAttachment>(context, sieve);
        var uploadHandler = new UploadRecordAttachmentCommandHandler(repo, uow, clinicContext);
        var queryHandler = new GetPatientRecordAttachmentsQueryHandler(repo);

        var patientId = Guid.NewGuid();
        var plaintext = Encoding.UTF8.GetBytes("Outside Chest X-Ray DICOM Report");
        var encrypted = await _encryptionService.EncryptAsync(plaintext, _testTenantId, _testClinicId, CancellationToken.None);

        var command = new UploadRecordAttachmentCommand(
            PatientId: patientId,
            ConsultationId: null,
            RecordType: "OutsideChestXRay",
            Title: "Outside Chest X-Ray Film",
            FileName: "cxr-scan.cez",
            ContentType: "application/octet-stream",
            FileSizeBytes: plaintext.Length,
            StorageUri: $"tenants/{_testTenantId}/clinics/{_testClinicId}/records/cxr-scan.cez",
            DocumentDate: DateOnly.FromDateTime(DateTime.UtcNow),
            Notes: "Encrypted at rest with Clinic CMK",
            UploadedByStaffName: "Radiology Tech",
            VerificationStatus: "Verified",
            EncryptionAlgorithm: encrypted.EncryptionAlgorithm,
            EncryptionKeyId: "cmk-v1",
            EncryptionIvBase64: encrypted.IvBase64,
            EncryptionTagBase64: encrypted.TagBase64,
            EncryptedSizeBytes: encrypted.EncryptedSizeBytes,
            EncryptedHash: encrypted.EncryptedHash,
            WrappedKeyJson: encrypted.WrappedKeyJson
        );

        var attachment = await uploadHandler.Handle(command, CancellationToken.None);

        attachment.Should().NotBeNull();
        attachment.EncryptionAlgorithm.Should().Be("AES-256-GCM");
        attachment.EncryptionKeyId.Should().Be("cmk-v1");
        attachment.EncryptedSizeBytes.Should().Be(plaintext.Length);
        attachment.EncryptedHash.Should().Be(encrypted.EncryptedHash);

        var list = await queryHandler.Handle(new GetPatientRecordAttachmentsQuery(patientId), CancellationToken.None);
        list.Should().HaveCount(1);
        list[0].EncryptionAlgorithm.Should().Be("AES-256-GCM");
        list[0].EncryptedHash.Should().Be(encrypted.EncryptedHash);
    }
}
