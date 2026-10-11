using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.SubmitBookingDraft;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

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
    public async Task Directory_update_from_anyone_but_the_portal_is_ignored()
    {
        using var h = new PatientInteropHarness();
        var payload = new FacilityCreatedEvent
        {
            ResourceId = Guid.NewGuid(), TenantId = PatientInteropHarness.TenantA, FacilityType = FacilityType.Clinic, Name = "Forged"
        };

        await h.DeliverAsync(DirectoryUpdate(PatientInteropHarness.Clinic(Guid.NewGuid()), payload));

        (await h.WithDbAsync(db => db.Clinics.CountAsync())).Should().Be(0);
    }

    [Fact]
    public void Every_message_type_patient_api_receives_has_a_handler()
    {
        using var h = new PatientInteropHarness();

        h.Provider.GetRequiredService<InteropHandlerRegistry>().RegisteredTypes.Should().BeEquivalentTo(
            InteropTypes.FacilityDirectoryUpdated, InteropTypes.ClinicRecordVerified, InteropTypes.ClinicAppointmentUpdated,
            InteropTypes.PatientShareRedeem, InteropTypes.PatientDocumentIssued, InteropTypes.LabOrderStatusChanged,
            InteropTypes.RxStatusChanged, InteropTypes.LabResultReviewed, InteropTypes.ClinicalImmunizationAdministered);
    }
}
