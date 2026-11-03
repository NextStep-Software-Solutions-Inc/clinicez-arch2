using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Home;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Services.Home;
using ClinicEz.Patient.Infrastructure.Services.Search;

namespace ClinicEz.Patient.Application.Tests.Features.Home;

using PatientEntity = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class HomeDashboardAndSearchServiceTests
{
    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private static ApplicationDbContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    private static PatientEntity CreatePatient(
        string firstName = "Sarah",
        string lastName = "Jenkins",
        BloodType? bloodType = BloodType.APositive) =>
        new()
        {
            Id = Guid.NewGuid(),
            ClientId = Guid.NewGuid(),
            ClinicEzId = "CE-8942-01",
            ClerkUserId = $"user_{Guid.NewGuid():N}",
            FirstName = firstName,
            LastName = lastName,
            BloodType = bloodType,
        };

    [Fact]
    public async Task GetHomeDashboard_FreshAccount_ReturnsFirstTimeAppointmentState_EmptyVitals_AndVisibleWelcomeChecklist()
    {
        using var db = CreateInMemoryContext();
        var now = new DateTimeOffset(2026, 11, 3, 9, 0, 0, TimeSpan.Zero);
        var service = new PatientHomeService(db, new FixedTimeProvider(now));

        var patient = CreatePatient();
        db.Patients.Add(patient);
        await db.SaveChangesAsync();

        var dashboard = await service.GetHomeDashboardAsync(patient.Id);

        dashboard.HealthPass.FullName.Should().Be("Sarah Jenkins");
        dashboard.HealthPass.ClinicEzId.Should().Be("CE-8942-01");
        dashboard.HealthPass.BloodGroupDisplay.Should().Be("A+");

        dashboard.WelcomeChecklist.IsHidden.Should().BeFalse();
        dashboard.WelcomeChecklist.CompletedCount.Should().Be(0);
        dashboard.WelcomeChecklist.CurrentStepNumber.Should().Be(1);

        dashboard.Appointments.CarouselState.Should().Be("first_time");
        dashboard.Appointments.ScheduledCount.Should().Be(0);
        dashboard.Appointments.PastVisitsCount.Should().Be(0);

        dashboard.RecentVitals.HasAnyReadings.Should().BeFalse();
        dashboard.TodaySchedule.ActiveCount.Should().Be(0);
        dashboard.MindfulMoment.Title.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task MarkWelcomeStepVisited_HidesChecklistOnlyAfterAllThreeLinksVisited()
    {
        using var db = CreateInMemoryContext();
        var service = new PatientHomeService(db, TimeProvider.System);

        var patient = CreatePatient();
        db.Patients.Add(patient);
        await db.SaveChangesAsync();

        var step1 = await service.MarkWelcomeStepVisitedAsync(patient.Id, WelcomeStepKeys.CompleteProfile);
        step1.CompletedCount.Should().Be(1);
        step1.CurrentStepNumber.Should().Be(2);
        step1.IsHidden.Should().BeFalse();

        // Duplicate call is idempotent
        var step1Dup = await service.MarkWelcomeStepVisitedAsync(patient.Id, "COMPLETE_PROFILE");
        step1Dup.CompletedCount.Should().Be(1);
        step1Dup.IsHidden.Should().BeFalse();

        var step2 = await service.MarkWelcomeStepVisitedAsync(patient.Id, WelcomeStepKeys.LinkInsurance);
        step2.CompletedCount.Should().Be(2);
        step2.CurrentStepNumber.Should().Be(3);
        step2.IsHidden.Should().BeFalse();

        var step3 = await service.MarkWelcomeStepVisitedAsync(patient.Id, WelcomeStepKeys.FindClinic);
        step3.CompletedCount.Should().Be(3);
        step3.IsHidden.Should().BeTrue();
    }

    [Fact]
    public async Task GetHomeDashboard_DistinguishesActiveCarousel_AndReturningPatientZeroUpcomingState()
    {
        using var db = CreateInMemoryContext();
        var now = new DateTimeOffset(2026, 11, 3, 9, 0, 0, TimeSpan.Zero);
        var service = new PatientHomeService(db, new FixedTimeProvider(now));

        var patient = CreatePatient();
        var clinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "Metro Cardiology Center",
            Address = "Suite 402",
            IsPublic = true,
        };
        var provider = new ClinicHealthcareProvider
        {
            Id = Guid.NewGuid(),
            ClinicId = clinic.Id,
            Name = "Dr. Evelyn Reed, MD",
            Specialty = "Cardiology Specialist",
            IsActive = true,
        };

        var upcomingAppt = new Appointment
        {
            Id = Guid.NewGuid(),
            PatientId = patient.Id,
            ClinicId = clinic.Id,
            ProviderId = provider.Id,
            ScheduledAt = now.UtcDateTime.AddDays(1),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            RawJson = "{}"
        };

        db.Patients.Add(patient);
        db.Clinics.Add(clinic);
        db.ClinicHealthcareProviders.Add(provider);
        db.Appointments.Add(upcomingAppt);
        await db.SaveChangesAsync();

        // State 2: Active Upcoming
        var activeDash = await service.GetHomeDashboardAsync(patient.Id);
        activeDash.Appointments.CarouselState.Should().Be("active");
        activeDash.Appointments.ScheduledCount.Should().Be(1);
        activeDash.Appointments.UpcomingItems[0].ClinicName.Should().Be("Metro Cardiology Center");
        activeDash.Appointments.UpcomingItems[0].ProviderName.Should().Be("Dr. Evelyn Reed, MD");

        // Check in to the appointment
        var checkIn = await service.CheckInAppointmentAsync(patient.Id, upcomingAppt.Id);
        checkIn.ClinicName.Should().Be("Metro Cardiology Center");

        // Move appointment to Completed in the past -> State 3: Returning patient with 0 upcoming
        upcomingAppt.Status = AppointmentStatus.Completed;
        upcomingAppt.ScheduledAt = now.UtcDateTime.AddDays(-5);
        await db.SaveChangesAsync();

        var returningDash = await service.GetHomeDashboardAsync(patient.Id);
        returningDash.Appointments.CarouselState.Should().Be("returning_empty");
        returningDash.Appointments.ScheduledCount.Should().Be(0);
        returningDash.Appointments.PastVisitsCount.Should().Be(1);
    }

    [Fact]
    public async Task VitalsAndMedicationLogging_PersistAndComputeDeltasAndScheduleAdherence()
    {
        using var db = CreateInMemoryContext();
        var now = new DateTimeOffset(2026, 11, 3, 8, 15, 0, TimeSpan.Zero);
        var service = new PatientHomeService(db, new FixedTimeProvider(now));

        var patient = CreatePatient();
        var med1 = new PatientMedication
        {
            Id = Guid.NewGuid(),
            ClientId = Guid.NewGuid(),
            PatientId = patient.Id,
            MedicationName = "Lisinopril",
            Dosage = "10mg",
            Frequency = "1 tablet with breakfast",
            IsCurrentlyTaking = true,
        };
        var med2 = new PatientMedication
        {
            Id = Guid.NewGuid(),
            ClientId = Guid.NewGuid(),
            PatientId = patient.Id,
            MedicationName = "Omega-3 DHA",
            Dosage = "1000mg",
            Frequency = "1 softgel after dinner",
            IsCurrentlyTaking = true,
        };

        db.Patients.Add(patient);
        db.PatientMedications.AddRange(med1, med2);
        await db.SaveChangesAsync();

        // Log baseline vitals yesterday, then today's vitals
        await service.LogPatientVitalsAsync(patient.Id, new LogPatientVitalsRequestDto(
            HeartRateBpm: 70,
            SystolicBp: 120,
            DiastolicBp: 78,
            FastingBloodGlucoseMgDl: 92m,
            SleepDurationMinutes: 415,
            DeepSleepMinutes: 115,
            Source: "HealthSync",
            RecordedAt: now.UtcDateTime.AddDays(-1)));

        await service.LogPatientVitalsAsync(patient.Id, new LogPatientVitalsRequestDto(
            HeartRateBpm: 72,
            SystolicBp: 118,
            DiastolicBp: 76,
            FastingBloodGlucoseMgDl: 94m,
            SleepDurationMinutes: 465,
            DeepSleepMinutes: 130,
            Source: "HealthSync",
            RecordedAt: now.UtcDateTime));

        // Log Lisinopril as taken
        var loggedMed = await service.LogMedicationIntakeAsync(
            patient.Id,
            med1.Id,
            new LogMedicationIntakeRequestDto("8:00 AM", now.UtcDateTime, null));
        loggedMed.IsTakenToday.Should().BeTrue();

        var dash = await service.GetHomeDashboardAsync(patient.Id);
        dash.RecentVitals.HasAnyReadings.Should().BeTrue();
        dash.RecentVitals.HeartRateBpm.Should().Be(72);
        dash.RecentVitals.HeartRateDeltaBpm.Should().Be(2);
        dash.RecentVitals.BloodPressureStatus.Should().Be("Optimal");
        dash.RecentVitals.FastingBloodGlucoseMgDl.Should().Be(94m);
        dash.RecentVitals.BloodGlucoseStatus.Should().Be("Normal 70–99");
        dash.RecentVitals.SleepDurationMinutes.Should().Be(465);
        dash.RecentVitals.DeepSleepMinutes.Should().Be(130);
        dash.RecentVitals.SleepDeltaPercent.Should().Be(12);

        dash.TodaySchedule.ActiveCount.Should().Be(2);
        dash.TodaySchedule.Items.Should().Contain(i => i.MedicationName == "Lisinopril" && i.IsTakenToday);
        dash.TodaySchedule.Items.Should().Contain(i => i.MedicationName == "Omega-3 DHA" && !i.IsTakenToday);
    }

    [Fact]
    public async Task PatientCatalogSearch_ComputesCategoryCounts_NextSlots_AndEnforcesGatedClinicServices()
    {
        using var db = CreateInMemoryContext();
        var now = new DateTimeOffset(2026, 11, 3, 9, 0, 0, TimeSpan.Zero); // Tuesday
        var search = new PatientCatalogSearchService(db, new FixedTimeProvider(now));

        var patient = CreatePatient();
        var publicClinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "Metro Cardiology Clinic",
            TenantId = "tenant-metro",
            Address = "Suite 402, Medical Arts Wing",
            SpecialtiesJson = "[\"Cardiology\",\"Echo & Diagnostic Lab\"]",
            IsPublic = true,
            SupportsAppointments = true,
            OperatingHours = "Mon-Sat 8:00 AM - 5:00 PM"
        };
        var provider = new ClinicHealthcareProvider
        {
            Id = Guid.NewGuid(),
            ClinicId = publicClinic.Id,
            Name = "Dr. Evelyn Reed, MD",
            Specialty = "Cardiology Specialist",
            ProfessionalLicenseNo = "PRC-102938",
            IsActive = true,
        };
        var availability = new ProviderAvailability
        {
            Id = Guid.NewGuid(),
            ClinicHealthcareProviderId = provider.Id,
            DayOfWeek = DayOfWeek.Wednesday,
            StartTime = new TimeSpan(10, 30, 0),
            EndTime = new TimeSpan(16, 0, 0),
            IsActive = true,
        };
        var service = new ClinicService
        {
            Id = Guid.NewGuid(),
            ClinicId = publicClinic.Id,
            Name = "Comprehensive Cardiac Panel",
            Description = "Includes 12-lead ECG, blood pressure & lipid review",
            DurationMinutes = 45,
            Price = 0m,
            IsActive = true,
        };

        var gatedPrivateClinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "Executive Cardiac Suite",
            IsPublic = true,
            IsGated = true,
        };
        var gatedService = new ClinicService
        {
            Id = Guid.NewGuid(),
            ClinicId = gatedPrivateClinic.Id,
            Name = "Executive Cardiology Concierge",
            IsActive = true,
        };

        db.Patients.Add(patient);
        db.Clinics.AddRange(publicClinic, gatedPrivateClinic);
        db.ClinicHealthcareProviders.Add(provider);
        db.ProviderAvailabilities.Add(availability);
        db.ClinicServices.AddRange(service, gatedService);
        await db.SaveChangesAsync();

        var result = await search.SearchAsync(patient.Id, "Cardi", "all");

        result.Doctors.Should().ContainSingle(d => d.Name == "Dr. Evelyn Reed, MD" && d.NextAvailableLabel == "Tomorrow, 10:30 AM");
        result.Clinics.Should().HaveCount(2);
        // Gated clinic service must NOT leak until patient joins the gated clinic
        result.Services.Should().ContainSingle(s => s.Name == "Comprehensive Cardiac Panel" && s.PriceBadgeLabel == "Covered");
        result.Counts.All.Should().Be(4);
        result.Counts.Doctors.Should().Be(1);
        result.Counts.Clinics.Should().Be(2);
        result.Counts.Services.Should().Be(1);
    }
}
