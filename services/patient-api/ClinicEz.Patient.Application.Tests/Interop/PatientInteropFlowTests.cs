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
                PreferredDate = new DateOnly(2026, 10, 15), PreferredTime = "14:00", Reason = "Checkup",
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

        // 1. Portal sends directory update enabling discovery eligibility
        var portalPayload = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "St. Jude Family Care",
            IsPublic = true,
            IsWorkspaceEligible = true
        };
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, portalPayload));

        // Eligible in workspace, but not published by clinic -> IsPublic MUST BE FALSE
        var clinicAfterPortal = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        clinicAfterPortal.IsWorkspaceEligible.Should().BeTrue();
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

        // Both tiers satisfied -> IsPublic MUST NOW BE TRUE
        var clinicAfterBoth = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        clinicAfterBoth.IsWorkspaceEligible.Should().BeTrue();
        clinicAfterBoth.IsDirectoryPublished.Should().BeTrue();
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
        clinicAfterClinic.IsDirectoryPublished.Should().BeTrue();
        clinicAfterClinic.IsPublic.Should().BeFalse();

        // 2. Portal later grants discovery eligibility
        var portalPayload = clinicPayload with
        {
            IsPublic = true,
            IsWorkspaceEligible = true
        };
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, portalPayload));

        // Both tiers satisfied -> IsPublic MUST NOW BE TRUE
        var clinicAfterBoth = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        clinicAfterBoth.IsWorkspaceEligible.Should().BeTrue();
        clinicAfterBoth.IsDirectoryPublished.Should().BeTrue();
        clinicAfterBoth.IsPublic.Should().BeTrue();
    }

    [Fact]
    public async Task TwoTierGovernance_WhenWorkspaceRevokesEligibility_ClinicBecomesPrivateWhileRetainingClinicPublishedState()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();

        // Setup: Clinic is in State 3 (Fully Published)
        var payload = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = PatientInteropHarness.TenantA,
            FacilityType = FacilityType.Clinic,
            Name = "Makati Medical Center",
            IsPublic = true
        };
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, payload));
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Clinic(clinicId, PatientInteropHarness.TenantA), payload));

        (await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId))).IsPublic.Should().BeTrue();

        // Portal revokes discovery eligibility
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, payload with { IsPublic = false, IsWorkspaceEligible = false }));

        var revokedClinic = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        revokedClinic.IsWorkspaceEligible.Should().BeFalse();
        revokedClinic.IsDirectoryPublished.Should().BeTrue(); // Clinic state preserved!
        revokedClinic.IsPublic.Should().BeFalse();             // Hidden from patients

        // Portal re-enables eligibility
        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Portal, payload with { IsPublic = true, IsWorkspaceEligible = true }));

        var restoredClinic = await h.WithDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == clinicId));
        restoredClinic.IsWorkspaceEligible.Should().BeTrue();
        restoredClinic.IsDirectoryPublished.Should().BeTrue();
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
            IsPublic = true
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
            IsPublic = true
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
    public void Every_message_type_patient_api_receives_has_a_handler()
    {
        using var h = new PatientInteropHarness();

        h.Provider.GetRequiredService<InteropHandlerRegistry>().RegisteredTypes.Should().BeEquivalentTo(
            InteropTypes.FacilityDirectoryUpdated, InteropTypes.ClinicRecordVerified, InteropTypes.ClinicAppointmentUpdated,
            InteropTypes.PatientShareRedeem, InteropTypes.PatientDocumentIssued, InteropTypes.LabOrderStatusChanged,
            InteropTypes.RxStatusChanged, InteropTypes.LabResultReviewed, InteropTypes.ClinicalImmunizationAdministered,
            InteropTypes.PatientQueueAlert, InteropTypes.PatientAppointmentAlert);
    }
}
