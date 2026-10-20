using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Verification Suite for Milestone 1:
/// Validates GetAppointmentsQueryHandler against all parameter permutations,
/// boundary conditions, multi-tenant isolation, soft-deletion filters,
/// and EF Core Npgsql SQL query translation.
/// </summary>
public class Milestone1GetAppointmentsAdversarialTests
{
    private readonly ISieveProcessor _sieveProcessor = Substitute.For<ISieveProcessor>();

    private ApplicationDbContext CreateScopedDbContext(string dbName, Guid clinicId, string tenantId)
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        return new ApplicationDbContext(options, config, clinicContext);
    }

    private static Appointment CreateAppointment(
        Guid clinicId,
        string tenantId,
        Guid doctorId,
        string doctorName,
        DateTime scheduledAt,
        AppointmentStatus status = AppointmentStatus.Confirmed,
        bool isDeleted = false,
        string patientName = "Test Patient")
    {
        return new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            DoctorId = doctorId,
            DoctorName = doctorName,
            PatientId = Guid.NewGuid(),
            PatientName = patientName,
            ScheduledAt = scheduledAt,
            EndTimeUtc = scheduledAt.AddMinutes(30),
            DurationMinutes = 30,
            Status = status,
            IsDeleted = isDeleted,
            DeletedAt = isDeleted ? DateTime.UtcNow : null
        };
    }

    // =========================================================================
    // 1. Empirical Parameter Combinations & Filtering Logic
    // =========================================================================

    [Fact]
    public async Task ParameterCombo_StartDate_Without_EndDate_ReturnsAppointmentsFromStartUtcOnward()
    {
        var dbName = $"Appts_StartOnly_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var tenantId = "tenant-test";

        using var db = CreateScopedDbContext(dbName, clinicId, tenantId);

        // Seed 4 appointments:
        // Appt 1: Prior day (2026-10-14 23:59:59Z) -> Excluded
        // Appt 2: Exactly start midnight (2026-10-15 00:00:00Z) -> Included
        // Appt 3: Same day afternoon (2026-10-15 15:30:00Z) -> Included
        // Appt 4: 10 days later (2026-10-25 10:00:00Z) -> Included
        var appt1 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 14, 23, 59, 59, DateTimeKind.Utc), patientName: "Prior Day");
        var appt2 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc), patientName: "Midnight Start");
        var appt3 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 15, 15, 30, 0, DateTimeKind.Utc), patientName: "Afternoon");
        var appt4 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 25, 10, 0, 0, DateTimeKind.Utc), patientName: "Far Future");

        db.Appointments.AddRange(appt1, appt2, appt3, appt4);
        await db.SaveChangesAsync();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, clinicContext);

        // Execute query with StartDate only
        var query = new GetAppointmentsQuery(StartDate: new DateOnly(2026, 10, 15));
        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(3);
        results.Select(r => r.PatientName).Should().Contain(new[] { "Midnight Start", "Afternoon", "Far Future" });
        results.Select(r => r.PatientName).Should().NotContain("Prior Day");
        results.Should().BeInAscendingOrder(r => r.ScheduledAt);
    }

    [Fact]
    public async Task ParameterCombo_EndDate_Without_StartDate_ReturnsAppointmentsUpToEndUtc()
    {
        var dbName = $"Appts_EndOnly_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var tenantId = "tenant-test";

        using var db = CreateScopedDbContext(dbName, clinicId, tenantId);

        // Appt 1: Past (2026-10-01 10:00:00Z) -> Included
        // Appt 2: Exactly EndDate day morning (2026-10-20 09:00:00Z) -> Included
        // Appt 3: EndDate 23:59:59Z -> Included
        // Appt 4: Next day 00:00:01Z (2026-10-21 00:00:01Z) -> Excluded
        var appt1 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 1, 10, 0, 0, DateTimeKind.Utc), patientName: "Old Past");
        var appt2 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 20, 9, 0, 0, DateTimeKind.Utc), patientName: "Morning End Day");
        var appt3 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 20, 23, 59, 59, DateTimeKind.Utc), patientName: "Late Night End Day");
        var appt4 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 21, 0, 0, 1, DateTimeKind.Utc), patientName: "Next Day Excluded");

        db.Appointments.AddRange(appt1, appt2, appt3, appt4);
        await db.SaveChangesAsync();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, clinicContext);

        // Execute query with EndDate only
        var query = new GetAppointmentsQuery(EndDate: new DateOnly(2026, 10, 20));
        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(3);
        results.Select(r => r.PatientName).Should().Contain(new[] { "Old Past", "Morning End Day", "Late Night End Day" });
        results.Select(r => r.PatientName).Should().NotContain("Next Day Excluded");
        results.Should().BeInAscendingOrder(r => r.ScheduledAt);
    }

    [Fact]
    public async Task ParameterCombo_Both_StartDate_And_EndDate_ReturnsStrictClosedRange()
    {
        var dbName = $"Appts_BothDates_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var tenantId = "tenant-test";

        using var db = CreateScopedDbContext(dbName, clinicId, tenantId);

        var apptBefore = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 9, 23, 59, 59, DateTimeKind.Utc), patientName: "Before Range");
        var apptStart = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 10, 8, 0, 0, DateTimeKind.Utc), patientName: "Start Day");
        var apptMid = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc), patientName: "Mid Range");
        var apptEnd = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 20, 18, 0, 0, DateTimeKind.Utc), patientName: "End Day");
        var apptAfter = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 21, 0, 0, 1, DateTimeKind.Utc), patientName: "After Range");

        db.Appointments.AddRange(apptBefore, apptStart, apptMid, apptEnd, apptAfter);
        await db.SaveChangesAsync();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, clinicContext);

        var query = new GetAppointmentsQuery(
            StartDate: new DateOnly(2026, 10, 10),
            EndDate: new DateOnly(2026, 10, 20));

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(3);
        results.Select(r => r.PatientName).Should().Equal("Start Day", "Mid Range", "End Day");
    }

    [Fact]
    public async Task ParameterCombo_Both_StartDate_And_EndDate_SameDay_MatchesSingleFullDay()
    {
        var dbName = $"Appts_SameDayRange_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var tenantId = "tenant-test";

        using var db = CreateScopedDbContext(dbName, clinicId, tenantId);

        var apptPrev = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 11, 23, 59, 59, DateTimeKind.Utc), patientName: "Prev Day");
        var apptMorning = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 12, 8, 0, 0, DateTimeKind.Utc), patientName: "Morning");
        var apptEvening = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 12, 20, 0, 0, DateTimeKind.Utc), patientName: "Evening");
        var apptNext = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 13, 0, 0, 0, DateTimeKind.Utc), patientName: "Next Day");

        db.Appointments.AddRange(apptPrev, apptMorning, apptEvening, apptNext);
        await db.SaveChangesAsync();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, clinicContext);

        var query = new GetAppointmentsQuery(
            StartDate: new DateOnly(2026, 10, 12),
            EndDate: new DateOnly(2026, 10, 12));

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(2);
        results.Select(r => r.PatientName).Should().Equal("Morning", "Evening");
    }

    [Fact]
    public async Task ParameterCombo_InvertedDateRange_StartDateGreaterThanEndDate_ReturnsEmptyListWithoutException()
    {
        var dbName = $"Appts_Inverted_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var tenantId = "tenant-test";

        using var db = CreateScopedDbContext(dbName, clinicId, tenantId);

        db.Appointments.Add(CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 15, 10, 0, 0, DateTimeKind.Utc)));
        await db.SaveChangesAsync();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, clinicContext);

        // StartDate 2026-10-25 is AFTER EndDate 2026-10-10
        var query = new GetAppointmentsQuery(
            StartDate: new DateOnly(2026, 10, 25),
            EndDate: new DateOnly(2026, 10, 10));

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().BeEmpty();
    }

    [Fact]
    public async Task ParameterCombo_NeitherStartDateNorEndDate_WithSingleDate_MatchesSingleDay()
    {
        var dbName = $"Appts_SingleDate_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var tenantId = "tenant-test";

        using var db = CreateScopedDbContext(dbName, clinicId, tenantId);

        var appt1 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 10, 9, 0, 0, DateTimeKind.Utc), patientName: "Target Day");
        var appt2 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 11, 9, 0, 0, DateTimeKind.Utc), patientName: "Other Day");

        db.Appointments.AddRange(appt1, appt2);
        await db.SaveChangesAsync();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, clinicContext);

        var query = new GetAppointmentsQuery(Date: new DateOnly(2026, 10, 10));
        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].PatientName.Should().Be("Target Day");
    }

    [Fact]
    public async Task ParameterCombo_NeitherStartDateNorEndDate_NeitherDate_ReturnsAllActiveAppointments()
    {
        var dbName = $"Appts_AllNullDates_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var tenantId = "tenant-test";

        using var db = CreateScopedDbContext(dbName, clinicId, tenantId);

        var appt1 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 9, 1, 9, 0, 0, DateTimeKind.Utc), patientName: "September");
        var appt2 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 1, 9, 0, 0, DateTimeKind.Utc), patientName: "October");
        var appt3 = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 11, 1, 9, 0, 0, DateTimeKind.Utc), patientName: "November");

        db.Appointments.AddRange(appt1, appt2, appt3);
        await db.SaveChangesAsync();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, clinicContext);

        // All null dates
        var query = new GetAppointmentsQuery();
        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(3);
        results.Select(r => r.PatientName).Should().Equal("September", "October", "November");
    }

    [Fact]
    public async Task ParameterCombo_RangeTakesPrecedenceOverSingleDate_WhenBothSupplied()
    {
        var dbName = $"Appts_Precedence_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var tenantId = "tenant-test";

        using var db = CreateScopedDbContext(dbName, clinicId, tenantId);

        var apptSingleDate = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 5, 9, 0, 0, DateTimeKind.Utc), patientName: "Single Date Target");
        var apptRange = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 20, 9, 0, 0, DateTimeKind.Utc), patientName: "Range Target");

        db.Appointments.AddRange(apptSingleDate, apptRange);
        await db.SaveChangesAsync();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, clinicContext);

        // Caller supplies Date (2026-10-05) AND StartDate/EndDate (2026-10-18 to 2026-10-22)
        var query = new GetAppointmentsQuery(
            Date: new DateOnly(2026, 10, 5),
            StartDate: new DateOnly(2026, 10, 18),
            EndDate: new DateOnly(2026, 10, 22));

        var results = await handler.Handle(query, CancellationToken.None);

        // Range takes precedence
        results.Should().HaveCount(1);
        results[0].PatientName.Should().Be("Range Target");
    }

    [Fact]
    public async Task ParameterCombo_DoctorId_With_DateRange_FiltersByBothCriteria()
    {
        var dbName = $"Appts_DocAndRange_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var doctorA = Guid.NewGuid();
        var doctorB = Guid.NewGuid();
        var tenantId = "tenant-test";

        using var db = CreateScopedDbContext(dbName, clinicId, tenantId);

        // Doc A in range -> Match
        var apptAInRange = CreateAppointment(clinicId, tenantId, doctorA, "Dr. A", new DateTime(2026, 10, 15, 10, 0, 0, DateTimeKind.Utc), patientName: "Doc A In Range");
        // Doc A out of range -> Excluded
        var apptAOutOfRange = CreateAppointment(clinicId, tenantId, doctorA, "Dr. A", new DateTime(2026, 10, 25, 10, 0, 0, DateTimeKind.Utc), patientName: "Doc A Out of Range");
        // Doc B in range -> Excluded
        var apptBInRange = CreateAppointment(clinicId, tenantId, doctorB, "Dr. B", new DateTime(2026, 10, 15, 10, 0, 0, DateTimeKind.Utc), patientName: "Doc B In Range");

        db.Appointments.AddRange(apptAInRange, apptAOutOfRange, apptBInRange);
        await db.SaveChangesAsync();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, clinicContext);

        var query = new GetAppointmentsQuery(
            StartDate: new DateOnly(2026, 10, 10),
            EndDate: new DateOnly(2026, 10, 20),
            DoctorId: doctorA);

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].PatientName.Should().Be("Doc A In Range");
        results[0].DoctorId.Should().Be(doctorA);
    }

    [Fact]
    public async Task ParameterCombo_DoctorId_Alone_FiltersAcrossAllDates()
    {
        var dbName = $"Appts_DocAlone_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var doctorA = Guid.NewGuid();
        var doctorB = Guid.NewGuid();
        var tenantId = "tenant-test";

        using var db = CreateScopedDbContext(dbName, clinicId, tenantId);

        var apptA1 = CreateAppointment(clinicId, tenantId, doctorA, "Dr. A", new DateTime(2026, 9, 10, 10, 0, 0, DateTimeKind.Utc), patientName: "Doc A Past");
        var apptA2 = CreateAppointment(clinicId, tenantId, doctorA, "Dr. A", new DateTime(2026, 11, 10, 10, 0, 0, DateTimeKind.Utc), patientName: "Doc A Future");
        var apptB = CreateAppointment(clinicId, tenantId, doctorB, "Dr. B", new DateTime(2026, 10, 10, 10, 0, 0, DateTimeKind.Utc), patientName: "Doc B Mid");

        db.Appointments.AddRange(apptA1, apptA2, apptB);
        await db.SaveChangesAsync();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, clinicContext);

        var query = new GetAppointmentsQuery(DoctorId: doctorA);
        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(2);
        results.Select(r => r.PatientName).Should().Equal("Doc A Past", "Doc A Future");
    }

    [Fact]
    public async Task ParameterCombo_DoctorId_With_Status_And_DateRange_ConjunctiveFilter()
    {
        var dbName = $"Appts_Conjunctive_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var doctorA = Guid.NewGuid();
        var tenantId = "tenant-test";

        using var db = CreateScopedDbContext(dbName, clinicId, tenantId);

        var apptConfirmed = CreateAppointment(clinicId, tenantId, doctorA, "Dr. A", new DateTime(2026, 10, 15, 10, 0, 0, DateTimeKind.Utc), status: AppointmentStatus.Confirmed, patientName: "Confirmed");
        var apptCancelled = CreateAppointment(clinicId, tenantId, doctorA, "Dr. A", new DateTime(2026, 10, 15, 11, 0, 0, DateTimeKind.Utc), status: AppointmentStatus.Cancelled, patientName: "Cancelled");
        var apptCheckedIn = CreateAppointment(clinicId, tenantId, doctorA, "Dr. A", new DateTime(2026, 10, 15, 14, 0, 0, DateTimeKind.Utc), status: AppointmentStatus.CheckedIn, patientName: "CheckedIn");

        db.Appointments.AddRange(apptConfirmed, apptCancelled, apptCheckedIn);
        await db.SaveChangesAsync();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, clinicContext);

        var query = new GetAppointmentsQuery(
            StartDate: new DateOnly(2026, 10, 10),
            EndDate: new DateOnly(2026, 10, 20),
            DoctorId: doctorA,
            Status: AppointmentStatus.Confirmed);

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].PatientName.Should().Be("Confirmed");
        results[0].Status.Should().Be(AppointmentStatus.Confirmed);
    }

    // =========================================================================
    // 2. Multi-Tenant Isolation & Soft-Delete Suppression
    // =========================================================================

    [Fact]
    public async Task MultiTenant_ClinicA_NeverReturns_ClinicBAppointments_UnderAnyQueryCombo()
    {
        var dbName = $"Appts_MT_{Guid.NewGuid()}";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var sharedDoctorId = Guid.NewGuid();
        var date = new DateOnly(2026, 10, 15);
        var targetTime = new DateTime(2026, 10, 15, 10, 0, 0, DateTimeKind.Utc);

        // Seed Clinic B appointments
        using (var dbB = CreateScopedDbContext(dbName, clinicB, "tenant-b"))
        {
            var apptB = CreateAppointment(clinicB, "tenant-b", sharedDoctorId, "Dr. Shared", targetTime, patientName: "Patient Clinic B");
            dbB.Appointments.Add(apptB);
            await dbB.SaveChangesAsync();
        }

        // Query from Clinic A
        using (var dbA = CreateScopedDbContext(dbName, clinicA, "tenant-a"))
        {
            var clinicContextA = Substitute.For<IClinicContext>();
            clinicContextA.ClinicId.Returns(clinicA);
            clinicContextA.TenantId.Returns("tenant-a");

            var repoA = new Repository<Appointment>(dbA, _sieveProcessor);
            var handlerA = new GetAppointmentsQueryHandler(repoA, clinicContextA);

            // Test 1: Date range
            var r1 = await handlerA.Handle(new GetAppointmentsQuery(StartDate: date, EndDate: date), CancellationToken.None);
            r1.Should().BeEmpty("Clinic A must not see Clinic B appointments via date range");

            // Test 2: Doctor ID alone
            var r2 = await handlerA.Handle(new GetAppointmentsQuery(DoctorId: sharedDoctorId), CancellationToken.None);
            r2.Should().BeEmpty("Clinic A must not see Clinic B appointments via doctorId");

            // Test 3: Unbounded query
            var r3 = await handlerA.Handle(new GetAppointmentsQuery(), CancellationToken.None);
            r3.Should().BeEmpty("Clinic A must not see Clinic B appointments via unbounded query");
        }
    }

    [Fact]
    public async Task SoftDelete_SuppressedAcrossAllParameterPermutations()
    {
        var dbName = $"Appts_SoftDelete_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var tenantId = "tenant-test";

        using var db = CreateScopedDbContext(dbName, clinicId, tenantId);

        var activeAppt = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 15, 10, 0, 0, DateTimeKind.Utc), isDeleted: false, patientName: "Active");
        var deletedAppt = CreateAppointment(clinicId, tenantId, doctorId, "Dr. Santos", new DateTime(2026, 10, 15, 11, 0, 0, DateTimeKind.Utc), isDeleted: true, patientName: "Deleted");

        db.Appointments.AddRange(activeAppt, deletedAppt);
        await db.SaveChangesAsync();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var repo = new Repository<Appointment>(db, _sieveProcessor);
        var handler = new GetAppointmentsQueryHandler(repo, clinicContext);

        var rRange = await handler.Handle(new GetAppointmentsQuery(StartDate: new DateOnly(2026, 10, 1), EndDate: new DateOnly(2026, 10, 31)), CancellationToken.None);
        rRange.Should().HaveCount(1);
        rRange[0].PatientName.Should().Be("Active");

        var rDoctor = await handler.Handle(new GetAppointmentsQuery(DoctorId: doctorId), CancellationToken.None);
        rDoctor.Should().HaveCount(1);
        rDoctor[0].PatientName.Should().Be("Active");
    }

    // =========================================================================
    // 3. EF Core Npgsql SQL Query Translation Verification
    // =========================================================================

    [Theory]
    [InlineData("StartDateOnly")]
    [InlineData("EndDateOnly")]
    [InlineData("BothDates")]
    [InlineData("SingleDate")]
    [InlineData("AllNull")]
    [InlineData("DoctorAndRange")]
    [InlineData("DoctorAlone")]
    [InlineData("AllParameters")]
    public void EFCore_Npgsql_TranslatesQueriesToValidSql_WithoutExceptions(string scenario)
    {
        var clinicId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("test-tenant");

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql("Host=localhost;Database=test;Username=postgres;Password=test")
            .Options;

        using var db = new ApplicationDbContext(options, config, clinicContext);
        var repo = new Repository<Appointment>(db, _sieveProcessor);

        var startDate = new DateOnly(2026, 10, 10);
        var endDate = new DateOnly(2026, 10, 20);
        var singleDate = new DateOnly(2026, 10, 15);

        IQueryable<Appointment> query = repo.Query(a => a.ClinicId == clinicContext.ClinicId).AsQueryable();

        switch (scenario)
        {
            case "StartDateOnly":
                var startUtc1 = startDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
                query = query.Where(a => a.ScheduledAt >= startUtc1);
                break;

            case "EndDateOnly":
                var endUtc2 = endDate.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);
                query = query.Where(a => a.ScheduledAt <= endUtc2);
                break;

            case "BothDates":
                var startUtc3 = startDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
                var endUtc3 = endDate.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);
                query = query.Where(a => a.ScheduledAt >= startUtc3 && a.ScheduledAt <= endUtc3);
                break;

            case "SingleDate":
                var startUtc4 = singleDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
                var endUtc4 = singleDate.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);
                query = query.Where(a => a.ScheduledAt >= startUtc4 && a.ScheduledAt <= endUtc4);
                break;

            case "AllNull":
                // No extra date filters
                break;

            case "DoctorAndRange":
                var startUtc5 = startDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
                var endUtc5 = endDate.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);
                query = query.Where(a => a.ScheduledAt >= startUtc5 && a.ScheduledAt <= endUtc5);
                query = query.Where(a => a.DoctorId == doctorId);
                break;

            case "DoctorAlone":
                query = query.Where(a => a.DoctorId == doctorId);
                break;

            case "AllParameters":
                var startUtc6 = startDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
                var endUtc6 = endDate.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);
                query = query.Where(a => a.ScheduledAt >= startUtc6 && a.ScheduledAt <= endUtc6);
                query = query.Where(a => a.DoctorId == doctorId);
                query = query.Where(a => a.Status == AppointmentStatus.Confirmed);
                break;
        }

        query = query.OrderBy(a => a.ScheduledAt);

        // Act: Generate SQL using EF Core Npgsql provider
        string sql = null!;
        Action act = () => sql = query.ToQueryString();

        // Assert: EF Core must successfully translate expression tree to SQL string without exceptions
        act.Should().NotThrow("EF Core Npgsql provider must translate LINQ expression tree to SQL");
        sql.Should().NotBeNullOrWhiteSpace();
        sql.Should().Contain("SELECT", "Generated SQL must be a SELECT statement");
        sql.Should().Contain("\"Appointments\"", "Generated SQL must target Appointments table");
        sql.Should().Contain("\"ScheduledAt\"", "Generated SQL must include ScheduledAt for filtering or ordering");
        sql.Should().Contain("ORDER BY", "Generated SQL must order by ScheduledAt");

        if (scenario.Contains("Doctor"))
        {
            sql.Should().Contain("\"DoctorId\"", "Generated SQL must include DoctorId filter");
        }
        if (scenario == "AllParameters")
        {
            sql.Should().Contain("\"Status\"", "Generated SQL must include Status filter");
        }
    }
}
