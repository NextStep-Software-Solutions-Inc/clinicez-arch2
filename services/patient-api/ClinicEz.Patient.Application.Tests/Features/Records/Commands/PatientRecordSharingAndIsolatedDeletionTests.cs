using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.SubmitBookingDraft;
using ClinicEz.Patient.Application.Features.Records.Commands;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Interfaces;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Records.Commands;

public sealed class PatientRecordSharingAndIsolatedDeletionTests
{
    private readonly IFileRecordRepository _fileRepo = Substitute.For<IFileRecordRepository>();
    private readonly IStorageService _storage = Substitute.For<IStorageService>();
    private readonly ICurrentUserService _currentUser = Substitute.For<ICurrentUserService>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();

    [Fact]
    public async Task DeleteRecord_RemovesPatientStorageKey_AndNeverAffectsClinicStorageKeys()
    {
        var patientId = Guid.NewGuid();
        var fileId = Guid.NewGuid();
        var patientKey = $"patients/{patientId}/records/{fileId}.cez";

        var record = new FileRecord
        {
            Id = fileId,
            PatientId = patientId,
            FileName = "xray.pdf",
            StorageKey = patientKey,
            IsDeleted = false
        };

        _fileRepo.GetByIdAndPatientIdAsync(fileId, patientId, Arg.Any<CancellationToken>())
            .Returns(record);
        _currentUser.UserId.Returns($"clerk_{patientId:N}");

        var handler = new DeletePatientRecordCommandHandler(
            _fileRepo, _storage, _currentUser, _uow, NullLogger<DeletePatientRecordCommandHandler>.Instance);

        // Act
        await handler.Handle(new DeletePatientRecordCommand(patientId, fileId), CancellationToken.None);

        // Assert: Soft-deleted in patient DB
        record.IsDeleted.Should().BeTrue();
        record.DeletedAt.Should().NotBeNull();
        _fileRepo.Received(1).Update(record);
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());

        // Assert: Patient key removed from storage
        await _storage.Received(1).DeleteAsync(patientKey, Arg.Any<CancellationToken>());

        // Assert: Storage service NEVER received deletion requests for foreign clinic prefixes
        await _storage.DidNotReceive().DeleteAsync(Arg.Is<string>(k => k.StartsWith("tenants/")), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DeleteRecord_WhenRecordNotFound_CompletesIdempotentlyWithoutCallingStorageOrUow()
    {
        var patientId = Guid.NewGuid();
        var fileId = Guid.NewGuid();

        _fileRepo.GetByIdAndPatientIdAsync(fileId, patientId, Arg.Any<CancellationToken>())
            .Returns((FileRecord?)null);

        var handler = new DeletePatientRecordCommandHandler(
            _fileRepo, _storage, _currentUser, _uow, NullLogger<DeletePatientRecordCommandHandler>.Instance);

        // Act
        await handler.Handle(new DeletePatientRecordCommand(patientId, fileId), CancellationToken.None);

        // Assert: Idempotent return - no storage delete, no DB update, no save
        _fileRepo.DidNotReceive().Update(Arg.Any<FileRecord>());
        await _storage.DidNotReceive().DeleteAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
        await _uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DeleteRecord_WhenStorageKeyIsNullOrWhitespace_SoftDeletesWithoutCallingStorage()
    {
        var patientId = Guid.NewGuid();
        var fileId = Guid.NewGuid();

        var record = new FileRecord
        {
            Id = fileId,
            PatientId = patientId,
            FileName = "notes.txt",
            StorageKey = "   ",
            IsDeleted = false
        };

        _fileRepo.GetByIdAndPatientIdAsync(fileId, patientId, Arg.Any<CancellationToken>())
            .Returns(record);

        var handler = new DeletePatientRecordCommandHandler(
            _fileRepo, _storage, _currentUser, _uow, NullLogger<DeletePatientRecordCommandHandler>.Instance);

        // Act
        await handler.Handle(new DeletePatientRecordCommand(patientId, fileId), CancellationToken.None);

        // Assert
        record.IsDeleted.Should().BeTrue();
        _fileRepo.Received(1).Update(record);
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
        await _storage.DidNotReceive().DeleteAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DeleteRecord_WhenStorageThrowsException_CatchesGracefullyAndStillSoftDeletes()
    {
        var patientId = Guid.NewGuid();
        var fileId = Guid.NewGuid();
        var patientKey = $"patients/{patientId}/records/{fileId}.cez";

        var record = new FileRecord
        {
            Id = fileId,
            PatientId = patientId,
            FileName = "xray.pdf",
            StorageKey = patientKey,
            IsDeleted = false
        };

        _fileRepo.GetByIdAndPatientIdAsync(fileId, patientId, Arg.Any<CancellationToken>())
            .Returns(record);
        _storage.DeleteAsync(patientKey, Arg.Any<CancellationToken>())
            .ThrowsAsync(new IOException("S3 storage connection timed out"));

        var handler = new DeletePatientRecordCommandHandler(
            _fileRepo, _storage, _currentUser, _uow, NullLogger<DeletePatientRecordCommandHandler>.Instance);

        // Act: should not throw
        var act = () => handler.Handle(new DeletePatientRecordCommand(patientId, fileId), CancellationToken.None);
        await act.Should().NotThrowAsync();

        // Assert: Database soft delete still committed
        record.IsDeleted.Should().BeTrue();
        _fileRepo.Received(1).Update(record);
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public void DeleteRecord_StructuralIsolation_HasNoClinicDbOrInteropOutboxDependencies()
    {
        var constructorParams = typeof(DeletePatientRecordCommandHandler).GetConstructors()[0].GetParameters();
        var paramTypes = constructorParams.Select(p => p.ParameterType.Name).ToList();

        // Must ONLY depend on patient-local services: file repo, storage, current user, uow, logger
        paramTypes.Should().Contain(nameof(IFileRecordRepository));
        paramTypes.Should().Contain(nameof(IStorageService));
        paramTypes.Should().Contain(nameof(ICurrentUserService));
        paramTypes.Should().Contain(nameof(IUnitOfWork));

        // Must NEVER depend on clinic repositories or interop messaging
        paramTypes.Should().NotContain(t => t.Contains("Clinic", StringComparison.OrdinalIgnoreCase) && !t.Contains("ClinicEz"));
        paramTypes.Should().NotContain(t => t.Contains("Interop", StringComparison.OrdinalIgnoreCase));
        paramTypes.Should().NotContain(t => t.Contains("Outbox", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task SubmitBookingDraft_WhenAttachmentFailsDecryption_FallsBackToDownloadUrlWithoutThrowing()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var fileId = Guid.NewGuid();
        var storageKey = $"patients/{patientId}/records/{fileId}.cez";

        var draftRepo = Substitute.For<IBookingDraftRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();
        var uow = Substitute.For<IUnitOfWork>();
        var membershipRepo = Substitute.For<IClinicMembershipRepository>();
        var publisher = Substitute.For<IInteropPublisher>();
        var patientRepo = Substitute.For<IPatientRepository>();
        var accessRepo = Substitute.For<IPatientAccessRepository>();
        var storage = Substitute.For<IStorageService>();
        var fileRepo = Substitute.For<IFileRecordRepository>();
        var encryptionService = Substitute.For<IPatientEncryptionService>();

        var draft = new BookingDraft
        {
            Id = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            Status = BookingDraftStatus.Draft,
            PreferredDate = new DateOnly(2026, 10, 25),
            PreferredTime = "09:00",
            AttachedFileIdsJson = JsonSerializer.Serialize(new List<Guid> { fileId })
        };
        draftRepo.GetByIdAsync(draftId, Arg.Any<CancellationToken>()).Returns(draft);

        var clinic = new Clinic { Id = clinicId, Name = "St. Jude Clinic", TenantId = "tenant-stjude", IsPublic = true };
        clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);

        var patient = new Domain.Entities.Patient
        {
            Id = patientId,
            FirstName = "Pedro",
            LastName = "Penduko",
            DateOfBirth = new DateOnly(1985, 5, 10),
            Mobile = "+639181112233"
        };
        patientRepo.GetWithProfileAsync(patientId, Arg.Any<CancellationToken>()).Returns(patient);

        var fileRecord = new FileRecord
        {
            Id = fileId,
            PatientId = patientId,
            FileName = "mri_scan.pdf",
            MimeType = "application/pdf",
            SizeBytes = 1024,
            StorageKey = storageKey,
            WrappedKeyJson = "{\"dek\":\"corrupted\"}",
            EncryptionIvBase64 = "iv123",
            EncryptionTagBase64 = "tag123"
        };
        fileRepo.GetByIdAsync(fileId, Arg.Any<CancellationToken>())
            .Returns(fileRecord);

        storage.GeneratePresignedDownloadUrlAsync(storageKey, Arg.Any<TimeSpan>(), Arg.Any<CancellationToken>())
            .Returns("https://r2.example.test/stream/mri_scan.pdf?sig=valid");
        storage.DownloadAsync(storageKey, Arg.Any<CancellationToken>())
            .Returns(new byte[] { 1, 2, 3, 4 });

        // Decryption fails with CryptographicException
        encryptionService.DecryptAsync(
            Arg.Any<byte[]>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new CryptographicException("Decryption authentication tag mismatch"));

        PatientRecordSharedPayload? enqueuedPayload = null;
        publisher.Enqueue(
            InteropTypes.PatientRecordShared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            draftId,
            Arg.Any<PatientRecordSharedPayload>(),
            Arg.Any<int>(),
            Arg.Any<TimeSpan?>())
            .Returns(call =>
            {
                enqueuedPayload = call.ArgAt<PatientRecordSharedPayload>(4);
                return InteropEnvelope.Create(call.ArgAt<string>(0), call.ArgAt<Party>(1), call.ArgAt<Party>(2), draftId, enqueuedPayload);
            });

        var snapshots = new PatientShareSnapshotBuilder(patientRepo, Substitute.For<IPatientDocumentRepository>());
        var handler = new SubmitBookingDraftCommandHandler(
            draftRepo, clinicRepo, uow, membershipRepo, publisher,
            patientRepo, accessRepo, storage,
            Options.Create(new SharingOptions { BookingGrantDays = 30 }),
            snapshots, fileRepo, encryptionService);

        // Act
        var result = await handler.Handle(new SubmitBookingDraftCommand(patientId, draftId), CancellationToken.None);

        // Assert: Booking submitted successfully
        result.Should().Be($"PENDING-{draftId:N}");
        draft.Status.Should().Be(BookingDraftStatus.Ready);

        // Assert: Enqueued attachment degraded gracefully (FileBase64 is null, DownloadUrl is present)
        enqueuedPayload.Should().NotBeNull();
        enqueuedPayload!.FileId.Should().Be(fileId);
        enqueuedPayload.FileBase64.Should().BeNull("decryption failed so inline bytes are omitted");
        enqueuedPayload.DownloadUrl.Should().Be("https://r2.example.test/stream/mri_scan.pdf?sig=valid");
    }

    [Fact]
    public async Task SubmitBookingDraft_WhenAttachmentDownloadFails_FallsBackToDownloadUrlWithoutThrowing()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var fileId = Guid.NewGuid();
        var storageKey = $"patients/{patientId}/records/{fileId}.cez";

        var draftRepo = Substitute.For<IBookingDraftRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();
        var uow = Substitute.For<IUnitOfWork>();
        var membershipRepo = Substitute.For<IClinicMembershipRepository>();
        var publisher = Substitute.For<IInteropPublisher>();
        var patientRepo = Substitute.For<IPatientRepository>();
        var accessRepo = Substitute.For<IPatientAccessRepository>();
        var storage = Substitute.For<IStorageService>();
        var fileRepo = Substitute.For<IFileRecordRepository>();
        var encryptionService = Substitute.For<IPatientEncryptionService>();

        var draft = new BookingDraft
        {
            Id = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            Status = BookingDraftStatus.Draft,
            PreferredDate = new DateOnly(2026, 10, 25),
            PreferredTime = "09:00",
            AttachedFileIdsJson = JsonSerializer.Serialize(new List<Guid> { fileId })
        };
        draftRepo.GetByIdAsync(draftId, Arg.Any<CancellationToken>()).Returns(draft);

        var clinic = new Clinic { Id = clinicId, Name = "St. Jude Clinic", TenantId = "tenant-stjude", IsPublic = true };
        clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>()).Returns(clinic);

        var patient = new Domain.Entities.Patient
        {
            Id = patientId,
            FirstName = "Pedro",
            LastName = "Penduko",
            DateOfBirth = new DateOnly(1985, 5, 10),
            Mobile = "+639181112233"
        };
        patientRepo.GetWithProfileAsync(patientId, Arg.Any<CancellationToken>()).Returns(patient);

        var fileRecord = new FileRecord
        {
            Id = fileId,
            PatientId = patientId,
            FileName = "lab_report.pdf",
            MimeType = "application/pdf",
            SizeBytes = 2048,
            StorageKey = storageKey,
            WrappedKeyJson = "{\"dek\":\"valid\"}",
            EncryptionIvBase64 = "iv123",
            EncryptionTagBase64 = "tag123"
        };
        fileRepo.GetByIdAsync(fileId, Arg.Any<CancellationToken>())
            .Returns(fileRecord);

        storage.GeneratePresignedDownloadUrlAsync(storageKey, Arg.Any<TimeSpan>(), Arg.Any<CancellationToken>())
            .Returns("https://r2.example.test/stream/lab_report.pdf?sig=valid");

        // Storage download throws IOException
        storage.DownloadAsync(storageKey, Arg.Any<CancellationToken>())
            .ThrowsAsync(new IOException("Storage read failed"));

        PatientRecordSharedPayload? enqueuedPayload = null;
        publisher.Enqueue(
            InteropTypes.PatientRecordShared,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            draftId,
            Arg.Any<PatientRecordSharedPayload>(),
            Arg.Any<int>(),
            Arg.Any<TimeSpan?>())
            .Returns(call =>
            {
                enqueuedPayload = call.ArgAt<PatientRecordSharedPayload>(4);
                return InteropEnvelope.Create(call.ArgAt<string>(0), call.ArgAt<Party>(1), call.ArgAt<Party>(2), draftId, enqueuedPayload);
            });

        var snapshots = new PatientShareSnapshotBuilder(patientRepo, Substitute.For<IPatientDocumentRepository>());
        var handler = new SubmitBookingDraftCommandHandler(
            draftRepo, clinicRepo, uow, membershipRepo, publisher,
            patientRepo, accessRepo, storage,
            Options.Create(new SharingOptions { BookingGrantDays = 30 }),
            snapshots, fileRepo, encryptionService);

        // Act
        var result = await handler.Handle(new SubmitBookingDraftCommand(patientId, draftId), CancellationToken.None);

        // Assert
        result.Should().Be($"PENDING-{draftId:N}");
        draft.Status.Should().Be(BookingDraftStatus.Ready);

        enqueuedPayload.Should().NotBeNull();
        enqueuedPayload!.FileBase64.Should().BeNull("download failed so inline bytes are omitted");
        enqueuedPayload.DownloadUrl.Should().Be("https://r2.example.test/stream/lab_report.pdf?sig=valid");
    }
}
