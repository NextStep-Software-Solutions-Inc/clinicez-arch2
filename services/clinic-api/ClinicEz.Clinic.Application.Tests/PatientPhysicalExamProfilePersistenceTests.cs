using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Services;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class PatientPhysicalExamProfilePersistenceTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-physical-exam";
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;
    private readonly IPhilHealthCatalogLookup _catalogLookup;

    public PatientPhysicalExamProfilePersistenceTests()
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
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var medicalRepo = TestDbHelper.CreateRepository<PatientPastMedicalHistory>(context, sieve);
        var familyRepo = TestDbHelper.CreateRepository<PatientFamilyHistory>(context, sieve);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(context, sieve);
        var surgRepo = TestDbHelper.CreateRepository<PatientSurgicalHistory>(context, sieve);
        var socRepo = TestDbHelper.CreateRepository<PatientSocialHistory>(context, sieve);
        var reproRepo = TestDbHelper.CreateRepository<PatientReproductiveHistory>(context, sieve);
        var ncdRepo = TestDbHelper.CreateRepository<NcdRiskAssessment>(context, sieve);
        var peRepo = TestDbHelper.CreateRepository<PatientPhysicalExamProfile>(context, sieve);

        var ingestionService = new LegacyPatientProfileIngestionService(
            patientRepo, surgRepo, socRepo, reproRepo, ncdRepo, uow, _clinicContext, immRepo, _catalogLookup, peRepo);

        var patientId = Guid.NewGuid();
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-TEST-PE-01",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            Gender = "Male",
            DateOfBirth = new DateOnly(1990, 5, 20),
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09171234567"
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var controller = new YakapPatientProfileController(
            patientRepo, vitalsRepo, medicalRepo, familyRepo, immRepo, socRepo, reproRepo, ncdRepo, uow, _clinicContext, _catalogLookup, ingestionService, peRepo);

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
    public async Task UpdateProfile_PersistsOrganSystemFindingsAndRemarksToRelationalTable()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var medicalRepo = TestDbHelper.CreateRepository<PatientPastMedicalHistory>(context, sieve);
        var familyRepo = TestDbHelper.CreateRepository<PatientFamilyHistory>(context, sieve);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(context, sieve);
        var surgRepo = TestDbHelper.CreateRepository<PatientSurgicalHistory>(context, sieve);
        var socRepo = TestDbHelper.CreateRepository<PatientSocialHistory>(context, sieve);
        var reproRepo = TestDbHelper.CreateRepository<PatientReproductiveHistory>(context, sieve);
        var ncdRepo = TestDbHelper.CreateRepository<NcdRiskAssessment>(context, sieve);
        var peRepo = TestDbHelper.CreateRepository<PatientPhysicalExamProfile>(context, sieve);

        var ingestionService = new LegacyPatientProfileIngestionService(
            patientRepo, surgRepo, socRepo, reproRepo, ncdRepo, uow, _clinicContext, immRepo, _catalogLookup, peRepo);

        var patientId = Guid.NewGuid();
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-TEST-PE-02",
            FirstName = "Maria",
            LastName = "Santos",
            Gender = "Female",
            DateOfBirth = new DateOnly(1985, 3, 15),
            PhilHealthNumber = "99-123456789-0",
            ContactNumber = "09171234567"
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var controller = new YakapPatientProfileController(
            patientRepo, vitalsRepo, medicalRepo, familyRepo, immRepo, socRepo, reproRepo, ncdRepo, uow, _clinicContext, _catalogLookup, ingestionService, peRepo);

        var updateDto = new PhilHealthPatientProfileDto
        {
            Pin = "99-123456789-0",
            SkinId = "2",
            SkinRemarks = "Clubbing of fingers present",
            HeentId = "5",
            HeentRemarks = "Exudative pharyngitis and cervical adenopathy",
            ChestId = "2",
            ChestRemarks = "Bilateral wheezes on expiration",
            HeartId = "2",
            HeartRemarks = "Grade II systolic murmur at apex",
            AbdomenId = "3",
            AbdomenRemarks = "Right lower quadrant tenderness with guarding",
            NeuroId = "3",
            NeuroRemarks = "Decreased sensation on left lower extremity",
            RectalId = "2",
            RectalRemarks = "External hemorrhoids noted, non-thrombosed",
            GuId = "2",
            GuRemarks = "Mild suprapubic tenderness",
            GenSurveyId = "2",
            GenSurveyRemarks = "Awake, in mild respiratory distress"
        };

        var updateResult = await controller.UpdateProfile(patientId, updateDto, CancellationToken.None);
        var okUpdate = updateResult.Result as OkObjectResult;
        okUpdate.Should().NotBeNull();

        // Verify relational record exists directly in DbContext / peRepo
        var persistedPe = await peRepo.Query(pe => pe.PatientId == patientId).FirstOrDefaultAsync();
        persistedPe.Should().NotBeNull();
        persistedPe!.SkinId.Should().Be("2");
        persistedPe.SkinRemarks.Should().Be("Clubbing of fingers present");
        persistedPe.HeentId.Should().Be("5");
        persistedPe.HeentRemarks.Should().Be("Exudative pharyngitis and cervical adenopathy");
        persistedPe.ChestId.Should().Be("2");
        persistedPe.ChestRemarks.Should().Be("Bilateral wheezes on expiration");
        persistedPe.HeartId.Should().Be("2");
        persistedPe.HeartRemarks.Should().Be("Grade II systolic murmur at apex");
        persistedPe.AbdomenId.Should().Be("3");
        persistedPe.AbdomenRemarks.Should().Be("Right lower quadrant tenderness with guarding");
        persistedPe.NeuroId.Should().Be("3");
        persistedPe.NeuroRemarks.Should().Be("Decreased sensation on left lower extremity");
        persistedPe.RectalId.Should().Be("2");
        persistedPe.RectalRemarks.Should().Be("External hemorrhoids noted, non-thrombosed");
        persistedPe.GuId.Should().Be("2");
        persistedPe.GuRemarks.Should().Be("Mild suprapubic tenderness");
        persistedPe.GenSurveyId.Should().Be("2");
        persistedPe.GenSurveyRemarks.Should().Be("Awake, in mild respiratory distress");

        // Subsequent GetProfile retrieves persisted values
        var getResult = await controller.GetProfile(patientId, CancellationToken.None);
        var okGet = getResult.Result as OkObjectResult;
        okGet.Should().NotBeNull();
        var retrieved = (okGet!.Value as ApiResponse<PhilHealthPatientProfileDto>)?.Data;
        retrieved.Should().NotBeNull();
        retrieved!.SkinId.Should().Be("2");
        retrieved.SkinRemarks.Should().Be("Clubbing of fingers present");
        retrieved.HeentId.Should().Be("5");
        retrieved.HeentRemarks.Should().Be("Exudative pharyngitis and cervical adenopathy");
        retrieved.ChestId.Should().Be("2");
        retrieved.ChestRemarks.Should().Be("Bilateral wheezes on expiration");
        retrieved.HeartId.Should().Be("2");
        retrieved.HeartRemarks.Should().Be("Grade II systolic murmur at apex");
        retrieved.AbdomenId.Should().Be("3");
        retrieved.AbdomenRemarks.Should().Be("Right lower quadrant tenderness with guarding");
        retrieved.NeuroId.Should().Be("3");
        retrieved.NeuroRemarks.Should().Be("Decreased sensation on left lower extremity");
        retrieved.RectalId.Should().Be("2");
        retrieved.RectalRemarks.Should().Be("External hemorrhoids noted, non-thrombosed");
        retrieved.GuId.Should().Be("2");
        retrieved.GuRemarks.Should().Be("Mild suprapubic tenderness");
        retrieved.GenSurveyId.Should().Be("2");
        retrieved.GenSurveyRemarks.Should().Be("Awake, in mild respiratory distress");
    }

    [Fact]
    public async Task GetPatientChart_IncludesPersistedPhysicalExamProfile()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var peRepo = TestDbHelper.CreateRepository<PatientPhysicalExamProfile>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-TEST-PE-03",
            FirstName = "Roberto",
            LastName = "Luna",
            Gender = "Male",
            DateOfBirth = new DateOnly(1975, 11, 8),
            PhilHealthNumber = "12-345678901-9",
            ContactNumber = "09171234567"
        };
        await patientRepo.AddAsync(patient);

        var pe = new PatientPhysicalExamProfile
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            GenSurveyId = "1",
            GenSurveyRemarks = "Comfortable, ambulatory",
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
}
