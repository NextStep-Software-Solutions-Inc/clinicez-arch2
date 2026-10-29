using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class PatientPhysicalExamPersistenceTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-physical-exam";
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;
    private readonly IPhilHealthCatalogLookup _catalogLookup;

    public PatientPhysicalExamPersistenceTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
        _catalogLookup = PhilHealthCatalogLookup.FromBundledSeed();
    }

    [Fact]
    public async Task GetProfile_WhenNoPhysicalExamExists_ReturnsStatutoryNormalDefaults()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var medicalRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(context, sieve);
        var familyRepo = TestDbHelper.CreateRepository<PatientFamilyHistory>(context, sieve);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(context, sieve);
        var surgRepo = TestDbHelper.CreateRepository<PatientSurgicalHistory>(context, sieve);
        var socRepo = TestDbHelper.CreateRepository<PatientSocialHistory>(context, sieve);
        var reproRepo = TestDbHelper.CreateRepository<PatientReproductiveHistory>(context, sieve);
        var ncdRepo = TestDbHelper.CreateRepository<NcdRiskAssessment>(context, sieve);
        var peRepo = TestDbHelper.CreateRepository<PatientPhysicalExam>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-TEST-PE-01",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            Sex = BiologicalSex.Male,
            DateOfBirth = new DateOnly(1990, 5, 20),
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09171234567"
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var controller = new YakapPatientProfileController(
            patientRepo, vitalsRepo, medicalRepo, familyRepo, immRepo, socRepo, reproRepo, ncdRepo, uow, _clinicContext, _catalogLookup, peRepo);

        var actionResult = await controller.GetProfile(patientId, CancellationToken.None);
        var okResult = actionResult.Result as OkObjectResult;
        okResult.Should().NotBeNull();

        var response = okResult!.Value as ApiResponse<PhilHealthPatientProfileDto>;
        response.Should().NotBeNull();
        response!.Data.Should().NotBeNull();

        // Statutory normal codes:
        // lib_skin_extremities = "1", lib_heent = "11", lib_chest = "6", lib_heart = "5", lib_abdomen = "7", lib_neuro = "6", lib_digital_rectal = "1", lib_genitourinary = "1"
        response.Data!.SkinId.Should().Be("1");
        response.Data.SkinRemarks.Should().BeNull();
        response.Data.HeentId.Should().Be("11");
        response.Data.HeentRemarks.Should().BeNull();
        response.Data.ChestId.Should().Be("6");
        response.Data.ChestRemarks.Should().BeNull();
        response.Data.HeartId.Should().Be("5");
        response.Data.HeartRemarks.Should().BeNull();
        response.Data.AbdomenId.Should().Be("7");
        response.Data.AbdomenRemarks.Should().BeNull();
        response.Data.NeuroId.Should().Be("6");
        response.Data.NeuroRemarks.Should().BeNull();
        response.Data.RectalId.Should().Be("1");
        response.Data.RectalRemarks.Should().BeNull();
        response.Data.GuId.Should().Be("1");
        response.Data.GuRemarks.Should().BeNull();
        response.Data.GenSurveyId.Should().Be("1");
        response.Data.GenSurveyRemarks.Should().BeNull();
    }

    [Fact]
    public async Task UpdateProfile_DoesNotMutatePhysicalExamProfile()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var medicalRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(context, sieve);
        var familyRepo = TestDbHelper.CreateRepository<PatientFamilyHistory>(context, sieve);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(context, sieve);
        var surgRepo = TestDbHelper.CreateRepository<PatientSurgicalHistory>(context, sieve);
        var socRepo = TestDbHelper.CreateRepository<PatientSocialHistory>(context, sieve);
        var reproRepo = TestDbHelper.CreateRepository<PatientReproductiveHistory>(context, sieve);
        var ncdRepo = TestDbHelper.CreateRepository<NcdRiskAssessment>(context, sieve);
        var peRepo = TestDbHelper.CreateRepository<PatientPhysicalExam>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-TEST-PE-02",
            FirstName = "Maria",
            LastName = "Santos",
            Sex = BiologicalSex.Female,
            DateOfBirth = new DateOnly(1985, 3, 15),
            PhilHealthNumber = "99-123456789-0",
            ContactNumber = "09171234567"
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var controller = new YakapPatientProfileController(
            patientRepo, vitalsRepo, medicalRepo, familyRepo, immRepo, socRepo, reproRepo, ncdRepo, uow, _clinicContext, _catalogLookup, peRepo);

        var updateDto = new PhilHealthPatientProfileDto
        {
            Pin = "99-123456789-0",
            SkinId = "2",
            SkinRemarks = "Clubbing of fingers present",
            HeentId = "5",
            HeentRemarks = "Exudative pharyngitis and cervical adenopathy",
        };

        var updateResult = await controller.UpdateProfile(patientId, updateDto, CancellationToken.None);
        var okUpdate = updateResult.Result as OkObjectResult;
        okUpdate.Should().NotBeNull();

        // Physical examination mutation was decoupled from YakapPatientProfileController,
        // so no PatientPhysicalExam entity should have been created or modified in peRepo.
        var persistedPe = await peRepo.Query(pe => pe.PatientId == patientId).FirstOrDefaultAsync();
        persistedPe.Should().BeNull();
    }

    [Fact]
    public async Task UpdatePatientPhysicalExamCommand_PersistsFindingsAndSubsequentQueriesRetrieveThem()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var medicalRepo = TestDbHelper.CreateRepository<PatientMedicalHistory>(context, sieve);
        var familyRepo = TestDbHelper.CreateRepository<PatientFamilyHistory>(context, sieve);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(context, sieve);
        var surgRepo = TestDbHelper.CreateRepository<PatientSurgicalHistory>(context, sieve);
        var socRepo = TestDbHelper.CreateRepository<PatientSocialHistory>(context, sieve);
        var reproRepo = TestDbHelper.CreateRepository<PatientReproductiveHistory>(context, sieve);
        var ncdRepo = TestDbHelper.CreateRepository<NcdRiskAssessment>(context, sieve);
        var peRepo = TestDbHelper.CreateRepository<PatientPhysicalExam>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-TEST-PE-CMD",
            FirstName = "Andres",
            LastName = "Bonifacio",
            Sex = BiologicalSex.Male,
            DateOfBirth = new DateOnly(1980, 11, 30),
            PhilHealthNumber = "11-223344556-7",
            ContactNumber = "09181234567"
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var commandHandler = new UpdatePatientPhysicalExamCommandHandler(
            patientRepo,
            peRepo,
            uow,
            _clinicContext);

        var command = new UpdatePatientPhysicalExamCommand(
            PatientId: patientId,
            GenSurveyId: "2",
            GenSurveyRemarks: "Awake, in mild respiratory distress",
            SkinId: "2",
            SkinRemarks: "Clubbing of fingers present",
            HeentId: "5",
            HeentRemarks: "Exudative pharyngitis and cervical adenopathy",
            ChestId: "2",
            ChestRemarks: "Bilateral wheezes on expiration",
            HeartId: "2",
            HeartRemarks: "Grade II systolic murmur at apex",
            AbdomenId: "3",
            AbdomenRemarks: "Right lower quadrant tenderness with guarding",
            NeuroId: "3",
            NeuroRemarks: "Decreased sensation on left lower extremity",
            RectalId: "2",
            RectalRemarks: "External hemorrhoids noted, non-thrombosed",
            GuId: "2",
            GuRemarks: "Mild suprapubic tenderness");

        var resultDto = await commandHandler.Handle(command, CancellationToken.None);

        resultDto.Should().NotBeNull();
        resultDto.PatientId.Should().Be(patientId);
        resultDto.SkinId.Should().Be("2");
        resultDto.SkinRemarks.Should().Be("Clubbing of fingers present");
        resultDto.ChestId.Should().Be("2");
        resultDto.ChestRemarks.Should().Be("Bilateral wheezes on expiration");

        // Verify relational record exists directly in DbContext / peRepo
        var persistedPe = await peRepo.Query(pe => pe.PatientId == patientId).FirstOrDefaultAsync();
        persistedPe.Should().NotBeNull();
        persistedPe!.SkinId.Should().Be("2");
        persistedPe.SkinRemarks.Should().Be("Clubbing of fingers present");
        persistedPe.HeentId.Should().Be("5");
        persistedPe.HeentRemarks.Should().Be("Exudative pharyngitis and cervical adenopathy");
        persistedPe.ChestId.Should().Be("2");
        persistedPe.ChestLungsRemarks.Should().Be("Bilateral wheezes on expiration");
        persistedPe.HeartId.Should().Be("2");
        persistedPe.HeartRemarks.Should().Be("Grade II systolic murmur at apex");
        persistedPe.AbdomenId.Should().Be("3");
        persistedPe.AbdomenRemarks.Should().Be("Right lower quadrant tenderness with guarding");
        persistedPe.NeuroId.Should().Be("3");
        persistedPe.NeurologicalRemarks.Should().Be("Decreased sensation on left lower extremity");
        persistedPe.RectalId.Should().Be("2");
        persistedPe.DigitalRectalRemarks.Should().Be("External hemorrhoids noted, non-thrombosed");
        persistedPe.GuId.Should().Be("2");
        persistedPe.GenitourinaryRemarks.Should().Be("Mild suprapubic tenderness");
        persistedPe.GenSurveyId.Should().Be("2");
        persistedPe.GeneralSurveyRemarks.Should().Be("Awake, in mild respiratory distress");

        // Dedicated CQRS query retrieves persisted findings
        var queryHandler = new GetPatientPhysicalExamQueryHandler(
            patientRepo,
            peRepo,
            _clinicContext);

        var queryResult = await queryHandler.Handle(new GetPatientPhysicalExamQuery(patientId), CancellationToken.None);
        queryResult.Should().NotBeNull();
        queryResult.SkinId.Should().Be("2");
        queryResult.SkinRemarks.Should().Be("Clubbing of fingers present");
        queryResult.HeentId.Should().Be("5");
        queryResult.GenSurveyId.Should().Be("2");

        // Yakap composite read facade also projects persisted findings
        var yakapController = new YakapPatientProfileController(
            patientRepo, vitalsRepo, medicalRepo, familyRepo, immRepo, socRepo, reproRepo, ncdRepo, uow, _clinicContext, _catalogLookup, peRepo);

        var yakapGetResult = await yakapController.GetProfile(patientId, CancellationToken.None);
        var yakapOk = yakapGetResult.Result as OkObjectResult;
        yakapOk.Should().NotBeNull();
        var yakapProfile = (yakapOk!.Value as ApiResponse<PhilHealthPatientProfileDto>)?.Data;
        yakapProfile.Should().NotBeNull();
        yakapProfile!.SkinId.Should().Be("2");
        yakapProfile.SkinRemarks.Should().Be("Clubbing of fingers present");
        yakapProfile.ChestId.Should().Be("2");
        yakapProfile.GenSurveyId.Should().Be("2");
    }

    [Fact]
    public async Task GetPatientPhysicalExamQuery_WhenNoProfileExists_ReturnsStatutoryNormalDefaults()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var peRepo = TestDbHelper.CreateRepository<PatientPhysicalExam>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-TEST-PE-NORM",
            FirstName = "Clara",
            LastName = "Reyes",
            Sex = BiologicalSex.Female,
            DateOfBirth = new DateOnly(1995, 8, 12),
            PhilHealthNumber = "33-445566778-9",
            ContactNumber = "09191234567"
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var queryHandler = new GetPatientPhysicalExamQueryHandler(
            patientRepo,
            peRepo,
            _clinicContext);

        var result = await queryHandler.Handle(new GetPatientPhysicalExamQuery(patientId), CancellationToken.None);

        result.Should().NotBeNull();
        result.PatientId.Should().Be(patientId);
        result.SkinId.Should().Be("1");
        result.SkinRemarks.Should().BeNull();
        result.HeentId.Should().Be("11");
        result.ChestId.Should().Be("6");
        result.HeartId.Should().Be("5");
        result.AbdomenId.Should().Be("7");
        result.NeuroId.Should().Be("6");
        result.RectalId.Should().Be("1");
        result.GuId.Should().Be("1");
        result.GenSurveyId.Should().Be("1");
        result.GenSurveyRemarks.Should().BeNull();
    }

    [Fact]
    public async Task GetPatientChart_IncludesPersistedPhysicalExamProfile()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var peRepo = TestDbHelper.CreateRepository<PatientPhysicalExam>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-TEST-PE-03",
            FirstName = "Roberto",
            LastName = "Luna",
            Sex = BiologicalSex.Male,
            DateOfBirth = new DateOnly(1975, 11, 8),
            PhilHealthNumber = "12-345678901-9",
            ContactNumber = "09171234567"
        };
        await patientRepo.AddAsync(patient);

        var pe = new PatientPhysicalExam
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            GenSurveyId = "1",
            GeneralSurveyRemarks = "Comfortable, ambulatory",
            SkinId = "1",
            HeentId = "11",
            ChestId = "6",
            HeartId = "5",
            AbdomenId = "7",
            NeuroId = "6",
            RectalId = "1",
            GuId = "1",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "DoctorTest"
        };
        await peRepo.AddAsync(pe);
        await uow.SaveChangesAsync();

        var handler = new GetPatientChartQueryHandler(
            consultRepo,
            triageRepo,
            procRepo,
            labRepo,
            invoiceRepo,
            _clinicContext,
            patientRepo: patientRepo,
            physicalExamRepo: peRepo);

        var chart = await handler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        chart.Should().NotBeNull();
        chart.PhysicalExamProfile.Should().NotBeNull();
        chart.PhysicalExamProfile!.PatientId.Should().Be(patientId);
        chart.PhysicalExamProfile.GenSurveyRemarks.Should().Be("Comfortable, ambulatory");
        chart.PhysicalExamProfile.SkinId.Should().Be("1");
        chart.PhysicalExamProfile.ChestId.Should().Be("6");
    }

    [Fact]
    public async Task UpdatePatientPhysicalExamCommand_PartialUpdate_PreservesUnspecifiedFields()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var peRepo = TestDbHelper.CreateRepository<PatientPhysicalExam>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-TEST-PARTIAL",
            FirstName = "Apolinario",
            LastName = "Mabini",
            Sex = BiologicalSex.Male,
            DateOfBirth = new DateOnly(1864, 7, 23),
            PhilHealthNumber = "12-998877665-1",
            ContactNumber = "09171234567"
        };
        await patientRepo.AddAsync(patient);

        var initialPe = new PatientPhysicalExam
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            GenSurveyId = "2",
            GeneralSurveyRemarks = "In moderate respiratory distress",
            SkinId = "1",
            SkinRemarks = null,
            HeentId = "5",
            HeentRemarks = "Exudative pharyngitis",
            ChestId = "2",
            ChestLungsRemarks = "Bilateral crackles",
            HeartId = "5",
            AbdomenId = "7",
            NeuroId = "6",
            RectalId = "1",
            GuId = "1",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "TriageStaff"
        };
        await peRepo.AddAsync(initialPe);
        await uow.SaveChangesAsync();

        var handler = new UpdatePatientPhysicalExamCommandHandler(patientRepo, peRepo, uow, _clinicContext);

        // Act: Update only SkinId and SkinRemarks, omitting all other fields
        var command = new UpdatePatientPhysicalExamCommand(
            PatientId: patientId,
            SkinId: "2",
            SkinRemarks: "Bilateral digital clubbing");

        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Updated fields reflect the change
        result.SkinId.Should().Be("2");
        result.SkinRemarks.Should().Be("Bilateral digital clubbing");

        // Assert: Unspecified fields are preserved intact (not reset to default "1" or null)
        result.GenSurveyId.Should().Be("2");
        result.GenSurveyRemarks.Should().Be("In moderate respiratory distress");
        result.HeentId.Should().Be("5");
        result.HeentRemarks.Should().Be("Exudative pharyngitis");
        result.ChestId.Should().Be("2");
        result.ChestRemarks.Should().Be("Bilateral crackles");

        var persisted = await peRepo.Query(pe => pe.PatientId == patientId).FirstOrDefaultAsync();
        persisted.Should().NotBeNull();
        persisted!.SkinId.Should().Be("2");
        persisted.GenSurveyId.Should().Be("2");
        persisted.GeneralSurveyRemarks.Should().Be("In moderate respiratory distress");
        persisted.HeentId.Should().Be("5");
        persisted.ChestId.Should().Be("2");
    }
}

