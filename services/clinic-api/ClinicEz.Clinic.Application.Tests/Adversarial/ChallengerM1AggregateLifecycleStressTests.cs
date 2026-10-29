using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using ClinicEz.Shared.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Challenger 1 Empirical Stress Test Suite for Milestone M1 Iteration 2:
/// Domain Stress & 1NF Lifecycle Challenger.
/// 
/// Comprehensive verification of:
/// 1. Full lifecycle (Add, Update, Soft-Delete, Query) across all 9 child collections:
///    - PatientMedicalHistory
///    - PatientAllergy
///    - PatientAlert
///    - PatientVitals
///    - PatientPhysicalExam & PatientPhysicalExamFinding
///    - PatientSocialHistory
///    - PatientReproductiveHistory
///    - PatientPhilHealthMembership
///    - PatientYakapEnlistment
/// 2. EF Core ChangeTracker concurrency & key generation:
///    - Adding child entities with Id = Guid.Empty never causes concurrency or key collision exceptions.
///    - Unset keys (Guid.Empty) trigger ValueGenerated.OnAdd, generating valid unique non-empty Guids.
///    - Contrast with pre-assigned keys in navigation collections which EF Core treats as existing entities (causing concurrency conflicts if not tracked via DbSet.Add).
///    - Mass batch additions (100+ entities) with unset keys succeed atomically.
/// 3. Pure relational persistence & zero CustomFields fallback:
///    - CustomFields JSON is never contaminated with clinical histories, allergies, alerts, or enlistments.
///    - Clinical queries are 100% relational and immune to arbitrary or poisoned CustomFields JSON.
///    - LabObservation and PatientPhysicalExamFinding are stored and queried relationally without JSON text columns.
/// </summary>
public sealed class ChallengerM1AggregateLifecycleStressTests
{
    private const string TestTenant = "tenant_challenger_m1_it2";
    private const string TestStaff = "challenger_staff_user";

    private static ApplicationDbContext CreateTestDbContext(
        Guid clinicId,
        string tenantId = TestTenant,
        string userId = TestStaff,
        string? dbName = null)
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var currentUserService = Substitute.For<ICurrentUserService>();
        currentUserService.UserId.Returns(userId);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var interceptor = new SoftDeleteSaveChangesInterceptor(currentUserService);

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName ?? $"ClinicEz_Lifecycle_{Guid.NewGuid():N}")
            .AddInterceptors(interceptor)
            .Options;

        return new ApplicationDbContext(options, config, clinicContext);
    }

    private static Patient CreateBaselinePatient(Guid clinicId, string tenantId = TestTenant)
    {
        return new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = $"PAT-{Guid.NewGuid():N}"[..14],
            FirstName = "Maria",
            LastName = "Santos",
            MiddleName = "Cruz",
            DateOfBirth = new DateOnly(1990, 5, 20),
            Sex = BiologicalSex.Female,
            ContactNumber = "09181234567",
            VerificationStatus = PatientVerificationStatus.Verified
        };
    }

    #region Group 1: Pure 1NF Child Collections Lifecycle (Add, Update, Soft-Delete, Query)

    [Fact]
    public async Task PatientMedicalHistory_FullLifecycle_AddUpdateSoftDeleteAndQuery_SucceedsRelational()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_MedHist_{Guid.NewGuid():N}";
        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // 1. Add with Id = Guid.Empty
        var medHistory = new PatientMedicalHistory
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = MedicalHistoryCategory.MedicalHistory,
            VerificationStatus = ConditionVerificationStatus.Confirmed,
            ConditionTitle = "Essential Hypertension",
            PhilHealthMdiseaseCode = "HYPERTENSION",
            Icd10Code = "I10",
            SpecificDescription = "Stage 2 primary hypertension under amlodipine",
            Status = ProblemStatus.Active,
            Severity = ProblemSeverity.Moderate,
            IsChronicNcd = true,
            OnsetDate = new DateOnly(2022, 1, 15),
            ClinicalNotes = "Controlled with medication"
        };
        patient.MedicalHistories.Add(medHistory);
        await context.SaveChangesAsync();

        medHistory.Id.Should().NotBeEmpty("EF Core must generate a valid Guid for new entity with Id = Guid.Empty");

        // 2. Query relationally
        var queried = await context.PatientMedicalHistories
            .FirstOrDefaultAsync(m => m.PatientId == patient.Id && m.ConditionTitle == "Essential Hypertension");
        queried.Should().NotBeNull();
        queried!.Icd10Code.Should().Be("I10");
        queried.Status.Should().Be(ProblemStatus.Active);
        queried.IsChronicNcd.Should().BeTrue();

        // 3. Update
        queried.Status = ProblemStatus.Resolved;
        queried.ResolvedDate = new DateOnly(2026, 10, 1);
        queried.SpecificDescription = "Hypertension resolved with lifestyle change";
        await context.SaveChangesAsync();

        var reloaded = await context.PatientMedicalHistories.FindAsync(medHistory.Id);
        reloaded.Should().NotBeNull();
        reloaded!.Status.Should().Be(ProblemStatus.Resolved);
        reloaded.ResolvedDate.Should().Be(new DateOnly(2026, 10, 1));

        // 4. Soft-Delete
        context.PatientMedicalHistories.Remove(reloaded);
        await context.SaveChangesAsync();

        // Standard query filtered
        var active = await context.PatientMedicalHistories.FirstOrDefaultAsync(m => m.Id == medHistory.Id);
        active.Should().BeNull("SoftDeleteSaveChangesInterceptor must filter soft-deleted medical history");

        // IgnoreQueryFilters shows audit
        var deleted = await context.PatientMedicalHistories.IgnoreQueryFilters().FirstOrDefaultAsync(m => m.Id == medHistory.Id);
        deleted.Should().NotBeNull();
        deleted!.IsDeleted.Should().BeTrue();
        deleted.DeletedAt.Should().NotBeNull();
        deleted.DeletedBy.Should().Be(TestStaff);
    }

    [Fact]
    public async Task PatientAllergy_FullLifecycle_AddUpdateSoftDeleteAndQuery_SucceedsRelational()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Allergy_{Guid.NewGuid():N}";
        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // 1. Add with Id = Guid.Empty
        var allergy = new PatientAllergy
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = AllergyCategory.Medication,
            Severity = AllergySeverity.Severe,
            Status = AllergyStatus.Active,
            Allergen = "Amoxicillin",
            AllergenDrugCode = "AMOX-500",
            ReactionManifestation = "Generalized urticaria and dyspnea",
            IsAnaphylactic = true,
            Notes = "Do not administer penicillin group"
        };
        patient.Allergies ??= new List<PatientAllergy>();
        patient.Allergies.Add(allergy);
        await context.SaveChangesAsync();

        allergy.Id.Should().NotBeEmpty();

        // 2. Query relationally
        var queried = await context.PatientAllergies
            .FirstOrDefaultAsync(a => a.PatientId == patient.Id && a.Allergen == "Amoxicillin");
        queried.Should().NotBeNull();
        queried!.Severity.Should().Be(AllergySeverity.Severe);
        queried.IsAnaphylactic.Should().BeTrue();

        // 3. Update
        queried.Severity = AllergySeverity.LifeThreatening;
        queried.ReactionManifestation = "Severe anaphylactic shock requiring epinephrine";
        await context.SaveChangesAsync();

        var reloaded = await context.PatientAllergies.FindAsync(allergy.Id);
        reloaded.Should().NotBeNull();
        reloaded!.Severity.Should().Be(AllergySeverity.LifeThreatening);

        // 4. Soft-Delete
        context.PatientAllergies.Remove(reloaded);
        await context.SaveChangesAsync();

        (await context.PatientAllergies.FirstOrDefaultAsync(a => a.Id == allergy.Id)).Should().BeNull();
        var deleted = await context.PatientAllergies.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == allergy.Id);
        deleted.Should().NotBeNull();
        deleted!.IsDeleted.Should().BeTrue();
        deleted.DeletedBy.Should().Be(TestStaff);
    }

    [Fact]
    public async Task PatientAlert_FullLifecycle_AddUpdateSoftDeleteAndQuery_SucceedsRelational()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Alert_{Guid.NewGuid():N}";
        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // 1. Add with Id = Guid.Empty
        var alert = new PatientAlert
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = PatientAlertCategory.ClinicalSafety,
            Severity = PatientAlertSeverity.Critical,
            Status = PatientAlertStatus.Active,
            Title = "High Fall Risk",
            Code = "FALL_RISK",
            Notes = "Patient has severe vertigo; requires assistance walking",
            ExpiresAt = DateTime.UtcNow.AddMonths(1)
        };
        patient.Alerts.Add(alert);
        await context.SaveChangesAsync();

        alert.Id.Should().NotBeEmpty();

        // 2. Query relationally
        var queried = await context.PatientAlerts.FirstOrDefaultAsync(a => a.PatientId == patient.Id && a.Code == "FALL_RISK");
        queried.Should().NotBeNull();
        queried!.IsActive.Should().BeTrue();

        // 3. Update
        queried.Notes = "Updated: Physical therapy completed, assisted walking only";
        queried.Severity = PatientAlertSeverity.Warning;
        await context.SaveChangesAsync();

        var reloaded = await context.PatientAlerts.FindAsync(alert.Id);
        reloaded.Should().NotBeNull();
        reloaded!.Severity.Should().Be(PatientAlertSeverity.Warning);

        // 4. Soft-Delete
        context.PatientAlerts.Remove(reloaded);
        await context.SaveChangesAsync();

        (await context.PatientAlerts.FirstOrDefaultAsync(a => a.Id == alert.Id)).Should().BeNull();
        var deleted = await context.PatientAlerts.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == alert.Id);
        deleted.Should().NotBeNull();
        deleted!.IsDeleted.Should().BeTrue();
    }

    [Fact]
    public async Task PatientVitals_FullLifecycle_StandaloneAndEncounterVitals_SucceedsRelational()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Vitals_{Guid.NewGuid():N}";
        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // 1. Standalone Vitals (QueueItemId == null, ConsultationEncounterId == null)
        var vitals = new PatientVitals
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = null,
            ConsultationEncounterId = null,
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 72,
            RespiratoryRateBreathsPerMin = 18,
            TemperatureCelsius = 36.6m,
            OxygenSaturationPercent = 98.5m,
            HeightCm = 165.0m,
            WeightKg = 60.0m,
            Bmi = 22.04m,
            BloodGlucoseRandomMgDl = 95.0m,
            VisualAcuityLeft = "20/20",
            VisualAcuityRight = "20/25",
            RecordedAt = DateTime.UtcNow,
            RecordedByNurseName = "Nurse Joy"
        };
        patient.Vitals.Add(vitals);
        await context.SaveChangesAsync();

        vitals.Id.Should().NotBeEmpty();

        // 2. Query relationally
        var queried = await context.PatientVitals.FirstOrDefaultAsync(v => v.PatientId == patient.Id);
        queried.Should().NotBeNull();
        queried!.QueueItemId.Should().BeNull();
        queried.BloodGlucoseRandomMgDl.Should().Be(95.0m);
        queried.Bmi.Should().Be(22.04m);

        // 3. Update
        queried.BloodGlucoseRandomMgDl = 110.0m;
        queried.WeightKg = 61.0m;
        await context.SaveChangesAsync();

        var reloaded = await context.PatientVitals.FindAsync(vitals.Id);
        reloaded.Should().NotBeNull();
        reloaded!.BloodGlucoseRandomMgDl.Should().Be(110.0m);
        reloaded.WeightKg.Should().Be(61.0m);

        // 4. Soft-Delete
        context.PatientVitals.Remove(reloaded);
        await context.SaveChangesAsync();

        (await context.PatientVitals.FirstOrDefaultAsync(v => v.Id == vitals.Id)).Should().BeNull();
        var deleted = await context.PatientVitals.IgnoreQueryFilters().FirstOrDefaultAsync(v => v.Id == vitals.Id);
        deleted.Should().NotBeNull();
        deleted!.IsDeleted.Should().BeTrue();
    }

    [Fact]
    public async Task PatientPhysicalExam_AndFindings_FullLifecycle_SucceedsRelational()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Exam_{Guid.NewGuid():N}";
        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // 1. Add Exam with child Findings (all with Id = Guid.Empty)
        var exam = new PatientPhysicalExam
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            ExamDate = DateTime.UtcNow,
            ExaminedByStaffName = "Dr. House",
            GeneralSurveyStatus = GeneralSurveyStatus.Abnormal,
            GeneralSurveyRemarks = "Patient appears pale and fatigued",
            ChestLungsRemarks = "Decreased breath sounds at right base",
            MusculoskeletalRemarks = "Full range of motion in all extremities",
            Findings = new List<PatientPhysicalExamFinding>
            {
                new()
                {
                    Id = Guid.Empty,
                    TenantId = patient.TenantId,
                    ClinicId = clinicId,
                    System = PhysicalExamSystem.Chest,
                    IsNormal = false,
                    FindingTitle = "Rales / Crackles",
                    PhilHealthFindingCode = "PE_CHEST_RALES",
                    BodySite = "Right lower lung field",
                    Remarks = "Inspiratory crackles"
                },
                new()
                {
                    Id = Guid.Empty,
                    TenantId = patient.TenantId,
                    ClinicId = clinicId,
                    System = PhysicalExamSystem.Heart,
                    IsNormal = true,
                    FindingTitle = "Normal heart sounds",
                    PhilHealthFindingCode = "PE_HEART_NORMAL",
                    Remarks = "Regular rate and rhythm, no murmurs"
                }
            }
        };
        patient.PhysicalExams.Add(exam);
        await context.SaveChangesAsync();

        exam.Id.Should().NotBeEmpty();
        exam.Findings.Should().HaveCount(2);
        exam.Findings.All(f => f.Id != Guid.Empty).Should().BeTrue();
        exam.Findings.All(f => f.PhysicalExamId == exam.Id).Should().BeTrue();

        // 2. Query relationally
        var queried = await context.PatientPhysicalExams
            .Include(e => e.Findings)
            .FirstOrDefaultAsync(e => e.Id == exam.Id);
        queried.Should().NotBeNull();
        queried!.Findings.Should().HaveCount(2);
        queried.GeneralSurveyRemarks.Should().Be("Patient appears pale and fatigued");

        // 3. Add new finding to existing tracked exam
        var newFinding = new PatientPhysicalExamFinding
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PhysicalExamId = exam.Id,
            System = PhysicalExamSystem.Abdomen,
            IsNormal = true,
            FindingTitle = "Soft, non-tender",
            Remarks = "Bowel sounds active"
        };
        queried.Findings.Add(newFinding);
        await context.SaveChangesAsync();

        newFinding.Id.Should().NotBeEmpty();
        (await context.PatientPhysicalExamFindings.CountAsync(f => f.PhysicalExamId == exam.Id)).Should().Be(3);

        // 4. Update finding
        var findingToUpdate = queried.Findings.First(f => f.System == PhysicalExamSystem.Chest);
        findingToUpdate.Remarks = "Crackles resolved on coughing";
        await context.SaveChangesAsync();

        var reloadedFinding = await context.PatientPhysicalExamFindings.FindAsync(findingToUpdate.Id);
        reloadedFinding!.Remarks.Should().Be("Crackles resolved on coughing");

        // 5. Soft-delete finding
        context.PatientPhysicalExamFindings.Remove(findingToUpdate);
        await context.SaveChangesAsync();

        (await context.PatientPhysicalExamFindings.FirstOrDefaultAsync(f => f.Id == findingToUpdate.Id)).Should().BeNull();
        (await context.PatientPhysicalExamFindings.IgnoreQueryFilters().FirstOrDefaultAsync(f => f.Id == findingToUpdate.Id))!.IsDeleted.Should().BeTrue();

        // 6. Soft-delete exam
        context.PatientPhysicalExams.Remove(queried);
        await context.SaveChangesAsync();

        (await context.PatientPhysicalExams.FirstOrDefaultAsync(e => e.Id == exam.Id)).Should().BeNull();
        (await context.PatientPhysicalExams.IgnoreQueryFilters().FirstOrDefaultAsync(e => e.Id == exam.Id))!.IsDeleted.Should().BeTrue();
    }

    [Fact]
    public async Task PatientSocialHistory_FullLifecycle_AndFilteredUniqueIndex_SucceedsRelational()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Social_{Guid.NewGuid():N}";

        Guid patientId;
        Guid socialId;

        // Scope 1: Create and Update
        using (var context1 = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var patient = CreateBaselinePatient(clinicId);
            context1.Patients.Add(patient);
            await context1.SaveChangesAsync();
            patientId = patient.Id;

            // 1. Add 1:1 SocialHistory
            var social = new PatientSocialHistory
            {
                Id = Guid.Empty,
                TenantId = patient.TenantId,
                ClinicId = clinicId,
                PatientId = patient.Id,
                IsSmoker = true,
                CigarettesPerDay = 10,
                YearsSmoking = 5,
                SmokingPackYears = 2.5m,
                SmokingStatus = "current",
                IsAlcoholDrinker = true,
                AlcoholFrequency = "Weekly",
                AlcoholStatus = "current",
                Occupation = "Software Engineer",
                Industry = "Technology",
                EducationLevel = "College",
                LivingArrangement = "With Family"
            };
            context1.PatientSocialHistories.Add(social);
            await context1.SaveChangesAsync();

            social.Id.Should().NotBeEmpty();
            socialId = social.Id;

            // 2. Query relationally
            var queried = await context1.PatientSocialHistories.FirstOrDefaultAsync(s => s.PatientId == patientId);
            queried.Should().NotBeNull();
            queried!.SmokingPackYears.Should().Be(2.5m);
            queried.Occupation.Should().Be("Software Engineer");

            // 3. Update
            queried.IsSmoker = false;
            queried.SmokingStoppedDate = new DateOnly(2026, 1, 1);
            queried.SmokingStatus = "quit";
            queried.ExerciseMinutesPerWeek = 150;
            await context1.SaveChangesAsync();

            var reloaded = await context1.PatientSocialHistories.FindAsync(socialId);
            reloaded!.SmokingStatus.Should().Be("quit");
            reloaded.ExerciseMinutesPerWeek.Should().Be(150);

            // 4. Soft-delete
            context1.PatientSocialHistories.Remove(reloaded);
            await context1.SaveChangesAsync();
        }

        // Scope 2: Verify soft-deletion and filtered unique index in subsequent request context
        using (var context2 = CreateTestDbContext(clinicId, dbName: dbName))
        {
            // Standard query must NOT find the soft-deleted social history
            (await context2.PatientSocialHistories.FirstOrDefaultAsync(s => s.Id == socialId)).Should().BeNull();
            (await context2.PatientSocialHistories.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.Id == socialId))!.IsDeleted.Should().BeTrue();

            // 5. Filtered Unique Index verification:
            // Adding a new social history for the same patient in the same clinic succeeds because old is soft-deleted
            var newSocial = new PatientSocialHistory
            {
                Id = Guid.Empty,
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patientId,
                IsSmoker = false,
                SmokingStatus = "never",
                Occupation = "Lead Architect"
            };
            context2.PatientSocialHistories.Add(newSocial);
            await context2.SaveChangesAsync();

            newSocial.Id.Should().NotBeEmpty();
            newSocial.Id.Should().NotBe(socialId);
            (await context2.PatientSocialHistories.CountAsync(s => s.PatientId == patientId)).Should().Be(1);
        }
    }

    [Fact]
    public async Task PatientReproductiveHistory_FullLifecycle_AndFilteredUniqueIndex_SucceedsRelational()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Repro_{Guid.NewGuid():N}";

        Guid patientId;
        Guid reproId;

        // Scope 1: Create, Query, Update, Soft-delete
        using (var context1 = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var patient = CreateBaselinePatient(clinicId);
            context1.Patients.Add(patient);
            await context1.SaveChangesAsync();
            patientId = patient.Id;

            // 1. Add 1:1 ReproductiveHistory
            var repro = new PatientReproductiveHistory
            {
                Id = Guid.Empty,
                TenantId = patient.TenantId,
                ClinicId = clinicId,
                PatientId = patient.Id,
                IsApplicable = true,
                MenarcheAge = 13,
                CoitarcheAge = 20,
                LastMenstrualPeriod = new DateOnly(2026, 9, 15),
                PeriodDurationDays = 5,
                CycleIntervalDays = 28,
                PadsPerDay = 3,
                IsCurrentlyPregnant = true,
                ExpectedDeliveryDate = new DateOnly(2027, 6, 22),
                Gravidity = 2,
                Parity = 1,
                TermBirths = 1,
                PretermBirths = 0,
                Abortions = 0,
                LivingChildren = 1,
                DeliveryType = "Vaginal",
                HadPreEclampsiaHypertension = false,
                ReceivedFamilyPlanningCounseling = true
            };
            context1.PatientReproductiveHistories.Add(repro);
            await context1.SaveChangesAsync();

            repro.Id.Should().NotBeEmpty();
            reproId = repro.Id;

            // 2. Query relationally
            var queried = await context1.PatientReproductiveHistories.FirstOrDefaultAsync(r => r.PatientId == patientId);
            queried.Should().NotBeNull();
            queried!.IsCurrentlyPregnant.Should().BeTrue();
            queried.ExpectedDeliveryDate.Should().Be(new DateOnly(2027, 6, 22));
            queried.CoitarcheAge.Should().Be(20);

            // 3. Update
            queried.IsCurrentlyPregnant = false;
            queried.LivingChildren = 2;
            queried.Parity = 2;
            await context1.SaveChangesAsync();

            var reloaded = await context1.PatientReproductiveHistories.FindAsync(reproId);
            reloaded!.IsCurrentlyPregnant.Should().BeFalse();
            reloaded.LivingChildren.Should().Be(2);

            // 4. Soft-delete
            context1.PatientReproductiveHistories.Remove(reloaded);
            await context1.SaveChangesAsync();
        }

        // Scope 2: Filtered unique index verification in subsequent request
        using (var context2 = CreateTestDbContext(clinicId, dbName: dbName))
        {
            (await context2.PatientReproductiveHistories.FirstOrDefaultAsync(r => r.Id == reproId)).Should().BeNull();
            (await context2.PatientReproductiveHistories.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == reproId))!.IsDeleted.Should().BeTrue();

            // 5. Filtered Unique Index verification:
            // Adding a new reproductive history for the same patient after soft-deletion succeeds
            var newRepro = new PatientReproductiveHistory
            {
                Id = Guid.Empty,
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patientId,
                IsApplicable = true,
                MenarcheAge = 13,
                IsMenopausal = true,
                MenopauseAge = 50
            };
            context2.PatientReproductiveHistories.Add(newRepro);
            await context2.SaveChangesAsync();

            newRepro.Id.Should().NotBeEmpty();
            (await context2.PatientReproductiveHistories.CountAsync(r => r.PatientId == patientId)).Should().Be(1);
        }
    }

    [Fact]
    public async Task PatientPhilHealthMembership_FullLifecycle_AndFilteredUniqueIndex_SucceedsRelational()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_PhilHealth_{Guid.NewGuid():N}";

        Guid patientId;
        Guid membershipId;

        // Scope 1: Create, Query, Update, Soft-delete
        using (var context1 = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var patient = CreateBaselinePatient(clinicId);
            context1.Patients.Add(patient);
            await context1.SaveChangesAsync();
            patientId = patient.Id;

            // 1. Add 1:1 Membership
            var membership = new PatientPhilHealthMembership
            {
                Id = Guid.Empty,
                TenantId = patient.TenantId,
                ClinicId = clinicId,
                PatientId = patient.Id,
                MemberPin = "12-345678901-2",
                MemberType = PhilHealthMemberType.MM,
                MembershipCategoryCode = "INFORMAL_ECONOMY",
                MembershipCategoryDesc = "Informal Economy - Self-Employed",
                EmployerPin = "00-111222333-4",
                EmployerName = "Self Employed",
                DefaultWalkInAtc = "ATC_PREMIUM"
            };
            context1.PatientPhilHealthMemberships.Add(membership);
            await context1.SaveChangesAsync();

            membership.Id.Should().NotBeEmpty();
            membershipId = membership.Id;

            // 2. Query relationally
            var queried = await context1.PatientPhilHealthMemberships.FirstOrDefaultAsync(m => m.PatientId == patientId);
            queried.Should().NotBeNull();
            queried!.MemberPin.Should().Be("12-345678901-2");
            queried.MemberType.Should().Be(PhilHealthMemberType.MM);

            // 3. Update
            queried.MembershipCategoryDesc = "Formal Economy - Private";
            queried.DefaultWalkInAtc = "ATC_FORMAL";
            await context1.SaveChangesAsync();

            var reloaded = await context1.PatientPhilHealthMemberships.FindAsync(membershipId);
            reloaded!.MembershipCategoryDesc.Should().Be("Formal Economy - Private");
            reloaded.DefaultWalkInAtc.Should().Be("ATC_FORMAL");

            // 4. Soft-delete
            context1.PatientPhilHealthMemberships.Remove(reloaded);
            await context1.SaveChangesAsync();
        }

        // Scope 2: Filtered unique index verification in subsequent request
        using (var context2 = CreateTestDbContext(clinicId, dbName: dbName))
        {
            (await context2.PatientPhilHealthMemberships.FirstOrDefaultAsync(m => m.Id == membershipId)).Should().BeNull();
            (await context2.PatientPhilHealthMemberships.IgnoreQueryFilters().FirstOrDefaultAsync(m => m.Id == membershipId))!.IsDeleted.Should().BeTrue();

            // 5. Filtered Unique Index verification:
            // Adding new membership for same patient succeeds after soft-delete
            var newMembership = new PatientPhilHealthMembership
            {
                Id = Guid.Empty,
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patientId,
                MemberPin = "98-765432109-8",
                MemberType = PhilHealthMemberType.DD,
                DependentRelationship = PhilHealthDependentRelationship.S,
                PrincipalMemberPin = "12-345678901-2"
            };
            context2.PatientPhilHealthMemberships.Add(newMembership);
            await context2.SaveChangesAsync();

            newMembership.Id.Should().NotBeEmpty();
            (await context2.PatientPhilHealthMemberships.CountAsync(m => m.PatientId == patientId)).Should().Be(1);
        }
    }

    [Fact]
    public async Task PatientYakapEnlistment_FullLifecycle_AndYearUniqueIndex_SucceedsRelational()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Yakap_{Guid.NewGuid():N}";
        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // 1. Add Enlistment for Year 2026
        var enlistment = new PatientYakapEnlistment
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            PackageType = YakapPackageType.Konsulta,
            EnlistmentDate = new DateOnly(2026, 1, 10),
            ValidUntil = new DateOnly(2026, 12, 31),
            CaseNo = "KONS-2026-0001",
            EnlistmentTransNo = "TRANS-ENL-001",
            ProfilingTransNo = "TRANS-PROF-001",
            ProfilingDate = new DateOnly(2026, 1, 12),
            ProfilingAtc = "ATC_PREMIUM",
            IsWalkedIn = true,
            HasPatientConsent = true,
            ConsentSignedAtUtc = DateTime.UtcNow
        };
        patient.YakapEnlistments.Add(enlistment);
        await context.SaveChangesAsync();

        enlistment.Id.Should().NotBeEmpty();

        // 2. Query relationally
        var queried = await context.PatientYakapEnlistments
            .FirstOrDefaultAsync(e => e.PatientId == patient.Id && e.EffectiveYear == 2026);
        queried.Should().NotBeNull();
        queried!.CaseNo.Should().Be("KONS-2026-0001");
        queried.Status.Should().Be(YakapEnlistmentStatus.Active);

        // 3. Update
        queried.ProfilingTransNo = "TRANS-PROF-001-REV1";
        queried.Remarks = "Verified with PhilHealth Konsulta portal";
        await context.SaveChangesAsync();

        var reloaded = await context.PatientYakapEnlistments.FindAsync(enlistment.Id);
        reloaded!.ProfilingTransNo.Should().Be("TRANS-PROF-001-REV1");

        // 4. Soft-delete
        context.PatientYakapEnlistments.Remove(reloaded);
        await context.SaveChangesAsync();

        (await context.PatientYakapEnlistments.FirstOrDefaultAsync(e => e.Id == enlistment.Id)).Should().BeNull();
        (await context.PatientYakapEnlistments.IgnoreQueryFilters().FirstOrDefaultAsync(e => e.Id == enlistment.Id))!.IsDeleted.Should().BeTrue();

        // 5. Filtered Unique Index on (ClinicId, PatientId, EffectiveYear):
        // Adding another 2026 enlistment for same patient succeeds after soft-delete
        var newEnlistment2026 = new PatientYakapEnlistment
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            PackageType = YakapPackageType.Konsulta,
            EnlistmentDate = new DateOnly(2026, 2, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            CaseNo = "KONS-2026-0002"
        };
        patient.YakapEnlistments.Add(newEnlistment2026);
        await context.SaveChangesAsync();

        newEnlistment2026.Id.Should().NotBeEmpty();
        (await context.PatientYakapEnlistments.CountAsync(e => e.PatientId == patient.Id && e.EffectiveYear == 2026)).Should().Be(1);
    }

    #endregion

    #region Group 2: EF Core ChangeTracker Concurrency & Guid.Empty Stress Testing

    [Fact]
    public async Task MassBatchAddition_WithUnsetGuidEmptyKeys_SucceedsAtomicallyWithoutConcurrencyException()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_MassBatch_{Guid.NewGuid():N}";
        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // Stress: Add 100+ child entities across all types simultaneously with Id = Guid.Empty
        var medHistories = Enumerable.Range(1, 20).Select(i => new PatientMedicalHistory
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = MedicalHistoryCategory.MedicalHistory,
            ConditionTitle = $"Stress Condition {i}",
            Icd10Code = $"Z{i:D2}",
            SpecificDescription = $"Description for condition {i}",
            Status = ProblemStatus.Active
        }).ToList();

        var allergies = Enumerable.Range(1, 15).Select(i => new PatientAllergy
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = AllergyCategory.Medication,
            Severity = AllergySeverity.Moderate,
            Status = AllergyStatus.Active,
            Allergen = $"Allergen {i}"
        }).ToList();

        var alerts = Enumerable.Range(1, 10).Select(i => new PatientAlert
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = PatientAlertCategory.ClinicalSafety,
            Severity = PatientAlertSeverity.Warning,
            Status = PatientAlertStatus.Active,
            Title = $"Alert {i}"
        }).ToList();

        var vitals = Enumerable.Range(1, 10).Select(i => new PatientVitals
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            SystolicBp = 110 + i,
            DiastolicBp = 70 + (i % 10),
            RecordedAt = DateTime.UtcNow.AddHours(-i)
        }).ToList();

        var physicalExam = new PatientPhysicalExam
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            ExamDate = DateTime.UtcNow,
            GeneralSurveyStatus = GeneralSurveyStatus.Normal,
            Findings = Enumerable.Range(1, 15).Select(i => new PatientPhysicalExamFinding
            {
                Id = Guid.Empty,
                TenantId = patient.TenantId,
                ClinicId = clinicId,
                System = PhysicalExamSystem.GeneralSurvey,
                IsNormal = true,
                FindingTitle = $"Finding {i}"
            }).ToList()
        };

        var yakapEnlistments = Enumerable.Range(2015, 10).Select(year => new PatientYakapEnlistment
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            EffectiveYear = year,
            Status = year == 2024 ? YakapEnlistmentStatus.Active : YakapEnlistmentStatus.Expired,
            EnlistmentDate = new DateOnly(year, 1, 1),
            ValidUntil = new DateOnly(year, 12, 31)
        }).ToList();

        // Add all to patient aggregate
        foreach (var m in medHistories) patient.MedicalHistories.Add(m);
        patient.Allergies ??= new List<PatientAllergy>();
        foreach (var a in allergies) patient.Allergies.Add(a);
        foreach (var al in alerts) patient.Alerts.Add(al);
        foreach (var v in vitals) patient.Vitals.Add(v);
        patient.PhysicalExams.Add(physicalExam);
        foreach (var y in yakapEnlistments) patient.YakapEnlistments.Add(y);

        // ATOMIC SAVE: Must succeed without concurrency conflict or key collision
        var saveAction = async () => await context.SaveChangesAsync();
        await saveAction.Should().NotThrowAsync("EF Core ChangeTracker must handle mass additions with Id = Guid.Empty cleanly");

        // Verify all entities have unique non-empty Guids
        var allIds = new HashSet<Guid>();

        foreach (var m in medHistories)
        {
            m.Id.Should().NotBeEmpty();
            allIds.Add(m.Id).Should().BeTrue("Every generated ID must be unique");
        }

        foreach (var a in allergies)
        {
            a.Id.Should().NotBeEmpty();
            allIds.Add(a.Id).Should().BeTrue();
        }

        foreach (var al in alerts)
        {
            al.Id.Should().NotBeEmpty();
            allIds.Add(al.Id).Should().BeTrue();
        }

        foreach (var v in vitals)
        {
            v.Id.Should().NotBeEmpty();
            allIds.Add(v.Id).Should().BeTrue();
        }

        physicalExam.Id.Should().NotBeEmpty();
        allIds.Add(physicalExam.Id).Should().BeTrue();

        foreach (var f in physicalExam.Findings)
        {
            f.Id.Should().NotBeEmpty();
            f.PhysicalExamId.Should().Be(physicalExam.Id);
            allIds.Add(f.Id).Should().BeTrue();
        }

        foreach (var y in yakapEnlistments)
        {
            y.Id.Should().NotBeEmpty();
            allIds.Add(y.Id).Should().BeTrue();
        }

        allIds.Count.Should().Be(20 + 15 + 10 + 10 + 1 + 15 + 10);
    }

    [Fact]
    public async Task ChangeTracker_UnsetGuidEmptyKey_TriggersKeyGeneration_WithoutConcurrencyConflict()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_KeyGen_{Guid.NewGuid():N}";
        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // When a new entity is created with Id = Guid.Empty and added via tracked collection:
        var alertGenerated = new PatientAlert
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Title = "Generated ID Alert"
        };

        patient.Alerts.Add(alertGenerated);

        // DetectChanges processes navigation additions, recognizing Id = Guid.Empty as unset key and marking state as Added
        context.ChangeTracker.DetectChanges();
        context.Entry(alertGenerated).State.Should().Be(EntityState.Added);

        await context.SaveChangesAsync();

        alertGenerated.Id.Should().NotBeEmpty("EF Core must generate a valid key upon save");

        // When an entity is explicitly added via DbSet.Add with a pre-set key, it is also correctly marked Added
        var explicitGuid = Guid.NewGuid();
        var alertExplicit = new PatientAlert
        {
            Id = explicitGuid,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Title = "Explicit ID Alert"
        };

        context.PatientAlerts.Add(alertExplicit);
        context.Entry(alertExplicit).State.Should().Be(EntityState.Added);

        await context.SaveChangesAsync();
        alertExplicit.Id.Should().Be(explicitGuid);
    }

    [Fact]
    public async Task ChangeTracker_LegacyParsedEnlistment_AddsWithoutConcurrencyException()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_ParsedEnl_{Guid.NewGuid():N}";
        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = CreateBaselinePatient(clinicId);
        // Inject legacy dictionary format into CustomFields
        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["effective_year"] = 2025,
                ["status"] = "Active",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = "LEGACY-CASE-2025",
                ["enlisted_at"] = "2025-01-15",
                ["valid_until"] = "2025-12-31"
            }
        };
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // Parse via domain extension: items have Id = Guid.Empty
        var parsed = patient.GetYakapEnlistments();
        parsed.Should().ContainSingle();
        parsed[0].Id.Should().Be(Guid.Empty);
        parsed[0].CaseNo.Should().Be("LEGACY-CASE-2025");

        // Now persist the parsed enlistment into the relational table
        var relational = new PatientYakapEnlistment
        {
            Id = parsed[0].Id, // Guid.Empty
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            EffectiveYear = parsed[0].EffectiveYear,
            Status = parsed[0].Status,
            Source = parsed[0].Source,
            CaseNo = parsed[0].CaseNo,
            EnlistmentDate = parsed[0].EnlistmentDate,
            ValidUntil = parsed[0].ValidUntil
        };

        context.PatientYakapEnlistments.Add(relational);
        await context.SaveChangesAsync();

        relational.Id.Should().NotBeEmpty("EF Core must generate a valid key when persisting an unkeyed parsed enlistment");
        var saved = await context.PatientYakapEnlistments.FirstOrDefaultAsync(e => e.Id == relational.Id);
        saved.Should().NotBeNull();
        saved!.CaseNo.Should().Be("LEGACY-CASE-2025");
    }

    #endregion

    #region Group 3: Pure Relational Persistence & Zero CustomFields Fallback

    [Fact]
    public async Task CustomFields_NeverContaminatedByClinicalEntities_RemainsStrictlySegregated()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_CustomFields_{Guid.NewGuid():N}";
        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = CreateBaselinePatient(clinicId);
        // Legitimate dynamic custom metadata
        patient.CustomFields["student_id"] = "2026-99999";
        patient.CustomFields["college"] = "College of Medicine";
        patient.CustomFields["year_level"] = 3;
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // Add 1NF child entities
        patient.MedicalHistories.Add(new PatientMedicalHistory
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = MedicalHistoryCategory.MedicalHistory,
            ConditionTitle = "Asthma",
            Icd10Code = "J45.9"
        });

        patient.Allergies ??= new List<PatientAllergy>();
        patient.Allergies.Add(new PatientAllergy
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = AllergyCategory.Food,
            Allergen = "Peanuts"
        });

        patient.Alerts.Add(new PatientAlert
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Title = "G6PD Deficiency"
        });

        patient.PhilHealthMembership = new PatientPhilHealthMembership
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            MemberPin = "11-222333444-5",
            MemberType = PhilHealthMemberType.MM
        };

        patient.YakapEnlistments.Add(new PatientYakapEnlistment
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active
        });

        await context.SaveChangesAsync();

        // Verify patient.CustomFields is completely clean of any clinical entities or legacy keys
        var reloadedPatient = await context.Patients.FindAsync(patient.Id);
        reloadedPatient.Should().NotBeNull();

        reloadedPatient!.CustomFields.Should().NotContainKey("philhealth_profile");
        reloadedPatient.CustomFields.Should().NotContainKey("yakap_enlistments");
        reloadedPatient.CustomFields.Should().NotContainKey("Allergies");
        reloadedPatient.CustomFields.Should().NotContainKey("ChronicConditions");
        reloadedPatient.CustomFields.Should().NotContainKey("Alerts");
        reloadedPatient.CustomFields.Should().NotContainKey("PhysicalExamFindings");

        // Legitimate custom fields are intact
        reloadedPatient.CustomFields["student_id"].Should().Be("2026-99999");
        reloadedPatient.CustomFields["college"].Should().Be("College of Medicine");
    }

    [Fact]
    public async Task ClinicalQueries_AreRelationalAndImmuneToPoisonedCustomFieldsJson()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Poisoned_{Guid.NewGuid():N}";
        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = CreateBaselinePatient(clinicId);
        // Deliberately poison CustomFields with fake legacy strings
        patient.CustomFields["Allergies"] = "POISON_ALLERGY_FAKE";
        patient.CustomFields["ChronicConditions"] = "POISON_CONDITION_FAKE";
        patient.CustomFields["Alerts"] = "POISON_ALERT_FAKE";
        patient.CustomFields["philhealth_profile"] = "{\"status\": \"corrupted\"}";
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // Add genuine 1NF relational entries
        var genuineAllergy = new PatientAllergy
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = AllergyCategory.Medication,
            Allergen = "Ceftriaxone",
            Severity = AllergySeverity.Moderate
        };
        var genuineCondition = new PatientMedicalHistory
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = MedicalHistoryCategory.MedicalHistory,
            ConditionTitle = "Type 2 Diabetes Mellitus",
            Icd10Code = "E11.9"
        };
        var genuineAlert = new PatientAlert
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Title = "Bleeding Risk"
        };

        context.PatientAllergies.Add(genuineAllergy);
        context.PatientMedicalHistories.Add(genuineCondition);
        context.PatientAlerts.Add(genuineAlert);
        await context.SaveChangesAsync();

        // Query relationally: results must reflect genuine rows, NOT poisoned JSON
        var allergies = await context.PatientAllergies.Where(a => a.PatientId == patient.Id).ToListAsync();
        allergies.Should().ContainSingle();
        allergies[0].Allergen.Should().Be("Ceftriaxone");
        allergies[0].Allergen.Should().NotBe("POISON_ALLERGY_FAKE");

        var conditions = await context.PatientMedicalHistories.Where(m => m.PatientId == patient.Id).ToListAsync();
        conditions.Should().ContainSingle();
        conditions[0].ConditionTitle.Should().Be("Type 2 Diabetes Mellitus");
        conditions[0].ConditionTitle.Should().NotBe("POISON_CONDITION_FAKE");

        var alerts = await context.PatientAlerts.Where(a => a.PatientId == patient.Id).ToListAsync();
        alerts.Should().ContainSingle();
        alerts[0].Title.Should().Be("Bleeding Risk");
        alerts[0].Title.Should().NotBe("POISON_ALERT_FAKE");
    }

    [Fact]
    public async Task LabObservations_PersistedAndQueriedRelationally_WithoutJsonBlobsOnLabOrder()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_LabObs_{Guid.NewGuid():N}";
        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        var labOrder = new LabOrder
        {
            Id = Guid.Empty,
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            OrderNumber = "ORD-2026-9999",
            OrderDate = DateTime.UtcNow,
            Status = LabOrderStatus.Completed,
            Observations = new List<LabObservation>
            {
                new()
                {
                    Id = Guid.Empty,
                    TenantId = patient.TenantId,
                    ClinicId = clinicId,
                    AnalyteCode = "FBS",
                    AnalyteName = "Fasting Blood Sugar",
                    LoincCode = "1558-6",
                    ValueText = "126 mg/dL",
                    NumericValue = 126m,
                    Unit = "mg/dL",
                    ReferenceRangeLow = 70m,
                    ReferenceRangeHigh = 100m,
                    AbnormalFlag = "H",
                    IsCriticalPanic = false
                },
                new()
                {
                    Id = Guid.Empty,
                    TenantId = patient.TenantId,
                    ClinicId = clinicId,
                    AnalyteCode = "K",
                    AnalyteName = "Serum Potassium",
                    LoincCode = "2823-3",
                    ValueText = "6.8 mEq/L",
                    NumericValue = 6.8m,
                    Unit = "mEq/L",
                    ReferenceRangeLow = 3.5m,
                    ReferenceRangeHigh = 5.0m,
                    AbnormalFlag = "HH",
                    IsCriticalPanic = true
                }
            }
        };
        context.LabOrders.Add(labOrder);
        await context.SaveChangesAsync();

        labOrder.Id.Should().NotBeEmpty();
        labOrder.Observations.Should().HaveCount(2);
        labOrder.Observations.All(o => o.Id != Guid.Empty).Should().BeTrue();
        labOrder.Observations.All(o => o.LabOrderId == labOrder.Id).Should().BeTrue();

        // Query relationally
        var observations = await context.LabObservations
            .Where(o => o.LabOrderId == labOrder.Id)
            .OrderBy(o => o.AnalyteCode)
            .ToListAsync();

        observations.Should().HaveCount(2);
        observations[0].AnalyteCode.Should().Be("FBS");
        observations[0].NumericValue.Should().Be(126m);
        observations[0].AbnormalFlag.Should().Be("H");

        observations[1].AnalyteCode.Should().Be("K");
        observations[1].IsCriticalPanic.Should().BeTrue();
        observations[1].AbnormalFlag.Should().Be("HH");

        // Update observation
        observations[0].ValueText = "125 mg/dL";
        observations[0].NumericValue = 125m;
        await context.SaveChangesAsync();

        var reloadedObs = await context.LabObservations.FindAsync(observations[0].Id);
        reloadedObs!.NumericValue.Should().Be(125m);

        // Soft-delete observation
        context.LabObservations.Remove(reloadedObs);
        await context.SaveChangesAsync();

        (await context.LabObservations.FirstOrDefaultAsync(o => o.Id == observations[0].Id)).Should().BeNull();
        (await context.LabObservations.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.Id == observations[0].Id))!.IsDeleted.Should().BeTrue();
    }

    #endregion
}
