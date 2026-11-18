using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Shared.Common;
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
    public async Task DirectoryCatalogSearch_ComputesCategoryCounts_NextSlots_AndEnforcesGatedClinicServices()
    {
        using var db = CreateInMemoryContext();
        var now = new DateTimeOffset(2026, 11, 3, 9, 0, 0, TimeSpan.Zero); // Tuesday
        var search = new DirectoryCatalogSearchService(db, new FixedTimeProvider(now));

        var patient = CreatePatient();
        var publicClinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "Metro Cardiology Clinic",
            TenantId = "tenant-metro",
            Address = "Suite 402, Medical Arts Wing",
            SpecialtiesJson = "[\"Cardiology\",\"Echo & Diagnostic Lab\"]",
            IsWorkspaceEligible = true,
            IsDirectoryPublished = true,
            IsPlatformVerified = true,
            IsPublic = true,
            SupportsAppointments = true,
            OperatingHours = "Mon-Sat 8:00 AM - 5:00 PM"
        };
        var practitioner = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0102938",
            DisplayPrcLicenseNo = "PRC-102938",
            VerificationLevel = PractitionerVerificationLevel.Verified,
            Name = "Dr. Evelyn Reed, MD",
            FirstName = "Evelyn",
            LastName = "Reed",
            PrimarySpecialty = "Cardiology Specialist",
            Bio = "Board-certified cardiologist."
        };
        var provider = new ClinicHealthcareProvider
        {
            Id = Guid.NewGuid(),
            ClinicId = publicClinic.Id,
            PractitionerId = practitioner.Id,
            Name = "Dr. Evelyn Reed, MD",
            Specialty = "Cardiology Specialist",
            Role = "Doctor",
            ProfessionalLicenseNo = "PRC-102938",
            NormalizedLicenseNo = "0102938",
            IsDirectoryOptIn = true,
            AffiliationStatus = "Active",
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
            IsWorkspaceEligible = true,
            IsDirectoryPublished = true,
            IsPlatformVerified = true,
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
        db.Practitioners.Add(practitioner);
        db.Clinics.AddRange(publicClinic, gatedPrivateClinic);
        db.ClinicHealthcareProviders.Add(provider);
        db.ProviderAvailabilities.Add(availability);
        db.ClinicServices.AddRange(service, gatedService);
        await db.SaveChangesAsync();

        var result = await search.SearchAsync(patient.Id, "Cardi", "all");

        result.Doctors.Should().ContainSingle(d =>
            d.Name == "Dr. Evelyn Reed, MD" &&
            d.PractitionerId == practitioner.Id &&
            d.IsVerified &&
            d.NextAvailableLabel == "Tomorrow, 10:30 AM");
        result.Clinics.Should().HaveCount(2);
        // Gated clinic service must NOT leak until patient joins the gated clinic
        result.Services.Should().ContainSingle(s => s.Name == "Comprehensive Cardiac Panel" && s.PriceBadgeLabel == "Covered");
        result.Counts.All.Should().Be(4);
        result.Counts.Doctors.Should().Be(1);
        result.Counts.Clinics.Should().Be(2);
        result.Counts.Services.Should().Be(1);
    }

    [Fact]
    public async Task DirectoryCatalogSearch_EnforcesThreeGateIsPublic_BookingPausedRanking_AndClinicianFiltering()
    {
        using var db = CreateInMemoryContext();
        var now = new DateTimeOffset(2026, 11, 3, 9, 0, 0, TimeSpan.Zero); // Tuesday
        var search = new DirectoryCatalogSearchService(db, new FixedTimeProvider(now));

        var bookableClinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "Alpha Bookable Clinic",
            TenantId = "tenant-alpha",
            FeaturedScore = 10,
            SupportsAppointments = true
        };
        bookableClinic.SetWorkspaceEligibility(true);
        bookableClinic.SetDirectoryPublished(true);
        bookableClinic.SetPlatformVerified(true);

        var pausedClinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "AAA Paused Clinic",
            TenantId = "tenant-paused",
            FeaturedScore = 9999,
            SupportsAppointments = false
        };
        pausedClinic.SetWorkspaceEligibility(true);
        pausedClinic.SetDirectoryPublished(true);
        pausedClinic.SetPlatformVerified(true);

        var unverifiedClinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "Unverified Hidden Clinic",
            TenantId = "tenant-unverified",
            SupportsAppointments = true
        };
        unverifiedClinic.SetWorkspaceEligibility(true);
        unverifiedClinic.SetDirectoryPublished(true);
        // IsPlatformVerified remains false -> IsPublic == false

        var verifiedNursePractitioner = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Nurse",
            NormalizedPrcLicenseNo = "0777777",
            DisplayPrcLicenseNo = "PRC-0777777",
            VerificationLevel = PractitionerVerificationLevel.Verified,
            Name = "RN Clara Reyes",
            FirstName = "Clara",
            LastName = "Reyes",
            PrimarySpecialty = "Triage & Immunization"
        };

        var unverifiedDoctor = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0888888",
            DisplayPrcLicenseNo = "PRC-0888888",
            VerificationLevel = PractitionerVerificationLevel.PendingVerification,
            Name = "Dr. Pending Hidden",
            FirstName = "Pending",
            LastName = "Hidden",
            PrimarySpecialty = "General Practice"
        };

        var nurseProvider = new ClinicHealthcareProvider
        {
            Id = Guid.NewGuid(),
            ClinicId = bookableClinic.Id,
            PractitionerId = verifiedNursePractitioner.Id,
            Name = "RN Clara Reyes",
            Specialty = "Triage & Immunization",
            Role = "Nurse",
            IsDirectoryOptIn = true,
            AffiliationStatus = "Active",
            IsActive = true
        };

        var unverifiedProvider = new ClinicHealthcareProvider
        {
            Id = Guid.NewGuid(),
            ClinicId = bookableClinic.Id,
            PractitionerId = unverifiedDoctor.Id,
            Name = "Dr. Pending Hidden",
            Specialty = "General Practice",
            Role = "Doctor",
            IsDirectoryOptIn = true,
            AffiliationStatus = "Active",
            IsActive = true
        };

        var optedOutProvider = new ClinicHealthcareProvider
        {
            Id = Guid.NewGuid(),
            ClinicId = bookableClinic.Id,
            PractitionerId = verifiedNursePractitioner.Id,
            Name = "Opted Out Copy",
            Specialty = "General Practice",
            Role = "Nurse",
            IsDirectoryOptIn = false,
            AffiliationStatus = "Active",
            IsActive = true
        };

        var receptionist = new ClinicHealthcareProvider
        {
            Id = Guid.NewGuid(),
            ClinicId = bookableClinic.Id,
            PractitionerId = verifiedNursePractitioner.Id,
            Name = "Receptionist Staff",
            Specialty = "Front Desk",
            Role = "Receptionist",
            IsDirectoryOptIn = true,
            AffiliationStatus = "Active",
            IsActive = true
        };

        db.Practitioners.AddRange(verifiedNursePractitioner, unverifiedDoctor);
        db.Clinics.AddRange(bookableClinic, pausedClinic, unverifiedClinic);
        db.ClinicHealthcareProviders.AddRange(nurseProvider, unverifiedProvider, optedOutProvider, receptionist);
        await db.SaveChangesAsync();

        // Anonymous directory search (patientId == null)
        var result = await search.SearchAsync(null, null, "all");

        result.Clinics.Should().HaveCount(2);
        result.Clinics.Select(c => c.Id).Should().NotContain(unverifiedClinic.Id);
        result.Clinics[0].Id.Should().Be(bookableClinic.Id);
        result.Clinics[0].SupportsAppointments.Should().BeTrue();
        result.Clinics[1].Id.Should().Be(pausedClinic.Id);
        result.Clinics[1].SupportsAppointments.Should().BeFalse();
        result.Clinics[1].Tags.Should().Contain("Booking Paused");

        result.Doctors.Should().ContainSingle(d => d.Id == nurseProvider.Id && d.Role == "Nurse" && d.IsVerified);
    }

    [Fact]
    public async Task DirectoryCatalogSearch_GroupsMultiClinicClinicianByPractitionerId_AndLookupWorksByEitherId()
    {
        using var db = CreateInMemoryContext();
        var now = new DateTimeOffset(2026, 11, 3, 9, 0, 0, TimeSpan.Zero); // Tuesday
        var search = new DirectoryCatalogSearchService(db, new FixedTimeProvider(now));

        var pausedClinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "North Paused Clinic",
            Address = "Quezon City",
            TenantId = "tenant-north",
            SupportsAppointments = false,
            IsWorkspaceEligible = true,
            IsDirectoryPublished = true,
            IsPlatformVerified = true,
            IsPublic = true
        };
        var bookableClinic = new Clinic
        {
            Id = Guid.NewGuid(),
            Name = "South Bookable Clinic",
            Address = "Makati City",
            TenantId = "tenant-south",
            SupportsAppointments = true,
            IsWorkspaceEligible = true,
            IsDirectoryPublished = true,
            IsPlatformVerified = true,
            IsPublic = true
        };

        var practitioner = new Practitioner
        {
            Id = Guid.NewGuid(),
            ProfessionKind = "Doctor",
            NormalizedPrcLicenseNo = "0123456",
            DisplayPrcLicenseNo = "PRC-0123456",
            VerificationLevel = PractitionerVerificationLevel.Verified,
            Name = "Dr. Jose Santos",
            FirstName = "Jose",
            LastName = "Santos",
            PrimarySpecialty = "Internal Medicine",
            Bio = "Internist practicing across Metro Manila."
        };

        var affPaused = new ClinicHealthcareProvider
        {
            Id = Guid.NewGuid(),
            ClinicId = pausedClinic.Id,
            PractitionerId = practitioner.Id,
            Name = "Dr. Jose Santos",
            Specialty = "General Practice",
            Role = "Doctor",
            IsDirectoryOptIn = true,
            AffiliationStatus = "Active",
            IsActive = true,
            ProviderAvailabilities =
            [
                new ProviderAvailability
                {
                    Id = Guid.NewGuid(),
                    DayOfWeek = DayOfWeek.Wednesday,
                    StartTime = new TimeSpan(9, 0, 0),
                    EndTime = new TimeSpan(12, 0, 0),
                    IsActive = true
                }
            ]
        };

        var affBookable = new ClinicHealthcareProvider
        {
            Id = Guid.NewGuid(),
            ClinicId = bookableClinic.Id,
            PractitionerId = practitioner.Id,
            Name = "Dr. Jose Santos",
            Specialty = "Internal Medicine",
            Role = "Doctor",
            IsDirectoryOptIn = true,
            AffiliationStatus = "Active",
            IsActive = true,
            ProviderAvailabilities =
            [
                new ProviderAvailability
                {
                    Id = Guid.NewGuid(),
                    DayOfWeek = DayOfWeek.Wednesday,
                    StartTime = new TimeSpan(14, 0, 0),
                    EndTime = new TimeSpan(18, 0, 0),
                    IsActive = true
                }
            ]
        };

        db.Practitioners.Add(practitioner);
        db.Clinics.AddRange(pausedClinic, bookableClinic);
        db.ClinicHealthcareProviders.AddRange(affPaused, affBookable);
        await db.SaveChangesAsync();

        var searchResult = await search.SearchAsync(null, "Santos", "doctors");

        searchResult.Doctors.Should().ContainSingle();
        var doc = searchResult.Doctors[0];
        doc.Id.Should().Be(affBookable.Id);
        doc.PractitionerId.Should().Be(practitioner.Id);
        doc.ClinicId.Should().Be(bookableClinic.Id);
        doc.ClinicName.Should().Be("South Bookable Clinic");
        doc.ClinicSupportsAppointments.Should().BeTrue();
        doc.IsVerified.Should().BeTrue();
        doc.Bio.Should().Be("Internist practicing across Metro Manila.");
        doc.Affiliations.Should().HaveCount(2);
        doc.Affiliations![0].ClinicId.Should().Be(bookableClinic.Id);
        doc.Affiliations[0].SupportsAppointments.Should().BeTrue();
        doc.Affiliations[0].Availabilities.Should().ContainSingle(w => w.DayOfWeek == DayOfWeek.Wednesday && w.StartTime == "14:00");
        doc.Affiliations[1].ClinicId.Should().Be(pausedClinic.Id);
        doc.Affiliations[1].SupportsAppointments.Should().BeFalse();
        doc.Affiliations[1].NextAvailableLabel.Should().Be("Booking Paused");

        var byPractitionerId = await search.GetPractitionerProfileAsync(practitioner.Id);
        var byProviderId = await search.GetPractitionerProfileAsync(affPaused.Id);

        byPractitionerId.Should().NotBeNull();
        byProviderId.Should().NotBeNull();
        byPractitionerId!.PractitionerId.Should().Be(practitioner.Id);
        byProviderId!.PractitionerId.Should().Be(practitioner.Id);
        byPractitionerId.Affiliations.Should().HaveCount(2);
        byPractitionerId.IsVerified.Should().BeTrue();
    }
}
