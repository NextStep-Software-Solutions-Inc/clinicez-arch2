using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.CustomFields.Validation;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Challenger Stress-Test Suite for Milestone M1 (Pure 1NF Domain & Persistence Logic):
/// 1. 1NF Clinical Lifecycle: Create, Update, Resolve, and Soft-Delete across:
///    - PatientAlert
///    - PatientAllergy
///    - Unified PatientMedicalHistory
///    - PatientPhysicalExam + PatientPhysicalExamFinding
///    - PatientVitals (with QueueItemId == null)
///    - LabObservation
/// 2. Cloud Account Linking Encapsulation: patient.LinkCloudAccount(Guid, string?)
/// 3. PhilHealth PIN Validation: Rejection of all-zero PIN "000000000000" and variations
/// 4. CustomFieldValueValidator: Asia/Manila timezone evaluation and date/numeric boundary conditions
/// </summary>
public sealed class ChallengerM1Pure1NfStressTests
{
    private static ApplicationDbContext CreateTestDbContext(
        Guid clinicId,
        string tenantId = "tenant_challenger_m1",
        string? userId = "challenger_staff",
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
            .UseInMemoryDatabase(databaseName: dbName ?? $"ClinicEz_M1Challenger_{Guid.NewGuid()}")
            .AddInterceptors(interceptor)
            .Options;

        return new ApplicationDbContext(options, config, clinicContext);
    }

    private static Patient CreateBaselinePatient(Guid clinicId, string tenantId = "tenant_challenger_m1")
    {
        return new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = $"PAT-{Guid.NewGuid():N}"[..14],
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1985, 6, 15),
            Sex = BiologicalSex.Male,
            ContactNumber = "09171234567"
        };
    }

    #region 1. 1NF Clinical Lifecycle Stress Tests

    [Fact]
    public async Task PatientAlert_Lifecycle_CreateUpdateResolveAndSoftDelete_MaintainsIntegrity()
    {
        var clinicId = Guid.NewGuid();
        using var context = CreateTestDbContext(clinicId);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // 1. Create Alert
        var alert = new PatientAlert
        {
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = PatientAlertCategory.ClinicalSafety,
            Title = "Severe Fall Risk",
            Severity = PatientAlertSeverity.Critical,
            Status = PatientAlertStatus.Active,
            ExpiresAt = DateTime.UtcNow.AddDays(7),
            Notes = "Requires wheelchair escort at all times"
        };
        context.PatientAlerts.Add(alert);
        await context.SaveChangesAsync();

        alert.Id.Should().NotBeEmpty();
        alert.IsActive.Should().BeTrue();

        // 2. Update Alert
        alert.Notes = "Updated: Escort assigned";
        alert.Severity = PatientAlertSeverity.Warning;
        await context.SaveChangesAsync();

        var loadedAlert = await context.PatientAlerts.FindAsync(alert.Id);
        loadedAlert.Should().NotBeNull();
        loadedAlert!.Notes.Should().Be("Updated: Escort assigned");
        loadedAlert.Severity.Should().Be(PatientAlertSeverity.Warning);

        // 3. Resolve Alert
        alert.Status = PatientAlertStatus.Resolved;
        await context.SaveChangesAsync();
        alert.IsActive.Should().BeFalse();

        // 4. Soft-Delete Alert
        context.PatientAlerts.Remove(alert);
        await context.SaveChangesAsync();

        // Regular query must NOT find soft-deleted alert
        var queryResult = await context.PatientAlerts.FirstOrDefaultAsync(a => a.Id == alert.Id);
        queryResult.Should().BeNull("SoftDeleteSaveChangesInterceptor must filter soft-deleted alert from standard queries");

        // IgnoreQueryFilters must find alert with IsDeleted == true
        var rawResult = await context.PatientAlerts.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == alert.Id);
        rawResult.Should().NotBeNull();
        rawResult!.IsDeleted.Should().BeTrue();
        rawResult.DeletedAt.Should().NotBeNull();
        rawResult.DeletedBy.Should().Be("challenger_staff");
    }

    [Fact]
    public async Task PatientAllergy_Lifecycle_CreateUpdateResolveAndSoftDelete_MaintainsIntegrity()
    {
        var clinicId = Guid.NewGuid();
        using var context = CreateTestDbContext(clinicId);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // 1. Create Allergy
        var allergy = new PatientAllergy
        {
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = AllergyCategory.Medication,
            Allergen = "Amoxicillin",
            AllergenDrugCode = "AMOX500",
            Severity = AllergySeverity.LifeThreatening,
            IsAnaphylactic = true,
            ReactionManifestation = "Facial edema and bronchospasm",
            Status = AllergyStatus.Active,
            OnsetDate = new DateOnly(2021, 3, 10)
        };
        context.PatientAllergies.Add(allergy);
        await context.SaveChangesAsync();

        allergy.Id.Should().NotBeEmpty();

        // 2. Update Allergy
        allergy.ReactionManifestation = "Confirmed severe anaphylaxis via allergist report";
        await context.SaveChangesAsync();

        var loaded = await context.PatientAllergies.FindAsync(allergy.Id);
        loaded!.ReactionManifestation.Should().Be("Confirmed severe anaphylaxis via allergist report");

        // 3. Resolve / Inactivate Allergy
        allergy.Status = AllergyStatus.Refuted;
        await context.SaveChangesAsync();
        loaded.Status.Should().Be(AllergyStatus.Refuted);

        // 4. Soft-Delete Allergy
        context.PatientAllergies.Remove(allergy);
        await context.SaveChangesAsync();

        (await context.PatientAllergies.AnyAsync(a => a.Id == allergy.Id)).Should().BeFalse();
        var raw = await context.PatientAllergies.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == allergy.Id);
        raw.Should().NotBeNull();
        raw!.IsDeleted.Should().BeTrue();
    }

    [Fact]
    public async Task UnifiedPatientMedicalHistory_Lifecycle_CreateUpdateResolveAndSoftDelete_WorksForBothCategories()
    {
        var clinicId = Guid.NewGuid();
        using var context = CreateTestDbContext(clinicId);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // 1. Create Medical History (ProblemListItem)
        var problem = new PatientMedicalHistory
        {
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = MedicalHistoryCategory.ProblemListItem,
            VerificationStatus = ConditionVerificationStatus.Confirmed,
            ConditionTitle = "Essential Hypertension",
            Icd10Code = "I10",
            PhilHealthMdiseaseCode = "011",
            Status = ProblemStatus.Active,
            Severity = ProblemSeverity.Moderate,
            IsChronicNcd = true,
            OnsetDate = new DateOnly(2018, 5, 20),
            ClinicalNotes = "Primary hypertension, controlled"
        };

        // 2. Create Medical History (MedicalHistory category)
        var pastHistory = new PatientMedicalHistory
        {
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            Category = MedicalHistoryCategory.MedicalHistory,
            ConditionTitle = "Pulmonary Tuberculosis",
            Icd10Code = "A15.0",
            Status = ProblemStatus.Resolved,
            ResolvedDate = new DateOnly(2015, 11, 1),
            ClinicalNotes = "Completed 6-month HRZE treatment course"
        };

        context.PatientMedicalHistories.AddRange(problem, pastHistory);
        await context.SaveChangesAsync();

        // 3. Update problem to Resolved
        problem.Status = ProblemStatus.Resolved;
        problem.ResolvedDate = new DateOnly(2026, 10, 28);
        await context.SaveChangesAsync();

        var loadedProblem = await context.PatientMedicalHistories.FindAsync(problem.Id);
        loadedProblem!.Status.Should().Be(ProblemStatus.Resolved);
        loadedProblem.ResolvedDate.Should().Be(new DateOnly(2026, 10, 28));

        // 4. Soft-delete problem
        context.PatientMedicalHistories.Remove(problem);
        await context.SaveChangesAsync();

        (await context.PatientMedicalHistories.AnyAsync(h => h.Id == problem.Id)).Should().BeFalse();
        (await context.PatientMedicalHistories.AnyAsync(h => h.Id == pastHistory.Id)).Should().BeTrue();

        var rawProblem = await context.PatientMedicalHistories.IgnoreQueryFilters().FirstOrDefaultAsync(h => h.Id == problem.Id);
        rawProblem.Should().NotBeNull();
        rawProblem!.IsDeleted.Should().BeTrue();
    }

    [Fact]
    public async Task PatientPhysicalExam_WithFindings_Lifecycle_SupportsChildEntityManagementAndSoftDelete()
    {
        var clinicId = Guid.NewGuid();
        using var context = CreateTestDbContext(clinicId);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // 1. Create Physical Exam with child Findings
        var exam = new PatientPhysicalExam
        {
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            ExamDate = DateTime.UtcNow,
            GeneralSurveyStatus = GeneralSurveyStatus.Abnormal,
            GeneralSurveyRemarks = "Appears lethargic",
            HeartRemarks = "Systolic ejection murmur heard at apex",
            AbdomenRemarks = "Soft, non-tender, no organomegaly"
        };

        var finding1 = new PatientPhysicalExamFinding
        {
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            System = PhysicalExamSystem.Heart,
            IsNormal = false,
            FindingTitle = "Heart Murmur",
            PhilHealthFindingCode = "HEART_MURMUR",
            Remarks = "Grade II/VI systolic murmur"
        };

        var finding2 = new PatientPhysicalExamFinding
        {
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            System = PhysicalExamSystem.Abdomen,
            IsNormal = true,
            FindingTitle = "Essentially Normal Abdomen"
        };

        exam.Findings.Add(finding1);
        exam.Findings.Add(finding2);

        context.PatientPhysicalExams.Add(exam);
        await context.SaveChangesAsync();

        exam.Id.Should().NotBeEmpty();
        finding1.Id.Should().NotBeEmpty();
        finding2.Id.Should().NotBeEmpty();

        // Verify navigation and child counts
        var loadedExam = await context.PatientPhysicalExams
            .Include(e => e.Findings)
            .FirstOrDefaultAsync(e => e.Id == exam.Id);

        loadedExam.Should().NotBeNull();
        loadedExam!.Findings.Should().HaveCount(2);

        // 2. Soft-delete an individual finding
        context.PatientPhysicalExamFindings.Remove(finding2);
        await context.SaveChangesAsync();

        (await context.PatientPhysicalExamFindings.AnyAsync(f => f.Id == finding2.Id)).Should().BeFalse();
        var rawFinding2 = await context.PatientPhysicalExamFindings.IgnoreQueryFilters().FirstOrDefaultAsync(f => f.Id == finding2.Id);
        rawFinding2!.IsDeleted.Should().BeTrue();

        // 3. Soft-delete the parent exam
        context.PatientPhysicalExams.Remove(exam);
        await context.SaveChangesAsync();

        (await context.PatientPhysicalExams.AnyAsync(e => e.Id == exam.Id)).Should().BeFalse();
        var rawExam = await context.PatientPhysicalExams.IgnoreQueryFilters().FirstOrDefaultAsync(e => e.Id == exam.Id);
        rawExam!.IsDeleted.Should().BeTrue();
    }

    [Fact]
    public async Task PatientVitals_StandaloneWithoutQueueItem_CanBeCreatedUpdatedAndSoftDeleted()
    {
        var clinicId = Guid.NewGuid();
        using var context = CreateTestDbContext(clinicId);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // Standalone vitals (e.g. FPE profiling or walk-in check with QueueItemId == null)
        var vitals = new PatientVitals
        {
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            QueueItemId = null,
            ConsultationEncounterId = null,
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 72,
            TemperatureCelsius = 36.6m,
            RespiratoryRateBreathsPerMin = 16,
            OxygenSaturationPercent = 99m,
            HeightCm = 170m,
            WeightKg = 68m,
            Bmi = 23.5m,
            BloodGlucoseRandomMgDl = 95.0m
        };

        context.PatientVitals.Add(vitals);
        await context.SaveChangesAsync();

        vitals.Id.Should().NotBeEmpty();
        vitals.QueueItemId.Should().BeNull();
        vitals.BloodGlucoseRandomMgDl.Should().Be(95.0m);

        // Update vitals
        vitals.BloodGlucoseRandomMgDl = 102.5m;
        await context.SaveChangesAsync();

        var loaded = await context.PatientVitals.FindAsync(vitals.Id);
        loaded!.BloodGlucoseRandomMgDl.Should().Be(102.5m);

        // Soft-delete vitals
        context.PatientVitals.Remove(vitals);
        await context.SaveChangesAsync();

        (await context.PatientVitals.AnyAsync(v => v.Id == vitals.Id)).Should().BeFalse();
        var rawVitals = await context.PatientVitals.IgnoreQueryFilters().FirstOrDefaultAsync(v => v.Id == vitals.Id);
        rawVitals!.IsDeleted.Should().BeTrue();
    }

    [Fact]
    public async Task LabObservation_Lifecycle_LinkedToLabOrder_CanBeCreatedUpdatedAndSoftDeleted()
    {
        var clinicId = Guid.NewGuid();
        using var context = CreateTestDbContext(clinicId);

        var patient = CreateBaselinePatient(clinicId);
        context.Patients.Add(patient);

        var labOrder = new LabOrder
        {
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            OrderNumber = "LAB-2026-0001",
            OrderDate = DateTime.UtcNow,
            Status = LabOrderStatus.Ordered
        };
        context.LabOrders.Add(labOrder);
        await context.SaveChangesAsync();

        var observation = new LabObservation
        {
            TenantId = patient.TenantId,
            ClinicId = clinicId,
            LabOrderId = labOrder.Id,
            AnalyteCode = "FBS",
            AnalyteName = "Fasting Blood Sugar",
            ValueText = "145",
            NumericValue = 145m,
            Unit = "mg/dL",
            ReferenceRangeLow = 70m,
            ReferenceRangeHigh = 100m,
            AbnormalFlag = "HIGH",
            IsCriticalPanic = false
        };
        context.LabObservations.Add(observation);
        await context.SaveChangesAsync();

        observation.Id.Should().NotBeEmpty();

        // Update observation to Critical Panic
        observation.IsCriticalPanic = true;
        observation.ValueText = "350";
        observation.NumericValue = 350m;
        await context.SaveChangesAsync();

        var loadedObs = await context.LabObservations.FindAsync(observation.Id);
        loadedObs!.IsCriticalPanic.Should().BeTrue();
        loadedObs.NumericValue.Should().Be(350m);

        // Soft-delete observation
        context.LabObservations.Remove(observation);
        await context.SaveChangesAsync();

        (await context.LabObservations.AnyAsync(o => o.Id == observation.Id)).Should().BeFalse();
        var rawObs = await context.LabObservations.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.Id == observation.Id);
        rawObs!.IsDeleted.Should().BeTrue();
    }

    [Fact]
    public async Task MultiTenantIsolation_EnforcesStrictJurisdictionAcross1NfEntities()
    {
        var clinic1Id = Guid.NewGuid();
        var clinic2Id = Guid.NewGuid();
        var sharedDbName = $"ClinicEz_MultiTenant_1NF_{Guid.NewGuid()}";

        using var context1 = CreateTestDbContext(clinic1Id, "tenant_a", "staff_1", sharedDbName);
        using var context2 = CreateTestDbContext(clinic2Id, "tenant_b", "staff_2", sharedDbName);

        var p1 = CreateBaselinePatient(clinic1Id, "tenant_a");
        context1.Patients.Add(p1);

        var alert1 = new PatientAlert
        {
            TenantId = "tenant_a",
            ClinicId = clinic1Id,
            PatientId = p1.Id,
            Title = "Clinic 1 Alert",
            Status = PatientAlertStatus.Active
        };
        context1.PatientAlerts.Add(alert1);

        var allergy1 = new PatientAllergy
        {
            TenantId = "tenant_a",
            ClinicId = clinic1Id,
            PatientId = p1.Id,
            Allergen = "Clinic 1 Allergen",
            Category = AllergyCategory.Food,
            Status = AllergyStatus.Active
        };
        context1.PatientAllergies.Add(allergy1);

        await context1.SaveChangesAsync();

        // Context 2 (Clinic 2) must not see Clinic 1's records
        (await context2.Patients.AnyAsync(p => p.Id == p1.Id)).Should().BeFalse();
        (await context2.PatientAlerts.AnyAsync(a => a.Id == alert1.Id)).Should().BeFalse();
        (await context2.PatientAllergies.AnyAsync(a => a.Id == allergy1.Id)).Should().BeFalse();
    }

    #endregion

    #region 2. LinkCloudAccount Encapsulation Tests

    [Fact]
    public void LinkCloudAccount_ValidGuidAndClinicEzId_SetsBothPropertiesCorrectly()
    {
        var patient = new Patient
        {
            PatientCode = "PAT-001",
            FirstName = "Test",
            LastName = "Patient",
            ContactNumber = "09123456789",
            DateOfBirth = new DateOnly(1990, 1, 1)
        };

        var cloudId = Guid.NewGuid();
        patient.LinkCloudAccount(cloudId, "CEZ-100293");

        patient.CloudPatientId.Should().Be(cloudId);
        patient.ClinicEzId.Should().Be("CEZ-100293");
    }

    [Fact]
    public void LinkCloudAccount_NullOrWhitespaceClinicEzId_PreservesExistingClinicEzId()
    {
        var patient = new Patient
        {
            PatientCode = "PAT-002",
            FirstName = "Test",
            LastName = "Patient",
            ContactNumber = "09123456789",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ClinicEzId = "CEZ-EXISTING"
        };

        var newCloudId = Guid.NewGuid();
        patient.LinkCloudAccount(newCloudId, null);
        patient.CloudPatientId.Should().Be(newCloudId);
        patient.ClinicEzId.Should().Be("CEZ-EXISTING", "Null clinicEzId must not overwrite existing ClinicEzId");

        patient.LinkCloudAccount(newCloudId, "   ");
        patient.ClinicEzId.Should().Be("CEZ-EXISTING", "Whitespace clinicEzId must not overwrite existing ClinicEzId");
    }

    [Fact]
    public void LinkCloudAccount_InitialNullClinicEzId_RemainsNullWhenPassedNull()
    {
        var patient = new Patient
        {
            PatientCode = "PAT-003",
            FirstName = "Test",
            LastName = "Patient",
            ContactNumber = "09123456789",
            DateOfBirth = new DateOnly(1990, 1, 1)
        };

        var cloudId = Guid.NewGuid();
        patient.LinkCloudAccount(cloudId, null);
        patient.CloudPatientId.Should().Be(cloudId);
        patient.ClinicEzId.Should().BeNull();
    }

    #endregion

    #region 3. PhilHealth PIN Validation & All-Zero Rejection Tests

    [Theory]
    [InlineData("000000000000")]
    [InlineData("00-000000000-0")]
    [InlineData(" 000000000000 ")]
    [InlineData("000-00000000-0")]
    [InlineData("0")]
    [InlineData("00000")]
    public void PhilHealthPinNormalizer_AllZeroOrEmptyInputs_ReturnsNull(string invalidPin)
    {
        PhilHealthPinNormalizer.Normalize(invalidPin).Should().BeNull($"All-zero or malformed PIN '{invalidPin}' must normalize to null");
        PhilHealthPinNormalizer.IsValidPin(invalidPin).Should().BeFalse($"All-zero or malformed PIN '{invalidPin}' must be invalid");
    }

    [Theory]
    [InlineData("12-345678901-8", "123456789018")]
    [InlineData("123456789018", "123456789018")]
    [InlineData(" 12-345678901-8 ", "123456789018")]
    public void PhilHealthPinNormalizer_ValidNonZeroPins_NormalizeCorrectly(string rawPin, string expected)
    {
        PhilHealthPinNormalizer.Normalize(rawPin).Should().Be(expected);
        PhilHealthPinNormalizer.IsValidPin(rawPin).Should().BeTrue();
    }

    [Theory]
    [InlineData("000000000000")]
    [InlineData("00-000000000-0")]
    [InlineData(" 000000000000 ")]
    public void RegisterClinicPatientCommandValidator_AllZeroPin_IsRejected(string pin)
    {
        var validator = new RegisterClinicPatientCommandValidator();
        var command = new RegisterClinicPatientCommand(
            FirstName: "Juan",
            LastName: "Dela Cruz",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1990, 1, 1),
            Sex: "Male",
            CivilStatus: null,
            ContactNumber: "09171234567",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: pin,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null
        );

        var result = validator.Validate(command);
        result.IsValid.Should().BeFalse($"PIN '{pin}' must fail validation");
        result.Errors.Should().Contain(e => e.PropertyName == nameof(RegisterClinicPatientCommand.PhilHealthNumber));
    }

    [Theory]
    [InlineData("000000000000")]
    [InlineData("00-000000000-0")]
    [InlineData(" 000000000000 ")]
    public void UpdateClinicPatientCommandValidator_AllZeroPin_IsRejected(string pin)
    {
        var validator = new UpdateClinicPatientCommandValidator();
        var command = new UpdateClinicPatientCommand(
            Id: Guid.NewGuid(),
            FirstName: "Juan",
            LastName: "Dela Cruz",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1990, 1, 1),
            Sex: "Male",
            CivilStatus: null,
            ContactNumber: "09171234567",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: pin
        );

        var result = validator.Validate(command);
        result.IsValid.Should().BeFalse($"PIN '{pin}' must fail validation in update command");
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateClinicPatientCommand.PhilHealthNumber));
    }

    [Fact]
    public void RegisterClinicPatientCommandValidator_Mod11Check_RejectsAllZerosDirectly()
    {
        RegisterClinicPatientCommandValidator.BeValidPhilHealthMod11("000000000000").Should().BeFalse();
        RegisterClinicPatientCommandValidator.BeValidPhilHealthMod11("00-000000000-0").Should().BeFalse();
        RegisterClinicPatientCommandValidator.BeValidPhilHealthMod11("000000000001").Should().BeFalse();
    }

    #endregion

    #region 4. CustomFieldValueValidator Timezone & Boundary Conditions Tests

    [Fact]
    public void CustomFieldValueValidator_GetTodayInClinic_ReturnsDateInAsiaManilaTimezone()
    {
        var today = CustomFieldValueValidator.GetTodayInClinic();

        // Calculate expected date in Asia/Manila (UTC+8)
        var utcNow = DateTime.UtcNow;
        DateOnly expected;
        try
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById("Asia/Manila");
            expected = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utcNow, tz));
        }
        catch
        {
            expected = DateOnly.FromDateTime(utcNow.AddHours(8));
        }

        today.Should().Be(expected, "GetTodayInClinic must return today's calendar date in Asia/Manila (UTC+8)");
    }

    [Fact]
    public void CustomFieldValueValidator_PastOrToday_BoundaryEnforcement()
    {
        var today = CustomFieldValueValidator.GetTodayInClinic();
        var yesterday = today.AddDays(-1);
        var tomorrow = today.AddDays(1);

        var def = new CustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            FieldKey = "last_vaccination_date",
            Label = "Last Vaccination Date",
            DataType = CustomFieldDataType.Date,
            BoundaryMode = "PastOrToday",
            IsActive = true,
            EntityType = "Patient"
        };

        // 1. Yesterday -> Valid
        var dictPast = new Dictionary<string, object?> { ["last_vaccination_date"] = yesterday.ToString("yyyy-MM-dd") };
        var actPast = () => CustomFieldValueValidator.ValidateAndNormalize(dictPast, new[] { def });
        actPast.Should().NotThrow();

        // 2. Today -> Valid
        var dictToday = new Dictionary<string, object?> { ["last_vaccination_date"] = today.ToString("yyyy-MM-dd") };
        var actToday = () => CustomFieldValueValidator.ValidateAndNormalize(dictToday, new[] { def });
        actToday.Should().NotThrow();

        // 3. Tomorrow -> Throws ValidationException
        var dictFuture = new Dictionary<string, object?> { ["last_vaccination_date"] = tomorrow.ToString("yyyy-MM-dd") };
        var actFuture = () => CustomFieldValueValidator.ValidateAndNormalize(dictFuture, new[] { def });
        actFuture.Should().Throw<ValidationException>().WithMessage("*cannot be a future date*");
    }

    [Fact]
    public void CustomFieldValueValidator_FutureOrToday_BoundaryEnforcement()
    {
        var today = CustomFieldValueValidator.GetTodayInClinic();
        var yesterday = today.AddDays(-1);
        var tomorrow = today.AddDays(1);

        var def = new CustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            FieldKey = "follow_up_date",
            Label = "Follow-Up Date",
            DataType = CustomFieldDataType.Date,
            BoundaryMode = "FutureOrToday",
            IsActive = true,
            EntityType = "Patient"
        };

        // 1. Today -> Valid
        var dictToday = new Dictionary<string, object?> { ["follow_up_date"] = today.ToString("yyyy-MM-dd") };
        var actToday = () => CustomFieldValueValidator.ValidateAndNormalize(dictToday, new[] { def });
        actToday.Should().NotThrow();

        // 2. Tomorrow -> Valid
        var dictFuture = new Dictionary<string, object?> { ["follow_up_date"] = tomorrow.ToString("yyyy-MM-dd") };
        var actFuture = () => CustomFieldValueValidator.ValidateAndNormalize(dictFuture, new[] { def });
        actFuture.Should().NotThrow();

        // 3. Yesterday -> Throws ValidationException
        var dictPast = new Dictionary<string, object?> { ["follow_up_date"] = yesterday.ToString("yyyy-MM-dd") };
        var actPast = () => CustomFieldValueValidator.ValidateAndNormalize(dictPast, new[] { def });
        actPast.Should().Throw<ValidationException>().WithMessage("*cannot be a past date*");
    }

    [Fact]
    public void CustomFieldValueValidator_FutureOnly_BoundaryEnforcement()
    {
        var today = CustomFieldValueValidator.GetTodayInClinic();
        var yesterday = today.AddDays(-1);
        var tomorrow = today.AddDays(1);

        var def = new CustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            FieldKey = "scheduled_procedure_date",
            Label = "Scheduled Procedure Date",
            DataType = CustomFieldDataType.Date,
            BoundaryMode = "FutureOnly",
            IsActive = true,
            EntityType = "Patient"
        };

        // 1. Today -> Throws ValidationException
        var dictToday = new Dictionary<string, object?> { ["scheduled_procedure_date"] = today.ToString("yyyy-MM-dd") };
        var actToday = () => CustomFieldValueValidator.ValidateAndNormalize(dictToday, new[] { def });
        actToday.Should().Throw<ValidationException>().WithMessage("*must be a future date after*");

        // 2. Yesterday -> Throws ValidationException
        var dictPast = new Dictionary<string, object?> { ["scheduled_procedure_date"] = yesterday.ToString("yyyy-MM-dd") };
        var actPast = () => CustomFieldValueValidator.ValidateAndNormalize(dictPast, new[] { def });
        actPast.Should().Throw<ValidationException>().WithMessage("*must be a future date after*");

        // 3. Tomorrow -> Valid
        var dictFuture = new Dictionary<string, object?> { ["scheduled_procedure_date"] = tomorrow.ToString("yyyy-MM-dd") };
        var actFuture = () => CustomFieldValueValidator.ValidateAndNormalize(dictFuture, new[] { def });
        actFuture.Should().NotThrow();
    }

    [Theory]
    [InlineData("2026/10/28")]
    [InlineData("28-10-2026")]
    [InlineData("invalid-date")]
    [InlineData("2026-02-30")]
    public void CustomFieldValueValidator_MalformedDateFormat_ThrowsValidationException(string malformedDate)
    {
        var def = new CustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            FieldKey = "check_date",
            Label = "Check Date",
            DataType = CustomFieldDataType.Date,
            IsActive = true,
            EntityType = "Patient"
        };

        var dict = new Dictionary<string, object?> { ["check_date"] = malformedDate };
        var act = () => CustomFieldValueValidator.ValidateAndNormalize(dict, new[] { def });
        act.Should().Throw<ValidationException>().WithMessage("*must be a valid date in YYYY-MM-DD format.*");
    }

    [Theory]
    [InlineData("123")]
    [InlineData("-456.78")]
    [InlineData(42)]
    [InlineData(3.14159)]
    [InlineData(-0.5)]
    public void CustomFieldValueValidator_NumberDataType_AcceptsValidNumbers(object validNumber)
    {
        var def = new CustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            FieldKey = "height_custom",
            Label = "Custom Height",
            DataType = CustomFieldDataType.Number,
            IsActive = true,
            EntityType = "Patient"
        };

        var dict = new Dictionary<string, object?> { ["height_custom"] = validNumber };
        var act = () => CustomFieldValueValidator.ValidateAndNormalize(dict, new[] { def });
        act.Should().NotThrow();
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("123a")]
    [InlineData("--12")]
    [InlineData("NaN")]
    public void CustomFieldValueValidator_NumberDataType_RejectsInvalidStrings(string invalidNumber)
    {
        var def = new CustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            FieldKey = "weight_custom",
            Label = "Custom Weight",
            DataType = CustomFieldDataType.Number,
            IsActive = true,
            EntityType = "Patient"
        };

        var dict = new Dictionary<string, object?> { ["weight_custom"] = invalidNumber };
        var act = () => CustomFieldValueValidator.ValidateAndNormalize(dict, new[] { def });
        act.Should().Throw<ValidationException>().WithMessage("*must be a valid number.*");
    }

    [Fact]
    public void CustomFieldValueValidator_MandatoryField_MissingOrCleared_ThrowsValidationException()
    {
        var def = new CustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            FieldKey = "student_id",
            Label = "Student ID",
            DataType = CustomFieldDataType.Text,
            IsRequired = true,
            IsActive = true,
            EntityType = "Patient"
        };

        // Missing key
        var emptyDict = new Dictionary<string, object?>();
        var actMissing = () => CustomFieldValueValidator.ValidateAndNormalize(emptyDict, new[] { def });
        actMissing.Should().Throw<ValidationException>().WithMessage("Student ID is required.");

        // Blank string
        var blankDict = new Dictionary<string, object?> { ["student_id"] = "   " };
        var actBlank = () => CustomFieldValueValidator.ValidateAndNormalize(blankDict, new[] { def });
        actBlank.Should().Throw<ValidationException>().WithMessage("Student ID is required.");

        // Null value
        var nullDict = new Dictionary<string, object?> { ["student_id"] = null };
        var actNull = () => CustomFieldValueValidator.ValidateAndNormalize(nullDict, new[] { def });
        actNull.Should().Throw<ValidationException>().WithMessage("Student ID is required.");

        // Valid value -> passes
        var validDict = new Dictionary<string, object?> { ["student_id"] = "2024-00123" };
        var actValid = () => CustomFieldValueValidator.ValidateAndNormalize(validDict, new[] { def });
        actValid.Should().NotThrow();
    }

    #endregion
}
