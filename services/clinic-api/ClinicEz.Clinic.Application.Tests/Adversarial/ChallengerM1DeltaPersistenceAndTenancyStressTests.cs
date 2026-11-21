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
/// Empirical Challenger 2 Stress Tests for Milestone M1-Delta:
/// Persistence, Multi-Tenancy, Soft-Delete, Seeder, Purge Order, and 10M Scale Features.
/// </summary>
public class ChallengerM1DeltaPersistenceAndTenancyStressTests
{
    private const string TenantAlpha = "tenant-alpha";
    private const string TenantBeta = "tenant-beta";
    private static readonly Guid ClinicAlpha = Guid.NewGuid();
    private static readonly Guid ClinicBeta = Guid.NewGuid();

    private static (ApplicationDbContext ContextAlpha, ApplicationDbContext ContextBeta, ApplicationDbContext AdminContext)
        CreateMultiTenantHarness(string dbName, ICurrentUserService? currentUserService = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var clinicContextAlpha = Substitute.For<IClinicContext>();
        clinicContextAlpha.ClinicId.Returns(ClinicAlpha);
        clinicContextAlpha.TenantId.Returns(TenantAlpha);

        var clinicContextBeta = Substitute.For<IClinicContext>();
        clinicContextBeta.ClinicId.Returns(ClinicBeta);
        clinicContextBeta.TenantId.Returns(TenantBeta);

        var adminClinicContext = Substitute.For<IClinicContext>();
        adminClinicContext.ClinicId.Returns(Guid.Empty);
        adminClinicContext.TenantId.Returns("admin-tenant");

        var interceptor = new SoftDeleteSaveChangesInterceptor(currentUserService);

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .AddInterceptors(interceptor)
            .Options;

        var contextAlpha = new ApplicationDbContext(options, config, clinicContextAlpha);
        var contextBeta = new ApplicationDbContext(options, config, clinicContextBeta);
        var adminContext = new ApplicationDbContext(options, config, adminClinicContext);

        return (contextAlpha, contextBeta, adminContext);
    }

    #region 1. Multi-Tenancy & Jurisdiction Isolation on All 17 New 1NF Entities + DailySequence

    [Fact]
    public void All17NewEntitiesAndDailySequence_InheritClinicScopedEntity()
    {
        var newEntityTypes = new[]
        {
            typeof(PatientAddress),
            typeof(PatientGuardian),
            typeof(PatientIdentityVerification),
            typeof(PatientHospitalizationHistory),
            typeof(PatientInjuryHistory),
            typeof(PatientHomeMedication),
            typeof(PatientSexualHistory),
            typeof(EncounterReviewOfSystemsItem),
            typeof(EncounterObGyneExam),
            typeof(EncounterPediatricMilestone),
            typeof(EncounterPediatricDangerSign),
            typeof(EncounterAdolescentAssessment),
            typeof(EncounterHeadsssDomainAssessment),
            typeof(PatientBpMonitoringLog),
            typeof(PatientBpMonitoringDay),
            typeof(YakapSubmission),
            typeof(YakapSubmissionError),
            typeof(PhilHealthDailySequence)
        };

        foreach (var entityType in newEntityTypes)
        {
            entityType.Should().BeAssignableTo<ClinicScopedEntity>(
                $"Entity {entityType.Name} must inherit from ClinicScopedEntity to enforce jurisdictional isolation.");
        }
    }

    [Fact]
    public void All17NewEntitiesAndDailySequence_HaveGlobalQueryFiltersConfiguredInModel()
    {
        var (contextAlpha, _, _) = CreateMultiTenantHarness($"TestDb_ModelFilter_{Guid.NewGuid()}");

        var newEntityTypes = new[]
        {
            typeof(PatientAddress),
            typeof(PatientGuardian),
            typeof(PatientIdentityVerification),
            typeof(PatientHospitalizationHistory),
            typeof(PatientInjuryHistory),
            typeof(PatientHomeMedication),
            typeof(PatientSexualHistory),
            typeof(EncounterReviewOfSystemsItem),
            typeof(EncounterObGyneExam),
            typeof(EncounterPediatricMilestone),
            typeof(EncounterPediatricDangerSign),
            typeof(EncounterAdolescentAssessment),
            typeof(EncounterHeadsssDomainAssessment),
            typeof(PatientBpMonitoringLog),
            typeof(PatientBpMonitoringDay),
            typeof(YakapSubmission),
            typeof(YakapSubmissionError),
            typeof(PhilHealthDailySequence)
        };

        foreach (var entityType in newEntityTypes)
        {
            var efEntityType = contextAlpha.Model.FindEntityType(entityType);
            efEntityType.Should().NotBeNull($"EF model must register entity type {entityType.Name}");
#pragma warning disable CS0618
            var filter = efEntityType!.GetQueryFilter();
#pragma warning restore CS0618
            filter.Should().NotBeNull($"Entity type {entityType.Name} MUST have a query filter configured");
        }
    }

    [Fact]
    public async Task MultiTenancy_DemographicsAndSocialHistory_PreventsCrossClinicDataLeakage()
    {
        var dbName = $"TestDb_TenancyDemo_{Guid.NewGuid()}";
        var (alpha, beta, admin) = CreateMultiTenantHarness(dbName);

        // Setup patient in Clinic Alpha
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientCode = "PAT-A-001",
            FirstName = "Andres",
            LastName = "Bonifacio",
            ContactNumber = "09171234567"
        };
        alpha.Patients.Add(patient);

        var address = new PatientAddress
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patient.Id,
            AddressType = PatientAddressType.Permanent,
            StreetAddress = "123 Katipunan St"
        };
        var guardian = new PatientGuardian
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patient.Id,
            FirstName = "Gregoria",
            LastName = "De Jesus",
            RelationshipCode = "SPOUSE"
        };
        var verif = new PatientIdentityVerification
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patient.Id,
            Mode = YakapVerificationMode.VALID_ID,
            VerificationDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };
        var hosp = new PatientHospitalizationHistory
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patient.Id,
            ReasonForAdmission = "Appendectomy"
        };
        var inj = new PatientInjuryHistory
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patient.Id,
            InjuryDescription = "Sprained Ankle"
        };
        var homeMed = new PatientHomeMedication
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patient.Id,
            GenericDrugName = "Amlodipine"
        };
        var sexHist = new PatientSexualHistory
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patient.Id,
            ConsentStatusCode = "CONSENTED",
            EverHadSex = true,
            IsSexuallyActive = true
        };

        alpha.PatientAddresses.Add(address);
        alpha.PatientGuardians.Add(guardian);
        alpha.PatientIdentityVerifications.Add(verif);
        alpha.PatientHospitalizationHistories.Add(hosp);
        alpha.PatientInjuryHistories.Add(inj);
        alpha.PatientHomeMedications.Add(homeMed);
        alpha.PatientSexualHistories.Add(sexHist);
        await alpha.SaveChangesAsync();

        // Clinic Beta querying Clinic Alpha's records must see ZERO records
        (await beta.PatientAddresses.AnyAsync(a => a.Id == address.Id)).Should().BeFalse();
        (await beta.PatientGuardians.AnyAsync(g => g.Id == guardian.Id)).Should().BeFalse();
        (await beta.PatientIdentityVerifications.AnyAsync(v => v.Id == verif.Id)).Should().BeFalse();
        (await beta.PatientHospitalizationHistories.AnyAsync(h => h.Id == hosp.Id)).Should().BeFalse();
        (await beta.PatientInjuryHistories.AnyAsync(i => i.Id == inj.Id)).Should().BeFalse();
        (await beta.PatientHomeMedications.AnyAsync(m => m.Id == homeMed.Id)).Should().BeFalse();
        (await beta.PatientSexualHistories.AnyAsync(s => s.Id == sexHist.Id)).Should().BeFalse();

        // Clinic Alpha querying must see all its records
        (await alpha.PatientAddresses.AnyAsync(a => a.Id == address.Id)).Should().BeTrue();
        (await alpha.PatientGuardians.AnyAsync(g => g.Id == guardian.Id)).Should().BeTrue();
        (await alpha.PatientIdentityVerifications.AnyAsync(v => v.Id == verif.Id)).Should().BeTrue();
        (await alpha.PatientHospitalizationHistories.AnyAsync(h => h.Id == hosp.Id)).Should().BeTrue();
        (await alpha.PatientInjuryHistories.AnyAsync(i => i.Id == inj.Id)).Should().BeTrue();
        (await alpha.PatientHomeMedications.AnyAsync(m => m.Id == homeMed.Id)).Should().BeTrue();
        (await alpha.PatientSexualHistories.AnyAsync(s => s.Id == sexHist.Id)).Should().BeTrue();
    }

    [Fact]
    public async Task MultiTenancy_EncounterFormsAndSubmissions_PreventsCrossClinicDataLeakage()
    {
        var dbName = $"TestDb_TenancyForms_{Guid.NewGuid()}";
        var (alpha, beta, admin) = CreateMultiTenantHarness(dbName);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientCode = "PAT-A-002",
            FirstName = "Jose",
            LastName = "Rizal",
            ContactNumber = "09179876543"
        };
        var consult = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Alpha",
            Subjective = "Fever and cough",
            EncounterDate = DateTime.UtcNow
        };
        alpha.Patients.Add(patient);
        alpha.Consultations.Add(consult);

        var ros = new EncounterReviewOfSystemsItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            ConsultationEncounterId = consult.Id,
            System = RosSystem.Cardiorespiratory,
            SymptomCode = "COUGH",
            IsNormal = false
        };
        var obGyne = new EncounterObGyneExam
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            ConsultationEncounterId = consult.Id,
            FundicHeightCm = 24.5m
        };
        var milestone = new EncounterPediatricMilestone
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            ConsultationEncounterId = consult.Id,
            MilestoneVisitAgeCode = "AGE_12M"
        };
        var dangerSign = new EncounterPediatricDangerSign
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PediatricMilestoneId = milestone.Id,
            Domain = PediatricDevelopmentDomain.GrossMotor,
            DangerSignCode = "CONVULSIONS"
        };
        var adol = new EncounterAdolescentAssessment
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            ConsultationEncounterId = consult.Id,
            SmrAssessed = true
        };
        var headsss = new EncounterHeadsssDomainAssessment
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            ConsultationEncounterId = consult.Id,
            Domain = HeadsssDomain.Home
        };
        var bpLog = new PatientBpMonitoringLog
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patient.Id,
            StartDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-7)),
            EndDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };
        var bpDay = new PatientBpMonitoringDay
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            BpMonitoringLogId = bpLog.Id,
            DayNumber = 1
        };
        var ysub = new YakapSubmission
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patient.Id,
            AccreditationNo = "123456789",
            CaseNo = "CASE-001",
            SubmissionType = YakapSubmissionType.Consultation,
            ReportStatus = YakapReportStatus.U,
            LocalTransactionNo = "LOC-001",
            ProcessingStatus = YakapProcessingStatus.Pending
        };
        var ysubErr = new YakapSubmissionError
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            YakapSubmissionId = ysub.Id,
            FieldPath = "Encounter.Date",
            Issue = "Invalid date"
        };
        var pds = new PhilHealthDailySequence
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            AccreditationNo = "123456789",
            Prefix = "C",
            ManilaDate = DateOnly.FromDateTime(DateTime.UtcNow),
            LastValue = 1
        };

        alpha.EncounterReviewOfSystemsItems.Add(ros);
        alpha.EncounterObGyneExams.Add(obGyne);
        alpha.EncounterPediatricMilestones.Add(milestone);
        alpha.EncounterPediatricDangerSigns.Add(dangerSign);
        alpha.EncounterAdolescentAssessments.Add(adol);
        alpha.EncounterHeadsssDomainAssessments.Add(headsss);
        alpha.PatientBpMonitoringLogs.Add(bpLog);
        alpha.PatientBpMonitoringDays.Add(bpDay);
        alpha.YakapSubmissions.Add(ysub);
        alpha.YakapSubmissionErrors.Add(ysubErr);
        alpha.PhilHealthDailySequences.Add(pds);
        await alpha.SaveChangesAsync();

        // Clinic Beta querying Clinic Alpha's records must see ZERO records
        (await beta.EncounterReviewOfSystemsItems.AnyAsync(r => r.Id == ros.Id)).Should().BeFalse();
        (await beta.EncounterObGyneExams.AnyAsync(o => o.Id == obGyne.Id)).Should().BeFalse();
        (await beta.EncounterPediatricMilestones.AnyAsync(m => m.Id == milestone.Id)).Should().BeFalse();
        (await beta.EncounterPediatricDangerSigns.AnyAsync(d => d.Id == dangerSign.Id)).Should().BeFalse();
        (await beta.EncounterAdolescentAssessments.AnyAsync(a => a.Id == adol.Id)).Should().BeFalse();
        (await beta.EncounterHeadsssDomainAssessments.AnyAsync(h => h.Id == headsss.Id)).Should().BeFalse();
        (await beta.PatientBpMonitoringLogs.AnyAsync(b => b.Id == bpLog.Id)).Should().BeFalse();
        (await beta.PatientBpMonitoringDays.AnyAsync(d => d.Id == bpDay.Id)).Should().BeFalse();
        (await beta.YakapSubmissions.AnyAsync(y => y.Id == ysub.Id)).Should().BeFalse();
        (await beta.YakapSubmissionErrors.AnyAsync(e => e.Id == ysubErr.Id)).Should().BeFalse();
        (await beta.PhilHealthDailySequences.AnyAsync(p => p.Id == pds.Id)).Should().BeFalse();

        // Clinic Alpha querying must see all its records
        (await alpha.EncounterReviewOfSystemsItems.AnyAsync(r => r.Id == ros.Id)).Should().BeTrue();
        (await alpha.EncounterObGyneExams.AnyAsync(o => o.Id == obGyne.Id)).Should().BeTrue();
        (await alpha.EncounterPediatricMilestones.AnyAsync(m => m.Id == milestone.Id)).Should().BeTrue();
        (await alpha.EncounterPediatricDangerSigns.AnyAsync(d => d.Id == dangerSign.Id)).Should().BeTrue();
        (await alpha.EncounterAdolescentAssessments.AnyAsync(a => a.Id == adol.Id)).Should().BeTrue();
        (await alpha.EncounterHeadsssDomainAssessments.AnyAsync(h => h.Id == headsss.Id)).Should().BeTrue();
        (await alpha.PatientBpMonitoringLogs.AnyAsync(b => b.Id == bpLog.Id)).Should().BeTrue();
        (await alpha.PatientBpMonitoringDays.AnyAsync(d => d.Id == bpDay.Id)).Should().BeTrue();
        (await alpha.YakapSubmissions.AnyAsync(y => y.Id == ysub.Id)).Should().BeTrue();
        (await alpha.YakapSubmissionErrors.AnyAsync(e => e.Id == ysubErr.Id)).Should().BeTrue();
        (await alpha.PhilHealthDailySequences.AnyAsync(p => p.Id == pds.Id)).Should().BeTrue();
    }

    [Fact]
    public async Task CascadeClinicAndTenantScopes_PropagatesScopesToAll17NewEntitiesWhenEmpty()
    {
        var dbName = $"TestDb_ScopeCascade_{Guid.NewGuid()}";
        var (alpha, _, _) = CreateMultiTenantHarness(dbName);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientCode = "PAT-A-003",
            FirstName = "Melchora",
            LastName = "Aquino",
            ContactNumber = "09181112233"
        };
        alpha.Patients.Add(patient);

        var consult = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Alpha",
            Subjective = "Headache",
            EncounterDate = DateTime.UtcNow
        };
        alpha.Consultations.Add(consult);

        // Add 1NF child records with Guid.Empty ClinicId and empty TenantId
        var addr = new PatientAddress
        {
            Id = Guid.NewGuid(),
            PatientId = patient.Id,
            AddressType = PatientAddressType.Permanent,
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var guardian = new PatientGuardian
        {
            Id = Guid.NewGuid(),
            PatientId = patient.Id,
            FirstName = "Juan",
            LastName = "Aquino",
            RelationshipCode = "SON",
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var verif = new PatientIdentityVerification
        {
            Id = Guid.NewGuid(),
            PatientId = patient.Id,
            Mode = YakapVerificationMode.VALID_ID,
            VerificationDate = DateOnly.FromDateTime(DateTime.UtcNow),
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var hosp = new PatientHospitalizationHistory
        {
            Id = Guid.NewGuid(),
            PatientId = patient.Id,
            ReasonForAdmission = "Pneumonia",
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var inj = new PatientInjuryHistory
        {
            Id = Guid.NewGuid(),
            PatientId = patient.Id,
            InjuryDescription = "Burn",
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var homeMed = new PatientHomeMedication
        {
            Id = Guid.NewGuid(),
            PatientId = patient.Id,
            GenericDrugName = "Metformin",
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var sexHist = new PatientSexualHistory
        {
            Id = Guid.NewGuid(),
            PatientId = patient.Id,
            ConsentStatusCode = "CONSENTED",
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var ros = new EncounterReviewOfSystemsItem
        {
            Id = Guid.NewGuid(),
            ConsultationEncounterId = consult.Id,
            System = RosSystem.General,
            SymptomCode = "FEVER",
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var obGyne = new EncounterObGyneExam
        {
            Id = Guid.NewGuid(),
            ConsultationEncounterId = consult.Id,
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var milestone = new EncounterPediatricMilestone
        {
            Id = Guid.NewGuid(),
            ConsultationEncounterId = consult.Id,
            MilestoneVisitAgeCode = "AGE_6M",
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var dangerSign = new EncounterPediatricDangerSign
        {
            Id = Guid.NewGuid(),
            PediatricMilestoneId = milestone.Id,
            Domain = PediatricDevelopmentDomain.GrossMotor,
            DangerSignCode = "LETHARGY",
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var adol = new EncounterAdolescentAssessment
        {
            Id = Guid.NewGuid(),
            ConsultationEncounterId = consult.Id,
            SmrAssessed = false,
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var headsss = new EncounterHeadsssDomainAssessment
        {
            Id = Guid.NewGuid(),
            ConsultationEncounterId = consult.Id,
            Domain = HeadsssDomain.EducationEmployment,
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var bpLog = new PatientBpMonitoringLog
        {
            Id = Guid.NewGuid(),
            PatientId = patient.Id,
            StartDate = DateOnly.FromDateTime(DateTime.UtcNow),
            EndDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7)),
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var bpDay = new PatientBpMonitoringDay
        {
            Id = Guid.NewGuid(),
            BpMonitoringLogId = bpLog.Id,
            DayNumber = 1,
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var ysub = new YakapSubmission
        {
            Id = Guid.NewGuid(),
            PatientId = patient.Id,
            ConsultationEncounterId = consult.Id,
            AccreditationNo = "987654321",
            CaseNo = "CASE-002",
            SubmissionType = YakapSubmissionType.Consultation,
            LocalTransactionNo = "LOC-002",
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };
        var ysubErr = new YakapSubmissionError
        {
            Id = Guid.NewGuid(),
            YakapSubmissionId = ysub.Id,
            FieldPath = "Vitals",
            Issue = "Missing BP",
            ClinicId = Guid.Empty,
            TenantId = string.Empty
        };

        alpha.PatientAddresses.Add(addr);
        alpha.PatientGuardians.Add(guardian);
        alpha.PatientIdentityVerifications.Add(verif);
        alpha.PatientHospitalizationHistories.Add(hosp);
        alpha.PatientInjuryHistories.Add(inj);
        alpha.PatientHomeMedications.Add(homeMed);
        alpha.PatientSexualHistories.Add(sexHist);
        alpha.EncounterReviewOfSystemsItems.Add(ros);
        alpha.EncounterObGyneExams.Add(obGyne);
        alpha.EncounterPediatricMilestones.Add(milestone);
        alpha.EncounterPediatricDangerSigns.Add(dangerSign);
        alpha.EncounterAdolescentAssessments.Add(adol);
        alpha.EncounterHeadsssDomainAssessments.Add(headsss);
        alpha.PatientBpMonitoringLogs.Add(bpLog);
        alpha.PatientBpMonitoringDays.Add(bpDay);
        alpha.YakapSubmissions.Add(ysub);
        alpha.YakapSubmissionErrors.Add(ysubErr);

        await alpha.SaveChangesAsync();

        // Verify that CascadeClinicAndTenantScopes populated ClinicId and TenantId
        addr.ClinicId.Should().Be(ClinicAlpha);
        guardian.ClinicId.Should().Be(ClinicAlpha);
        verif.ClinicId.Should().Be(ClinicAlpha);
        hosp.ClinicId.Should().Be(ClinicAlpha);
        inj.ClinicId.Should().Be(ClinicAlpha);
        homeMed.ClinicId.Should().Be(ClinicAlpha);
        sexHist.ClinicId.Should().Be(ClinicAlpha);
        ros.ClinicId.Should().Be(ClinicAlpha);
        obGyne.ClinicId.Should().Be(ClinicAlpha);
        milestone.ClinicId.Should().Be(ClinicAlpha);
        dangerSign.ClinicId.Should().Be(ClinicAlpha);
        adol.ClinicId.Should().Be(ClinicAlpha);
        headsss.ClinicId.Should().Be(ClinicAlpha);
        bpLog.ClinicId.Should().Be(ClinicAlpha);
        bpDay.ClinicId.Should().Be(ClinicAlpha);
        ysub.ClinicId.Should().Be(ClinicAlpha);
        ysubErr.ClinicId.Should().Be(ClinicAlpha);

        addr.TenantId.Should().Be(TenantAlpha);
        guardian.TenantId.Should().Be(TenantAlpha);
        verif.TenantId.Should().Be(TenantAlpha);
        hosp.TenantId.Should().Be(TenantAlpha);
        inj.TenantId.Should().Be(TenantAlpha);
        homeMed.TenantId.Should().Be(TenantAlpha);
        sexHist.TenantId.Should().Be(TenantAlpha);
        ros.TenantId.Should().Be(TenantAlpha);
        obGyne.TenantId.Should().Be(TenantAlpha);
        milestone.TenantId.Should().Be(TenantAlpha);
        dangerSign.TenantId.Should().Be(TenantAlpha);
        adol.TenantId.Should().Be(TenantAlpha);
        headsss.TenantId.Should().Be(TenantAlpha);
        bpLog.TenantId.Should().Be(TenantAlpha);
        bpDay.TenantId.Should().Be(TenantAlpha);
        ysub.TenantId.Should().Be(TenantAlpha);
        ysubErr.TenantId.Should().Be(TenantAlpha);
    }

    #endregion

    #region 2. Soft-Delete & Filtered Unique Index Reactivation Tests

    [Fact]
    public async Task SoftDelete_SuppressesRecordsFromDefaultQueries_AndPreservesInIgnoreQueryFilters()
    {
        var dbName = $"TestDb_SoftDelete_{Guid.NewGuid()}";
        var (alpha, _, _) = CreateMultiTenantHarness(dbName);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientCode = "PAT-A-004",
            FirstName = "Apolinario",
            LastName = "Mabini",
            ContactNumber = "09191234567"
        };
        var addr = new PatientAddress
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patient.Id,
            AddressType = PatientAddressType.Permanent,
            StreetAddress = "Tanauan, Batangas"
        };
        alpha.Patients.Add(patient);
        alpha.PatientAddresses.Add(addr);
        await alpha.SaveChangesAsync();

        // Soft delete the address via interceptor
        alpha.PatientAddresses.Remove(addr);
        await alpha.SaveChangesAsync();

        // Default query with filter must NOT return the soft-deleted address
        var activeAddr = await alpha.PatientAddresses.FirstOrDefaultAsync(a => a.Id == addr.Id);
        activeAddr.Should().BeNull();

        // IgnoreQueryFilters must return it with IsDeleted == true
        var rawAddr = await alpha.PatientAddresses.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == addr.Id);
        rawAddr.Should().NotBeNull();
        rawAddr!.IsDeleted.Should().BeTrue();
        rawAddr.DeletedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task FilteredUniqueIndex_PatientAddress_AllowsRecreationWhenSoftDeleted()
    {
        var dbName = $"TestDb_AddressRecreate_{Guid.NewGuid()}";
        var (alpha, _, _) = CreateMultiTenantHarness(dbName);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientCode = "PAT-A-005",
            FirstName = "Marcelo",
            LastName = "Del Pilar",
            ContactNumber = "09197654321"
        };
        alpha.Patients.Add(patient);
        await alpha.SaveChangesAsync();

        // 1. Create first Permanent address
        var addr1 = new PatientAddress
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patientId,
            AddressType = PatientAddressType.Permanent,
            StreetAddress = "Bulakan, Bulacan"
        };
        alpha.PatientAddresses.Add(addr1);
        await alpha.SaveChangesAsync();

        // 2. Soft-delete addr1
        alpha.PatientAddresses.Remove(addr1);
        await alpha.SaveChangesAsync();

        // 3. Re-create address with the EXACT same key (ClinicId, PatientId, AddressType)
        var addr2 = new PatientAddress
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patientId,
            AddressType = PatientAddressType.Permanent,
            StreetAddress = "New Address, Bulakan, Bulacan"
        };
        alpha.PatientAddresses.Add(addr2);
        var saveAction = async () => await alpha.SaveChangesAsync();
        await saveAction.Should().NotThrowAsync("Filtered unique index allows re-creating records when IsDeleted = true");

        // Verify that addr2 is now active
        var active = await alpha.PatientAddresses.FirstOrDefaultAsync(a => a.PatientId == patientId && a.AddressType == PatientAddressType.Permanent);
        active.Should().NotBeNull();
        active!.Id.Should().Be(addr2.Id);
        active.StreetAddress.Should().Be("New Address, Bulakan, Bulacan");
    }

    [Fact]
    public async Task FilteredUniqueIndex_PatientSexualHistory_AllowsRecreationWhenSoftDeleted()
    {
        var dbName = $"TestDb_SexHistRecreate_{Guid.NewGuid()}";
        var (alpha, _, _) = CreateMultiTenantHarness(dbName);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientCode = "PAT-A-006",
            FirstName = "Juan",
            LastName = "Luna",
            ContactNumber = "09201234567"
        };
        alpha.Patients.Add(patient);
        await alpha.SaveChangesAsync();

        // 1. Create sexual history
        var sh1 = new PatientSexualHistory
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patientId,
            ConsentStatusCode = "CONSENTED",
            EverHadSex = true,
            IsSexuallyActive = false
        };
        alpha.PatientSexualHistories.Add(sh1);
        await alpha.SaveChangesAsync();

        // 2. Soft-delete sh1
        alpha.PatientSexualHistories.Remove(sh1);
        await alpha.SaveChangesAsync();
        alpha.ChangeTracker.Clear();

        // 3. Re-create sexual history with the same key (ClinicId, PatientId)
        var sh2 = new PatientSexualHistory
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            PatientId = patientId,
            ConsentStatusCode = "CONSENTED",
            EverHadSex = true,
            IsSexuallyActive = true
        };
        alpha.PatientSexualHistories.Add(sh2);
        var saveAction = async () => await alpha.SaveChangesAsync();
        await saveAction.Should().NotThrowAsync("Filtered unique index allows re-creating sexual history when IsDeleted = true");

        var active = await alpha.PatientSexualHistories.FirstOrDefaultAsync(s => s.PatientId == patientId);
        active.Should().NotBeNull();
        active!.Id.Should().Be(sh2.Id);
        active.IsSexuallyActive.Should().BeTrue();
    }

    [Fact]
    public async Task FilteredUniqueIndex_PhilHealthDailySequence_AllowsRecreationWhenSoftDeleted()
    {
        var dbName = $"TestDb_SeqRecreate_{Guid.NewGuid()}";
        var (alpha, _, _) = CreateMultiTenantHarness(dbName);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // 1. Create sequence
        var seq1 = new PhilHealthDailySequence
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            AccreditationNo = "H99999999",
            Prefix = "C",
            ManilaDate = today,
            LastValue = 5
        };
        alpha.PhilHealthDailySequences.Add(seq1);
        await alpha.SaveChangesAsync();

        // 2. Soft-delete seq1
        alpha.PhilHealthDailySequences.Remove(seq1);
        await alpha.SaveChangesAsync();

        // 3. Re-create sequence with identical (ClinicId, AccreditationNo, Prefix, ManilaDate)
        var seq2 = new PhilHealthDailySequence
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAlpha,
            ClinicId = ClinicAlpha,
            AccreditationNo = "H99999999",
            Prefix = "C",
            ManilaDate = today,
            LastValue = 1
        };
        alpha.PhilHealthDailySequences.Add(seq2);
        var saveAction = async () => await alpha.SaveChangesAsync();
        await saveAction.Should().NotThrowAsync("Filtered unique index allows re-creating daily sequence when IsDeleted = true");

        var active = await alpha.PhilHealthDailySequences.FirstOrDefaultAsync(s => s.AccreditationNo == "H99999999" && s.Prefix == "C");
        active.Should().NotBeNull();
        active!.Id.Should().Be(seq2.Id);
        active.LastValue.Should().Be(1);
    }

    #endregion

    #region 3. DevPatientSeeder Verification

    [Fact]
    public async Task DevPatientSeeder_SeedsAll1NfEntities_Successfully()
    {
        var dbName = $"TestDb_SeederAll1Nf_{Guid.NewGuid()}";
        var (alpha, _, _) = CreateMultiTenantHarness(dbName);

        var options = new PatientSeedOptions
        {
            Count = 50,
            ClinicId = ClinicAlpha,
            TenantId = TenantAlpha,
            ClearExistingSeededPatients = false,
            BatchSize = 50
        };

        var result = await DevPatientSeeder.SeedAsync(alpha, options);

        result.Should().NotBeNull();
        result.PatientsCreated.Should().Be(50);
        result.AddressesCreated.Should().BeGreaterThan(0, "PatientAddress rows must be seeded");
        result.GuardiansCreated.Should().BeGreaterThan(0, "PatientGuardian rows must be seeded");
        result.IdentityVerificationsCreated.Should().BeGreaterThan(0, "PatientIdentityVerification rows must be seeded");
        result.HospitalizationHistoriesCreated.Should().BeGreaterThan(0, "PatientHospitalizationHistory rows must be seeded");
        result.InjuryHistoriesCreated.Should().BeGreaterThan(0, "PatientInjuryHistory rows must be seeded");
        result.HomeMedicationsCreated.Should().BeGreaterThan(0, "PatientHomeMedication rows must be seeded");
        result.SexualHistoriesCreated.Should().BeGreaterThan(0, "PatientSexualHistory rows must be seeded");
        result.ReviewOfSystemsItemsCreated.Should().BeGreaterThan(0, "EncounterReviewOfSystemsItem rows must be seeded");
        result.SpecificFormsCreated.Should().BeGreaterThan(0, "Specific encounter forms must be seeded");
        result.BpMonitoringLogsCreated.Should().BeGreaterThan(0, "PatientBpMonitoringLog rows must be seeded");
        result.YakapSubmissionsCreated.Should().BeGreaterThan(0, "YakapSubmission rows must be seeded");

        // Verify seeded entities in DB
        var patientCount = await alpha.Patients.CountAsync();
        patientCount.Should().Be(50);

        var addressCount = await alpha.PatientAddresses.CountAsync();
        addressCount.Should().Be(result.AddressesCreated);

        var guardianCount = await alpha.PatientGuardians.CountAsync();
        guardianCount.Should().Be(result.GuardiansCreated);

        var verifCount = await alpha.PatientIdentityVerifications.CountAsync();
        verifCount.Should().Be(result.IdentityVerificationsCreated);

        var hospCount = await alpha.PatientHospitalizationHistories.CountAsync();
        hospCount.Should().Be(result.HospitalizationHistoriesCreated);

        var injCount = await alpha.PatientInjuryHistories.CountAsync();
        injCount.Should().Be(result.InjuryHistoriesCreated);

        var homeMedCount = await alpha.PatientHomeMedications.CountAsync();
        homeMedCount.Should().Be(result.HomeMedicationsCreated);

        var sexHistCount = await alpha.PatientSexualHistories.CountAsync();
        sexHistCount.Should().Be(result.SexualHistoriesCreated);

        var rosCount = await alpha.EncounterReviewOfSystemsItems.CountAsync();
        rosCount.Should().Be(result.ReviewOfSystemsItemsCreated);

        var bpCount = await alpha.PatientBpMonitoringLogs.CountAsync();
        bpCount.Should().Be(result.BpMonitoringLogsCreated);

        var bpDayCount = await alpha.PatientBpMonitoringDays.CountAsync();
        bpDayCount.Should().BeGreaterThan(0);

        var ysubCount = await alpha.YakapSubmissions.CountAsync();
        ysubCount.Should().Be(result.YakapSubmissionsCreated);
    }

    #endregion

    #region 4. Purge Order & Foreign Key Restrict Integrity

    [Fact]
    public async Task PurgeClinicTestRecordsAsync_DeletesAllTestRecordsWithoutConstraintViolations()
    {
        var dbName = $"TestDb_PurgeOrder_{Guid.NewGuid()}";
        var (alpha, _, _) = CreateMultiTenantHarness(dbName);

        // 1. Seed 50 patients with rich 1NF child graphs
        var seedOptions = new PatientSeedOptions
        {
            Count = 50,
            ClinicId = ClinicAlpha,
            TenantId = TenantAlpha,
            ClearExistingSeededPatients = false,
            BatchSize = 50
        };
        await DevPatientSeeder.SeedAsync(alpha, seedOptions);

        (await alpha.Patients.CountAsync()).Should().Be(50);
        (await alpha.PatientAddresses.CountAsync()).Should().BeGreaterThan(0);
        (await alpha.PatientBpMonitoringLogs.CountAsync()).Should().BeGreaterThan(0);
        (await alpha.YakapSubmissions.CountAsync()).Should().BeGreaterThan(0);

        // 2. Execute PurgeClinicTestRecordsAsync
        var purgeAction = async () => await DevPatientSeeder.PurgeClinicTestRecordsAsync(
            alpha, ClinicAlpha, TenantAlpha, purgeAll: false);
        await purgeAction.Should().NotThrowAsync("Purge order must respect FK restrict constraints");

        // 3. Verify that all seeded records for Clinic Alpha are deleted
        var remainingPatients = await alpha.Patients.CountAsync();
        remainingPatients.Should().Be(0, "All seeded patients must be purged");

        var remainingAddrs = await alpha.PatientAddresses.CountAsync();
        remainingAddrs.Should().Be(0, "All addresses for purged patients must be removed");

        var remainingGuardians = await alpha.PatientGuardians.CountAsync();
        remainingGuardians.Should().Be(0, "All guardians for purged patients must be removed");

        var remainingBp = await alpha.PatientBpMonitoringLogs.CountAsync();
        remainingBp.Should().Be(0, "All BP monitoring logs for purged patients must be removed");

        var remainingBpDays = await alpha.PatientBpMonitoringDays.CountAsync();
        remainingBpDays.Should().Be(0, "All BP monitoring days for purged patients must be removed");

        var remainingYakap = await alpha.YakapSubmissions.CountAsync();
        remainingYakap.Should().Be(0, "All Yakap submissions for purged patients must be removed");

        // 4. Re-seed to verify no dangling keys cause duplicate collisions
        var reseedAction = async () => await DevPatientSeeder.SeedAsync(alpha, seedOptions);
        await reseedAction.Should().NotThrowAsync("Re-seeding after purge must succeed with 0 collision errors");
        (await alpha.Patients.CountAsync()).Should().Be(50);
    }

    #endregion

    #region 5. High-Scale 10M Features Verification

    [Fact]
    public void HighScale10M_PatientModelMetadata_HasStoredSearchTextAndGinTrgmIndex()
    {
        var (alpha, _, _) = CreateMultiTenantHarness($"TestDb_ScaleMeta_{Guid.NewGuid()}");

        var patientEntity = alpha.Model.FindEntityType(typeof(Patient));
        patientEntity.Should().NotBeNull();

        // 1. SearchText computed column
        var searchTextProp = patientEntity!.FindProperty("SearchText");
        searchTextProp.Should().NotBeNull();
        var sql = searchTextProp!.GetComputedColumnSql();
        sql.Should().NotBeNull();
        sql!.ToLowerInvariant().Should().Contain("firstname");
        sql.ToLowerInvariant().Should().Contain("lastname");
        var isStored = searchTextProp.FindAnnotation("Relational:IsStored")?.Value as bool? ?? false;
        isStored.Should().BeTrue("SearchText computed column must be stored for GIN trigram indexing");

        // 2. GIN trigram index on SearchText
        var searchIndex = patientEntity.GetIndexes()
            .FirstOrDefault(idx => idx.Properties.Any(p => p.Name == "SearchText"));
        searchIndex.Should().NotBeNull("An index on SearchText must exist");
        searchIndex!.GetMethod().Should().Be("gin");
        var operators = searchIndex.GetOperators();
        operators.Should().NotBeNull();
        operators!.Should().Contain("gin_trgm_ops");

        // 3. GIN index on CustomFields
        var customFieldsIndex = patientEntity.GetIndexes()
            .FirstOrDefault(idx => idx.Properties.Any(p => p.Name == "CustomFields"));
        customFieldsIndex.Should().NotBeNull("An index on CustomFields must exist");
        customFieldsIndex!.GetMethod().Should().Be("gin");
        var cfOps = customFieldsIndex.GetOperators();
        cfOps.Should().NotBeNull();
        cfOps!.Should().Contain("jsonb_path_ops");

        // 4. HasActiveSafetyAlert property
        var alertProp = patientEntity.FindProperty("HasActiveSafetyAlert");
        alertProp.Should().NotBeNull();
        alertProp!.ClrType.Should().Be(typeof(bool));
        alertProp.GetDefaultValue().Should().Be(false);
    }

    [Fact]
    public void HighScale10M_PhilHealthDailySequence_HasClinicIdLeadingFilteredUniqueIndex()
    {
        var (alpha, _, _) = CreateMultiTenantHarness($"TestDb_DailySeqMeta_{Guid.NewGuid()}");

        var seqEntity = alpha.Model.FindEntityType(typeof(PhilHealthDailySequence));
        seqEntity.Should().NotBeNull();

        var uniqueIndex = seqEntity!.GetIndexes().FirstOrDefault(idx => idx.IsUnique);
        uniqueIndex.Should().NotBeNull("PhilHealthDailySequence must have a unique composite index");

        var propertyNames = uniqueIndex!.Properties.Select(p => p.Name).ToList();
        propertyNames.Should().Equal(new[] { "ClinicId", "AccreditationNo", "Prefix", "ManilaDate" },
            "Composite unique index must lead with ClinicId and contain AccreditationNo, Prefix, ManilaDate");

        var filter = uniqueIndex.GetFilter();
        filter.Should().NotBeNull();
        filter.Should().Contain("\"IsDeleted\" = false");
    }

    #endregion
}
