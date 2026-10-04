using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Consumers;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class AppointmentBookedConsumerTests
{
    private ApplicationDbContext CreateDbContext()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new System.Collections.Generic.KeyValuePair<string, string?>("DbSchema", "clinic_dashboard")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"ClinicEz_ConsumerTest_{Guid.NewGuid()}")
            .Options;

        return new ApplicationDbContext(options, config);
    }

    [Fact]
    public async Task Consume_MatchingClinic_IngestsAppointmentSuccessfully()
    {
        // Arrange
        using var dbContext = CreateDbContext();
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var logger = Substitute.For<ILogger<AppointmentBookedConsumer>>();
        var consumer = new AppointmentBookedConsumer(dbContext, clinicContext, logger);

        var bookedEvent = new AppointmentBookedEvent
        {
            Id = Guid.NewGuid(),
            DraftId = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PreferredDate = new DateOnly(2026, 9, 25),
            PreferredTime = "10:30",
            Reason = "Follow-up consultation",
            Notes = "Patient has persistent headache",
            CreatedAt = DateTime.UtcNow
        };

        var consumeContext = Substitute.For<ConsumeContext<AppointmentBookedEvent>>();
        consumeContext.Message.Returns(bookedEvent);
        consumeContext.CancellationToken.Returns(CancellationToken.None);

        // Act
        await consumer.Consume(consumeContext);

        // Assert
        var appt = await dbContext.Appointments.FirstOrDefaultAsync(a => a.DraftId == draftId);
        appt.Should().NotBeNull();
        appt!.ClinicId.Should().Be(clinicId);
        appt.PatientId.Should().Be(patientId);
        appt.Status.Should().Be(AppointmentStatus.Confirmed);
        appt.Reason.Should().Be("Follow-up consultation");
        appt.ScheduledAt.Hour.Should().Be(10);
        appt.ScheduledAt.Minute.Should().Be(30);
    }

    [Fact]
    public async Task Consume_DifferentClinic_IgnoresEventDueToJurisdiction()
    {
        // Arrange
        using var dbContext = CreateDbContext();
        var thisClinicId = Guid.NewGuid();
        var otherClinicId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(thisClinicId);

        var logger = Substitute.For<ILogger<AppointmentBookedConsumer>>();
        var consumer = new AppointmentBookedConsumer(dbContext, clinicContext, logger);

        var bookedEvent = new AppointmentBookedEvent
        {
            Id = Guid.NewGuid(),
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = otherClinicId,
            TenantId = "tenant_test",
            PreferredDate = new DateOnly(2026, 9, 25),
            PreferredTime = "09:00"
        };

        var consumeContext = Substitute.For<ConsumeContext<AppointmentBookedEvent>>();
        consumeContext.Message.Returns(bookedEvent);
        consumeContext.CancellationToken.Returns(CancellationToken.None);

        // Act
        await consumer.Consume(consumeContext);

        // Assert: No appointment saved in this clinic's db
        var count = await dbContext.Appointments.CountAsync();
        count.Should().Be(0);
    }

    [Fact]
    public async Task Consume_WithPhilHealthDependentSponsor_ProvisionsClinicPatientWithProfile()
    {
        // Arrange
        using var dbContext = CreateDbContext();
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var logger = Substitute.For<ILogger<AppointmentBookedConsumer>>();
        var consumer = new AppointmentBookedConsumer(dbContext, clinicContext, logger);

        var bookedEvent = new AppointmentBookedEvent
        {
            Id = Guid.NewGuid(),
            DraftId = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PreferredDate = new DateOnly(2026, 10, 20),
            PreferredTime = "11:00",
            Reason = "Checkup for cough",
            PatientFirstName = "Maria",
            PatientLastName = "Santos",
            ContactNumber = "09181234567",
            DateOfBirth = new DateOnly(1995, 5, 12),
            Gender = "Female",
            PhilHealthNumber = "12-345678901-2",
            PhilHealthCategory = "DD",
            SponsorPin = "11-987654321-0",
            SponsorFirstName = "Jose",
            SponsorLastName = "Santos",
            SponsorDob = new DateOnly(1992, 3, 15),
            SponsorRelationship = "Spouse",
            CreatedAt = DateTime.UtcNow
        };

        var consumeContext = Substitute.For<ConsumeContext<AppointmentBookedEvent>>();
        consumeContext.Message.Returns(bookedEvent);
        consumeContext.CancellationToken.Returns(CancellationToken.None);

        // Act
        await consumer.Consume(consumeContext);

        // Assert
        var patient = await dbContext.Patients.FirstOrDefaultAsync(p => p.Id == patientId);
        patient.Should().NotBeNull();
        patient!.FirstName.Should().Be("Maria");
        patient.LastName.Should().Be("Santos");
        patient.PhilHealthNumber.Should().Be("12-345678901-2");
        patient.CustomFields.Should().ContainKey("philhealth_profile");

        var profile = patient.CustomFields["philhealth_profile"] as ClinicEz.Clinic.Application.Features.Yakap.DTOs.PhilHealthPatientProfileDto;
        profile.Should().NotBeNull();
        profile!.Pin.Should().Be("12-345678901-2");
        profile.MemberPin.Should().Be("11-987654321-0");
        profile.MemberType.Should().Be("DD");
        profile.MemberFirstName.Should().Be("Jose");
        profile.MemberLastName.Should().Be("Santos");
        profile.MemberBirthDate.Should().Be("1992-03-15");
        profile.DependentRelationship.Should().Be("S");
        profile.IsWalkedIn.Should().Be("N");

        var appt = await dbContext.Appointments.FirstOrDefaultAsync(a => a.DraftId == draftId);
        appt.Should().NotBeNull();
        appt!.PatientName.Should().Be("Maria Santos");
    }

    [Fact]
    public async Task Consume_WithAttachedFiles_CreatesPendingVerificationRecordAttachments()
    {
        // Arrange
        using var dbContext = CreateDbContext();
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();
        var xrayFileId = Guid.NewGuid();
        var labFileId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var logger = Substitute.For<ILogger<AppointmentBookedConsumer>>();
        var consumer = new AppointmentBookedConsumer(dbContext, clinicContext, logger);

        var bookedEvent = new AppointmentBookedEvent
        {
            Id = Guid.NewGuid(),
            DraftId = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PreferredDate = new DateOnly(2026, 11, 1),
            PreferredTime = "14:00",
            Reason = "Chest X-Ray and CBC follow-up",
            PatientFirstName = "Juan",
            PatientLastName = "Dela Cruz",
            AttachedFiles = new System.Collections.Generic.List<BookedAttachmentItem>
            {
                new()
                {
                    FileId = xrayFileId,
                    FileName = "chest_xray_2026.pdf",
                    DocumentTypeCode = "xray",
                    MimeType = "application/pdf",
                    SizeBytes = 2048576
                },
                new()
                {
                    FileId = labFileId,
                    FileName = "blood_test.pdf",
                    DocumentTypeCode = "lab-result",
                    MimeType = "application/pdf",
                    SizeBytes = 512000
                }
            }
        };

        var consumeContext = Substitute.For<ConsumeContext<AppointmentBookedEvent>>();
        consumeContext.Message.Returns(bookedEvent);
        consumeContext.CancellationToken.Returns(CancellationToken.None);

        // Act
        await consumer.Consume(consumeContext);

        // Assert
        var attachments = await dbContext.RecordAttachments.ToListAsync();
        attachments.Should().HaveCount(2);

        var xray = attachments.FirstOrDefault(a => a.Id == xrayFileId);
        xray.Should().NotBeNull();
        xray!.PatientId.Should().Be(patientId);
        xray.ClinicId.Should().Be(clinicId);
        xray.TenantId.Should().Be(tenantId);
        xray.RecordType.Should().Be("OutsideChestXRay");
        xray.FileName.Should().Be("chest_xray_2026.pdf");
        xray.VerificationStatus.Should().Be("PendingVerification");
        xray.EncryptionAlgorithm.Should().Be("AES-256-GCM");
        xray.EncryptionKeyId.Should().Be("cmk-v1");
        xray.StorageUri.Should().Be($"tenants/{tenantId}/clinics/{clinicId}/records/{xrayFileId}.cez");

        var lab = attachments.FirstOrDefault(a => a.Id == labFileId);
        lab.Should().NotBeNull();
        lab!.RecordType.Should().Be("LabResult");
        lab.FileName.Should().Be("blood_test.pdf");
        lab.VerificationStatus.Should().Be("PendingVerification");
    }
}
