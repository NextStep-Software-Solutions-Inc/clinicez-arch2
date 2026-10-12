using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.Queries;
using ClinicEz.Clinic.Application.Features.Procedures.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Verification Suite for Milestone M1 (Features 6-9):
/// 1. Yakap Claim Readiness pre-flight validator edge cases (PAN, PRC, symptom code 38 pain site,
///    symptom code X other complaint, 9-system physical exam completeness, PDEA S2 license).
/// 2. Closed-loop procedure queue handoffs (InConsultation -> PendingProcedure -> ReEvaluation -> InConsultation -> Completed).
/// 3. RoomOrStation queue filtering across views ("All", "MyRoom", "WaitingForDoctor", "Triage", "PendingProcedure", and aliases).
/// 4. Multi-tenant isolation across all features.
/// </summary>
public class ChallengerM1Features6To9Tests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_challenger_m1_2";

    public ChallengerM1Features6To9Tests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    private (ConsultationEncounter Encounter, StaffMember Doctor, ClinicPatient Patient, TriageVitals Vitals) CreateBaseline(
        Guid encounterId, Guid doctorId, Guid patientId)
    {
        var doctor = new StaffMember
        {
            Id = doctorId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Jose",
            LastName = "Rizal",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-1234567",
            PhilHealthPan = "PAN-1234567890",
            S2LicenseNumber = "S2-998877"
        };

        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-CHAL",
            FirstName = "Andres",
            LastName = "Bonifacio",
            ContactNumber = "09181234567",
            PhilHealthNumber = "12-345678901-8"
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            DoctorId = doctorId,
            PatientName = "Andres Bonifacio",
            DoctorName = "Dr. Jose Rizal",
            DoctorPhilHealthPan = "PAN-1234567890",
            DoctorPrcLicense = "PRC-1234567",
            DoctorS2License = "S2-998877",
            PhilHealthAtc = "ATC-KONSULTA-01",
            PhilHealthSignSympCode = "01", // Fever
            GeneralSurveyId = "1", // Essentially Normal
            Diagnoses = new List<EncounterDiagnosis>
            {
                new() { Id = Guid.NewGuid(), Icd10Code = "J00", Description = "Acute nasopharyngitis", IsPrimary = true }
            },
            Prescriptions = new List<PrescriptionItem>
            {
                new() { Id = Guid.NewGuid(), GenericName = "Paracetamol", Dosage = "500mg", Form = "Tablet", Sig = "1 tab TID PO", PhilHealthDrugCode = "DRUG00000000000000000000000001" }
            }
        };

        var findings = new NineSystemPhysicalExamFindings();
        encounter.SetPhysicalExamFindings(findings);

        var vitals = new TriageVitals
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 72,
            RespiratoryRateBreathsPerMin = 16,
            TemperatureCelsius = 36.6m,
            HeightCm = 170,
            WeightKg = 68,
            RecordedAt = DateTime.UtcNow
        };

        return (encounter, doctor, patient, vitals);
    }

    #region Feature 7: Yakap Claim Readiness Pre-Flight Validator

    [Fact]
    public async Task YakapReadiness_MissingDoctorPan_OnEncounterAndDoctor_FailsWithDescriptiveError()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        encounter.DoctorPhilHealthPan = null;
        doctor.PhilHealthPan = null;

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.IsReady.Should().BeFalse();
        result.DoctorPanValid.Should().BeFalse();
        result.MissingFields.Should().Contain(m => m.Contains("Doctor PhilHealth Accreditation Number (PAN) is missing"));
    }

    [Fact]
    public async Task YakapReadiness_MissingEncounterPan_FallsBackToDoctorPan()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        encounter.DoctorPhilHealthPan = "   "; // Whitespace on encounter
        doctor.PhilHealthPan = "PAN-FALLBACK-999";

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.DoctorPanValid.Should().BeTrue();
    }

    [Fact]
    public async Task YakapReadiness_MissingDoctorPrc_OnEncounterAndDoctor_FailsWithDescriptiveError()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        encounter.DoctorPrcLicense = "   ";
        doctor.PrcLicenseNumber = null;

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.IsReady.Should().BeFalse();
        result.DoctorPrcValid.Should().BeFalse();
        result.MissingFields.Should().Contain(m => m.Contains("Doctor PRC License Number is missing"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task YakapReadiness_SymptomCode38_Pain_MissingPainSite_Fails(string? painSite)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        encounter.PhilHealthSignSympCode = "38"; // PAIN
        encounter.PhilHealthPainSite = painSite;

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.IsReady.Should().BeFalse();
        result.SymptomsValid.Should().BeFalse();
        result.MissingFields.Should().Contain(m => m.Contains("pain site description is missing for chief complaint code '38' (PAIN)"));
    }

    [Fact]
    public async Task YakapReadiness_SymptomCode38_Pain_WithValidPainSite_Passes()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        encounter.PhilHealthSignSympCode = "38";
        encounter.PhilHealthPainSite = "Right lower quadrant abdominal pain with tenderness";

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.SymptomsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("X", null)]
    [InlineData("X", "")]
    [InlineData("X", "   ")]
    [InlineData("OTHERS", null)]
    [InlineData("others", "")]
    public async Task YakapReadiness_SymptomCodeX_Others_MissingOtherComplaint_Fails(string code, string? otherComplaint)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        encounter.PhilHealthSignSympCode = code;
        encounter.PhilHealthOtherComplaint = otherComplaint;

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.IsReady.Should().BeFalse();
        result.SymptomsValid.Should().BeFalse();
        result.MissingFields.Should().Contain(m => m.Contains("other complaint description is missing for chief complaint code 'X' (OTHERS)"));
    }

    [Fact]
    public async Task YakapReadiness_SymptomCodeX_Others_WithValidOtherComplaint_Passes()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        encounter.PhilHealthSignSympCode = "X";
        encounter.PhilHealthOtherComplaint = "Persistent intractable hiccups for 3 days";

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.SymptomsValid.Should().BeTrue();
    }

    [Fact]
    public async Task YakapReadiness_PhysicalExam_MissingFindingsObject_Fails()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        encounter.PhysicalExamFindingsJson = null; // No PE checklist performed

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.IsReady.Should().BeFalse();
        result.PhysicalExamComplete.Should().BeFalse();
        result.MissingFields.Should().Contain(m => m.Contains("9-System Physical Examination checklist is incomplete"));
    }

    [Fact]
    public async Task YakapReadiness_PhysicalExam_AbnormalGeneralSurvey_MissingRemarks_Fails()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        encounter.GeneralSurveyId = "2"; // Abnormal
        encounter.GeneralSurveyRemarks = null; // Missing mandatory remarks

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.IsReady.Should().BeFalse();
        result.GeneralSurveyValid.Should().BeFalse();
        result.PhysicalExamComplete.Should().BeFalse();
        result.MissingFields.Should().Contain(m => m.Contains("General Survey remarks are mandatory when marked abnormal"));
    }

    [Theory]
    [InlineData("Skin", "Skin finding")]
    [InlineData("Heent", "HEENT finding")]
    [InlineData("Chest", "Chest finding")]
    [InlineData("Heart", "Heart finding")]
    [InlineData("Abdomen", "Abdomen finding")]
    [InlineData("Neuro", "Neurological finding")]
    [InlineData("Rectal", "Rectal finding")]
    [InlineData("Gu", "Genitourinary finding")]
    [InlineData("Musculoskeletal", "Musculoskeletal finding")]
    public async Task YakapReadiness_PhysicalExam_All9Systems_AbnormalWithoutRemarks_FailsIndividually(string systemName, string expectedErrorPhrase)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        var pe = new NineSystemPhysicalExamFindings();
        switch (systemName)
        {
            case "Skin": pe.Skin.IsNormal = false; pe.Skin.Remarks = null; break;
            case "Heent": pe.Heent.IsNormal = false; pe.Heent.Remarks = null; break;
            case "Chest": pe.Chest.IsNormal = false; pe.Chest.Remarks = null; break;
            case "Heart": pe.Heart.IsNormal = false; pe.Heart.Remarks = null; break;
            case "Abdomen": pe.Abdomen.IsNormal = false; pe.Abdomen.Remarks = null; break;
            case "Neuro": pe.Neuro.IsNormal = false; pe.Neuro.Remarks = null; break;
            case "Rectal": pe.Rectal.IsNormal = false; pe.Rectal.Remarks = null; break;
            case "Gu": pe.Gu.IsNormal = false; pe.Gu.Remarks = null; break;
            case "Musculoskeletal": pe.Musculoskeletal.IsNormal = false; pe.Musculoskeletal.Remarks = null; break;
        }
        encounter.SetPhysicalExamFindings(pe);

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.IsReady.Should().BeFalse();
        result.PhysicalExamComplete.Should().BeFalse();
        result.MissingFields.Should().Contain(m => m.Contains(expectedErrorPhrase));
    }

    [Fact]
    public async Task YakapReadiness_PhysicalExam_AbnormalSystemWithValidRemarks_Passes()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        var pe = new NineSystemPhysicalExamFindings();
        pe.Chest.IsNormal = false;
        pe.Chest.Remarks = "Bilateral expiratory wheezing; no crackles";
        encounter.SetPhysicalExamFindings(pe);

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.PhysicalExamComplete.Should().BeTrue();
    }

    [Fact]
    public async Task YakapReadiness_DangerousDrug_WithoutDoctorS2License_Fails()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        encounter.DoctorS2License = null;
        doctor.S2LicenseNumber = null;
        encounter.Prescriptions.Add(new PrescriptionItem
        {
            Id = Guid.NewGuid(),
            GenericName = "Morphine Sulfate",
            Dosage = "10mg",
            Form = "Tablet",
            Sig = "1 tab Q4H PRN pain",
            IsDangerousDrug = true,
            PhilHealthDrugCode = "DRUG00000000000000000000000002"
        });

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.IsReady.Should().BeFalse();
        result.S2LicenseValid.Should().BeFalse();
        result.MissingFields.Should().Contain(m => m.Contains("PDEA controlled drug, but Doctor S2 License number is missing"));
    }

    [Fact]
    public async Task YakapReadiness_DangerousDrug_WithDoctorEntityS2License_Passes()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var patId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, docId, patId);

        encounter.DoctorS2License = null; // null on encounter snapshot
        doctor.S2LicenseNumber = "S2-VALID-4567"; // present on doctor profile
        encounter.Prescriptions.Add(new PrescriptionItem
        {
            Id = Guid.NewGuid(),
            GenericName = "Fentanyl Citrate",
            Dosage = "50mcg",
            Form = "Ampule",
            Sig = "IV as directed",
            IsDangerousDrug = true,
            PhilHealthDrugCode = "DRUG00000000000000000000000003"
        });

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        result.S2LicenseValid.Should().BeTrue();
    }

    [Fact]
    public async Task YakapReadiness_CrossClinicTenantIsolation_ThrowsNotFound()
    {
        var otherClinicId = Guid.NewGuid();
        var otherClinicContext = Substitute.For<IClinicContext>();
        otherClinicContext.ClinicId.Returns(otherClinicId);
        otherClinicContext.TenantId.Returns("other_tenant");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, Guid.NewGuid(), Guid.NewGuid());

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        // Attempt to query using other clinic context
        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, otherClinicContext);
        var act = () => handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    #endregion

    #region Feature 8: Closed-Loop Procedure Queue Transitions

    [Fact]
    public async Task ClosedLoop_FullLifecycle_FromInConsultationToCompleted()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-100",
            SequenceNumber = 100,
            QueueDate = today,
            PatientId = patientId,
            PatientName = "Emilio Aguinaldo",
            DoctorId = doctorId,
            DoctorName = "Dr. Jose Rizal",
            RoomOrStation = "Exam Room 1",
            Status = QueueStatus.InConsultation
        };
        await queueRepo.AddAsync(queueItem, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var orderHandler = new OrderProcedureCommandHandler(procRepo, uow, _clinicContext, queueRepo);
        var recordHandler = new RecordProcedureExecutionCommandHandler(procRepo, uow, _clinicContext, queueRepo);
        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, _clinicContext);
        var completeHandler = new CompleteQueueItemCommandHandler(queueRepo, uow, _clinicContext);

        // Stage 1: Doctor orders procedure during consult -> Transitions to PendingProcedure
        var orderCmd = new OrderProcedureCommand(
            PatientId: patientId,
            PatientName: "Emilio Aguinaldo",
            QueueItemId: queueItem.Id,
            ProcedureName: "Wound Debridement & Dressing",
            Category: "Surgical",
            OrderedByDoctorId: doctorId,
            OrderedByDoctorName: "Dr. Jose Rizal"
        );
        var procDto = await orderHandler.Handle(orderCmd, CancellationToken.None);

        var pendingItem = await queueRepo.Query(q => q.Id == queueItem.Id).FirstOrDefaultAsync();
        pendingItem!.Status.Should().Be(QueueStatus.PendingProcedure);

        // Stage 2: Nurse performs procedure at procedure bay -> Transitions to ReEvaluation
        var execCmd = new RecordProcedureExecutionCommand(
            ProcedureId: procDto.Id,
            PerformedByStaffName: "Nurse Trining",
            ClinicalNotes: "Wound irrigated with NSS and dressed with sterile gauze."
        );
        await recordHandler.Handle(execCmd, CancellationToken.None);

        var reEvalItem = await queueRepo.Query(q => q.Id == queueItem.Id).FirstOrDefaultAsync();
        reEvalItem!.Status.Should().Be(QueueStatus.ReEvaluation);

        // Stage 3: Doctor re-calls patient back into consultation room -> Returns to InConsultation
        var callCmd = new CallQueueItemCommand(queueItem.Id, doctorId, "Dr. Jose Rizal", "Exam Room 1");
        await callHandler.Handle(callCmd, CancellationToken.None);

        var calledItem = await queueRepo.Query(q => q.Id == queueItem.Id).FirstOrDefaultAsync();
        calledItem!.Status.Should().Be(QueueStatus.InConsultation);

        // Stage 4: Doctor finishes encounter -> Transitions to Completed
        var completeCmd = new CompleteQueueItemCommand(queueItem.Id);
        await completeHandler.Handle(completeCmd, CancellationToken.None);

        var completedItem = await queueRepo.Query(q => q.Id == queueItem.Id).FirstOrDefaultAsync();
        completedItem!.Status.Should().Be(QueueStatus.Completed);
    }

    [Fact]
    public async Task ClosedLoop_OrderProcedure_DoesNotRegressCompletedOrCancelledItem()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var completedItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-101",
            SequenceNumber = 101,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = Guid.NewGuid(),
            PatientName = "Completed Patient",
            Status = QueueStatus.Completed
        };
        var cancelledItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-102",
            SequenceNumber = 102,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = Guid.NewGuid(),
            PatientName = "Cancelled Patient",
            Status = QueueStatus.Cancelled
        };

        await queueRepo.AddAsync(completedItem, CancellationToken.None);
        await queueRepo.AddAsync(cancelledItem, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var orderHandler = new OrderProcedureCommandHandler(procRepo, uow, _clinicContext, queueRepo);

        // Act 1: Order for completed item
        await orderHandler.Handle(new OrderProcedureCommand(
            PatientId: completedItem.PatientId,
            PatientName: completedItem.PatientName,
            QueueItemId: completedItem.Id,
            ProcedureName: "Post-consult IV"
        ), CancellationToken.None);

        // Act 2: Order for cancelled item
        await orderHandler.Handle(new OrderProcedureCommand(
            PatientId: cancelledItem.PatientId,
            PatientName: cancelledItem.PatientName,
            QueueItemId: cancelledItem.Id,
            ProcedureName: "Cancelled procedure"
        ), CancellationToken.None);

        var checkCompleted = await queueRepo.Query(q => q.Id == completedItem.Id).FirstOrDefaultAsync();
        var checkCancelled = await queueRepo.Query(q => q.Id == cancelledItem.Id).FirstOrDefaultAsync();

        checkCompleted!.Status.Should().Be(QueueStatus.Completed, "Completed queue item must not be overwritten by procedure order");
        checkCancelled!.Status.Should().Be(QueueStatus.Cancelled, "Cancelled queue item must not be overwritten by procedure order");
    }

    [Fact]
    public async Task ClosedLoop_QueueMetrics_CorrectlyAccountsForPendingProcedureAndReEvaluation()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var items = new[]
        {
            new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", SequenceNumber = 1, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting },
            new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-2", SequenceNumber = 2, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Triaged },
            new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-3", SequenceNumber = 3, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P3", Status = QueueStatus.InConsultation },
            new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-4", SequenceNumber = 4, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P4", Status = QueueStatus.PendingProcedure },
            new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-5", SequenceNumber = 5, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P5", Status = QueueStatus.ReEvaluation },
            new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-6", SequenceNumber = 6, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P6", Status = QueueStatus.Completed },
            new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-7", SequenceNumber = 7, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P7", Status = QueueStatus.Cancelled },
        };

        foreach (var itm in items)
        {
            await queueRepo.AddAsync(itm, CancellationToken.None);
        }
        await uow.SaveChangesAsync(CancellationToken.None);

        var metricsHandler = new GetQueueMetricsQueryHandler(queueRepo, _clinicContext);
        var metrics = await metricsHandler.Handle(new GetQueueMetricsQuery(today), CancellationToken.None);

        // Active queue count must include Waiting (1) + Triaged (1) + InConsultation (1) + PendingProcedure (1) + ReEvaluation (1) = 5
        metrics.InQueue.Should().Be(5);
        metrics.CompletedToday.Should().Be(1);
        metrics.TotalCheckedIn.Should().Be(7);
    }

    #endregion

    #region Feature 9: RoomOrStation Queue Filtering & View Filters

    [Fact]
    public async Task RoomOrStationFiltering_IsolatesStationsAccurately()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var docA = Guid.NewGuid();
        var docB = Guid.NewGuid();

        var item1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-201",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Room 1",
            DoctorId = docA,
            DoctorName = "Dr. Santos",
            RoomOrStation = "Exam Room 1",
            Status = QueueStatus.Triaged
        };
        var item2 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-202",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Room 2",
            DoctorId = docB,
            DoctorName = "Dr. Reyes",
            RoomOrStation = "Exam Room 2",
            Status = QueueStatus.Triaged
        };
        var item3 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-203",
            SequenceNumber = 3,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Triage Station",
            RoomOrStation = "Triage Station A",
            Status = QueueStatus.Waiting
        };

        await queueRepo.AddAsync(item1, CancellationToken.None);
        await queueRepo.AddAsync(item2, CancellationToken.None);
        await queueRepo.AddAsync(item3, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // Filter RoomOrStation = "Exam Room 1"
        var room1Results = await handler.Handle(new GetQueueQuery(RoomOrStation: "Exam Room 1"), CancellationToken.None);
        room1Results.Should().HaveCount(1);
        room1Results[0].PatientName.Should().Be("Patient Room 1");

        // Filter RoomOrStation = "Triage Station A"
        var triageStationResults = await handler.Handle(new GetQueueQuery(RoomOrStation: "Triage Station A"), CancellationToken.None);
        triageStationResults.Should().HaveCount(1);
        triageStationResults[0].PatientName.Should().Be("Patient Triage Station");

        // Combined Filter: Doctor B AND Room 2
        var combinedResults = await handler.Handle(new GetQueueQuery(DoctorId: docB, RoomOrStation: "Exam Room 2"), CancellationToken.None);
        combinedResults.Should().HaveCount(1);
        combinedResults[0].PatientName.Should().Be("Patient Room 2");

        // Mismatched Filter: Doctor A AND Room 2 -> Should return 0
        var mismatched = await handler.Handle(new GetQueueQuery(DoctorId: docA, RoomOrStation: "Exam Room 2"), CancellationToken.None);
        mismatched.Should().BeEmpty();
    }

    [Fact]
    public async Task ViewFiltering_StandardContractViews_FilterAccurately()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var qWaiting = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", SequenceNumber = 1, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Waiting Pat", Status = QueueStatus.Waiting };
        var qTriaged = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-2", SequenceNumber = 2, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Triaged Pat", Status = QueueStatus.Triaged };
        var qProc = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-3", SequenceNumber = 3, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Proc Pat", Status = QueueStatus.PendingProcedure };
        var qReEval = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-4", SequenceNumber = 4, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "ReEval Pat", Status = QueueStatus.ReEvaluation };
        var qCompleted = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-5", SequenceNumber = 5, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Completed Pat", Status = QueueStatus.Completed };
        var qCancelled = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-6", SequenceNumber = 6, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Cancelled Pat", Status = QueueStatus.Cancelled };

        await queueRepo.AddAsync(qWaiting, CancellationToken.None);
        await queueRepo.AddAsync(qTriaged, CancellationToken.None);
        await queueRepo.AddAsync(qProc, CancellationToken.None);
        await queueRepo.AddAsync(qReEval, CancellationToken.None);
        await queueRepo.AddAsync(qCompleted, CancellationToken.None);
        await queueRepo.AddAsync(qCancelled, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // View: "All" -> includes Completed but still excludes nothing
        var allView = await handler.Handle(new GetQueueQuery(View: "All"), CancellationToken.None);
        allView.Should().HaveCount(6);

        // View: "Triage" -> only Waiting
        var triageView = await handler.Handle(new GetQueueQuery(View: "Triage"), CancellationToken.None);
        triageView.Select(q => q.PatientName).Should().BeEquivalentTo(new[] { "Waiting Pat" });

        // View: "WaitingForDoctor" -> Triaged + ReEvaluation
        var waitingDocView = await handler.Handle(new GetQueueQuery(View: "WaitingForDoctor"), CancellationToken.None);
        waitingDocView.Select(q => q.PatientName).Should().BeEquivalentTo(new[] { "Triaged Pat", "ReEval Pat" });

        // View: "PendingProcedure" -> only PendingProcedure
        var procView = await handler.Handle(new GetQueueQuery(View: "PendingProcedure"), CancellationToken.None);
        procView.Select(q => q.PatientName).Should().BeEquivalentTo(new[] { "Proc Pat" });

        // View: "MyRoom" -> Active items excluding Cancelled and NoShow
        var myRoomView = await handler.Handle(new GetQueueQuery(View: "MyRoom"), CancellationToken.None);
        myRoomView.Select(q => q.PatientName).Should().NotContain("Cancelled Pat");
    }

    [Fact]
    public async Task ViewFiltering_KebabCaseOrAliasViews_EmpiricalBehaviorRecorded()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var qProc = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-30", SequenceNumber = 30, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Proc Pat", Status = QueueStatus.PendingProcedure };
        var qWait = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-31", SequenceNumber = 31, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Wait Pat", Status = QueueStatus.Waiting };
        var qCancelled = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-32", SequenceNumber = 32, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Cancelled Pat", Status = QueueStatus.Cancelled };

        await queueRepo.AddAsync(qProc, CancellationToken.None);
        await queueRepo.AddAsync(qWait, CancellationToken.None);
        await queueRepo.AddAsync(qCancelled, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // Empirical check: When caller passes kebab-case view "procedures" (as mentioned in handoff line 59)
        // instead of "PendingProcedure", it does not match the if-else branch and returns all records without status filter.
        var proceduresView = await handler.Handle(new GetQueueQuery(View: "procedures"), CancellationToken.None);
        
        // This empirically captures that "procedures" is unhandled and returns all items:
        proceduresView.Should().HaveCount(3, "Unrecognized view 'procedures' does not match 'PendingProcedure', returning all items without status filter");
    }

    [Fact]
    public async Task QueueQuery_MultiTenantIsolation_EnforcesStrictSeparation()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var clinicAItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-A",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Clinic A Patient",
            Status = QueueStatus.Waiting
        };

        var otherClinicId = Guid.NewGuid();
        var clinicBItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_b",
            ClinicId = otherClinicId,
            QueueNumber = "Q-B",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Clinic B Patient",
            Status = QueueStatus.Waiting
        };

        await queueRepo.AddAsync(clinicAItem, CancellationToken.None);
        await queueRepo.AddAsync(clinicBItem, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);
        var results = await handler.Handle(new GetQueueQuery(Date: today), CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].PatientName.Should().Be("Clinic A Patient");
        results[0].ClinicId.Should().Be(_clinicId);
    }

    [Fact]
    public async Task YakapReadiness_SymptomCode_LowercaseX_DemonstratesCaseSensitivityEdgeCase()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, Guid.NewGuid(), Guid.NewGuid());

        encounter.PhilHealthSignSympCode = "x"; // Lowercase x
        encounter.PhilHealthOtherComplaint = null; // Missing complaint

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        // Empirical proof: because code == "X" is ordinal case-sensitive, lowercase "x" skips the other complaint check!
        result.SymptomsValid.Should().BeTrue("Demonstrates that lowercase 'x' bypasses the case-sensitive check (code == 'X')");
    }

    [Fact]
    public async Task YakapReadiness_SymptomCode_MultiCodeString_DemonstratesDelimiterEdgeCase()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);

        var encId = Guid.NewGuid();
        var (encounter, doctor, patient, vitals) = CreateBaseline(encId, Guid.NewGuid(), Guid.NewGuid());

        encounter.PhilHealthSignSympCode = "01,38"; // Multi-code symptom containing pain code 38
        encounter.PhilHealthPainSite = null; // Missing pain site

        await consultRepo.AddAsync(encounter, CancellationToken.None);
        await staffRepo.AddAsync(doctor, CancellationToken.None);
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await vitalsRepo.AddAsync(vitals, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ValidateConsultationYakapReadinessQueryHandler(consultRepo, patientRepo, staffRepo, vitalsRepo, _clinicContext);
        var result = await handler.Handle(new ValidateConsultationYakapReadinessQuery(encId), CancellationToken.None);

        // Empirical proof: because code == "38" checks full string equality, multi-code "01,38" skips the pain site check!
        result.SymptomsValid.Should().BeTrue("Demonstrates that multi-code string '01,38' bypasses string equality check (code == '38')");
    }

    [Theory]
    [InlineData("my-station")]
    [InlineData("my-patients")]
    public async Task ViewFiltering_KebabCaseViews_MyStationAndMyPatients_DemonstratesFallbackBehavior(string viewName)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var qProc = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-40", SequenceNumber = 40, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Proc Pat", Status = QueueStatus.PendingProcedure };
        var qWait = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-41", SequenceNumber = 41, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Wait Pat", Status = QueueStatus.Waiting };

        await queueRepo.AddAsync(qProc, CancellationToken.None);
        await queueRepo.AddAsync(qWait, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);
        var results = await handler.Handle(new GetQueueQuery(View: viewName), CancellationToken.None);

        // Empirical proof: kebab-case view is not matched by if-else branches, returning all records
        results.Should().HaveCount(2, $"Unrecognized view '{viewName}' falls through without status filter");
    }

    #endregion
}
