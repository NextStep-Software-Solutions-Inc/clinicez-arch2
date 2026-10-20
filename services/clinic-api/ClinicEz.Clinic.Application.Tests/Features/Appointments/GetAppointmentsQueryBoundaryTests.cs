using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using FluentAssertions;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Appointments;

public class GetAppointmentsQueryBoundaryTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _doctorId1 = Guid.NewGuid();
    private readonly Guid _doctorId2 = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;
    private readonly ISieveProcessor _sieveProcessor;

    public GetAppointmentsQueryBoundaryTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns("test-tenant");

        _sieveProcessor = Substitute.For<ISieveProcessor>();
    }

    private Appointment CreateAppointment(
        Guid doctorId,
        DateTime scheduledAt,
        AppointmentStatus status = AppointmentStatus.Confirmed,
        string patientName = "Test Patient")
    {
        return new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = doctorId,
            DoctorName = doctorId == _doctorId1 ? "Dr. Santos" : "Dr. Reyes",
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            EndTimeUtc = scheduledAt.AddMinutes(30),
            Status = status,
            PatientId = Guid.NewGuid(),
            PatientName = patientName,
            CreatedAt = DateTime.UtcNow
        };
    }

    [Fact]
    public async Task Handle_MonthBoundaries_IncludesExactStartAndEndUtc_ExcludesOutside()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, _clinicContext);

        // October 2026 month boundaries (2026-10-01 to 2026-10-31)
        var justBeforeStart = new DateTime(2026, 9, 30, 23, 59, 59, 999, DateTimeKind.Utc);
        var exactStart = new DateTime(2026, 10, 1, 0, 0, 0, 0, DateTimeKind.Utc);
        var midMonth = new DateTime(2026, 10, 15, 12, 0, 0, 0, DateTimeKind.Utc);
        var exactEnd = new DateTime(2026, 10, 31, 23, 59, 59, 999, DateTimeKind.Utc);
        var justAfterEnd = new DateTime(2026, 11, 1, 0, 0, 0, 0, DateTimeKind.Utc);

        var a1 = CreateAppointment(_doctorId1, justBeforeStart, patientName: "JustBeforeStart");
        var a2 = CreateAppointment(_doctorId1, exactStart, patientName: "ExactStart");
        var a3 = CreateAppointment(_doctorId1, midMonth, patientName: "MidMonth");
        var a4 = CreateAppointment(_doctorId1, exactEnd, patientName: "ExactEnd");
        var a5 = CreateAppointment(_doctorId1, justAfterEnd, patientName: "JustAfterEnd");

        db.Appointments.AddRange(a1, a2, a3, a4, a5);
        await db.SaveChangesAsync();

        var query = new GetAppointmentsQuery(
            StartDate: new DateOnly(2026, 10, 1),
            EndDate: new DateOnly(2026, 10, 31));

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(3);
        results.Select(r => r.PatientName).Should().BeEquivalentTo(new[] { "ExactStart", "MidMonth", "ExactEnd" });
        results.Any(r => r.PatientName == "JustBeforeStart").Should().BeFalse();
        results.Any(r => r.PatientName == "JustAfterEnd").Should().BeFalse();
    }

    [Fact]
    public async Task Handle_LeapYearBoundaries_2024_February29Included()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, _clinicContext);

        // 2024 is a leap year (Feb 28 to Mar 1)
        var feb27 = new DateTime(2024, 2, 27, 23, 59, 59, DateTimeKind.Utc);
        var feb28 = new DateTime(2024, 2, 28, 9, 0, 0, DateTimeKind.Utc);
        var feb29 = new DateTime(2024, 2, 29, 14, 30, 0, DateTimeKind.Utc); // Leap day!
        var mar1 = new DateTime(2024, 3, 1, 16, 0, 0, DateTimeKind.Utc);
        var mar2 = new DateTime(2024, 3, 2, 0, 0, 1, DateTimeKind.Utc);

        var appts = new[]
        {
            CreateAppointment(_doctorId1, feb27, patientName: "Feb27"),
            CreateAppointment(_doctorId1, feb28, patientName: "Feb28"),
            CreateAppointment(_doctorId1, feb29, patientName: "Feb29_LeapDay"),
            CreateAppointment(_doctorId1, mar1, patientName: "Mar1"),
            CreateAppointment(_doctorId1, mar2, patientName: "Mar2")
        };

        db.Appointments.AddRange(appts);
        await db.SaveChangesAsync();

        var query = new GetAppointmentsQuery(
            StartDate: new DateOnly(2024, 2, 28),
            EndDate: new DateOnly(2024, 3, 1));

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(3);
        results.Select(r => r.PatientName).Should().BeEquivalentTo(new[] { "Feb28", "Feb29_LeapDay", "Mar1" });
        results.Any(r => r.PatientName == "Feb27").Should().BeFalse();
        results.Any(r => r.PatientName == "Mar2").Should().BeFalse();
    }

    [Fact]
    public async Task Handle_NonLeapYearBoundaries_2026_February28ToMarch01()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, _clinicContext);

        // 2026 is non-leap
        var feb28 = new DateTime(2026, 2, 28, 10, 0, 0, DateTimeKind.Utc);
        var mar1 = new DateTime(2026, 3, 1, 10, 0, 0, DateTimeKind.Utc);
        var mar2 = new DateTime(2026, 3, 2, 10, 0, 0, DateTimeKind.Utc);

        db.Appointments.AddRange(
            CreateAppointment(_doctorId1, feb28, patientName: "Feb28_2026"),
            CreateAppointment(_doctorId1, mar1, patientName: "Mar1_2026"),
            CreateAppointment(_doctorId1, mar2, patientName: "Mar2_2026"));
        await db.SaveChangesAsync();

        var query = new GetAppointmentsQuery(
            StartDate: new DateOnly(2026, 2, 28),
            EndDate: new DateOnly(2026, 3, 1));

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(2);
        results.Select(r => r.PatientName).Should().BeEquivalentTo(new[] { "Feb28_2026", "Mar1_2026" });
    }

    [Fact]
    public async Task Handle_YearBoundaries_2026_To_2027_CrossYearTransition()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, _clinicContext);

        // 2026-12-31 to 2027-01-01
        var dec30 = new DateTime(2026, 12, 30, 23, 59, 59, DateTimeKind.Utc);
        var dec31Start = new DateTime(2026, 12, 31, 0, 0, 0, DateTimeKind.Utc);
        var dec31End = new DateTime(2026, 12, 31, 23, 59, 59, DateTimeKind.Utc);
        var jan1Start = new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var jan1End = new DateTime(2027, 1, 1, 23, 59, 59, DateTimeKind.Utc);
        var jan2 = new DateTime(2027, 1, 2, 0, 0, 1, DateTimeKind.Utc);

        db.Appointments.AddRange(
            CreateAppointment(_doctorId1, dec30, patientName: "Dec30"),
            CreateAppointment(_doctorId1, dec31Start, patientName: "Dec31Start"),
            CreateAppointment(_doctorId1, dec31End, patientName: "Dec31End"),
            CreateAppointment(_doctorId1, jan1Start, patientName: "Jan1Start"),
            CreateAppointment(_doctorId1, jan1End, patientName: "Jan1End"),
            CreateAppointment(_doctorId1, jan2, patientName: "Jan2"));
        await db.SaveChangesAsync();

        var query = new GetAppointmentsQuery(
            StartDate: new DateOnly(2026, 12, 31),
            EndDate: new DateOnly(2027, 1, 1));

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(4);
        results.Select(r => r.PatientName).Should().BeEquivalentTo(new[] { "Dec31Start", "Dec31End", "Jan1Start", "Jan1End" });
        results.Any(r => r.PatientName == "Dec30").Should().BeFalse();
        results.Any(r => r.PatientName == "Jan2").Should().BeFalse();
    }

    [Fact]
    public async Task Handle_DateRangeWithDoctorFilter_ReturnsOnlyMatchingDoctorWithinRange()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, _clinicContext);

        var date = new DateTime(2026, 10, 15, 10, 0, 0, DateTimeKind.Utc);

        var apptDoc1 = CreateAppointment(_doctorId1, date, patientName: "Doctor1_Patient");
        var apptDoc2 = CreateAppointment(_doctorId2, date, patientName: "Doctor2_Patient");

        db.Appointments.AddRange(apptDoc1, apptDoc2);
        await db.SaveChangesAsync();

        var query = new GetAppointmentsQuery(
            StartDate: new DateOnly(2026, 10, 1),
            EndDate: new DateOnly(2026, 10, 31),
            DoctorId: _doctorId1);

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].PatientName.Should().Be("Doctor1_Patient");
        results[0].DoctorId.Should().Be(_doctorId1);
    }

    [Fact]
    public async Task Handle_DateRangeWithStatusFilter_ReturnsOnlyMatchingStatusWithinRange()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, _clinicContext);

        var date = new DateTime(2026, 10, 15, 10, 0, 0, DateTimeKind.Utc);

        var confirmed = CreateAppointment(_doctorId1, date, AppointmentStatus.Confirmed, "Confirmed_Patient");
        var cancelled = CreateAppointment(_doctorId1, date.AddHours(1), AppointmentStatus.Cancelled, "Cancelled_Patient");

        db.Appointments.AddRange(confirmed, cancelled);
        await db.SaveChangesAsync();

        var query = new GetAppointmentsQuery(
            StartDate: new DateOnly(2026, 10, 1),
            EndDate: new DateOnly(2026, 10, 31),
            Status: AppointmentStatus.Confirmed);

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].PatientName.Should().Be("Confirmed_Patient");
        results[0].Status.Should().Be(AppointmentStatus.Confirmed);
    }

    [Fact]
    public async Task Handle_OpenEndedStartDateOnly_FiltersAppointmentsFromStartOnwards()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, _clinicContext);

        var past = new DateTime(2026, 9, 30, 23, 0, 0, DateTimeKind.Utc);
        var present = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);
        var future = new DateTime(2026, 12, 1, 10, 0, 0, DateTimeKind.Utc);

        db.Appointments.AddRange(
            CreateAppointment(_doctorId1, past, patientName: "Past"),
            CreateAppointment(_doctorId1, present, patientName: "Present"),
            CreateAppointment(_doctorId1, future, patientName: "Future"));
        await db.SaveChangesAsync();

        var query = new GetAppointmentsQuery(StartDate: new DateOnly(2026, 10, 1));

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(2);
        results.Select(r => r.PatientName).Should().BeEquivalentTo(new[] { "Present", "Future" });
    }

    [Fact]
    public async Task Handle_OpenEndedEndDateOnly_FiltersAppointmentsUpToEnd()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, _clinicContext);

        var past = new DateTime(2026, 9, 30, 23, 0, 0, DateTimeKind.Utc);
        var present = new DateTime(2026, 10, 31, 23, 59, 59, DateTimeKind.Utc);
        var future = new DateTime(2026, 11, 1, 0, 0, 1, DateTimeKind.Utc);

        db.Appointments.AddRange(
            CreateAppointment(_doctorId1, past, patientName: "Past"),
            CreateAppointment(_doctorId1, present, patientName: "Present"),
            CreateAppointment(_doctorId1, future, patientName: "Future"));
        await db.SaveChangesAsync();

        var query = new GetAppointmentsQuery(EndDate: new DateOnly(2026, 10, 31));

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(2);
        results.Select(r => r.PatientName).Should().BeEquivalentTo(new[] { "Past", "Present" });
    }

    [Fact]
    public async Task Handle_SingleDateFallback_FiltersOnlyAppointmentsOnThatDate()
    {
        using var db = MessagingTestKit.CreateDbContext(_clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, _clinicContext);

        var dayBefore = new DateTime(2026, 10, 14, 23, 59, 59, DateTimeKind.Utc);
        var targetStart = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc);
        var targetMid = new DateTime(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc);
        var targetEnd = new DateTime(2026, 10, 15, 23, 59, 59, DateTimeKind.Utc);
        var dayAfter = new DateTime(2026, 10, 16, 0, 0, 1, DateTimeKind.Utc);

        db.Appointments.AddRange(
            CreateAppointment(_doctorId1, dayBefore, patientName: "DayBefore"),
            CreateAppointment(_doctorId1, targetStart, patientName: "TargetStart"),
            CreateAppointment(_doctorId1, targetMid, patientName: "TargetMid"),
            CreateAppointment(_doctorId1, targetEnd, patientName: "TargetEnd"),
            CreateAppointment(_doctorId1, dayAfter, patientName: "DayAfter"));
        await db.SaveChangesAsync();

        var query = new GetAppointmentsQuery(Date: new DateOnly(2026, 10, 15));

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(3);
        results.Select(r => r.PatientName).Should().BeEquivalentTo(new[] { "TargetStart", "TargetMid", "TargetEnd" });
    }
}
