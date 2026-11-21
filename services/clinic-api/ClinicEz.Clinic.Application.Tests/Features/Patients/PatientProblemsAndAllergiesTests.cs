using ClinicEz.Clinic.Infrastructure.Persistence;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Allergies.Commands;
using ClinicEz.Clinic.Application.Features.Allergies.Queries;
using ClinicEz.Clinic.Application.Features.Problems.Commands;
using ClinicEz.Clinic.Application.Features.Problems.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Domain.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class PatientMedicalHistorysAndAllergiesTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string TenantId = "tenant-test";
    private readonly IClinicContext _clinicContext;

    public PatientMedicalHistorysAndAllergiesTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(TenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    private Patient SeedPatient(ApplicationDbContext db)
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-002",
            FirstName = "Maria",
            LastName = "Santos",
            Sex = BiologicalSex.Female,
            DateOfBirth = new DateOnly(1985, 3, 15),
            ContactNumber = "09171234567"
        };
        db.Patients.Add(patient);
        db.SaveChanges();
        return patient;
    }

    // ==========================================
    // 1. Structured Problems Tests
    // ==========================================
    [Fact]
    public async Task CreatePatientMedicalHistory_ValidCommand_PersistsProblemAndEnforcesMultiTenant()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = SeedPatient(db);

        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var problemRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(db, sieve);

        var handler = new CreatePatientProblemCommandHandler(patientRepo, problemRepo, uow, _clinicContext);

        var command = new CreatePatientProblemCommand(
            PatientId: patient.Id,
            ConsultationEncounterId: null,
            Icd10Code: "E11.9",
            ProblemTitle: "Type 2 diabetes mellitus without complications",
            PhilHealthMdiseaseCode: "006",
            Status: "Active",
            Severity: "Moderate",
            IsChronicNcd: true,
            OnsetDate: new DateOnly(2022, 1, 15),
            ClinicalNotes: "HbA1c 7.8% on metformin 500mg BID",
            RecordedByDoctorName: "Dr. Jose Rizal, MD"
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.Icd10Code.Should().Be("E11.9");
        result.ProblemTitle.Should().Contain("Type 2 diabetes");
        result.Status.Should().Be("Active");
        result.IsChronicNcd.Should().BeTrue();
        result.ClinicId.Should().Be(_clinicId);
        result.RecordedByDoctorName.Should().Be("Dr. Jose Rizal, MD");

        var inDb = await db.PatientMedicalHistories.FirstOrDefaultAsync(p => p.Id == result.Id);
        inDb.Should().NotBeNull();
        inDb!.ClinicId.Should().Be(_clinicId);
    }

    [Fact]
    public void CreatePatientProblem_InvalidIcd10_FailsValidation()
    {
        var validator = new CreatePatientProblemValidator();

        var invalidCommand = new CreatePatientProblemCommand(
            PatientId: Guid.NewGuid(),
            ConsultationEncounterId: null,
            Icd10Code: "INVALID_CODE",
            ProblemTitle: "Test Problem"
        );

        var validation = validator.Validate(invalidCommand);
        validation.IsValid.Should().BeFalse();
        validation.Errors.Should().Contain(e => e.ErrorMessage.Contains("standard format"));
    }

    [Fact]
    public async Task UpdatePatientProblemStatus_Resolved_SetsResolvedDate()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = SeedPatient(db);

        var problem = new PatientMedicalHistory
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            Icd10Code = "J18.9",
            ConditionTitle = "Community acquired pneumonia",
            Status = ProblemStatus.Active,
            Severity = ProblemSeverity.Moderate,
            OnsetDate = new DateOnly(2026, 2, 1),
            RecordedByStaffId = Guid.NewGuid(),
            RecordedByStaffName = "Dr. Rizal"
        };
        db.PatientMedicalHistories.Add(problem);
        await db.SaveChangesAsync();

        var problemRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(db, sieve);
        var handler = new UpdatePatientProblemStatusCommandHandler(problemRepo, uow, _clinicContext);

        var resolvedDate = new DateOnly(2026, 2, 20);
        var command = new UpdatePatientProblemStatusCommand(
            ProblemId: problem.Id,
            PatientId: patient.Id,
            Status: "Resolved",
            ResolvedDate: resolvedDate,
            ClinicalNotes: "Chest X-ray clear. Completed amoxicillin course."
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be("Resolved");
        result.ResolvedDate.Should().Be(resolvedDate);
        result.ClinicalNotes.Should().Contain("Chest X-ray clear");
    }

    // ==========================================
    // 2. Structured Allergies Tests
    // ==========================================
    [Fact]
    public async Task CreatePatientAllergy_ValidDrugAllergy_SyncsPatientSummaryString()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = SeedPatient(db);

        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var allergyRepo = TestDbHelper.CreateRepository<PatientAllergy>(db, sieve);

        var handler = new CreatePatientAllergyCommandHandler(patientRepo, allergyRepo, uow, _clinicContext);

        var command = new CreatePatientAllergyCommand(
            PatientId: patient.Id,
            Category: "Medication",
            Allergen: "Penicillin",
            AllergenDrugCode: "PNF-PEN-01",
            Severity: "LifeThreatening",
            ReactionManifestation: "Laryngeal edema and anaphylaxis",
            IsAnaphylactic: true,
            OnsetDate: new DateOnly(2015, 6, 1),
            Notes: "Hospitalized in 2015 after amoxicillin ingestion"
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.Allergen.Should().Be("Penicillin");
        result.IsAnaphylactic.Should().BeTrue();
        result.Severity.Should().Be("LifeThreatening");

        var updatedPatient = await db.Patients.Include(p => p.Allergies).FirstOrDefaultAsync(p => p.Id == patient.Id);
        updatedPatient!.Allergies.Should().Contain(a => a.Allergen == "Penicillin");
    }

    [Fact]
    public async Task DeletePatientAllergy_SoftDeletesRecord()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = SeedPatient(db);

        var allergy = new PatientAllergy
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            Category = AllergyCategory.Food,
            Allergen = "Peanuts",
            Severity = AllergySeverity.Moderate,
            IsAnaphylactic = false,
            Status = AllergyStatus.Active
        };
        db.PatientAllergies.Add(allergy);
        await db.SaveChangesAsync();

        var allergyRepo = TestDbHelper.CreateRepository<PatientAllergy>(db, sieve);
        var handler = new DeletePatientAllergyCommandHandler(allergyRepo, uow, _clinicContext);

        var result = await handler.Handle(new DeletePatientAllergyCommand(allergy.Id, patient.Id), CancellationToken.None);

        result.Should().BeTrue();
        var inDb = await db.PatientAllergies.FindAsync(allergy.Id);
        inDb!.IsDeleted.Should().BeTrue();
    }

    // ==========================================
    // 3. PhilPEN Risk Scorer Tests
    // ==========================================
    [Fact]
    public void PhilPenRiskScorer_CrisisOverride_ElevatesToBandE()
    {
        var input = new PhilPenSurveyInput(
            AgeYears: 45,
            Sex: "Male",
            IsSmoker: false,
            SystolicBp: 190, // Hypertensive crisis >= 180
            DiastolicBp: 115,
            HasDiabetes: false
        );

        var result = PhilPenRiskScorer.CalculateRiskScore(input);

        result.RiskBand.Should().Be(PhilPenCvdRiskBand.BandE_40PercentOrGreater);
        result.CrisisOverrideApplied.Should().BeTrue();
        result.ManagementRecommendation.Should().Contain("EMERGENCY");
    }

    [Fact]
    public void PhilPenRiskScorer_BmiFallback_UsedWhenCholesterolMissing()
    {
        var input = new PhilPenSurveyInput(
            AgeYears: 55,
            Sex: "Male",
            IsSmoker: true,
            SystolicBp: 145,
            TotalCholesterolMgDl: null, // Missing lab
            BodyMassIndex: 32m // Obese -> fallback
        );

        var result = PhilPenRiskScorer.CalculateRiskScore(input);

        result.UsedBmiFallback.Should().BeTrue();
        result.CrisisOverrideApplied.Should().BeFalse();
        result.RiskBand.Should().BeOneOf(PhilPenCvdRiskBand.BandC_20ToUnder30Percent, PhilPenCvdRiskBand.BandD_30ToUnder40Percent, PhilPenCvdRiskBand.BandE_40PercentOrGreater);
    }

    [Fact]
    public void PhilPenRiskScorer_LowRiskIndividual_CalculatesBandA()
    {
        var input = new PhilPenSurveyInput(
            AgeYears: 25,
            Sex: "Female",
            IsSmoker: false,
            SystolicBp: 115,
            TotalCholesterolMgDl: 170m
        );

        var result = PhilPenRiskScorer.CalculateRiskScore(input);

        result.RiskBand.Should().Be(PhilPenCvdRiskBand.BandA_LessThan10Percent);
        result.CalculatedScorePercent.Should().BeLessThan(10m);
    }

    // ==========================================
    // 4. Clinical Decision Support (CDS) Tests
    // ==========================================
    [Fact]
    public void ClinicalDecisionSupport_StructuredAllergy_DetectsDirectAndCrossReactivity()
    {
        var candidates = new List<PrescriptionCandidate>
        {
            new() { GenericName = "Cephalexin", Dosage = "500mg" },
            new() { GenericName = "Ibuprofen", Dosage = "400mg" }
        };

        var structuredAllergies = new List<PatientAllergy>
        {
            new()
            {
                TenantId = TenantId,
                ClinicId = _clinicId,
                PatientId = Guid.NewGuid(),
                Category = AllergyCategory.Medication,
                Allergen = "Penicillin",
                Severity = AllergySeverity.Severe,
                IsAnaphylactic = false,
                ReactionManifestation = "Maculopapular rash"
            },
            new()
            {
                TenantId = TenantId,
                ClinicId = _clinicId,
                PatientId = Guid.NewGuid(),
                Category = AllergyCategory.Medication,
                Allergen = "Aspirin",
                Severity = AllergySeverity.LifeThreatening,
                IsAnaphylactic = true,
                ReactionManifestation = "Severe bronchospasm"
            }
        };

        var alerts = ClinicalDecisionSupportEvaluator.Evaluate(
            candidates: candidates,
            structuredAllergies: structuredAllergies
        );

        // Penicillin -> Cephalexin cross-reactivity
        var cephAlert = alerts.FirstOrDefault(a => a.Type == CdsAlertType.CrossReactivity && a.OffendingDrug.Contains("Cephalexin"));
        cephAlert.Should().NotBeNull();
        cephAlert!.Severity.Should().Be(CdsAlertSeverity.Major);

        // Aspirin -> Ibuprofen cross-sensitivity
        var nsaidAlert = alerts.FirstOrDefault(a => a.Type == CdsAlertType.CrossReactivity && a.OffendingDrug.Contains("Ibuprofen"));
        nsaidAlert.Should().NotBeNull();
        nsaidAlert!.Severity.Should().Be(CdsAlertSeverity.Critical);
        nsaidAlert.IsHardStop.Should().BeTrue();
    }

    [Fact]
    public void ClinicalDecisionSupport_DrugDiseaseInteractions_FlagsContraindications()
    {
        var candidates = new List<PrescriptionCandidate>
        {
            new() { GenericName = "Naproxen", Dosage = "500mg" },
            new() { GenericName = "Propranolol", Dosage = "40mg" }
        };

        var activeProblems = new List<PatientMedicalHistory>
        {
            new()
            {
                TenantId = TenantId,
                ClinicId = _clinicId,
                PatientId = Guid.NewGuid(),
                Icd10Code = "K25.0",
                ConditionTitle = "Acute gastric ulcer with hemorrhage",
                Status = ProblemStatus.Active,
                RecordedByStaffId = Guid.NewGuid(),
                RecordedByStaffName = "Dr. Rizal"
            },
            new()
            {
                TenantId = TenantId,
                ClinicId = _clinicId,
                PatientId = Guid.NewGuid(),
                Icd10Code = "J45.909",
                ConditionTitle = "Bronchial Asthma",
                Status = ProblemStatus.Active,
                RecordedByStaffId = Guid.NewGuid(),
                RecordedByStaffName = "Dr. Rizal"
            }
        };

        var alerts = ClinicalDecisionSupportEvaluator.Evaluate(
            candidates: candidates,
            activeProblems: activeProblems
        );

        // Naproxen in Peptic Ulcer
        var pudAlert = alerts.FirstOrDefault(a => a.Type == CdsAlertType.DrugDiseaseInteraction && a.OffendingDrug.Contains("Naproxen"));
        pudAlert.Should().NotBeNull();
        pudAlert!.Severity.Should().Be(CdsAlertSeverity.Critical);
        pudAlert.IsHardStop.Should().BeTrue();

        // Propranolol in Asthma
        var asthmaAlert = alerts.FirstOrDefault(a => a.Type == CdsAlertType.DrugDiseaseInteraction && a.OffendingDrug.Contains("Propranolol"));
        asthmaAlert.Should().NotBeNull();
        asthmaAlert!.Severity.Should().Be(CdsAlertSeverity.Critical);
        asthmaAlert.IsHardStop.Should().BeTrue();
    }
}
