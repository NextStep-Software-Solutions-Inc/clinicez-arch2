using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class PatientMedicalHistoryTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-test";
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;

    public PatientMedicalHistoryTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
    }

    [Fact]
    public async Task SavePatientMedicalHistories_PersistsToRelationalTableAndUpdatesPatient()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var medicalRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0001",
            FirstName = "John",
            LastName = "Doe",
            ContactNumber = "09171234567",
            DateOfBirth = new DateOnly(1990, 1, 1)
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var handler = new SavePatientMedicalHistoriesCommandHandler(patientRepo, medicalRepo, uow, _clinicContext);

        var request = new SavePatientMedicalHistoriesCommand(
            patientId,
            new List<MedicalHistoryEntryItem>
            {
                new("Hypertension", "011", "I10", null, new DateOnly(2020, 5, 1), false, "Well-controlled on amlodipine"),
                new("Asthma", "002", "J45", null, null, false, "Mild intermittent"),
                new("Others", "998", null, "Systemic Lupus Erythematosus", null, false, "Diagnosed in 2022")
            },
            "Patient has chronic cardiovascular and autoimmune conditions."
        );

        var result = await handler.Handle(request, CancellationToken.None);

        result.Items.Should().HaveCount(3);
        result.PersonalMedicalHistoryNotes.Should().Be("Patient has chronic cardiovascular and autoimmune conditions.");

        var savedInDb = medicalRepo.Query(m => m.PatientId == patientId).ToList();
        savedInDb.Should().HaveCount(3);
        savedInDb.Should().Contain(m => m.PhilHealthMdiseaseCode == "011" && m.ConditionTitle == "Hypertension");
        savedInDb.Should().Contain(m => m.PhilHealthMdiseaseCode == "002" && m.ConditionTitle == "Asthma");
        savedInDb.Should().Contain(m => m.PhilHealthMdiseaseCode == "998" && m.SpecificDescription == "Systemic Lupus Erythematosus");

        var updatedPatient = patientRepo.Query(p => p.Id == patientId).First();
        updatedPatient.Should().NotBeNull();
    }

    [Fact]
    public async Task GetPatientMedicalHistory_ReturnsStructuredEntriesAndNotes()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var medicalRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0002",
            FirstName = "Jane",
            LastName = "Smith",
            ContactNumber = "09181234567",
            DateOfBirth = new DateOnly(1985, 3, 15)
        };
        await patientRepo.AddAsync(patient);

        var med = new PatientMedicalHistory
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConditionTitle = "Asthma",
            PhilHealthMdiseaseCode = "002",
            Icd10Code = "J45",
            Status = ProblemStatus.Resolved,
            ClinicalNotes = "Resolved since age 12",
            CreatedBy = "Doctor1"
        };
        await medicalRepo.AddAsync(med);
        await uow.SaveChangesAsync();

        var queryHandler = new GetPatientMedicalHistoryQueryHandler(patientRepo, medicalRepo);
        var result = await queryHandler.Handle(new GetPatientMedicalHistoryQuery(patientId), CancellationToken.None);

        result.Items.Should().HaveCount(1);
        result.Items[0].ConditionTitle.Should().Be("Asthma");
        result.Items[0].IsResolved.Should().BeTrue();
        result.PersonalMedicalHistoryNotes.Should().BeNull();
    }

    [Fact]
    public async Task SavePatientFamilyHistories_PersistsToRelationalTableAndUpdatesPatientNotes()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var familyRepo = TestDbHelper.CreateRepository<PatientFamilyHistory>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0003",
            FirstName = "Carlos",
            LastName = "Garcia",
            ContactNumber = "09191234567",
            DateOfBirth = new DateOnly(1978, 6, 20)
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var handler = new SavePatientFamilyHistoriesCommandHandler(patientRepo, familyRepo, uow, _clinicContext);

        var request = new SavePatientFamilyHistoriesCommand(
            patientId,
            new List<FamilyHistoryEntryItem>
            {
                new("Diabetes Mellitus", "006", "E11", null, "Mother", "Onset at age 52"),
                new("Coronary Artery Disease", "005", "I25", null, "Father", "Myocardial infarction at 58"),
                new("Others", "998", null, "Familial Hypercholesterolemia", "Maternal Uncle", "High LDL cholesterol")
            },
            "Strong maternal history of T2D and paternal cardiovascular events."
        );

        var result = await handler.Handle(request, CancellationToken.None);

        result.Items.Should().HaveCount(3);
        result.FamilyMedicalHistoryNotes.Should().Be("Strong maternal history of T2D and paternal cardiovascular events.");

        var savedInDb = familyRepo.Query(f => f.PatientId == patientId).ToList();
        savedInDb.Should().HaveCount(3);
        savedInDb.Should().Contain(f => f.PhilHealthMdiseaseCode == "006" && f.Relationship == FamilyRelationship.Mother);
        savedInDb.Should().Contain(f => f.PhilHealthMdiseaseCode == "005" && f.Relationship == FamilyRelationship.Father);
        savedInDb.Should().Contain(f => f.PhilHealthMdiseaseCode == "998" && f.SpecificDescription == "Familial Hypercholesterolemia");

        var updatedPatient = patientRepo.Query(p => p.Id == patientId).First();
        updatedPatient.Should().NotBeNull();
    }

    [Fact]
    public async Task RegisterPatient_WithStructuredMedicalHistories_PersistsToRelationalTableAndComputesChronicConditionsSummary()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var medicalRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(context, sieve);

        var handler = new RegisterClinicPatientCommandHandler(
            patientRepo,
            uow,
            _clinicContext,
            allergyRepo: null,
            queueRepo: null,
            medicalRepo: medicalRepo);

        var command = new RegisterClinicPatientCommand(
            "Maria",
            "Santos",
            "Cruz",
            null,
            new DateOnly(1985, 3, 15),
            "Female",
            "Married",
            "09179876543",
            "maria.santos@example.com",
            "123 Main St",
            "Barangay 1",
            "Makati",
            "Metro Manila",
            null,
            null,
            null,
            null,
            null,
            null,
            "O+",
            null,
            null,
            "High Fall Risk",
            MedicalHistories: new List<MedicalHistoryEntryDto>
            {
                new("Hypertension", "011", "I10", null, new DateOnly(2021, 1, 10), false, "On Maintenance"),
                new("Diabetes Mellitus", "006", "E11", null, new DateOnly(2022, 6, 20), false, "Diet controlled"),
                new("Others", "998", null, "Chronic Kidney Disease Stage 3", null, false, "eGFR 45")
            });

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.FirstName.Should().Be("Maria");
        result.LastName.Should().Be("Santos");
        result.Alerts.Should().Be("High Fall Risk");
        result.ChronicConditions.Should().Contain("Hypertension");
        result.ChronicConditions.Should().Contain("Diabetes Mellitus");
        result.ChronicConditions.Should().Contain("Chronic Kidney Disease Stage 3");

        result.PastMedicalHistories.Should().NotBeNull();
        result.PastMedicalHistories.Should().HaveCount(3);
        result.PastMedicalHistories!.Should().Contain(m => m.PhilHealthMdiseaseCode == "011" && m.ConditionTitle == "Hypertension");
        result.PastMedicalHistories!.Should().Contain(m => m.PhilHealthMdiseaseCode == "006" && m.ConditionTitle == "Diabetes Mellitus");
        result.PastMedicalHistories!.Should().Contain(m => m.PhilHealthMdiseaseCode == "998" && m.SpecificDescription == "Chronic Kidney Disease Stage 3");

        var dbHistories = medicalRepo.Query(m => m.PatientId == result.Id).ToList();
        dbHistories.Should().HaveCount(3);
        dbHistories.Should().Contain(m => m.PhilHealthMdiseaseCode == "011" && m.ClinicalNotes == "On Maintenance");
    }

    [Fact]
    public async Task UpdatePatient_WithStructuredMedicalHistories_SyncsRelationalTableAndUpdatesDto()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var medicalRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0099",
            FirstName = "Pedro",
            LastName = "Penduko",
            ContactNumber = "09181112233",
            DateOfBirth = new DateOnly(1975, 5, 20),
            Gender = Gender.Male
        };
        patient.Alerts.Add(new PatientAlert
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            Category = PatientAlertCategory.FallRisk,
            Code = "FALL",
            Title = "High Fall Risk",
            Severity = PatientAlertSeverity.High,
            Status = PatientAlertStatus.Active
        });
        await patientRepo.AddAsync(patient);

        var existingHtn = new PatientMedicalHistory
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConditionTitle = "Hypertension",
            PhilHealthMdiseaseCode = "011",
            ClinicalNotes = "Old note"
        };
        var existingAsthma = new PatientMedicalHistory
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConditionTitle = "Asthma",
            PhilHealthMdiseaseCode = "002"
        };
        await medicalRepo.AddAsync(existingHtn);
        await medicalRepo.AddAsync(existingAsthma);
        await uow.SaveChangesAsync();

        var handler = new UpdateClinicPatientCommandHandler(
            patientRepo,
            uow,
            medicalRepo: medicalRepo,
            clinicContext: _clinicContext);

        // Update: update Hypertension notes, omit Asthma (should be deleted), add Diabetes Mellitus (new)
        var command = new UpdateClinicPatientCommand(
            patientId,
            "Pedro",
            "Penduko",
            null,
            null,
            new DateOnly(1975, 5, 20),
            "Male",
            "Single",
            "09181112233",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "High Fall Risk, Wheelchair Assist",
            MedicalHistories: new List<MedicalHistoryEntryDto>
            {
                new("Hypertension", "011", "I10", null, null, false, "Updated: controlled on losartan"),
                new("Diabetes Mellitus", "006", "E11", null, new DateOnly(2023, 1, 1), false, "Newly diagnosed")
            });

        var result = await handler.Handle(command, CancellationToken.None);

        result.Alerts.Should().Be("High Fall Risk, Wheelchair Assist");
        result.ChronicConditions.Should().Contain("Hypertension");
        result.ChronicConditions.Should().Contain("Diabetes Mellitus");
        result.ChronicConditions.Should().NotContain("Asthma");

        result.PastMedicalHistories.Should().NotBeNull();
        result.PastMedicalHistories.Should().HaveCount(2);
        result.PastMedicalHistories!.Should().Contain(m => m.PhilHealthMdiseaseCode == "011" && m.ClinicalNotes == "Updated: controlled on losartan");
        result.PastMedicalHistories!.Should().Contain(m => m.PhilHealthMdiseaseCode == "006" && m.ConditionTitle == "Diabetes Mellitus");
        result.PastMedicalHistories!.Should().NotContain(m => m.PhilHealthMdiseaseCode == "002");

        var dbHistories = medicalRepo.Query(m => m.PatientId == patientId).ToList();
        dbHistories.Should().HaveCount(2);
        dbHistories.Should().NotContain(m => m.PhilHealthMdiseaseCode == "002");
    }

    [Fact]
    public async Task UpdatePatient_WithMultipleCustomConditions_PersistsDistinctEntriesWithoutCollision()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var medicalRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0101",
            FirstName = "Juan",
            LastName = "Luna",
            ContactNumber = "09171234567",
            DateOfBirth = new DateOnly(1980, 1, 1),
            Gender = Gender.Male
        };
        await patientRepo.AddAsync(patient);

        var ckd = new PatientMedicalHistory
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConditionTitle = "Others",
            PhilHealthMdiseaseCode = "998",
            SpecificDescription = "Chronic Kidney Disease Stage 3",
            ClinicalNotes = "eGFR 45"
        };
        var gout = new PatientMedicalHistory
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConditionTitle = "Others",
            PhilHealthMdiseaseCode = "998",
            SpecificDescription = "Gout",
            ClinicalNotes = "Uric acid 8.5"
        };
        await medicalRepo.AddAsync(ckd);
        await medicalRepo.AddAsync(gout);
        await uow.SaveChangesAsync();

        var handler = new UpdateClinicPatientCommandHandler(
            patientRepo,
            uow,
            medicalRepo: medicalRepo,
            clinicContext: _clinicContext);

        // Update: keep CKD with updated note, keep Gout, add Hypothyroidism (new custom condition, code 998)
        var command = new UpdateClinicPatientCommand(
            patientId,
            "Juan",
            "Luna",
            null,
            null,
            new DateOnly(1980, 1, 1),
            "Male",
            "Single",
            "09171234567",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            MedicalHistories: new List<MedicalHistoryEntryDto>
            {
                new("Others", "998", null, "Chronic Kidney Disease Stage 3", null, false, "Updated: eGFR 48 on SGLT2i", Id: ckd.Id),
                new("Others", "998", null, "Gout", null, false, "Uric acid 8.5", Id: gout.Id),
                new("Others", "998", null, "Hypothyroidism", null, false, "Levothyroxine 50mcg", Id: null)
            });

        var result = await handler.Handle(command, CancellationToken.None);

        result.PastMedicalHistories.Should().NotBeNull();
        result.PastMedicalHistories.Should().HaveCount(3);
        result.PastMedicalHistories!.Should().Contain(m => m.Id == ckd.Id && m.ClinicalNotes == "Updated: eGFR 48 on SGLT2i");
        result.PastMedicalHistories!.Should().Contain(m => m.Id == gout.Id && m.SpecificDescription == "Gout");
        result.PastMedicalHistories!.Should().Contain(m => m.SpecificDescription == "Hypothyroidism");

        result.ChronicConditions.Should().Contain("Chronic Kidney Disease Stage 3");
        result.ChronicConditions.Should().Contain("Gout");
        result.ChronicConditions.Should().Contain("Hypothyroidism");

        var dbHistories = medicalRepo.Query(m => m.PatientId == patientId).ToList();
        dbHistories.Should().HaveCount(3);
        dbHistories.Should().Contain(m => m.SpecificDescription == "Chronic Kidney Disease Stage 3");
        dbHistories.Should().Contain(m => m.SpecificDescription == "Gout");
        dbHistories.Should().Contain(m => m.SpecificDescription == "Hypothyroidism");
    }

    [Fact]
    public async Task UpdatePatient_ClearingAllConditions_DeletesRelationalRecordsAndNullsChronicConditionsSummary()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var medicalRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0102",
            FirstName = "Clara",
            LastName = "Reyes",
            ContactNumber = "09170001122",
            DateOfBirth = new DateOnly(1995, 2, 2),
            Gender = Gender.Female
        };
        await patientRepo.AddAsync(patient);

        var htn = new PatientMedicalHistory
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConditionTitle = "Hypertension",
            PhilHealthMdiseaseCode = "011"
        };
        var asthma = new PatientMedicalHistory
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConditionTitle = "Asthma",
            PhilHealthMdiseaseCode = "002"
        };
        await medicalRepo.AddAsync(htn);
        await medicalRepo.AddAsync(asthma);
        await uow.SaveChangesAsync();

        var handler = new UpdateClinicPatientCommandHandler(
            patientRepo,
            uow,
            medicalRepo: medicalRepo,
            clinicContext: _clinicContext);

        // Cleared by clinician: empty list
        var command = new UpdateClinicPatientCommand(
            patientId,
            "Clara",
            "Reyes",
            null,
            null,
            new DateOnly(1995, 2, 2),
            "Female",
            "Single",
            "09170001122",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            MedicalHistories: new List<MedicalHistoryEntryDto>());

        var result = await handler.Handle(command, CancellationToken.None);

        result.PastMedicalHistories.Should().NotBeNull();
        result.PastMedicalHistories.Should().BeEmpty();
        result.ChronicConditions.Should().BeNull();

        var dbHistories = medicalRepo.Query(m => m.PatientId == patientId).ToList();
        dbHistories.Should().BeEmpty();

        var updatedPatient = patientRepo.Query(p => p.Id == patientId).First();
        updatedPatient.Should().NotBeNull();
    }
}
