using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>A booking merges into the booked clinic's own chart only: tenant and facility isolation on the patient merge.</summary>
public class AppointmentBookedIsolationTests
{
    private const string Tenant = "tenant-booked";
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();
    private readonly Guid _clinicId = Guid.NewGuid();

    private Task Book(AppointmentBookedEvent booked, Guid? clinicId = null) =>
        new AppointmentBookedHandler(_db, MessagingTestKit.Recipient(_db), new InteropPublisher(_db), NullLogger<AppointmentBookedHandler>.Instance)
            .HandleAsync(booked,
                MessagingTestKit.Delivered(InteropTypes.PatientAppointmentBooked, Party.ForPatient(booked.PatientId.ToString()),
                    MessagingTestKit.ClinicParty(Tenant, clinicId ?? _clinicId), booked.DraftId, booked),
                CancellationToken.None);

    private AppointmentBookedEvent Booking(Guid patientId, string? email = null) => new()
    {
        DraftId = Guid.NewGuid(),
        PatientId = patientId,
        ClinicId = _clinicId,
        TenantId = Tenant,
        PreferredDate = new DateOnly(2026, 9, 25),
        PatientFirstName = "Maria",
        PatientLastName = "Santos",
        Email = email
    };

    [Fact]
    public async Task A_New_Patient_Gets_The_Patient_Plane_Id_As_Their_Chart_Id()
    {
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        var patientId = Guid.NewGuid();

        await Book(Booking(patientId));

        var chart = await _db.Patients.IgnoreQueryFilters().SingleAsync();
        chart.Id.Should().Be(patientId);
        chart.ClinicId.Should().Be(_clinicId);
    }

    [Fact]
    public async Task A_Patient_Id_Already_Used_By_Another_Clinics_Chart_Does_Not_Collide_Or_Leak()
    {
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        var otherClinic = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var foreign = Phase3TestKit.NewPatient(otherClinic, Tenant);
        foreign.Id = patientId;
        foreign.Email = "other@clinic.test";
        _db.Patients.Add(foreign);
        await _db.SaveChangesAsync();

        await Book(Booking(patientId, "new@clinic.test"));

        var mine = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.ClinicId == _clinicId);
        mine.Id.Should().NotBe(patientId, "the primary key is taken by another clinic's chart");
        mine.SyncPatientId.Should().Be(patientId);
        mine.Email.Should().Be("new@clinic.test");
        var untouched = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == patientId);
        untouched.ClinicId.Should().Be(otherClinic);
        untouched.Email.Should().Be("other@clinic.test");
    }

    [Fact]
    public async Task A_Second_Booking_Reuses_The_Same_Chart_And_Fills_Only_Blank_Fields()
    {
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        var patientId = Guid.NewGuid();
        await Book(Booking(patientId, "first@clinic.test"));

        await Book(Booking(patientId, "second@clinic.test"));

        var chart = await _db.Patients.IgnoreQueryFilters().SingleAsync();
        chart.Email.Should().Be("first@clinic.test", "an existing value is never overwritten by a booking");
        (await _db.Appointments.IgnoreQueryFilters().CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task A_Booking_For_Another_Clinic_Never_Touches_This_Clinics_Chart()
    {
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        var otherClinic = Guid.NewGuid();
        MessagingTestKit.SeedClinic(_db, otherClinic, Tenant);
        var patientId = Guid.NewGuid();
        var mine = Phase3TestKit.NewPatient(_clinicId, Tenant, patientId);
        mine.Email = null;
        _db.Patients.Add(mine);
        await _db.SaveChangesAsync();

        await Book(Booking(patientId, "leak@clinic.test") with { ClinicId = otherClinic }, otherClinic);

        (await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == mine.Id)).Email.Should().BeNull();
        (await _db.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == otherClinic)).Should().Be(1);
    }
}
