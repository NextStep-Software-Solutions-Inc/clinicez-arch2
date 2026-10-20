using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Interop;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

public class PatientAppointmentAlertChallengerTests
{
    private static async Task<Guid> SeedPatientAsync(PatientInteropHarness h, string? pushToken = null)
    {
        var patientId = Guid.NewGuid();
        await h.WithDbAsync(async db =>
        {
            db.Patients.Add(new Patient
            {
                Id = patientId,
                ClerkUserId = $"clerk_{patientId:N}",
                FirstName = "Juan",
                LastName = "Luna",
                Mobile = "+639170000001",
                Email = "juan.luna@example.test",
                DateOfBirth = new DateOnly(1857, 10, 23)
            });

            if (!string.IsNullOrWhiteSpace(pushToken))
            {
                db.DeviceSessions.Add(new DeviceSession
                {
                    Id = Guid.NewGuid(),
                    PatientId = patientId,
                    DeviceId = "device_test_1",
                    DeviceLabel = "iOS Test",
                    ClerkSessionId = "clerk_sess_1",
                    PushToken = pushToken,
                    LastActiveAt = DateTime.UtcNow,
                    IsRevoked = false
                });
            }

            await db.SaveChangesAsync();
        });

        return patientId;
    }

    [Fact]
    public void Registry_includes_PatientAppointmentAlert_message_type()
    {
        using var h = new PatientInteropHarness();
        var registry = h.Provider.GetRequiredService<InteropHandlerRegistry>();
        registry.RegisteredTypes.Should().Contain(InteropTypes.PatientAppointmentAlert);
    }

    [Fact]
    public async Task HandleAsync_ignores_message_when_recipient_kind_is_not_Patient()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h, "token_123");
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var payload = new PatientAppointmentAlertPayload(
            AppointmentId: appointmentId,
            ClinicId: clinicId,
            ClinicName: "City Clinic",
            DoctorId: null,
            DoctorName: null,
            ServiceType: null,
            ScheduledAtUtc: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            AlertKind: AppointmentAlertKinds.Booked,
            Message: "Appointment booked",
            TimestampUtc: DateTime.UtcNow);

        // Recipient kind is ControlPlane (Portal) instead of Patient
        var nonPatientTarget = Party.Portal;
        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            nonPatientTarget,
            appointmentId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);

        var count = await h.WithDbAsync(db => db.Notifications.CountAsync());
        count.Should().Be(0);

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();
        await pushService.DidNotReceiveWithAnyArgs().SendPushNotificationAsync(default!, default!, default!, default!, default);
    }

    [Fact]
    public async Task HandleAsync_ignores_message_when_patient_id_is_invalid_guid()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var payload = new PatientAppointmentAlertPayload(
            AppointmentId: appointmentId,
            ClinicId: clinicId,
            ClinicName: "City Clinic",
            DoctorId: null,
            DoctorName: null,
            ServiceType: null,
            ScheduledAtUtc: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            AlertKind: AppointmentAlertKinds.Booked,
            Message: "Appointment booked",
            TimestampUtc: DateTime.UtcNow);

        var invalidTarget = Party.ForPatient("invalid-guid-12345");
        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            invalidTarget,
            appointmentId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);

        var count = await h.WithDbAsync(db => db.Notifications.CountAsync());
        count.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_ignores_message_when_patient_not_found_in_database()
    {
        using var h = new PatientInteropHarness();
        var nonExistentPatientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var payload = new PatientAppointmentAlertPayload(
            AppointmentId: appointmentId,
            ClinicId: clinicId,
            ClinicName: "City Clinic",
            DoctorId: null,
            DoctorName: null,
            ServiceType: null,
            ScheduledAtUtc: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            AlertKind: AppointmentAlertKinds.Booked,
            Message: "Appointment booked",
            TimestampUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(nonExistentPatientId),
            appointmentId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);

        var count = await h.WithDbAsync(db => db.Notifications.CountAsync());
        count.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_is_strictly_idempotent_on_repeated_delivery()
    {
        using var h = new PatientInteropHarness();
        const string pushToken = "token_idem_999";
        var patientId = await SeedPatientAsync(h, pushToken);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var payload = new PatientAppointmentAlertPayload(
            AppointmentId: appointmentId,
            ClinicId: clinicId,
            ClinicName: "Capitol Health",
            DoctorId: null,
            DoctorName: null,
            ServiceType: "Consultation",
            ScheduledAtUtc: DateTime.UtcNow.AddHours(24),
            DurationMinutes: 15,
            AlertKind: AppointmentAlertKinds.Reminder24h,
            Message: "Reminder for your appointment tomorrow",
            TimestampUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        // 3 consecutive deliveries
        await h.Dispatcher.DispatchAsync(envelope, default);
        await h.Dispatcher.DispatchAsync(envelope with { MessageId = Guid.NewGuid() }, default);
        await h.Dispatcher.DispatchAsync(envelope with { MessageId = Guid.NewGuid() }, default);

        var notifs = await h.WithDbAsync(db => db.Notifications.Where(n => n.PatientId == patientId).ToListAsync());
        notifs.Should().HaveCount(1);
        notifs[0].SourceId.Should().Be($"appointment:{appointmentId}:{AppointmentAlertKinds.Reminder24h}");

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();
        await pushService.Received(1).SendPushNotificationAsync(
            pushToken,
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_creates_separate_notifications_for_different_alert_kinds_on_same_appointment()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var kinds = new[]
        {
            AppointmentAlertKinds.Booked,
            AppointmentAlertKinds.Reminder24h,
            AppointmentAlertKinds.Reminder2h,
            AppointmentAlertKinds.Rescheduled,
            AppointmentAlertKinds.Cancelled
        };

        foreach (var kind in kinds)
        {
            var payload = new PatientAppointmentAlertPayload(
                AppointmentId: appointmentId,
                ClinicId: clinicId,
                ClinicName: "Metro Clinic",
                DoctorId: null,
                DoctorName: null,
                ServiceType: null,
                ScheduledAtUtc: DateTime.UtcNow.AddDays(1),
                DurationMinutes: 30,
                AlertKind: kind,
                Message: $"Alert for {kind}",
                TimestampUtc: DateTime.UtcNow);

            var envelope = InteropEnvelope.Create(
                InteropTypes.PatientAppointmentAlert,
                PatientInteropHarness.Clinic(clinicId),
                PatientInteropHarness.Patient(patientId),
                appointmentId,
                payload);

            await h.Dispatcher.DispatchAsync(envelope, default);
        }

        var notifs = await h.WithDbAsync(db => db.Notifications.Where(n => n.PatientId == patientId).ToListAsync());
        notifs.Should().HaveCount(kinds.Length);
        notifs.Select(n => n.SourceId).Should().BeEquivalentTo(kinds.Select(k => $"appointment:{appointmentId}:{k}"));
    }

    [Theory]
    [InlineData("appointment_booked", "Clinic A", "Appointment Confirmed: Clinic A")]
    [InlineData("appointment_rescheduled", "Clinic A", "Appointment Rescheduled: Clinic A")]
    [InlineData("appointment_cancelled", "Clinic A", "Appointment Cancelled: Clinic A")]
    [InlineData("appointment_reminder_24h", "Clinic A", "Appointment Reminder (Tomorrow): Clinic A")]
    [InlineData("appointment_reminder_2h", "Clinic A", "Appointment Reminder (In 2 Hours): Clinic A")]
    [InlineData("appointment_reminder_manual", "Clinic A", "Appointment Reminder: Clinic A")]
    [InlineData("unknown_custom_alert", "Clinic A", "Appointment Notice: Clinic A")]
    [InlineData("appointment_booked", "", "Appointment Confirmed")]
    [InlineData("appointment_booked", null, "Appointment Confirmed")]
    public async Task HandleAsync_resolves_expected_title_for_all_alert_kinds_and_empty_clinic_name(
        string alertKind, string? clinicName, string expectedTitle)
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var payload = new PatientAppointmentAlertPayload(
            AppointmentId: appointmentId,
            ClinicId: clinicId,
            ClinicName: clinicName!,
            DoctorId: null,
            DoctorName: null,
            ServiceType: null,
            ScheduledAtUtc: DateTime.UtcNow,
            DurationMinutes: 30,
            AlertKind: alertKind,
            Message: "Test body message",
            TimestampUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);

        var notif = await h.WithDbAsync(db => db.Notifications.SingleAsync(n => n.PatientId == patientId));
        notif.Title.Should().Be(expectedTitle);
    }

    [Fact]
    public async Task HandleAsync_deduplicates_push_tokens_and_ignores_empty_or_whitespace_tokens()
    {
        using var h = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        const string validToken1 = "tok_unique_1";
        const string validToken2 = "tok_unique_2";

        await h.WithDbAsync(async db =>
        {
            db.Patients.Add(new Patient
            {
                Id = patientId,
                ClerkUserId = "clerk_multi_device",
                FirstName = "Emilio",
                LastName = "Aguinaldo",
                Mobile = "+639170000002",
                Email = "emilio@example.test",
                DateOfBirth = new DateOnly(1869, 3, 22)
            });

            // Add duplicate token, valid token 2, whitespace token, null token
            db.DeviceSessions.AddRange(
                new DeviceSession { Id = Guid.NewGuid(), PatientId = patientId, DeviceId = "d1", PushToken = validToken1, IsRevoked = false },
                new DeviceSession { Id = Guid.NewGuid(), PatientId = patientId, DeviceId = "d2", PushToken = validToken1, IsRevoked = false }, // duplicate
                new DeviceSession { Id = Guid.NewGuid(), PatientId = patientId, DeviceId = "d3", PushToken = validToken2, IsRevoked = false },
                new DeviceSession { Id = Guid.NewGuid(), PatientId = patientId, DeviceId = "d4", PushToken = "   ", IsRevoked = false },      // whitespace
                new DeviceSession { Id = Guid.NewGuid(), PatientId = patientId, DeviceId = "d5", PushToken = null, IsRevoked = false }         // null
            );
            await db.SaveChangesAsync();
        });

        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var payload = new PatientAppointmentAlertPayload(
            AppointmentId: appointmentId,
            ClinicId: clinicId,
            ClinicName: "Cavite Medical",
            DoctorId: null,
            DoctorName: null,
            ServiceType: null,
            ScheduledAtUtc: DateTime.UtcNow,
            DurationMinutes: 15,
            AlertKind: AppointmentAlertKinds.Booked,
            Message: "Appointment Booked",
            TimestampUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();
        await pushService.Received(1).SendPushNotificationAsync(validToken1, Arg.Any<string>(), Arg.Any<string>(), "appointment", Arg.Any<CancellationToken>());
        await pushService.Received(1).SendPushNotificationAsync(validToken2, Arg.Any<string>(), Arg.Any<string>(), "appointment", Arg.Any<CancellationToken>());
        await pushService.Received(2).SendPushNotificationAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), "appointment", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_saves_in_app_notification_even_when_push_service_throws_exception()
    {
        using var h = new PatientInteropHarness();
        const string failToken = "fail_token_throw";
        var patientId = await SeedPatientAsync(h, failToken);

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();
        pushService.SendPushNotificationAsync(failToken, Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new InvalidOperationException("FCM service timeout"));

        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var payload = new PatientAppointmentAlertPayload(
            AppointmentId: appointmentId,
            ClinicId: clinicId,
            ClinicName: "Resilient Health",
            DoctorId: null,
            DoctorName: null,
            ServiceType: null,
            ScheduledAtUtc: DateTime.UtcNow,
            DurationMinutes: 30,
            AlertKind: AppointmentAlertKinds.Reminder2h,
            Message: "Upcoming appointment alert",
            TimestampUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        // Should not throw exception
        var act = () => h.Dispatcher.DispatchAsync(envelope, default);
        await act.Should().NotThrowAsync();

        // Notification must still be saved
        var notif = await h.WithDbAsync(db => db.Notifications.SingleOrDefaultAsync(n => n.PatientId == patientId));
        notif.Should().NotBeNull();
        notif!.Body.Should().Be("Upcoming appointment alert");
    }

    [Fact]
    public async Task HandleAsync_persists_full_fidelity_json_payload()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var scheduledUtc = DateTime.UtcNow.AddDays(3);
        var timestampUtc = DateTime.UtcNow;

        var payload = new PatientAppointmentAlertPayload(
            AppointmentId: appointmentId,
            ClinicId: clinicId,
            ClinicName: "Apex Medical",
            DoctorId: doctorId,
            DoctorName: "Dr. Antonio Luna",
            ServiceType: "Specialist Consultation",
            ScheduledAtUtc: scheduledUtc,
            DurationMinutes: 45,
            AlertKind: AppointmentAlertKinds.Booked,
            Message: "Your appointment is confirmed.",
            TimestampUtc: timestampUtc);

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);

        var notif = await h.WithDbAsync(db => db.Notifications.SingleAsync(n => n.PatientId == patientId));
        notif.Payload.Should().NotBeNullOrWhiteSpace();

        using var doc = JsonDocument.Parse(notif.Payload!);
        var root = doc.RootElement;

        root.GetProperty("appointmentId").GetGuid().Should().Be(appointmentId);
        root.GetProperty("clinicId").GetGuid().Should().Be(clinicId);
        root.GetProperty("clinicName").GetString().Should().Be("Apex Medical");
        root.GetProperty("doctorId").GetGuid().Should().Be(doctorId);
        root.GetProperty("doctorName").GetString().Should().Be("Dr. Antonio Luna");
        root.GetProperty("serviceType").GetString().Should().Be("Specialist Consultation");
        root.GetProperty("durationMinutes").GetInt32().Should().Be(45);
        root.GetProperty("alertKind").GetString().Should().Be("appointment_booked");
        root.GetProperty("message").GetString().Should().Be("Your appointment is confirmed.");
        notif.Type.Should().Be(NotificationType.AppointmentReminder);
        notif.Category.Should().Be(NotificationCategory.Appointments);
    }
}
