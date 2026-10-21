using System;
using System.Text.Json;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Interop;

public class AppointmentNotificationContractChallengerTests
{
    [Fact]
    public void All_six_AppointmentAlertKinds_constants_match_spec_exactly()
    {
        AppointmentAlertKinds.Booked.Should().Be("appointment_booked");
        AppointmentAlertKinds.Rescheduled.Should().Be("appointment_rescheduled");
        AppointmentAlertKinds.Cancelled.Should().Be("appointment_cancelled");
        AppointmentAlertKinds.Reminder24h.Should().Be("appointment_reminder_24h");
        AppointmentAlertKinds.Reminder2h.Should().Be("appointment_reminder_2h");
        AppointmentAlertKinds.ManualReminder.Should().Be("appointment_reminder_manual");
    }

    [Fact]
    public void InteropTypes_PatientAppointmentAlert_constant_matches_spec_exactly()
    {
        InteropTypes.PatientAppointmentAlert.Should().Be("patient.appointment.alert");
    }

    [Theory]
    [InlineData("appointment_reminder_24h", true)]
    [InlineData("appointment_reminder_2h", true)]
    [InlineData("appointment_reminder_manual", true)]
    [InlineData("APPOINTMENT_REMINDER_24H", true)]
    [InlineData("APPOINTMENT_REMINDER_2H", true)]
    [InlineData("APPOINTMENT_REMINDER_MANUAL", true)]
    [InlineData("appointment_booked", false)]
    [InlineData("appointment_rescheduled", false)]
    [InlineData("appointment_cancelled", false)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData(null, false)]
    [InlineData("unknown_kind", false)]
    public void AppointmentAlertKinds_IsReminder_classifies_correctly(string? kind, bool expected)
    {
        AppointmentAlertKinds.IsReminder(kind).Should().Be(expected);
    }

    [Theory]
    [InlineData("appointment_booked", true)]
    [InlineData("appointment_rescheduled", true)]
    [InlineData("appointment_cancelled", true)]
    [InlineData("APPOINTMENT_BOOKED", true)]
    [InlineData("APPOINTMENT_RESCHEDULED", true)]
    [InlineData("APPOINTMENT_CANCELLED", true)]
    [InlineData("appointment_reminder_24h", false)]
    [InlineData("appointment_reminder_2h", false)]
    [InlineData("appointment_reminder_manual", false)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData(null, false)]
    [InlineData("unknown_kind", false)]
    public void AppointmentAlertKinds_IsLifecycle_classifies_correctly(string? kind, bool expected)
    {
        AppointmentAlertKinds.IsLifecycle(kind).Should().Be(expected);
    }

    [Fact]
    public void PatientAppointmentAlertPayload_serializes_and_deserializes_with_default_SystemTextJson()
    {
        var original = new PatientAppointmentAlertPayload(
            AppointmentId: Guid.NewGuid(),
            ClinicId: Guid.NewGuid(),
            ClinicName: "St. Jude Clinic",
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Juan dela Cruz",
            ServiceType: "Pediatric Consultation",
            ScheduledAtUtc: new DateTime(2026, 11, 15, 14, 30, 0, DateTimeKind.Utc),
            DurationMinutes: 45,
            AlertKind: AppointmentAlertKinds.Booked,
            Message: "Your appointment has been booked.",
            TimestampUtc: new DateTime(2026, 11, 1, 8, 0, 0, DateTimeKind.Utc)
        );

        var json = JsonSerializer.Serialize(original);
        json.Should().NotBeNullOrWhiteSpace();

        var deserialized = JsonSerializer.Deserialize<PatientAppointmentAlertPayload>(json);
        deserialized.Should().NotBeNull();
        deserialized.Should().Be(original);
        deserialized!.AppointmentId.Should().Be(original.AppointmentId);
        deserialized.ClinicId.Should().Be(original.ClinicId);
        deserialized.ClinicName.Should().Be("St. Jude Clinic");
        deserialized.DoctorId.Should().Be(original.DoctorId);
        deserialized.DoctorName.Should().Be("Dr. Juan dela Cruz");
        deserialized.ServiceType.Should().Be("Pediatric Consultation");
        deserialized.ScheduledAtUtc.Should().Be(original.ScheduledAtUtc);
        deserialized.DurationMinutes.Should().Be(45);
        deserialized.AlertKind.Should().Be("appointment_booked");
        deserialized.Message.Should().Be("Your appointment has been booked.");
        deserialized.TimestampUtc.Should().Be(original.TimestampUtc);
    }

    [Fact]
    public void PatientAppointmentAlertPayload_serializes_and_deserializes_with_camelCase_options()
    {
        var original = new PatientAppointmentAlertPayload(
            AppointmentId: Guid.NewGuid(),
            ClinicId: Guid.NewGuid(),
            ClinicName: "Makati Medical Satellite",
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Maria Santos",
            ServiceType: "Dental Checkup",
            ScheduledAtUtc: DateTime.UtcNow.AddDays(2),
            DurationMinutes: 60,
            AlertKind: AppointmentAlertKinds.Reminder24h,
            Message: "Reminder: You have an appointment tomorrow.",
            TimestampUtc: DateTime.UtcNow
        );

        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true
        };

        var json = JsonSerializer.Serialize(original, options);
        json.Should().Contain("\"appointmentId\":");
        json.Should().Contain("\"clinicId\":");
        json.Should().Contain("\"clinicName\":");
        json.Should().Contain("\"doctorId\":");
        json.Should().Contain("\"doctorName\":");
        json.Should().Contain("\"serviceType\":");
        json.Should().Contain("\"scheduledAtUtc\":");
        json.Should().Contain("\"durationMinutes\":");
        json.Should().Contain("\"alertKind\":");
        json.Should().Contain("\"message\":");
        json.Should().Contain("\"timestampUtc\":");

        var deserialized = JsonSerializer.Deserialize<PatientAppointmentAlertPayload>(json, options);
        deserialized.Should().NotBeNull();
        deserialized!.AppointmentId.Should().Be(original.AppointmentId);
        deserialized.ClinicId.Should().Be(original.ClinicId);
        deserialized.ClinicName.Should().Be(original.ClinicName);
        deserialized.DoctorId.Should().Be(original.DoctorId);
        deserialized.DoctorName.Should().Be(original.DoctorName);
        deserialized.ServiceType.Should().Be(original.ServiceType);
        deserialized.DurationMinutes.Should().Be(original.DurationMinutes);
        deserialized.AlertKind.Should().Be(original.AlertKind);
        deserialized.Message.Should().Be(original.Message);
    }

    [Fact]
    public void PatientAppointmentAlertPayload_handles_nullable_fields_cleanly()
    {
        var original = new PatientAppointmentAlertPayload(
            AppointmentId: Guid.NewGuid(),
            ClinicId: Guid.NewGuid(),
            ClinicName: "Walk-In Clinic",
            DoctorId: null,
            DoctorName: null,
            ServiceType: null,
            ScheduledAtUtc: DateTime.UtcNow.AddHours(3),
            DurationMinutes: 15,
            AlertKind: AppointmentAlertKinds.Reminder2h,
            Message: "Reminder: You have an appointment in 2 hours.",
            TimestampUtc: DateTime.UtcNow
        );

        var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true };
        var json = JsonSerializer.Serialize(original, options);

        var deserialized = JsonSerializer.Deserialize<PatientAppointmentAlertPayload>(json, options);
        deserialized.Should().NotBeNull();
        deserialized!.DoctorId.Should().BeNull();
        deserialized.DoctorName.Should().BeNull();
        deserialized.ServiceType.Should().BeNull();
        deserialized.AppointmentId.Should().Be(original.AppointmentId);
        deserialized.ClinicId.Should().Be(original.ClinicId);
        deserialized.ClinicName.Should().Be("Walk-In Clinic");
    }

    [Fact]
    public void PatientAppointmentAlertPayload_supports_record_nondestructive_mutation()
    {
        var original = new PatientAppointmentAlertPayload(
            AppointmentId: Guid.NewGuid(),
            ClinicId: Guid.NewGuid(),
            ClinicName: "Alpha Clinic",
            DoctorId: null,
            DoctorName: null,
            ServiceType: null,
            ScheduledAtUtc: DateTime.UtcNow,
            DurationMinutes: 30,
            AlertKind: AppointmentAlertKinds.Booked,
            Message: "Booked",
            TimestampUtc: DateTime.UtcNow
        );

        var updated = original with
        {
            AlertKind = AppointmentAlertKinds.Rescheduled,
            Message = "Rescheduled to next week",
            DurationMinutes = 45
        };

        updated.AppointmentId.Should().Be(original.AppointmentId);
        updated.ClinicId.Should().Be(original.ClinicId);
        updated.AlertKind.Should().Be(AppointmentAlertKinds.Rescheduled);
        updated.Message.Should().Be("Rescheduled to next week");
        updated.DurationMinutes.Should().Be(45);
        original.AlertKind.Should().Be(AppointmentAlertKinds.Booked);
    }
}
