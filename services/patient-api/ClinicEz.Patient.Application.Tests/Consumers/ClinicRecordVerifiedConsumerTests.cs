using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Consumers;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Consumers;

public class ClinicRecordVerifiedConsumerTests
{
    private ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"Patient_ConsumerTest_{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options);
    }

    [Fact]
    public async Task Consume_WhenFileRecordExists_UpdatesSyncStatusToSynced_AndAddsNotification()
    {
        // Arrange
        using var dbContext = CreateDbContext();
        var patientId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();

        var patient = new global::ClinicEz.Patient.Domain.Entities.Patient
        {
            Id = patientId,
            ClerkUserId = "clerk_pat_1",
            FirstName = "Maria",
            LastName = "Santos"
        };
        await dbContext.Patients.AddAsync(patient);

        var fileRecord = new FileRecord
        {
            Id = attachmentId,
            ClientId = Guid.NewGuid(),
            PatientId = patientId,
            FileName = "outside_xray.pdf",
            StorageKey = "patients/1/xray.cez",
            DocumentTypeId = Guid.NewGuid(),
            SyncStatus = FileSyncStatus.Queued,
            UploadedAt = DateTime.UtcNow
        };
        await dbContext.FileRecords.AddAsync(fileRecord);
        await dbContext.SaveChangesAsync();

        var logger = Substitute.For<ILogger<ClinicRecordVerifiedConsumer>>();
        var consumer = new ClinicRecordVerifiedConsumer(dbContext, logger);

        var recordEvent = new ClinicRecordVerifiedEvent
        {
            AttachmentId = attachmentId,
            TenantId = "tenant_test",
            ClinicId = clinicId,
            PatientId = patientId,
            RecordType = "OutsideChestXRay",
            Title = "Outside Chest X-Ray",
            FileName = "outside_xray.pdf",
            VerificationStatus = "Verified",
            VerifiedByStaffName = "Nurse Reyes",
            VerifiedAt = DateTime.UtcNow
        };

        var consumeContext = Substitute.For<ConsumeContext<ClinicRecordVerifiedEvent>>();
        consumeContext.Message.Returns(recordEvent);
        consumeContext.CancellationToken.Returns(CancellationToken.None);

        // Act
        await consumer.Consume(consumeContext);

        // Assert
        var updatedFile = await dbContext.FileRecords.FirstOrDefaultAsync(f => f.Id == attachmentId);
        updatedFile.Should().NotBeNull();
        updatedFile!.SyncStatus.Should().Be(FileSyncStatus.Synced);
        updatedFile.SyncError.Should().BeNull();

        var notification = await dbContext.Notifications.FirstOrDefaultAsync(n => n.PatientId == patientId);
        notification.Should().NotBeNull();
        notification!.Title.Should().Be("Document Verified by Clinic");
        notification.Body.Should().Contain("Nurse Reyes");
        notification.IsRead.Should().BeFalse();
    }

    [Fact]
    public async Task Consume_WhenRejected_UpdatesSyncStatusToFailed_AndAddsRejectionNotification()
    {
        // Arrange
        using var dbContext = CreateDbContext();
        var patientId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();

        var patient = new global::ClinicEz.Patient.Domain.Entities.Patient
        {
            Id = patientId,
            ClerkUserId = "clerk_pat_2",
            FirstName = "Juan",
            LastName = "Dela Cruz"
        };
        await dbContext.Patients.AddAsync(patient);

        var fileRecord = new FileRecord
        {
            Id = attachmentId,
            ClientId = Guid.NewGuid(),
            PatientId = patientId,
            FileName = "cor_scan.pdf",
            StorageKey = "patients/2/cor.cez",
            DocumentTypeId = Guid.NewGuid(),
            SyncStatus = FileSyncStatus.Queued,
            UploadedAt = DateTime.UtcNow
        };
        await dbContext.FileRecords.AddAsync(fileRecord);
        await dbContext.SaveChangesAsync();

        var logger = Substitute.For<ILogger<ClinicRecordVerifiedConsumer>>();
        var consumer = new ClinicRecordVerifiedConsumer(dbContext, logger);

        var recordEvent = new ClinicRecordVerifiedEvent
        {
            AttachmentId = attachmentId,
            TenantId = "tenant_test",
            ClinicId = clinicId,
            PatientId = patientId,
            RecordType = "CertificateOfRegistration",
            Title = "Certificate of Registration",
            FileName = "cor_scan.pdf",
            VerificationStatus = "Rejected",
            RejectionReason = "Illegible official stamp or signature",
            VerifiedByStaffName = "Registrar Nurse",
            VerifiedAt = DateTime.UtcNow
        };

        var consumeContext = Substitute.For<ConsumeContext<ClinicRecordVerifiedEvent>>();
        consumeContext.Message.Returns(recordEvent);
        consumeContext.CancellationToken.Returns(CancellationToken.None);

        // Act
        await consumer.Consume(consumeContext);

        // Assert
        var updatedFile = await dbContext.FileRecords.FirstOrDefaultAsync(f => f.Id == attachmentId);
        updatedFile.Should().NotBeNull();
        updatedFile!.SyncStatus.Should().Be(FileSyncStatus.Failed);
        updatedFile.SyncError.Should().Be("Illegible official stamp or signature");

        var notification = await dbContext.Notifications.FirstOrDefaultAsync(n => n.PatientId == patientId);
        notification.Should().NotBeNull();
        notification!.Title.Should().Be("Document Review Update");
        notification.Body.Should().Contain("Illegible official stamp or signature");
        notification.IsRead.Should().BeFalse();
    }
}
