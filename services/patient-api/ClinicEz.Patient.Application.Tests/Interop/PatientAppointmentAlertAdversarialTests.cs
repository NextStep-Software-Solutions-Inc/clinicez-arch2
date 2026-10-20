using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
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

public sealed class PatientAppointmentAlertAdversarialTests
{
    private static async Task<Guid> SeedPatientAsync(PatientInteropHarness h, string mobile = "+639170000001")
    {
        var patientId = Guid.NewGuid();
        await h.WithDbAsync(async db =>
        {
            db.Patients.Add(new Patient
            {
                Id = patientId,
                ClerkUserId = $"clerk_{patientId:N}",
                FirstName = "Adversarial",
                LastName = "Tester",
                Mobile = mobile,
                Email = $"adv_{patientId:N}@example.test",
                DateOfBirth = new DateOnly(1985, 3, 15)
            });
            await db.SaveChangesAsync();
        });
        return patientId;
    }

    private static PatientAppointmentAlertPayload CreatePayload(
        Guid appointmentId,
        Guid clinicId,
        string clinicName = "Metro General Clinic",
        Guid? doctorId = null,
        string? doctorName = null,
        string? serviceType = null,
        string alertKind = AppointmentAlertKinds.Booked,
        string message = "Your appointment is confirmed.") =>
        new(
            AppointmentId: appointmentId,
            ClinicId: clinicId,
            ClinicName: clinicName,
            DoctorId: doctorId,
            DoctorName: doctorName,
            ServiceType: serviceType,
            ScheduledAtUtc: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            AlertKind: alertKind,
            Message: message,
            TimestampUtc: DateTime.UtcNow);

    [Fact]
    public async Task DuplicateDelivery_WithIdenticalMessageId_IsHandledOnceAndSkippedOnSecond()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        const string pushToken = "token_dup_identical_mid";

        await h.WithDbAsync(async db =>
        {
            db.DeviceSessions.Add(new DeviceSession
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                DeviceId = "dev_1",
                DeviceLabel = "Phone",
                ClerkSessionId = "sess_1",
                PushToken = pushToken,
                LastActiveAt = DateTime.UtcNow,
                IsRevoked = false
            });
            await db.SaveChangesAsync();
        });

        var payload = CreatePayload(appointmentId, clinicId, alertKind: AppointmentAlertKinds.Booked);
        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        // First delivery
        var result1 = await h.Dispatcher.DispatchAsync(envelope, default);
        result1.Outcome.Should().Be(DispatchOutcome.Handled);

        // Second delivery with identical MessageId
        var result2 = await h.Dispatcher.DispatchAsync(envelope, default);
        // Note: InteropDispatcher tracks processed message IDs in Inbox; handler also guards via SourceId.
        result2.Outcome.Should().BeOneOf(DispatchOutcome.Handled, DispatchOutcome.Duplicate);

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
    public async Task DuplicateDelivery_WithDistinctMessageIds_IsHandledOnceAndIdempotentlySkipped()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        const string pushToken = "token_dup_distinct_mid";

        await h.WithDbAsync(async db =>
        {
            db.DeviceSessions.Add(new DeviceSession
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                DeviceId = "dev_2",
                DeviceLabel = "Tablet",
                ClerkSessionId = "sess_2",
                PushToken = pushToken,
                LastActiveAt = DateTime.UtcNow,
                IsRevoked = false
            });
            await db.SaveChangesAsync();
        });

        var payload = CreatePayload(appointmentId, clinicId, alertKind: AppointmentAlertKinds.Reminder24h);
        var envelope1 = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        var envelope2 = envelope1 with { MessageId = Guid.NewGuid() };

        // First delivery
        await h.Dispatcher.DispatchAsync(envelope1, default);
        // Second delivery with new message ID (simulating redelivery from outbox/relay)
        await h.Dispatcher.DispatchAsync(envelope2, default);

        var notifications = await h.WithDbAsync(db => db.Notifications.AsNoTracking().Where(n => n.PatientId == patientId).ToListAsync());
        notifications.Should().ContainSingle();
        notifications[0].SourceId.Should().Be($"appointment:{appointmentId}:{AppointmentAlertKinds.Reminder24h}");

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();
        await pushService.Received(1).SendPushNotificationAsync(
            pushToken,
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task MultipleDeviceSessions_WithDuplicatePushTokens_DeduplicatesTokensBeforeDispatch()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        const string sharedToken = "fcm_token_shared_between_sessions";
        const string uniqueToken = "fcm_token_unique_phone";

        await h.WithDbAsync(async db =>
        {
            // Session 1: shared token
            db.DeviceSessions.Add(new DeviceSession
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                DeviceId = "device_1",
                DeviceLabel = "Web Browser 1",
                ClerkSessionId = "sess_web_1",
                PushToken = sharedToken,
                LastActiveAt = DateTime.UtcNow,
                IsRevoked = false
            });
            // Session 2: duplicate shared token
            db.DeviceSessions.Add(new DeviceSession
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                DeviceId = "device_2",
                DeviceLabel = "Web Browser 2",
                ClerkSessionId = "sess_web_2",
                PushToken = sharedToken,
                LastActiveAt = DateTime.UtcNow,
                IsRevoked = false
            });
            // Session 3: unique distinct token
            db.DeviceSessions.Add(new DeviceSession
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                DeviceId = "device_3",
                DeviceLabel = "Mobile iOS",
                ClerkSessionId = "sess_ios",
                PushToken = uniqueToken,
                LastActiveAt = DateTime.UtcNow,
                IsRevoked = false
            });
            // Session 4: empty token (should be ignored)
            db.DeviceSessions.Add(new DeviceSession
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                DeviceId = "device_4",
                DeviceLabel = "Mobile Android Old",
                ClerkSessionId = "sess_android_old",
                PushToken = "   ",
                LastActiveAt = DateTime.UtcNow,
                IsRevoked = false
            });
            // Session 5: null token (should be ignored)
            db.DeviceSessions.Add(new DeviceSession
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                DeviceId = "device_5",
                DeviceLabel = "Desktop",
                ClerkSessionId = "sess_desktop",
                PushToken = null,
                LastActiveAt = DateTime.UtcNow,
                IsRevoked = false
            });
            await db.SaveChangesAsync();
        });

        var payload = CreatePayload(appointmentId, clinicId, alertKind: AppointmentAlertKinds.Booked);
        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();

        // Exactly 1 call for sharedToken
        await pushService.Received(1).SendPushNotificationAsync(
            sharedToken,
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>());

        // Exactly 1 call for uniqueToken
        await pushService.Received(1).SendPushNotificationAsync(
            uniqueToken,
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>());

        // Total push calls must be exactly 2
        await pushService.Received(2).SendPushNotificationAsync(
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Resilience_WithNullDoctorId_NullDoctorName_NullServiceType_SucceedsAndSerializesCleanly()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var payload = CreatePayload(
            appointmentId: appointmentId,
            clinicId: clinicId,
            clinicName: "Community Health Care",
            doctorId: null,
            doctorName: null,
            serviceType: null,
            alertKind: AppointmentAlertKinds.Booked,
            message: "Your appointment is confirmed at Community Health Care.");

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);

        var notif = await h.WithDbAsync(db => db.Notifications.AsNoTracking().SingleAsync(n => n.PatientId == patientId));
        notif.Title.Should().Be("Appointment Confirmed: Community Health Care");
        notif.Body.Should().Be(payload.Message);

        // Verify JSON payload deserializes cleanly and reflects nulls
        using var doc = JsonDocument.Parse(notif.Payload!);
        var root = doc.RootElement;
        root.GetProperty("appointmentId").GetGuid().Should().Be(appointmentId);
        root.GetProperty("doctorId").ValueKind.Should().Be(JsonValueKind.Null);
        root.GetProperty("doctorName").ValueKind.Should().Be(JsonValueKind.Null);
        root.GetProperty("serviceType").ValueKind.Should().Be(JsonValueKind.Null);
        root.GetProperty("clinicName").GetString().Should().Be("Community Health Care");
    }

    [Fact]
    public async Task Resilience_WithNullOrWhitespaceClinicName_ResolvesTitleCleanlyWithoutColon()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var payload = CreatePayload(
            appointmentId: appointmentId,
            clinicId: clinicId,
            clinicName: "   ", // whitespace clinic name
            alertKind: AppointmentAlertKinds.Rescheduled);

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);

        var notif = await h.WithDbAsync(db => db.Notifications.AsNoTracking().SingleAsync(n => n.PatientId == patientId));
        notif.Title.Should().Be("Appointment Rescheduled");
    }

    [Fact]
    public async Task Resilience_WithUnknownAlertKind_FallsBackToDefaultTitle()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var payload = CreatePayload(
            appointmentId: appointmentId,
            clinicId: clinicId,
            clinicName: "Test Clinic",
            alertKind: "custom_unrecognized_kind");

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);

        var notif = await h.WithDbAsync(db => db.Notifications.AsNoTracking().SingleAsync(n => n.PatientId == patientId));
        notif.Title.Should().Be("Appointment Notice: Test Clinic");
    }

    [Fact]
    public async Task MultiLifecycle_DifferentAlertKindsForSameAppointment_AreAllRecorded()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        const string pushToken = "fcm_lifecycle_token";

        await h.WithDbAsync(async db =>
        {
            db.DeviceSessions.Add(new DeviceSession
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                DeviceId = "dev_lifecycle",
                DeviceLabel = "Device",
                ClerkSessionId = "sess_life",
                PushToken = pushToken,
                LastActiveAt = DateTime.UtcNow,
                IsRevoked = false
            });
            await db.SaveChangesAsync();
        });

        var kinds = new[]
        {
            AppointmentAlertKinds.Booked,
            AppointmentAlertKinds.Reminder24h,
            AppointmentAlertKinds.Reminder2h,
            AppointmentAlertKinds.Cancelled
        };

        foreach (var kind in kinds)
        {
            var payload = CreatePayload(appointmentId, clinicId, alertKind: kind, message: $"Alert: {kind}");
            var envelope = InteropEnvelope.Create(
                InteropTypes.PatientAppointmentAlert,
                PatientInteropHarness.Clinic(clinicId),
                PatientInteropHarness.Patient(patientId),
                appointmentId,
                payload);

            await h.Dispatcher.DispatchAsync(envelope, default);
        }

        var notifications = await h.WithDbAsync(db => db.Notifications.AsNoTracking().Where(n => n.PatientId == patientId).ToListAsync());
        notifications.Should().HaveCount(4);
        notifications.Select(n => n.SourceId).Should().BeEquivalentTo(
            $"appointment:{appointmentId}:{AppointmentAlertKinds.Booked}",
            $"appointment:{appointmentId}:{AppointmentAlertKinds.Reminder24h}",
            $"appointment:{appointmentId}:{AppointmentAlertKinds.Reminder2h}",
            $"appointment:{appointmentId}:{AppointmentAlertKinds.Cancelled}"
        );

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();
        await pushService.Received(4).SendPushNotificationAsync(
            pushToken,
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task PushNotificationException_DoesNotRollbackOrThrow()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        await h.WithDbAsync(async db =>
        {
            db.DeviceSessions.Add(new DeviceSession
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                DeviceId = "dev_err",
                DeviceLabel = "Device",
                ClerkSessionId = "sess_err",
                PushToken = "fcm_failing_token",
                LastActiveAt = DateTime.UtcNow,
                IsRevoked = false
            });
            await db.SaveChangesAsync();
        });

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();
        pushService.SendPushNotificationAsync(
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>())
            .ThrowsAsync(new InvalidOperationException("FCM service gateway timeout"));

        var payload = CreatePayload(appointmentId, clinicId, alertKind: AppointmentAlertKinds.Booked);
        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        var outcome = await h.Dispatcher.DispatchAsync(envelope, default);
        outcome.Outcome.Should().Be(DispatchOutcome.Handled);

        // In-app notification must still be committed!
        var notif = await h.WithDbAsync(db => db.Notifications.AsNoTracking().SingleOrDefaultAsync(n => n.PatientId == patientId));
        notif.Should().NotBeNull();
        notif!.SourceId.Should().Be($"appointment:{appointmentId}:{AppointmentAlertKinds.Booked}");
    }

    [Fact]
    public async Task RecipientKindNotPatient_IsIgnoredWithoutPersistingOrThrowing()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var payload = CreatePayload(appointmentId, clinicId);
        // Address envelope to a Facility instead of a Patient
        var invalidTo = PatientInteropHarness.Clinic(clinicId);
        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            invalidTo,
            appointmentId,
            payload);

        var result = await h.Dispatcher.DispatchAsync(envelope, default);
        result.Outcome.Should().Be(DispatchOutcome.Handled);

        var count = await h.WithDbAsync(db => db.Notifications.CountAsync());
        count.Should().Be(0);

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();
        await pushService.DidNotReceive().SendPushNotificationAsync(
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task NonExistentPatient_IsIgnoredWithoutPersistingOrThrowing()
    {
        using var h = new PatientInteropHarness();
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var nonExistentPatientId = Guid.NewGuid();

        var payload = CreatePayload(appointmentId, clinicId);
        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(nonExistentPatientId),
            appointmentId,
            payload);

        var result = await h.Dispatcher.DispatchAsync(envelope, default);
        result.Outcome.Should().Be(DispatchOutcome.Handled);

        var count = await h.WithDbAsync(db => db.Notifications.CountAsync());
        count.Should().Be(0);

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();
        await pushService.DidNotReceive().SendPushNotificationAsync(
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task PatientWithZeroDeviceSessions_PersistsNotificationWithoutPushCalls()
    {
        using var h = new PatientInteropHarness();
        var patientId = await SeedPatientAsync(h);
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        var payload = CreatePayload(appointmentId, clinicId, alertKind: AppointmentAlertKinds.ManualReminder);
        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentAlert,
            PatientInteropHarness.Clinic(clinicId),
            PatientInteropHarness.Patient(patientId),
            appointmentId,
            payload);

        await h.Dispatcher.DispatchAsync(envelope, default);

        var notif = await h.WithDbAsync(db => db.Notifications.AsNoTracking().SingleAsync(n => n.PatientId == patientId));
        notif.Title.Should().Be("Appointment Reminder: Metro General Clinic");
        notif.SourceId.Should().Be($"appointment:{appointmentId}:{AppointmentAlertKinds.ManualReminder}");

        var pushService = h.Provider.GetRequiredService<IPushNotificationService>();
        await pushService.DidNotReceive().SendPushNotificationAsync(
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>());
    }
}
