using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class AppointmentBookedHandlerTests
{
    private const string TenantId = "tenant_test";

    private static AppointmentBookedHandler CreateHandler(ApplicationDbContext db) =>
        new(db, MessagingTestKit.Recipient(db), new InteropPublisher(db), NullLogger<AppointmentBookedHandler>.Instance);

    private static InteropMessageContext Delivered(AppointmentBookedEvent booked, Party to) =>
        MessagingTestKit.Delivered(
            InteropTypes.PatientAppointmentBooked, Party.ForPatient(booked.PatientId.ToString()), to, booked.DraftId, booked);

    [Fact]
    public async Task Handle_MatchingClinic_IngestsAppointmentSuccessfully()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        var booked = new AppointmentBookedEvent
        {
            Id = Guid.NewGuid(),
            DraftId = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            TenantId = TenantId,
            PreferredDate = new DateOnly(2026, 9, 25),
            PreferredTime = "10:30",
            Reason = "Follow-up consultation",
            Notes = "Patient has persistent headache",
            CreatedAt = DateTime.UtcNow
        };

        await CreateHandler(db).HandleAsync(booked, Delivered(booked, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        var appt = await db.Appointments.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.DraftId == draftId);
        appt.Should().NotBeNull();
        appt!.ClinicId.Should().Be(clinicId);
        appt.TenantId.Should().Be(TenantId);
        appt.PatientId.Should().Be(patientId);
        appt.Status.Should().Be(AppointmentStatus.Confirmed);
        appt.Reason.Should().Be("Follow-up consultation");
        appt.ScheduledAt.Hour.Should().Be(10);
        appt.ScheduledAt.Minute.Should().Be(30);
    }

    [Fact]
    public async Task Handle_MatchingClinic_ConfirmsBookingToPatientThroughOutbox()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId, "Apex Clinic");
        var booked = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = TenantId,
            PreferredDate = new DateOnly(2026, 9, 25)
        };

        await CreateHandler(db).HandleAsync(booked, Delivered(booked, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        var outbox = await db.InteropOutbox.SingleAsync();
        outbox.Type.Should().Be(InteropTypes.ClinicAppointmentUpdated);
        outbox.CorrelationId.Should().Be(booked.DraftId);
        var envelope = InteropEnvelope.FromJson(outbox.EnvelopeJson);
        envelope.To.Kind.Should().Be(PartyKind.Patient);
        envelope.To.PatientId.Should().Be(booked.PatientId.ToString());
        envelope.From.FacilityId.Should().Be(clinicId.ToString());
        var update = envelope.GetPayload<ClinicAppointmentUpdatedEvent>();
        update.PatientId.Should().Be(booked.PatientId);
        update.Appointments.Should().ContainSingle();
        update.Appointments[0].Status.Should().Be("Confirmed");
        update.Appointments[0].ClinicName.Should().Be("Apex Clinic");
        update.Appointments[0].DraftId.Should().Be(booked.DraftId);
    }

    [Fact]
    public async Task Handle_RedeliveredBooking_CreatesOneAppointmentAndOneConfirmation()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var booked = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = TenantId,
            PreferredDate = new DateOnly(2026, 9, 25)
        };
        var context = Delivered(booked, MessagingTestKit.ClinicParty(TenantId, clinicId));
        var handler = CreateHandler(db);

        await handler.HandleAsync(booked, context, CancellationToken.None);
        await handler.HandleAsync(booked, context, CancellationToken.None);

        (await db.Appointments.IgnoreQueryFilters().CountAsync()).Should().Be(1);
        (await db.Patients.IgnoreQueryFilters().CountAsync()).Should().Be(1);
        (await db.InteropOutbox.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Handle_BookingForAnotherClinicOnThisServer_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var thisClinicId = Guid.NewGuid();
        var otherClinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, thisClinicId, TenantId);
        MessagingTestKit.SeedClinic(db, otherClinicId, TenantId);

        var booked = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = otherClinicId,
            TenantId = TenantId,
            PreferredDate = new DateOnly(2026, 9, 25)
        };

        await CreateHandler(db).HandleAsync(booked, Delivered(booked, MessagingTestKit.ClinicParty(TenantId, thisClinicId)), CancellationToken.None);

        (await db.Appointments.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Handle_MessageAddressedToAnotherTenantsFacility_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);

        var booked = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = TenantId,
            PreferredDate = new DateOnly(2026, 9, 25)
        };

        // Same facility id, different tenant: not this clinic.
        await CreateHandler(db).HandleAsync(booked, Delivered(booked, MessagingTestKit.ClinicParty("another_tenant", clinicId)), CancellationToken.None);

        (await db.Appointments.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.Patients.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Handle_PayloadTenantDiffersFromAddressedClinic_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);

        var booked = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = "another_tenant",
            PreferredDate = new DateOnly(2026, 9, 25)
        };

        await CreateHandler(db).HandleAsync(booked, Delivered(booked, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        (await db.Appointments.IgnoreQueryFilters().CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Handle_WithPhilHealthDependentSponsor_ProvisionsClinicPatientWithProfile()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        var booked = new AppointmentBookedEvent
        {
            Id = Guid.NewGuid(),
            DraftId = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            TenantId = TenantId,
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

        await CreateHandler(db).HandleAsync(booked, Delivered(booked, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Id == patientId);
        patient.Should().NotBeNull();
        patient!.FirstName.Should().Be("Maria");
        patient.LastName.Should().Be("Santos");
        patient.PhilHealthNumber.Should().Be("12-345678901-2");
        patient.SyncPatientId.Should().Be(patientId);
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

        var appt = await db.Appointments.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.DraftId == draftId);
        appt.Should().NotBeNull();
        appt!.PatientName.Should().Be("Maria Santos");
    }

    [Fact]
    public async Task Handle_WithAttachedFiles_CreatesPendingVerificationRecordAttachments()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var patientId = Guid.NewGuid();
        var xrayFileId = Guid.NewGuid();
        var labFileId = Guid.NewGuid();

        var booked = new AppointmentBookedEvent
        {
            Id = Guid.NewGuid(),
            DraftId = Guid.NewGuid(),
            PatientId = patientId,
            ClinicId = clinicId,
            TenantId = TenantId,
            PreferredDate = new DateOnly(2026, 11, 1),
            PreferredTime = "14:00",
            Reason = "Chest X-Ray and CBC follow-up",
            PatientFirstName = "Juan",
            PatientLastName = "Dela Cruz",
            AttachedFiles = new List<BookedAttachmentItem>
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

        await CreateHandler(db).HandleAsync(booked, Delivered(booked, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        var attachments = await db.RecordAttachments.IgnoreQueryFilters().ToListAsync();
        attachments.Should().HaveCount(2);

        var xray = attachments.FirstOrDefault(a => a.Id == xrayFileId);
        xray.Should().NotBeNull();
        xray!.PatientId.Should().Be(patientId);
        xray.ClinicId.Should().Be(clinicId);
        xray.TenantId.Should().Be(TenantId);
        xray.RecordType.Should().Be("OutsideChestXRay");
        xray.FileName.Should().Be("chest_xray_2026.pdf");
        xray.VerificationStatus.Should().Be("PendingVerification");
        xray.EncryptionAlgorithm.Should().Be("AES-256-GCM");
        xray.EncryptionKeyId.Should().Be("cmk-v1");
        xray.StorageUri.Should().Be($"tenants/{TenantId}/clinics/{clinicId}/records/{xrayFileId}.cez");

        var lab = attachments.FirstOrDefault(a => a.Id == labFileId);
        lab.Should().NotBeNull();
        lab!.RecordType.Should().Be("LabResult");
        lab.FileName.Should().Be("blood_test.pdf");
        lab.VerificationStatus.Should().Be("PendingVerification");
    }
}
