using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.SubmitBookingDraft;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;

namespace ClinicEz.Patient.Application.Tests.Interop;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

/// <summary>End-to-end patient plane flows over the in-process hub: outbox, relay, poller, handlers, inbox.</summary>
public sealed class PatientInteropFlowTests
{
    private static async Task<(Guid PatientId, Guid ClinicId, Guid DraftId)> SeedBookableDraftAsync(
        PatientInteropHarness h, string? clinicTenant = PatientInteropHarness.TenantA, string shareFieldsJson = "[\"fullName\",\"mobile\"]")
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        await h.WithDbAsync(async db =>
        {
            db.Patients.Add(new Patient
            {
                Id = patientId, ClerkUserId = "clerk_1", FirstName = "Juan", LastName = "Dela Cruz",
                Mobile = "+639171234567", Email = "juan@example.test", DateOfBirth = new DateOnly(1990, 1, 2)
            });
            db.Clinics.Add(new Clinic { Id = clinicId, Name = "City Health", TenantId = clinicTenant, IsPublic = true });
            db.BookingDrafts.Add(new BookingDraft
            {
                Id = draftId, PatientId = patientId, ClinicId = clinicId, Status = BookingDraftStatus.Draft,
                PreferredDate = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8).AddDays(7)), PreferredTime = "14:00", Reason = "Checkup",
                ShareFieldsJson = shareFieldsJson
            });
            await db.SaveChangesAsync();
        });

        return (patientId, clinicId, draftId);
    }

    private static async Task SubmitAsync(PatientInteropHarness h, Guid patientId, Guid draftId)
    {
        // One scope = one DbContext shared by the repositories and the outbox publisher.
        using var scope = h.Provider.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SubmitBookingDraftCommandHandler>()
            .Handle(new SubmitBookingDraftCommand(patientId, draftId), default);
    }

    [Fact]
    public async Task Booking_commits_with_its_outbox_row_and_reaches_the_clinic_through_the_hub()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicId, draftId) = await SeedBookableDraftAsync(h);

        await SubmitAsync(h, patientId, draftId);

        var outbox = await h.WithDbAsync(db => db.InteropOutbox.AsNoTracking().ToListAsync());
        outbox.Should().ContainSingle().Which.Type.Should().Be(InteropTypes.PatientAppointmentBooked);
        (await h.WithDbAsync(db => db.BookingDrafts.AsNoTracking().SingleAsync())).Status.Should().Be(BookingDraftStatus.Ready);

        (await h.Relay.RunOnceAsync(default)).Should().Be(1);

        var sent = h.Hub.Sent.Should().ContainSingle().Subject;
        sent.CorrelationId.Should().Be(draftId);
        sent.From.Kind.Should().Be(PartyKind.Patient);
        sent.From.PatientId.Should().Be(patientId.ToString());
        sent.To.TenantId.Should().Be(PatientInteropHarness.TenantA);
        sent.To.FacilityId.Should().Be(clinicId.ToString());
        sent.To.FacilityType.Should().Be(FacilityType.Clinic);
        var payload = sent.GetPayload<AppointmentBookedEvent>();
        payload.TenantId.Should().Be(PatientInteropHarness.TenantA);
        payload.PatientLastName.Should().Be("Dela Cruz");
    }

    [Fact]
    public async Task Rejected_booking_leaves_neither_outbox_row_nor_status_change()
    {
        using var h = new PatientInteropHarness();
        var (patientId, _, draftId) = await SeedBookableDraftAsync(h, clinicTenant: null);

        var act = () => SubmitAsync(h, patientId, draftId);

        await act.Should().ThrowAsync<ConflictException>();
        (await h.WithDbAsync(db => db.InteropOutbox.CountAsync())).Should().Be(0);
        (await h.WithDbAsync(db => db.BookingDrafts.AsNoTracking().SingleAsync())).Status.Should().Be(BookingDraftStatus.Draft);
    }

    private static InteropEnvelope AppointmentUpdate(
        Party from, Party to, ClinicAppointmentUpdatedEvent payload) =>
        InteropEnvelope.Create(InteropTypes.ClinicAppointmentUpdated, from, to, Guid.NewGuid(), payload);

    private static ClinicAppointmentUpdatedEvent UpdatePayload(
        Guid patientId, Guid clinicId, Guid appointmentId, string tenantId = PatientInteropHarness.TenantA, string status = "Confirmed") =>
        new()
        {
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = patientId,
            Appointments =
            [
                new ClinicAppointmentSnapshotDto
                {
                    Id = appointmentId.ToString(),
                    ClinicId = clinicId.ToString(),
                    ClinicName = "City Health",
                    Provider = new ClinicAppointmentProviderDto { Id = Guid.NewGuid().ToString(), Name = "Dr. Cruz" },
                    ScheduledAt = DateTime.UtcNow.AddHours(1).ToString("O"),
                    DurationMinutes = 30,
                    Status = status,
                    Notes = "From clinic"
                }
            ]
        };

    [Fact]
    public async Task Clinic_update_creates_then_updates_the_patients_appointment()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicId, _) = await SeedBookableDraftAsync(h);
        var appointmentId = Guid.NewGuid();

        await h.DeliverAsync(AppointmentUpdate(PatientInteropHarness.Clinic(clinicId), PatientInteropHarness.Patient(patientId),
            UpdatePayload(patientId, clinicId, appointmentId, status: "Pending")));
        await h.DeliverAsync(AppointmentUpdate(PatientInteropHarness.Clinic(clinicId), PatientInteropHarness.Patient(patientId),
            UpdatePayload(patientId, clinicId, appointmentId, status: "Confirmed")));

        var appt = await h.WithDbAsync(db => db.Appointments.AsNoTracking().SingleAsync());
        appt.Id.Should().Be(appointmentId);
        appt.PatientId.Should().Be(patientId);
        appt.ClinicId.Should().Be(clinicId);
        appt.Status.Should().Be(AppointmentStatus.Confirmed);
        h.Hub.Pending(InteropServices.Patient).Should().Be(0);
    }

    [Fact]
    public async Task Redelivered_clinic_update_has_a_single_effect()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicId, _) = await SeedBookableDraftAsync(h);
        var envelope = AppointmentUpdate(PatientInteropHarness.Clinic(clinicId), PatientInteropHarness.Patient(patientId),
            UpdatePayload(patientId, clinicId, Guid.NewGuid()));

        (await h.Dispatcher.DispatchAsync(envelope, default)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await h.Dispatcher.DispatchAsync(envelope, default)).Outcome.Should().Be(DispatchOutcome.Duplicate);

        (await h.WithDbAsync(db => db.Appointments.CountAsync())).Should().Be(1);
    }

    [Fact]
    public async Task Update_from_a_different_facility_than_the_payload_claims_is_ignored_and_acked()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicId, _) = await SeedBookableDraftAsync(h);
        var impostorClinic = Guid.NewGuid();
        var envelope = AppointmentUpdate(PatientInteropHarness.Clinic(impostorClinic), PatientInteropHarness.Patient(patientId),
            UpdatePayload(patientId, clinicId, Guid.NewGuid()));

        await h.DeliverAsync(envelope);

        (await h.WithDbAsync(db => db.Appointments.CountAsync())).Should().Be(0);
        h.Hub.Pending(InteropServices.Patient).Should().Be(0);
    }

    [Fact]
    public async Task Update_from_the_right_facility_id_but_another_tenant_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicId, _) = await SeedBookableDraftAsync(h);
        var envelope = AppointmentUpdate(
            PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantB), PatientInteropHarness.Patient(patientId),
            UpdatePayload(patientId, clinicId, Guid.NewGuid(), tenantId: PatientInteropHarness.TenantB));

        await h.DeliverAsync(envelope);

        (await h.WithDbAsync(db => db.Appointments.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task Update_addressed_to_another_patient_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicId, _) = await SeedBookableDraftAsync(h);
        var envelope = AppointmentUpdate(PatientInteropHarness.Clinic(clinicId), PatientInteropHarness.Patient(Guid.NewGuid()),
            UpdatePayload(patientId, clinicId, Guid.NewGuid()));

        await h.DeliverAsync(envelope);

        (await h.WithDbAsync(db => db.Appointments.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task A_clinic_cannot_overwrite_an_appointment_that_belongs_to_another_clinic()
    {
        using var h = new PatientInteropHarness();
        var (patientId, clinicId, _) = await SeedBookableDraftAsync(h);
        var otherClinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        await h.WithDbAsync(async db =>
        {
            db.Clinics.Add(new Clinic { Id = otherClinicId, Name = "Other", TenantId = PatientInteropHarness.TenantB });
            db.Appointments.Add(new Appointment
            {
                Id = appointmentId, PatientId = patientId, ClinicId = otherClinicId, Status = AppointmentStatus.Pending,
                Notes = "original", AttachedFileIdsJson = "[]", RawJson = string.Empty
            });
            await db.SaveChangesAsync();
        });

        await h.DeliverAsync(AppointmentUpdate(PatientInteropHarness.Clinic(clinicId), PatientInteropHarness.Patient(patientId),
            UpdatePayload(patientId, clinicId, appointmentId, status: "Cancelled")));

        var appt = await h.WithDbAsync(db => db.Appointments.AsNoTracking().SingleAsync());
        appt.ClinicId.Should().Be(otherClinicId);
        appt.Status.Should().Be(AppointmentStatus.Pending);
        appt.Notes.Should().Be("original");
    }

    private static ClinicRecordVerifiedEvent Verified(Guid patientId, Guid clinicId, Guid attachmentId, string tenantId = PatientInteropHarness.TenantA) =>
        new()
        {
            AttachmentId = attachmentId, TenantId = tenantId, ClinicId = clinicId, PatientId = patientId,
            Title = "Outside X-Ray", VerificationStatus = "Verified", VerifiedByStaffName = "Nurse Reyes"
        };

    private static async Task SeedFileAsync(PatientInteropHarness h, Guid patientId, Guid attachmentId) =>
        await h.WithDbAsync(async db =>
        {
            db.FileRecords.Add(new FileRecord
            {
                Id = attachmentId, ClientId = Guid.NewGuid(), PatientId = patientId, FileName = "xray.pdf",
                Title = "Outside Record",
                StorageKey = "k", DocumentTypeId = Guid.NewGuid(), SyncStatus = FileSyncStatus.Queued, UploadedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        });

    [Fact]
    public async Task Record_verified_from_the_clinic_syncs_the_file_and_notifies_once_even_when_redelivered()
    {
        using var h = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();
        await SeedFileAsync(h, patientId, attachmentId);

        var envelope = InteropEnvelope.Create(InteropTypes.ClinicRecordVerified, PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId), attachmentId, Verified(patientId, clinicId, attachmentId));
        await h.Dispatcher.DispatchAsync(envelope, default);
        // A crash between handling and recording would redeliver under a new message id: the handler itself must be idempotent.
        await h.Dispatcher.DispatchAsync(envelope with { MessageId = Guid.NewGuid() }, default);

        (await h.WithDbAsync(db => db.FileRecords.AsNoTracking().SingleAsync())).SyncStatus.Should().Be(FileSyncStatus.Synced);
        (await h.WithDbAsync(db => db.Notifications.CountAsync())).Should().Be(1);
    }

    [Fact]
    public async Task Record_verified_not_sent_by_the_named_clinic_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();
        await SeedFileAsync(h, patientId, attachmentId);

        var forged = InteropEnvelope.Create(InteropTypes.ClinicRecordVerified, PatientInteropHarness.Clinic(Guid.NewGuid()),
            PatientInteropHarness.Patient(patientId), attachmentId, Verified(patientId, clinicId, attachmentId));
        await h.DeliverAsync(forged);

        (await h.WithDbAsync(db => db.FileRecords.AsNoTracking().SingleAsync())).SyncStatus.Should().Be(FileSyncStatus.Queued);
        (await h.WithDbAsync(db => db.Notifications.CountAsync())).Should().Be(0);
    }

    private static InteropEnvelope DirectoryUpdate(Party from, FacilityCreatedEvent payload) =>
        InteropEnvelope.Create(
            InteropTypes.FacilityDirectoryUpdated, from,
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient }, Guid.NewGuid(), payload);

    [Fact]
    public async Task Directory_update_from_the_portal_registers_the_clinic_with_its_tenant_and_is_idempotent()
    {
        using var h = new PatientInteropHarness();
        var resourceId = Guid.NewGuid();
        var payload = new FacilityCreatedEvent
        {
            ResourceId = resourceId, TenantId = PatientInteropHarness.TenantA, FacilityType = FacilityType.Clinic,
            Name = "Metro General Clinic", Slug = "metro", ConsoleUrl = "https://metro.example.test"
        };

        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, payload));
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, payload with { Name = "Metro General Clinic II" }));

        var clinic = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == resourceId));
        clinic.Name.Should().Be("Metro General Clinic II");
        clinic.TenantId.Should().Be(PatientInteropHarness.TenantA);
        clinic.PrivacyPolicyUrl.Should().Be("https://metro.example.test/privacy");
    }

    [Fact]
    public async Task Directory_update_from_unauthorized_parties_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var resourceId = Guid.NewGuid();
        var payload = new FacilityCreatedEvent
        {
            ResourceId = resourceId, TenantId = PatientInteropHarness.TenantA, FacilityType = FacilityType.Clinic, Name = "Forged"
        };

        // 1. Impostor clinic where sender FacilityId does not match message ResourceId
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Clinic(Guid.NewGuid()), payload));

        // 2. Non-clinic facility (e.g., Laboratory)
        var labParty = Party.ForFacility(PatientInteropHarness.TenantA, resourceId.ToString(), FacilityType.Laboratory);
        await h.DeliverAsync(DirectoryUpdate(labParty, payload));

        // 3. Unauthorized control plane service
        var otherServiceParty = new Party { Kind = PartyKind.ControlPlane, Service = "billing-api" };
        await h.DeliverAsync(DirectoryUpdate(otherServiceParty, payload));

        (await h.WithDbAsync(db => db.Clinics.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task Directory_update_from_clinic_with_null_facility_id_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var resourceId = Guid.NewGuid();
        var payload = new FacilityCreatedEvent
        {
            ResourceId = resourceId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Impostor Null Clinic"
        };

        var nullFacilityParty = new Party
        {
            Kind = PartyKind.Facility,
            FacilityType = FacilityType.Clinic,
            TenantId = PatientInteropHarness.TenantA,
            FacilityId = null
        };

        await h.DeliverAsync(DirectoryUpdate(nullFacilityParty, payload));

        (await h.WithDbAsync(db => db.Clinics.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task Directory_update_from_clinic_with_empty_facility_id_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var resourceId = Guid.NewGuid();
        var payload = new FacilityCreatedEvent
        {
            ResourceId = resourceId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Impostor Empty Clinic"
        };

        var emptyFacilityParty = new Party
        {
            Kind = PartyKind.Facility,
            FacilityType = FacilityType.Clinic,
            TenantId = PatientInteropHarness.TenantA,
            FacilityId = "   "
        };

        await h.DeliverAsync(DirectoryUpdate(emptyFacilityParty, payload));

        (await h.WithDbAsync(db => db.Clinics.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task Directory_update_from_clinic_with_malformed_facility_id_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var resourceId = Guid.NewGuid();
        var payload = new FacilityCreatedEvent
        {
            ResourceId = resourceId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Impostor Malformed Clinic"
        };

        var malformedFacilityParty = new Party
        {
            Kind = PartyKind.Facility,
            FacilityType = FacilityType.Clinic,
            TenantId = PatientInteropHarness.TenantA,
            FacilityId = "not-a-valid-guid"
        };

        await h.DeliverAsync(DirectoryUpdate(malformedFacilityParty, payload));

        (await h.WithDbAsync(db => db.Clinics.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task Directory_update_from_clinic_with_mismatched_resource_id_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var resourceId = Guid.NewGuid();
        var senderFacilityId = Guid.NewGuid();
        var payload = new FacilityCreatedEvent
        {
            ResourceId = resourceId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Impostor Mismatched Resource Clinic"
        };

        var mismatchedParty = PatientInteropHarness.Clinic(senderFacilityId, PatientInteropHarness.TenantA);

        await h.DeliverAsync(DirectoryUpdate(mismatchedParty, payload));

        (await h.WithDbAsync(db => db.Clinics.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task Directory_update_from_clinic_with_mismatched_tenant_id_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var resourceId = Guid.NewGuid();
        var payload = new FacilityCreatedEvent
        {
            ResourceId = resourceId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Impostor Mismatched Tenant Clinic"
        };

        // Sender claims to be in TenantB, but payload claims TenantA
        var crossTenantParty = PatientInteropHarness.Clinic(resourceId, PatientInteropHarness.TenantB);

        await h.DeliverAsync(DirectoryUpdate(crossTenantParty, payload));

        (await h.WithDbAsync(db => db.Clinics.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task TwoTierGovernance_WhenPortalUpdatesFirst_ClinicRemainsPrivateUntilClinicPublishes()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();

        // 1. Portal sends directory update enabling discovery eligibility and platform verification
        var portalPayload = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "St. Jude Family Care",
            IsPublic = true,
            IsWorkspaceEligible = true,
            IsPlatformVerified = true,
            PlatformVerificationStatus = PlatformVerificationStatus.Verified
        };
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, portalPayload));

        // Eligible in workspace and verified, but not published by clinic -> IsPublic MUST BE FALSE
        var clinicAfterPortal = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        clinicAfterPortal.IsWorkspaceEligible.Should().BeTrue();
        clinicAfterPortal.IsPlatformVerified.Should().BeTrue();
        clinicAfterPortal.IsDirectoryPublished.Should().BeFalse();
        clinicAfterPortal.IsPublic.Should().BeFalse();

        // 2. Clinic manager verifies readiness and publishes from clinic-app
        var clinicPayload = portalPayload with
        {
            IsPublic = true,
            IsDirectoryPublished = true,
            OperatingHours = "Mon-Fri 08:00-17:00"
        };
        var clinicSender = PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA);
        await h.DeliverAsync(DirectoryUpdate(clinicSender, clinicPayload));

        // All three gates satisfied -> IsPublic MUST NOW BE TRUE
        var clinicAfterBoth = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        clinicAfterBoth.IsWorkspaceEligible.Should().BeTrue();
        clinicAfterBoth.IsDirectoryPublished.Should().BeTrue();
        clinicAfterBoth.IsPlatformVerified.Should().BeTrue();
        clinicAfterBoth.IsPublic.Should().BeTrue();
    }

    [Fact]
    public async Task TwoTierGovernance_WhenClinicPublishesFirst_ClinicRemainsPrivateUntilPortalEnablesEligibility()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();

        // 1. Clinic publishes first
        var clinicPayload = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "St. Luke Specialty",
            IsPublic = true,
            IsDirectoryPublished = true,
            OperatingHours = "Mon-Fri 09:00-18:00"
        };
        var clinicSender = PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA);
        await h.DeliverAsync(DirectoryUpdate(clinicSender, clinicPayload));

        // Clinic published, but workspace not yet eligible -> IsPublic MUST BE FALSE
        var clinicAfterClinic = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        clinicAfterClinic.IsWorkspaceEligible.Should().BeFalse();
        clinicAfterClinic.IsPlatformVerified.Should().BeFalse();
        clinicAfterClinic.IsDirectoryPublished.Should().BeTrue();
        clinicAfterClinic.IsPublic.Should().BeFalse();

        // 2. Portal later grants discovery eligibility & platform verification
        var portalPayload = clinicPayload with
        {
            IsPublic = true,
            IsWorkspaceEligible = true,
            PlatformVerificationStatus = PlatformVerificationStatus.Verified
        };
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, portalPayload));

        // All three gates satisfied -> IsPublic MUST NOW BE TRUE
        var clinicAfterBoth = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        clinicAfterBoth.IsWorkspaceEligible.Should().BeTrue();
        clinicAfterBoth.IsDirectoryPublished.Should().BeTrue();
        clinicAfterBoth.IsPlatformVerified.Should().BeTrue();
        clinicAfterBoth.IsPublic.Should().BeTrue();
    }

    [Fact]
    public async Task TwoTierGovernance_WhenWorkspaceRevokesEligibility_ClinicBecomesPrivateWhileRetainingClinicPublishedState()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();

        // Setup: Clinic is fully verified and published
        var payload = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Makati Medical Center",
            IsPublic = true,
            IsPlatformVerified = true
        };
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, payload));
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA), payload));

        (await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId))).IsPublic.Should().BeTrue();

        // Portal revokes discovery eligibility
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, payload with { IsPublic = false, IsWorkspaceEligible = false }));

        var revokedClinic = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        revokedClinic.IsWorkspaceEligible.Should().BeFalse();
        revokedClinic.IsDirectoryPublished.Should().BeTrue(); // Clinic state preserved!
        revokedClinic.IsPlatformVerified.Should().BeTrue();
        revokedClinic.IsPublic.Should().BeFalse();             // Hidden from patients

        // Portal re-enables eligibility
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, payload with { IsPublic = true, IsWorkspaceEligible = true }));

        var restoredClinic = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        restoredClinic.IsWorkspaceEligible.Should().BeTrue();
        restoredClinic.IsDirectoryPublished.Should().BeTrue();
        restoredClinic.IsPlatformVerified.Should().BeTrue();
        restoredClinic.IsPublic.Should().BeTrue();             // Automatically restored!
    }

    [Fact]
    public async Task TwoTierGovernance_WhenClinicUnpublishes_ClinicBecomesPrivateWhileRetainingWorkspaceEligibility()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();

        var payload = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Cebu Doctors Clinic",
            IsPublic = true,
            IsPlatformVerified = true
        };
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, payload));
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA), payload));

        // Clinic manager unpublishes from clinic-app
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA),
            payload with { IsPublic = false, IsDirectoryPublished = false }));

        var unpublishedClinic = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        unpublishedClinic.IsWorkspaceEligible.Should().BeTrue();  // Workspace state preserved!
        unpublishedClinic.IsDirectoryPublished.Should().BeFalse();
        unpublishedClinic.IsPublic.Should().BeFalse();            // Hidden from patients

        // Clinic manager re-publishes
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA),
            payload with { IsPublic = true, IsDirectoryPublished = true }));

        var republishedClinic = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        republishedClinic.IsWorkspaceEligible.Should().BeTrue();
        republishedClinic.IsDirectoryPublished.Should().BeTrue();
        republishedClinic.IsPublic.Should().BeTrue();             // Automatically restored!
    }

    [Fact]
    public async Task TwoTierGovernance_WhenClinicPausesBooking_ClinicRemainsPublicWhileAppointmentsArePaused()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();

        var payload = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Davao Wellness Clinic",
            IsPublic = true,
            IsPlatformVerified = true
        };
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, payload));
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA), payload));

        (await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId))).IsPublic.Should().BeTrue();

        // Clinic pauses online appointments
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA),
            payload with { IsBookingPaused = true }));

        var pausedClinic = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        pausedClinic.IsWorkspaceEligible.Should().BeTrue();
        pausedClinic.IsDirectoryPublished.Should().BeTrue();
        pausedClinic.IsPublic.Should().BeTrue();                    // Still discoverable in directory!
        pausedClinic.SupportsAppointments.Should().BeFalse();       // Appointments are paused!
    }

    [Fact]
    public async Task Directory_update_from_authorized_clinic_upserts_clinic_services_and_capacity_controls()
    {
        using var h = new PatientInteropHarness();
        var resourceId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var service1Id = Guid.NewGuid();
        var service2Id = Guid.NewGuid();

        var payload = new FacilityCreatedEvent
        {
            ResourceId = resourceId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "St. Jude Family Care",
            Slug = "st-jude",
            ConsoleUrl = "https://stjude.example.test",
            IsPublic = true,
            IsBookingPaused = true,
            IsJoinGated = true,
            JoinCode = "VIP2026",
            OperatingHours = "Mon-Fri 08:00-17:00",
            Providers =
            [
                new FacilityProviderDto(providerId, "Dr. Maria Santos", "Cardiology", "PRC-0098765", true, 1)
            ],
            Services =
            [
                new ClinicServiceDto(service1Id, "General Consultation", "Consultation", 600m, true),
                new ClinicServiceDto(service2Id, "CBC Blood Test", "Laboratory", 350m, true)
            ]
        };

        // Authorized clinic sender matches payload.ResourceId
        var clinicSender = PatientInteropHarness.Clinic(resourceId, PatientInteropHarness.TenantA);
        await h.DeliverAsync(DirectoryUpdate(clinicSender, payload));

        var clinic = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == resourceId));
        clinic.Name.Should().Be("St. Jude Family Care");
        clinic.SupportsAppointments.Should().BeFalse();
        clinic.IsGated.Should().BeTrue();
        clinic.JoinCode.Should().Be("VIP2026");
        clinic.OperatingHours.Should().Be("Mon-Fri 08:00-17:00");
        clinic.FeaturedScore.Should().Be(1000);
        clinic.IsDirectoryPublished.Should().BeTrue();
        clinic.IsWorkspaceEligible.Should().BeFalse();
        clinic.IsPublic.Should().BeFalse();

        var providers = await h.WithDbAsync(db => db.ClinicHealthcareProviders.AsNoTracking().Where(p => p.ClinicId == resourceId).ToListAsync());
        providers.Should().ContainSingle();
        providers[0].Name.Should().Be("Dr. Maria Santos");
        providers[0].Specialty.Should().Be("Cardiology");
        providers[0].ProfessionalLicenseNo.Should().Be("PRC-0098765");

        var services = await h.WithDbAsync(db => db.ClinicServices.AsNoTracking().Where(s => s.ClinicId == resourceId).ToListAsync());
        services.Should().HaveCount(2);
        services.Should().Contain(s => s.Id == service1Id && s.Name == "General Consultation" && s.Price == 600m && s.IsActive);
        services.Should().Contain(s => s.Id == service2Id && s.Name == "CBC Blood Test" && s.Price == 350m && s.IsActive);
    }

    [Fact]
    public async Task Directory_update_deactivates_omitted_services_and_reactivates_reincluded_services()
    {
        using var h = new PatientInteropHarness();
        var resourceId = Guid.NewGuid();
        var service1Id = Guid.NewGuid();
        var service2Id = Guid.NewGuid();
        var service3Id = Guid.NewGuid();

        var clinicSender = PatientInteropHarness.Clinic(resourceId, PatientInteropHarness.TenantA);

        // Initial sync: Service 1 & Service 2
        var initialPayload = new FacilityCreatedEvent
        {
            ResourceId = resourceId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Clinic With Services",
            Services =
            [
                new ClinicServiceDto(service1Id, "Service 1", "General", 100m, true),
                new ClinicServiceDto(service2Id, "Service 2", "General", 200m, true)
            ]
        };
        await h.DeliverAsync(DirectoryUpdate(clinicSender, initialPayload));

        // Update omitting Service 2 and adding Service 3
        var updatePayload = initialPayload with
        {
            Services =
            [
                new ClinicServiceDto(service1Id, "Service 1", "General", 100m, true),
                new ClinicServiceDto(service3Id, "Service 3", "General", 300m, true)
            ]
        };
        await h.DeliverAsync(DirectoryUpdate(clinicSender, updatePayload));

        var dbServices = await h.WithDbAsync(db => db.ClinicServices.AsNoTracking().Where(s => s.ClinicId == resourceId).ToListAsync());
        dbServices.Should().HaveCount(3);
        dbServices.Single(s => s.Id == service1Id).IsActive.Should().BeTrue();
        dbServices.Single(s => s.Id == service2Id).IsActive.Should().BeFalse(); // Soft-deactivated, preserving FKs!
        dbServices.Single(s => s.Id == service3Id).IsActive.Should().BeTrue();

        // Reactivation sync: Re-including Service 2
        var reactivatePayload = initialPayload with
        {
            Services =
            [
                new ClinicServiceDto(service1Id, "Service 1", "General", 100m, true),
                new ClinicServiceDto(service2Id, "Service 2", "General", 250m, true)
            ]
        };
        await h.DeliverAsync(DirectoryUpdate(clinicSender, reactivatePayload));

        var updatedDbServices = await h.WithDbAsync(db => db.ClinicServices.AsNoTracking().Where(s => s.ClinicId == resourceId).ToListAsync());
        updatedDbServices.Single(s => s.Id == service2Id).IsActive.Should().BeTrue();
        updatedDbServices.Single(s => s.Id == service2Id).Price.Should().Be(250m);
        updatedDbServices.Single(s => s.Id == service3Id).IsActive.Should().BeFalse(); // Now service 3 is omitted and soft-deactivated
    }

    [Fact]
    public async Task Patient_queue_alert_creates_notification_and_is_idempotent()
    {
        using var h = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var ticketId = Guid.NewGuid();

        await h.WithDbAsync(async db =>
        {
            db.Patients.Add(new Patient
            {
                Id = patientId, ClerkUserId = "clerk_queue_1", FirstName = "Maria", LastName = "Santos",
                Mobile = "+639171234568", Email = "maria@example.test", DateOfBirth = new DateOnly(1992, 5, 10)
            });
            await db.SaveChangesAsync();
        });

        var payload = new PatientQueueAlertPayload(
            ticketId, "Q-005", "called_to_room", "Ticket Q-005 has been called to Room 2.", "Dr. Reyes", "Room 2", 0, DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientQueueAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            ticketId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);
        // Duplicate delivery should be idempotent
        await h.Dispatcher.DispatchAsync(envelope with { MessageId = Guid.NewGuid() }, default);

        var notifications = await h.WithDbAsync(db => db.Notifications.AsNoTracking().Where(n => n.PatientId == patientId).ToListAsync());
        notifications.Should().ContainSingle();
        notifications[0].Title.Should().Be("Called: Ticket Q-005");
        notifications[0].Body.Should().Be("Ticket Q-005 has been called to Room 2.");
        notifications[0].SourceId.Should().Be($"{ticketId}:called_to_room");
    }

    [Fact]
    public async Task Patient_appointment_alert_creates_in_app_notification_and_dispatches_fcm_push()
    {
        using var h = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        const string pushToken = "fcm_test_device_token_xyz_123";

        await h.WithDbAsync(async db =>
        {
            db.Patients.Add(new Patient
            {
                Id = patientId,
                ClerkUserId = "clerk_appt_user",
                FirstName = "Maria",
                LastName = "Santos",
                Mobile = "+639171234569",
                Email = "maria.santos@example.test",
                DateOfBirth = new DateOnly(1992, 5, 10)
            });
            db.DeviceSessions.Add(new DeviceSession
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                DeviceId = "device_001",
                DeviceLabel = "iPhone 15",
                ClerkSessionId = "sess_001",
                PushToken = pushToken,
                LastActiveAt = DateTime.UtcNow,
                IsRevoked = false
            });
            await db.SaveChangesAsync();
        });

        var payload = new PatientAppointmentAlertPayload(
            AppointmentId: appointmentId,
            ClinicId: clinicId,
            ClinicName: "Metro Health Clinic",
            DoctorId: doctorId,
            DoctorName: "Dr. Maria Santos",
            ServiceType: "General Consultation",
            ScheduledAtUtc: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            AlertKind: AppointmentAlertKinds.Reminder24h,
            Message: "Reminder: You have an appointment tomorrow at 10:00 AM with Dr. Maria Santos at Metro Health Clinic.",
            TimestampUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);

        var notifications = await h.WithDbAsync(db => db.Notifications.AsNoTracking().Where(n => n.PatientId == patientId).ToListAsync());
        notifications.Should().ContainSingle();
        var notif = notifications[0];
        notif.Title.Should().Contain("Appointment Reminder (Tomorrow)");
        notif.Body.Should().Be(payload.Message);
        notif.Type.Should().Be(NotificationType.AppointmentReminder);
        notif.Category.Should().Be(NotificationCategory.Appointments);
        notif.SourceId.Should().Be($"appointment:{appointmentId}:{AppointmentAlertKinds.Reminder24h}");

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();
        await pushService.Received(1).SendPushNotificationAsync(
            pushToken,
            Arg.Is<string>(t => t.Contains("Appointment Reminder (Tomorrow)")),
            payload.Message,
            "appointment",
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Patient_appointment_alert_is_idempotent_on_redelivery()
    {
        using var h = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        const string pushToken = "fcm_test_token_dup";

        await h.WithDbAsync(async db =>
        {
            db.Patients.Add(new Patient
            {
                Id = patientId,
                ClerkUserId = "clerk_dup_user",
                FirstName = "Jose",
                LastName = "Rizal",
                Mobile = "+639171234570",
                Email = "jose@example.test",
                DateOfBirth = new DateOnly(1861, 6, 19)
            });
            db.DeviceSessions.Add(new DeviceSession
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                DeviceId = "device_dup",
                DeviceLabel = "Android",
                ClerkSessionId = "sess_dup",
                PushToken = pushToken,
                LastActiveAt = DateTime.UtcNow,
                IsRevoked = false
            });
            await db.SaveChangesAsync();
        });

        var payload = new PatientAppointmentAlertPayload(
            AppointmentId: appointmentId,
            ClinicId: clinicId,
            ClinicName: "City Clinic",
            DoctorId: null,
            DoctorName: null,
            ServiceType: "Checkup",
            ScheduledAtUtc: DateTime.UtcNow.AddHours(2),
            DurationMinutes: 15,
            AlertKind: AppointmentAlertKinds.Reminder2h,
            Message: "Reminder: You have an appointment in 2 hours.",
            TimestampUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        // First delivery
        await h.Dispatcher.DispatchAsync(envelope, default);
        // Duplicate delivery with same or new MessageId
        await h.Dispatcher.DispatchAsync(envelope with { MessageId = Guid.NewGuid() }, default);

        var notifications = await h.WithDbAsync(db => db.Notifications.AsNoTracking().Where(n => n.PatientId == patientId).ToListAsync());
        notifications.Should().ContainSingle();

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();
        await pushService.Received(1).SendPushNotificationAsync(
            pushToken,
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ThreeGateGovernance_RemainsPrivateUntilPlatformVerified_AndPortalSuspensionHidesClinic()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();

        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "St. Jude Clinic",
            IsWorkspaceEligible = true,
            PlatformVerificationStatus = PlatformVerificationStatus.PendingReview
        }));

        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA), new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "St. Jude Clinic",
            IsDirectoryPublished = true
        }));

        var beforeVerify = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        beforeVerify.IsWorkspaceEligible.Should().BeTrue();
        beforeVerify.IsDirectoryPublished.Should().BeTrue();
        beforeVerify.IsPlatformVerified.Should().BeFalse();
        beforeVerify.IsPublic.Should().BeFalse();

        // Portal approves verification
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "St. Jude Clinic",
            IsWorkspaceEligible = true,
            PlatformVerificationStatus = PlatformVerificationStatus.Verified,
            ReplaceProvidersSnapshot = false
        }));

        var verified = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        verified.IsPlatformVerified.Should().BeTrue();
        verified.IsPublic.Should().BeTrue();

        // Portal suspends clinic
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "St. Jude Clinic",
            PlatformVerificationStatus = PlatformVerificationStatus.Suspended,
            ReplaceProvidersSnapshot = false
        }));

        var suspended = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        suspended.IsPlatformVerified.Should().BeFalse();
        suspended.IsWorkspaceEligible.Should().BeTrue();
        suspended.IsDirectoryPublished.Should().BeTrue();
        suspended.IsPublic.Should().BeFalse();
    }

    [Fact]
    public async Task Directory_update_with_ReplaceProvidersSnapshotFalse_and_null_providers_never_deactivates_existing_providers()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var clinicParty = PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA);

        await h.DeliverAsync(DirectoryUpdate(clinicParty, new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Clinic With Clinicians",
            IsDirectoryPublished = true,
            Providers =
            [
                new FacilityProviderDto(providerId, "Dr. Ana Cruz", "Pediatrics", "PRC-0045678", true, 1, Role: "Doctor")
            ]
        }));

        // Portal sends directory update with ReplaceProvidersSnapshot = false and Providers = null
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Clinic With Clinicians",
            IsWorkspaceEligible = true,
            IsPlatformVerified = true,
            Providers = null,
            ReplaceProvidersSnapshot = false
        }));

        var provider = await h.WithDbAsync(db => db.ClinicHealthcareProviders.AsNoTracking().SingleAsync(p => p.Id == providerId));
        provider.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task Directory_update_from_clinic_filters_non_clinical_roles_and_syncs_availabilities_idempotently()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var nurseId = Guid.NewGuid();
        var receptionistId = Guid.NewGuid();
        var canonicalDocId = Guid.NewGuid();
        var clinicParty = PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA);

        await h.WithDbAsync(async db =>
        {
            db.Practitioners.Add(new Practitioner
            {
                Id = canonicalDocId,
                ProfessionKind = "Doctor",
                NormalizedPrcLicenseNo = "0012345",
                DisplayPrcLicenseNo = "PRC-12345",
                VerificationLevel = PractitionerVerificationLevel.Verified,
                Name = "Dr. Juan Luna",
                FirstName = "Juan",
                LastName = "Luna",
                PrimarySpecialty = "Family Medicine"
            });
            await db.SaveChangesAsync();
        });

        var initialPayload = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Metro Care",
            IsDirectoryPublished = true,
            Providers =
            [
                new FacilityProviderDto(
                    doctorId, "Dr. Juan Luna", "Family Medicine", "PRC-12345", true, 1,
                    Role: "Doctor",
                    CanonicalProviderId: canonicalDocId,
                    NormalizedLicenseNo: "0012345",
                    IsDirectoryOptIn: true,
                    Availabilities:
                    [
                        new ProviderAvailabilityWindowDto(DayOfWeek.Monday, "09:00", "12:00"),
                        new ProviderAvailabilityWindowDto(DayOfWeek.Wednesday, "13:00", "17:00")
                    ]),
                new FacilityProviderDto(
                    nurseId, "RN Maria Clara", "Triage", "PRC-54321", true, 2,
                    Role: "Nurse",
                    IsDirectoryOptIn: false),
                new FacilityProviderDto(
                    receptionistId, "Bob Frontdesk", "Admin", null, true, 3,
                    Role: "Receptionist")
            ]
        };

        await h.DeliverAsync(DirectoryUpdate(clinicParty, initialPayload));
        // Replay identical snapshot under a new message id
        await h.Dispatcher.DispatchAsync(DirectoryUpdate(clinicParty, initialPayload) with { MessageId = Guid.NewGuid() }, default);

        var providers = await h.WithDbAsync(db => db.ClinicHealthcareProviders
            .Include(p => p.ProviderAvailabilities)
            .AsNoTracking()
            .Where(p => p.ClinicId == clinicId)
            .ToListAsync());

        providers.Should().HaveCount(2);
        providers.Select(p => p.Id).Should().NotContain(receptionistId);

        var doc = providers.Single(p => p.Id == doctorId);
        doc.Role.Should().Be("Doctor");
        doc.PractitionerId.Should().Be(canonicalDocId);
        doc.NormalizedLicenseNo.Should().Be("0012345");
        doc.IsDirectoryOptIn.Should().BeTrue();
        doc.ProviderAvailabilities.Should().HaveCount(2);

        var nurse = providers.Single(p => p.Id == nurseId);
        nurse.Role.Should().Be("Nurse");
        nurse.IsDirectoryOptIn.Should().BeFalse();

        // Update availability schedule removes Wednesday and adds Friday
        var updatedPayload = initialPayload with
        {
            Providers =
            [
                new FacilityProviderDto(
                    doctorId, "Dr. Juan Luna", "Family Medicine", "PRC-12345", true, 1,
                    Role: "Doctor",
                    CanonicalProviderId: canonicalDocId,
                    NormalizedLicenseNo: "0012345",
                    IsDirectoryOptIn: true,
                    Availabilities:
                    [
                        new ProviderAvailabilityWindowDto(DayOfWeek.Monday, "09:00", "12:00"),
                        new ProviderAvailabilityWindowDto(DayOfWeek.Friday, "08:00", "11:00")
                    ])
            ]
        };
        await h.DeliverAsync(DirectoryUpdate(clinicParty, updatedPayload));

        var docAfter = await h.WithDbAsync(db => db.ClinicHealthcareProviders
            .Include(p => p.ProviderAvailabilities)
            .AsNoTracking()
            .SingleAsync(p => p.Id == doctorId));
        docAfter.ProviderAvailabilities.Select(a => a.DayOfWeek).Should().BeEquivalentTo([DayOfWeek.Monday, DayOfWeek.Friday]);
        var nurseAfter = await h.WithDbAsync(db => db.ClinicHealthcareProviders.AsNoTracking().SingleAsync(p => p.Id == nurseId));
        nurseAfter.IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task Directory_update_with_unknown_canonical_provider_keeps_practitioner_id_null_until_identity_update_arrives()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var canonicalDocId = Guid.NewGuid();
        var clinicParty = PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA);

        // Out-of-order: clinic directory update arrives before portal practitioner.identity.updated
        await h.DeliverAsync(DirectoryUpdate(clinicParty, new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Out Of Order Clinic",
            IsDirectoryPublished = true,
            Providers =
            [
                new FacilityProviderDto(
                    staffId, "Dr. Clara Rizal", "Pediatrics", "PRC-0091234", true, 1,
                    Role: "Doctor",
                    CanonicalProviderId: canonicalDocId,
                    NormalizedLicenseNo: "0091234",
                    IsDirectoryOptIn: true)
            ]
        }));

        var beforeIdentity = await h.WithDbAsync(db => db.ClinicHealthcareProviders.AsNoTracking().SingleAsync(p => p.Id == staffId));
        beforeIdentity.PractitionerId.Should().BeNull("FK target Practitioner does not exist yet");
        beforeIdentity.NormalizedLicenseNo.Should().Be("0091234");

        // Portal practitioner.identity.updated arrives next and links the provider by staff/license
        await h.DeliverAsync(InteropEnvelope.Create(
            InteropTypes.PractitionerIdentityUpdated,
            PatientInteropHarness.Portal,
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            Guid.NewGuid(),
            new PractitionerIdentityUpdatedPayload
            {
                PractitionerId = canonicalDocId,
                ProfessionKind = "Doctor",
                NormalizedPrcLicenseNo = "0091234",
                DisplayPrcLicenseNo = "PRC-0091234",
                VerificationLevel = PractitionerVerificationLevel.Verified,
                FirstName = "Clara",
                LastName = "Rizal",
                Title = "Dr.",
                PrimarySpecialty = "Pediatrics",
                TenantId = PatientInteropHarness.TenantA,
                FacilityId = clinicId,
                ClinicStaffMemberId = staffId,
                AffiliationStatus = "Active"
            }));

        var afterIdentity = await h.WithDbAsync(db => db.ClinicHealthcareProviders.AsNoTracking().SingleAsync(p => p.Id == staffId));
        afterIdentity.PractitionerId.Should().Be(canonicalDocId);
    }

    [Fact]
    public async Task Practitioner_identity_updated_from_portal_upserts_practitioner_handles_merge_and_links_clinic_provider()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var oldPractitionerId = Guid.NewGuid();
        var canonicalPractitionerId = Guid.NewGuid();

        await h.WithDbAsync(async db =>
        {
            db.Clinics.Add(new Clinic
            {
                Id = clinicId,
                Name = "St. Paul Clinic",
                TenantId = PatientInteropHarness.TenantA,
                IsWorkspaceEligible = true,
                IsDirectoryPublished = true,
                IsPlatformVerified = true,
                IsPublic = true
            });
            db.Practitioners.Add(new Practitioner
            {
                Id = oldPractitionerId,
                ProfessionKind = "Doctor",
                NormalizedPrcLicenseNo = "0099887",
                DisplayPrcLicenseNo = "PRC-0099887",
                VerificationLevel = PractitionerVerificationLevel.PendingVerification,
                Name = "Dr. Elena Gomez",
                FirstName = "Elena",
                LastName = "Gomez",
                PrimarySpecialty = "General Practice"
            });
            db.ClinicHealthcareProviders.Add(new ClinicHealthcareProvider
            {
                Id = staffId,
                ClinicId = clinicId,
                PractitionerId = oldPractitionerId,
                Name = "Dr. Elena Gomez",
                Specialty = "General Practice",
                Role = "Doctor",
                NormalizedLicenseNo = "0099887"
            });
            await db.SaveChangesAsync();
        });

        // Forged message from non-Portal sender must be ignored
        var payload = new PractitionerIdentityUpdatedPayload
        {
            PractitionerId = oldPractitionerId,
            MergedIntoPractitionerId = canonicalPractitionerId,
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0099887",
            DisplayPrcLicenseNo = "PRC-0099887",
            PrcExpiryDate = new DateOnly(2029, 12, 31),
            VerificationLevel = PractitionerVerificationLevel.Verified,
            FirstName = "Elena",
            LastName = "Gomez",
            Title = "Dr.",
            PrimarySpecialty = "Cardiology",
            PublicBio = "Fellow of Philippine Heart Association.",
            AvatarUrl = "https://cdn.example.test/elena.jpg",
            VerifiedAtUtc = DateTime.UtcNow,
            TenantId = PatientInteropHarness.TenantA,
            FacilityId = clinicId,
            ClinicStaffMemberId = staffId,
            AffiliationStatus = "Active",
            LocalSpecialty = "Clinical Cardiology",
            Availabilities =
            [
                new ProviderAvailabilityWindowDto(DayOfWeek.Tuesday, "09:00", "15:00")
            ]
        };

        var forgedEnvelope = InteropEnvelope.Create(
            InteropTypes.PractitionerIdentityUpdated,
            PatientInteropHarness.Clinic(clinicId),
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            Guid.NewGuid(),
            payload);
        await h.DeliverAsync(forgedEnvelope);

        (await h.WithDbAsync(db => db.Practitioners.AsNoTracking().SingleAsync(p => p.Id == oldPractitionerId)))
            .VerificationLevel.Should().Be(PractitionerVerificationLevel.PendingVerification);

        // Authorized Portal message applies merge + upsert + affiliation link + availabilities
        var portalEnvelope = InteropEnvelope.Create(
            InteropTypes.PractitionerIdentityUpdated,
            PatientInteropHarness.Portal,
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            Guid.NewGuid(),
            payload);
        await h.DeliverAsync(portalEnvelope);

        var mergedOld = await h.WithDbAsync(db => db.Practitioners.AsNoTracking().SingleAsync(p => p.Id == oldPractitionerId));
        mergedOld.MergedIntoPractitionerId.Should().Be(canonicalPractitionerId);

        var canonical = await h.WithDbAsync(db => db.Practitioners.AsNoTracking().SingleAsync(p => p.Id == canonicalPractitionerId));
        canonical.VerificationLevel.Should().Be(PractitionerVerificationLevel.Verified);
        canonical.Name.Should().Be("Dr. Elena Gomez");
        canonical.Bio.Should().Be("Fellow of Philippine Heart Association.");
        canonical.AvatarUrl.Should().Be("https://cdn.example.test/elena.jpg");

        var staff = await h.WithDbAsync(db => db.ClinicHealthcareProviders
            .Include(p => p.ProviderAvailabilities)
            .AsNoTracking()
            .SingleAsync(p => p.Id == staffId));
        staff.PractitionerId.Should().Be(canonicalPractitionerId);
        staff.Specialty.Should().Be("Clinical Cardiology");
        staff.AffiliationStatus.Should().Be("Active");
        staff.AvatarUrl.Should().Be("https://cdn.example.test/elena.jpg");
        staff.ProviderAvailabilities.Should().ContainSingle(a => a.DayOfWeek == DayOfWeek.Tuesday);
    }

    [Fact]
    public async Task Practitioner_verification_revoked_updates_level_and_marks_targeted_and_all_affiliations()
    {
        using var h = new PatientInteropHarness();
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var staffA = Guid.NewGuid();
        var staffB = Guid.NewGuid();
        var practitionerId = Guid.NewGuid();

        await h.WithDbAsync(async db =>
        {
            db.Clinics.AddRange(
                new Clinic { Id = clinicA, Name = "Clinic A", TenantId = PatientInteropHarness.TenantA, IsPublic = true },
                new Clinic { Id = clinicB, Name = "Clinic B", TenantId = PatientInteropHarness.TenantB, IsPublic = true });
            db.Practitioners.Add(new Practitioner
            {
                Id = practitionerId,
                ProfessionKind = "Doctor",
                NormalizedPrcLicenseNo = "0055555",
                DisplayPrcLicenseNo = "PRC-0055555",
                VerificationLevel = PractitionerVerificationLevel.Verified,
                Name = "Dr. Marco Cruz",
                FirstName = "Marco",
                LastName = "Cruz",
                PrimarySpecialty = "Surgery"
            });
            db.ClinicHealthcareProviders.AddRange(
                new ClinicHealthcareProvider
                {
                    Id = staffA,
                    ClinicId = clinicA,
                    PractitionerId = practitionerId,
                    Name = "Dr. Marco Cruz",
                    Specialty = "Surgery",
                    Role = "Doctor",
                    NormalizedLicenseNo = "0055555",
                    AffiliationStatus = "Active"
                },
                new ClinicHealthcareProvider
                {
                    Id = staffB,
                    ClinicId = clinicB,
                    PractitionerId = practitionerId,
                    Name = "Dr. Marco Cruz",
                    Specialty = "Surgery",
                    Role = "Doctor",
                    NormalizedLicenseNo = "0055555",
                    AffiliationStatus = "Active"
                });
            await db.SaveChangesAsync();
        });

        // 1. Targeted affiliation suspension at Clinic A only
        var targetedPayload = new PractitionerVerificationRevokedPayload
        {
            PractitionerId = practitionerId,
            FacilityId = clinicA,
            ClinicStaffMemberId = staffA,
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0055555",
            NewStatus = PractitionerVerificationLevel.Suspended,
            Reason = "Suspended at Clinic A"
        };
        await h.DeliverAsync(InteropEnvelope.Create(
            InteropTypes.PractitionerVerificationRevoked,
            PatientInteropHarness.Portal,
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            Guid.NewGuid(),
            targetedPayload));

        var afterTargetedA = await h.WithDbAsync(db => db.ClinicHealthcareProviders.AsNoTracking().SingleAsync(p => p.Id == staffA));
        var afterTargetedB = await h.WithDbAsync(db => db.ClinicHealthcareProviders.AsNoTracking().SingleAsync(p => p.Id == staffB));
        afterTargetedA.AffiliationStatus.Should().Be("Suspended");
        afterTargetedB.AffiliationStatus.Should().Be("Active");

        // 2. Practitioner-wide revocation marks all remaining affiliations Revoked
        var allPayload = new PractitionerVerificationRevokedPayload
        {
            PractitionerId = practitionerId,
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0055555",
            NewStatus = PractitionerVerificationLevel.Expired,
            Reason = "PRC license expired"
        };
        await h.DeliverAsync(InteropEnvelope.Create(
            InteropTypes.PractitionerVerificationRevoked,
            PatientInteropHarness.Portal,
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            Guid.NewGuid(),
            allPayload));

        var practAfter = await h.WithDbAsync(db => db.Practitioners.AsNoTracking().SingleAsync(p => p.Id == practitionerId));
        practAfter.VerificationLevel.Should().Be(PractitionerVerificationLevel.Expired);
        var allProviders = await h.WithDbAsync(db => db.ClinicHealthcareProviders.AsNoTracking().Where(p => p.PractitionerId == practitionerId).ToListAsync());
        allProviders.Should().OnlyContain(p => p.AffiliationStatus == "Revoked");
    }

    [Fact]
    public void Every_message_type_patient_api_receives_has_a_handler()
    {
        using var h = new PatientInteropHarness();

        h.Provider.GetRequiredService<InteropHandlerRegistry>().RegisteredTypes.Should().BeEquivalentTo(
            InteropTypes.FacilityDirectoryUpdated,
            InteropTypes.PractitionerIdentityUpdated, InteropTypes.PractitionerVerificationRevoked,
            InteropTypes.ClinicRecordVerified, InteropTypes.ClinicAppointmentUpdated,
            InteropTypes.PatientShareRedeem, InteropTypes.PatientDocumentIssued, InteropTypes.LabOrderStatusChanged,
            InteropTypes.RxStatusChanged, InteropTypes.LabResultReviewed, InteropTypes.ClinicalImmunizationAdministered,
            InteropTypes.PatientQueueAlert, InteropTypes.PatientAppointmentAlert,
            InteropTypes.CommsMessageReplicate, InteropTypes.CommsMessageReceived,
            InteropTypes.CommsThreadStateChanged, InteropTypes.CommsEligibilitySynced,
            InteropTypes.CommsCallStateChanged);
    }

    [Fact]
    public async Task Directory_update_syncs_prefixed_join_code_and_expiry_and_clears_when_removed()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();
        var clinicSender = PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA);
        var expiresAt = DateTime.UtcNow.AddDays(7);

        await h.DeliverAsync(DirectoryUpdate(clinicSender, new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Nextstep OPD",
            IsDirectoryPublished = true,
            IsJoinGated = true,
            JoinCode = " 45f9-lf9zs5lt ",
            JoinCodeExpiresAtUtc = expiresAt
        }));

        var synced = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        synced.IsGated.Should().BeTrue();
        synced.JoinCode.Should().Be("45F9-LF9ZS5LT");
        synced.JoinCodeExpiresAt.Should().BeCloseTo(expiresAt, TimeSpan.FromMilliseconds(10));

        await h.DeliverAsync(DirectoryUpdate(clinicSender, new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Nextstep OPD",
            IsDirectoryPublished = true,
            IsJoinGated = false,
            JoinCode = null,
            JoinCodeExpiresAtUtc = null
        }));

        var cleared = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        cleared.IsGated.Should().BeFalse();
        cleared.JoinCode.Should().BeNull();
        cleared.JoinCodeExpiresAt.Should().BeNull();
    }
}
