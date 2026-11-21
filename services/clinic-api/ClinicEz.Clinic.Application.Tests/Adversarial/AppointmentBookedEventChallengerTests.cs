using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical adversarial verification of <see cref="AppointmentBookedEvent"/> contract
/// and its ingestion through <see cref="AppointmentBookedHandler"/> in clinic-api.
/// </summary>
public class AppointmentBookedEventChallengerTests
{
    private const string TenantId = "tenant_challenger_m1";

    private static AppointmentBookedHandler CreateHandler(ApplicationDbContext db) =>
        new(db, MessagingTestKit.Recipient(db), new InteropPublisher(db), NullLogger<AppointmentBookedHandler>.Instance);

    private static InteropMessageContext Delivered(AppointmentBookedEvent booked, Party to) =>
        MessagingTestKit.Delivered(
            InteropTypes.PatientAppointmentBooked, Party.ForPatient(booked.PatientId.ToString()), to, booked.DraftId, booked);

    [Fact]
    public async Task Ingestion_LegacyPayloadWithoutAppointmentType_IngestsSuccessfullyWithNullType()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        var legacyJson = $$"""
        {
          "id": "{{Guid.NewGuid()}}",
          "draftId": "{{draftId}}",
          "patientId": "{{patientId}}",
          "clinicId": "{{clinicId}}",
          "tenantId": "{{TenantId}}",
          "preferredDate": "2026-11-20",
          "preferredTime": "09:00",
          "reason": "Routine Checkup"
        }
        """;

        var evt = JsonSerializer.Deserialize<AppointmentBookedEvent>(legacyJson, InteropJson.Options)!;
        evt.AppointmentType.Should().BeNull();

        await CreateHandler(db).HandleAsync(evt, Delivered(evt, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        var appt = await db.Appointments.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.DraftId == draftId);
        appt.Should().NotBeNull();
        appt!.Status.Should().Be(AppointmentStatus.Confirmed);
        appt.Reason.Should().Be("Routine Checkup");
    }

    [Theory]
    [InlineData("Teleconsult")]
    [InlineData("InPerson")]
    [InlineData("teleconsult")]
    [InlineData("INPERSON")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Specialist_Remote")]
    public async Task Ingestion_AppointmentBookedEvent_WithVariousAppointmentTypeStrings_IngestsWithoutCrashing(string? appointmentType)
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
            AppointmentType = appointmentType,
            PreferredDate = new DateOnly(2026, 11, 20),
            PreferredTime = "14:00",
            Reason = "Adversarial Ingestion Test"
        };

        await CreateHandler(db).HandleAsync(booked, Delivered(booked, MessagingTestKit.ClinicParty(TenantId, clinicId)), CancellationToken.None);

        var appt = await db.Appointments.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.DraftId == draftId);
        appt.Should().NotBeNull();
        appt!.Status.Should().Be(AppointmentStatus.Confirmed);
    }

    [Fact]
    public void Contract_InteropEnvelopeWireRoundtrip_PreservesTeleconsultAppointmentType()
    {
        var booked = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = Guid.NewGuid(),
            TenantId = TenantId,
            AppointmentType = "Teleconsult",
            Reason = "Virtual Follow-up"
        };

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentBooked,
            Party.ForPatient(booked.PatientId.ToString()),
            Party.ForFacility(TenantId, booked.ClinicId.ToString(), FacilityType.Clinic),
            booked.DraftId,
            booked);

        var wireJson = envelope.ToJson();
        var reconstituted = InteropEnvelope.FromJson(wireJson);
        var payload = reconstituted.GetPayload<AppointmentBookedEvent>();

        payload.Should().NotBeNull();
        payload.AppointmentType.Should().Be("Teleconsult");
        payload.Reason.Should().Be("Virtual Follow-up");
    }
}
