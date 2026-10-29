using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Immunizations.Commands;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class PhilHealthProfileImmunizationSyncTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-test";
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;
    private readonly IPhilHealthCatalogLookup _catalogLookup;

    public PhilHealthProfileImmunizationSyncTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
        _catalogLookup = PhilHealthCatalogLookup.FromBundledSeed();
    }

    [Fact]
    public async Task GetProfile_MergesImmunizationsFromRelationalTable()
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

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0001",
            FirstName = "Marco",
            LastName = "Penida",
            ContactNumber = "09171234567",
            Gender = Gender.Female,
            DateOfBirth = new DateOnly(1999, 1, 21),
            PhilHealthNumber = "12-121212121-7"
        };
        await patientRepo.AddAsync(patient);

        // Add OPV 2 (C03) to relational PatientImmunizations
        var opv2 = new PatientImmunization
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Marco Penida",
            PhilHealthLibrary = "lib_immchild",
            PhilHealthCode = "C03",
            VaccineName = "OPV 2 (Oral Polio Vaccine 2)",
            LotBatchNumber = "HISTORICAL",
            ExpirationDate = new DateOnly(2026, 10, 12),
            AdministeredAtUtc = DateTime.UtcNow,
            AdministeredByStaffName = "Historical Provider",
            IsHistorical = true,
            HistoricalFacilityName = "Previous Clinic"
        };
        await immRepo.AddAsync(opv2);
        await uow.SaveChangesAsync();

        var controller = new YakapPatientProfileController(
            patientRepo, vitalsRepo, medicalRepo, familyRepo, immRepo, socRepo, reproRepo, ncdRepo, uow, _clinicContext, _catalogLookup);

        var actionResult = await controller.GetProfile(patientId, CancellationToken.None);
        var okResult = actionResult.Result as OkObjectResult;
        okResult.Should().NotBeNull();

        var response = okResult!.Value as ClinicEz.Shared.Common.ApiResponse<PhilHealthPatientProfileDto>;
        response.Should().NotBeNull();
        response!.Data.Should().NotBeNull();
        response.Data!.ChildImmunizations.Should().Contain("C03");
    }

    [Fact]
    public async Task UpdateProfile_SyncsImmunizationsToRelationalTable()
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

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-0001",
            FirstName = "Marco",
            LastName = "Penida",
            ContactNumber = "09171234567",
            Gender = Gender.Female,
            DateOfBirth = new DateOnly(1999, 1, 21),
            PhilHealthNumber = "12-121212121-7"
        };
        await patientRepo.AddAsync(patient);
        await uow.SaveChangesAsync();

        var controller = new YakapPatientProfileController(
            patientRepo, vitalsRepo, medicalRepo, familyRepo, immRepo, socRepo, reproRepo, ncdRepo, uow, _clinicContext, _catalogLookup);

        var profileDto = new PhilHealthPatientProfileDto
        {
            Pin = "12-121212121-7",
            MemberType = "MM",
            MemberLastName = "Penida",
            MemberFirstName = "Marco",
            YoungWomanImmunizations = ["Y01"], // HPV
            ChildImmunizations = ["C03"],      // OPV 2
            MedicalHistories = [],
            FamilyHistories = []
        };

        var actionResult = await controller.UpdateProfile(patientId, profileDto, CancellationToken.None);
        var okResult = actionResult.Result as OkObjectResult;
        okResult.Should().NotBeNull();

        var inDb = immRepo.Query(i => i.PatientId == patientId).ToList();
        inDb.Should().HaveCount(2);
        inDb.Should().Contain(i => i.PhilHealthLibrary == "lib_immyoungw" && i.PhilHealthCode == "Y01");
        inDb.Should().Contain(i => i.PhilHealthLibrary == "lib_immchild" && i.PhilHealthCode == "C03");
    }
}
