using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Services;
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
    public async Task UpdateProfile_DoesNotMutatePhysicalExamProfile()
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
        };

        var updateResult = await controller.UpdateProfile(patientId, updateDto, CancellationToken.None);
        var okUpdate = updateResult.Result as OkObjectResult;
        okUpdate.Should().NotBeNull();

        // Physical examination mutation was decoupled from YakapPatientProfileController,
        // so no PatientPhysicalExamProfile entity should have been created or modified in peRepo.
        var persistedPe = await peRepo.Query(pe => pe.PatientId == patientId).FirstOrDefaultAsync();
        persistedPe.Should().BeNull();
    }

    [Fact]
    public async Task UpdatePatientPhysicalExamCommand_PersistsFindingsAndSubsequentQueriesRetrieveThem()
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

        var patientId = Guid.NewGuid();
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-TEST-PE-CMD",
            FirstName = "Andres",
            LastName = "Bonifacio",
            Gender = "Male",
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

        // Dedicated CQRS query retrieves persisted findings
        var ingestionService = new LegacyPatientProfileIngestionService(
            patientRepo, surgRepo, socRepo, reproRepo, ncdRepo, uow, _clinicContext, immRepo, _catalogLookup, peRepo);

        var queryHandler = new GetPatientPhysicalExamQueryHandler(
            patientRepo,
            peRepo,
            ingestionService,
            _clinicContext);

        var queryResult = await queryHandler.Handle(new GetPatientPhysicalExamQuery(patientId), CancellationToken.None);
        queryResult.Should().NotBeNull();
        queryResult.SkinId.Should().Be("2");
        queryResult.SkinRemarks.Should().Be("Clubbing of fingers present");
        queryResult.HeentId.Should().Be("5");
        queryResult.GenSurveyId.Should().Be("2");

        // Yakap composite read facade also projects persisted findings
        var yakapController = new YakapPatientProfileController(
            patientRepo, vitalsRepo, medicalRepo, familyRepo, immRepo, socRepo, reproRepo, ncdRepo, uow, _clinicContext, _catalogLookup, ingestionService, peRepo);

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
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
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
            PatientCode = "P-TEST-PE-NORM",
            FirstName = "Clara",
            LastName = "Reyes",
            Gender = "Female",
            DateOfBirth = new DateOnly(1995, 8, 12),
            PhilHealthNumber = "33-445566778-9",
            ContactNumber = "09191234567"
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var queryHandler = new GetPatientPhysicalExamQueryHandler(
            patientRepo,
            peRepo,
            ingestionService,
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
    public void YakapClinicalMapper_WithRelationalPhysicalExamProfile_MapsPEMISCAndPESPECIFIC()
    {
        var mapper = new YakapClinicalMapper(_catalogLookup);
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-1982-001",
            FirstName = "Emilio",
            LastName = "Aguinaldo",
            Gender = "Male",
            DateOfBirth = new DateOnly(1982, 3, 22),
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09171234567",
            BloodType = "O+"
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Emilio Aguinaldo",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Test",
            EncounterDate = DateTime.UtcNow,
            Subjective = "Cough and colds",
            Assessment = "Acute Bronchitis"
        };

        var vitals = new TriageVitals
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            QueueItemId = Guid.NewGuid(),
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 75,
            RespiratoryRateBreathsPerMin = 18,
            TemperatureCelsius = 36.8m,
            HeightCm = 170,
            WeightKg = 70,
            Bmi = 24.2m
        };

        var pe = new PatientPhysicalExamProfile
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            GenSurveyId = "2",
            GenSurveyRemarks = "Awake, in mild respiratory distress",
            SkinId = "2",
            SkinRemarks = "Clubbing of fingers present",
            HeentId = "5",
            HeentRemarks = "Exudative pharyngitis",
            ChestId = "2",
            ChestRemarks = "Bilateral wheezes on expiration",
            HeartId = "2",
            HeartRemarks = "Grade II systolic murmur",
            AbdomenId = "3",
            AbdomenRemarks = "Right lower quadrant tenderness",
            NeuroId = "3",
            NeuroRemarks = "Decreased sensation left lower leg",
            RectalId = "2",
            RectalRemarks = "External hemorrhoids non-thrombosed",
            GuId = "2",
            GuRemarks = "Mild suprapubic tenderness"
        };

        var settings = new ClinicSettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Test Healthcare Center",
            AccreditationNumber = "123456789"
        };

        var patientsMap = new Dictionary<Guid, ClinicPatient> { [patientId] = patient };
        var vitalsMap = new Dictionary<Guid, TriageVitals> { [encounterId] = vitals };
        var peMap = new Dictionary<Guid, PatientPhysicalExamProfile> { [patientId] = pe };

        var reportDoc = mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: patientsMap,
            vitalsMap: vitalsMap,
            transmittalNumber: "TX-TEST-PE-01",
            physicalExamsMap: peMap);

        reportDoc.Should().NotBeNull();
        reportDoc.Profiles.Should().HaveCount(1);
        var profile = reportDoc.Profiles[0];

        // Verify PEMISCS maps from PatientPhysicalExamProfile
        profile.PhysicalExamMiscs.Should().HaveCount(1);
        var misc = profile.PhysicalExamMiscs[0];
        misc.SkinId.Should().Be("2");
        misc.HeentId.Should().Be("5");
        misc.ChestId.Should().Be("2");
        misc.HeartId.Should().Be("2");
        misc.AbdomenId.Should().Be("3");
        misc.NeuroId.Should().Be("3");
        misc.RectalId.Should().Be("2");
        misc.GuId.Should().Be("2");

        // Verify PESPECIFIC maps from PatientPhysicalExamProfile
        profile.PhysicalExamSpecifics.Should().NotBeNull();
        profile.PhysicalExamSpecifics.SkinRem.Should().Be("Clubbing of fingers present");
        profile.PhysicalExamSpecifics.HeentRem.Should().Be("Exudative pharyngitis");
        profile.PhysicalExamSpecifics.ChestRem.Should().Be("Bilateral wheezes on expiration");
        profile.PhysicalExamSpecifics.HeartRem.Should().Be("Grade II systolic murmur");
        profile.PhysicalExamSpecifics.AbdomenRem.Should().Be("Right lower quadrant tenderness");
        profile.PhysicalExamSpecifics.NeuroRem.Should().Be("Decreased sensation left lower leg");
        profile.PhysicalExamSpecifics.RectalRem.Should().Be("External hemorrhoids non-thrombosed");
        profile.PhysicalExamSpecifics.GuRem.Should().Be("Mild suprapubic tenderness");

        // Verify PEGENSURVEY and BloodType
        profile.GenSurveyId.Should().Be("2");
        profile.GenSurveyRem.Should().Be("Awake, in mild respiratory distress");
        profile.BloodType.Should().Be("O+");
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

    [Fact]
    public async Task UpdatePatientPhysicalExamCommand_PartialUpdate_PreservesUnspecifiedFields()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var peRepo = TestDbHelper.CreateRepository<PatientPhysicalExamProfile>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-TEST-PARTIAL",
            FirstName = "Apolinario",
            LastName = "Mabini",
            Gender = "Male",
            DateOfBirth = new DateOnly(1864, 7, 23),
            PhilHealthNumber = "12-998877665-1",
            ContactNumber = "09171234567"
        };
        await patientRepo.AddAsync(patient);

        var initialPe = new PatientPhysicalExamProfile
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            GenSurveyId = "2",
            GenSurveyRemarks = "In moderate respiratory distress",
            SkinId = "1",
            SkinRemarks = null,
            HeentId = "5",
            HeentRemarks = "Exudative pharyngitis",
            ChestId = "2",
            ChestRemarks = "Bilateral crackles",
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
        persisted.GenSurveyRemarks.Should().Be("In moderate respiratory distress");
        persisted.HeentId.Should().Be("5");
        persisted.ChestId.Should().Be("2");
    }

    [Fact]
    public async Task ValidateYakapTransmittalCommand_WithRelationalPhysicalExamProfile_PassesPhysicalExamToMapperAndProxy()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var transmittalRepo = TestDbHelper.CreateRepository<YakapTransmittal>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var serviceItemRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var peRepo = TestDbHelper.CreateRepository<PatientPhysicalExamProfile>(context, sieve);

        var proxyClient = Substitute.For<IPhilHealthProxyClient>();
        GenerateAndValidateReportProxyRequest? capturedRequest = null;
        proxyClient.ValidateReportAsync(
            Arg.Do<GenerateAndValidateReportProxyRequest>(r => capturedRequest = r),
            Arg.Any<CancellationToken>())
            .Returns(ApiResponse<YakapValidationProxyResponse>.Success(
                new YakapValidationProxyResponse(
                    IsValid: true,
                    TransmittalNumber: "TXN-TEST-VAL-PE",
                    RawXml: "<xml>TransmittalValid</xml>",
                    EncryptedPayload: "enc-valid",
                    PhilHealthSoapResponse: "OK",
                    ValidationErrors: [])));

        var patientId = Guid.NewGuid();
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "P-VAL-PE",
            FirstName = "Melchora",
            LastName = "Aquino",
            Gender = "Female",
            DateOfBirth = new DateOnly(1950, 1, 6),
            PhilHealthNumber = "01-234567890-1",
            ContactNumber = "09171234567",
            BloodType = "AB+"
        };
        await patientRepo.AddAsync(patient);

        var encounterId = Guid.NewGuid();
        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Melchora Aquino",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = DateTime.UtcNow,
            Subjective = "Fever and productive cough",
            Assessment = "Community Acquired Pneumonia"
        };
        await encounterRepo.AddAsync(encounter);

        var pe = new PatientPhysicalExamProfile
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            GenSurveyId = "2",
            GenSurveyRemarks = "In respiratory distress",
            SkinId = "2",
            SkinRemarks = "Cyanosis of extremities",
            ChestId = "2",
            ChestRemarks = "Right lower lobe crackles",
            HeartId = "5",
            AbdomenId = "7",
            NeuroId = "6",
            RectalId = "1",
            GuId = "1",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "AttendingPhysician"
        };
        await peRepo.AddAsync(pe);

        var transmittal = new YakapTransmittal
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            TransmittalNumber = "TXN-TEST-VAL-PE",
            ReportTagging = "1",
            EffectiveYear = "2026",
            PackageType = "K",
            Status = YakapTransmittalStatus.Draft,
            Items =
            {
                new YakapTransmittalItem
                {
                    Id = Guid.NewGuid(),
                    TenantId = _tenantId,
                    ClinicId = _clinicId,
                    PatientId = patientId,
                    PatientName = "Aquino, Melchora",
                    PhilHealthIdentificationNumber = "012345678901",
                    ConsultationEncounterId = encounterId,
                    ItemType = "Encounter"
                }
            }
        };
        await transmittalRepo.AddAsync(transmittal);
        await uow.SaveChangesAsync();

        var mapper = new YakapClinicalMapper(_catalogLookup);

        var handler = new ClinicEz.Clinic.Application.Features.Yakap.Commands.ValidateYakapTransmittal.ValidateYakapTransmittalCommandHandler(
            transmittalRepo,
            encounterRepo,
            patientRepo,
            vitalsRepo,
            settingsRepo,
            labOrderRepo,
            serviceItemRepo,
            proxyClient,
            uow,
            _clinicContext,
            mapper,
            peRepo);

        var result = await handler.Handle(
            new ClinicEz.Clinic.Application.Features.Yakap.Commands.ValidateYakapTransmittal.ValidateYakapTransmittalCommand(transmittal.Id),
            CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        capturedRequest.Should().NotBeNull();
        capturedRequest!.Document.Should().NotBeNull();
        capturedRequest.Document.Profiles.Should().HaveCount(1);

        var p = capturedRequest.Document.Profiles[0];
        p.BloodType.Should().Be("AB+");
        p.GenSurveyId.Should().Be("2");
        p.GenSurveyRem.Should().Be("In respiratory distress");
        p.PhysicalExamMiscs.Should().HaveCount(1);
        p.PhysicalExamMiscs[0].SkinId.Should().Be("2");
        p.PhysicalExamMiscs[0].ChestId.Should().Be("2");
        p.PhysicalExamSpecifics.Should().NotBeNull();
        p.PhysicalExamSpecifics.SkinRem.Should().Be("Cyanosis of extremities");
        p.PhysicalExamSpecifics.ChestRem.Should().Be("Right lower lobe crackles");
    }
}

