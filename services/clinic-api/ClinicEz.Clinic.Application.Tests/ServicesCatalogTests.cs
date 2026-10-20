using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Reflection;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ServicesCatalogTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string TenantId = "tenant-test-101";

    public ServicesCatalogTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(TenantId);
    }

    [Fact]
    public async Task CreateClinicServiceItem_WithPhilHealthMapping_PersistsSuccessfully()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new CreateClinicServiceItemCommandHandler(repo, uow, _clinicContext);

        var command = new CreateClinicServiceItemCommand(
            Code: "MED-AMOX-500",
            Name: "Amoxicillin 500mg Capsule",
            Category: "Medicine",
            StandardPrice: 12.50m,
            Description: "Oral broad-spectrum antibiotic",
            PhilHealthCode: "PHIL-DRUG-AMOX-500MG-CAP-001",
            PhilHealthDescription: "Amoxicillin 500 mg Capsule",
            IsPhilHealthFormulary: true
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Code.Should().Be("MED-AMOX-500");
        result.Name.Should().Be("Amoxicillin 500mg Capsule");
        result.Category.Should().Be("Medicine");
        result.StandardPrice.Should().Be(12.50m);
        result.PhilHealthCode.Should().Be("PHIL-DRUG-AMOX-500MG-CAP-001");
        result.PhilHealthDescription.Should().Be("Amoxicillin 500 mg Capsule");
        result.IsPhilHealthFormulary.Should().BeTrue();

        var inDb = await repo.GetByIdAsync(result.Id);
        inDb.Should().NotBeNull();
        inDb!.PhilHealthCode.Should().Be("PHIL-DRUG-AMOX-500MG-CAP-001");
        inDb.IsPhilHealthFormulary.Should().BeTrue();
    }

    [Fact]
    public async Task CreateClinicServiceItem_DuplicateCode_ThrowsConflictException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new CreateClinicServiceItemCommandHandler(repo, uow, _clinicContext);

        var command1 = new CreateClinicServiceItemCommand("DIAG-CBC", "Complete Blood Count", "Diagnostic", 200m);
        await handler.Handle(command1, CancellationToken.None);

        var command2 = new CreateClinicServiceItemCommand("DIAG-CBC", "Duplicate CBC", "Diagnostic", 250m);

        // Act & Assert
        await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(command2, CancellationToken.None));
    }

    [Fact]
    public async Task UpdateClinicServiceItem_UpdatesPhilHealthMappingAndPrice()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var createHandler = new CreateClinicServiceItemCommandHandler(repo, uow, _clinicContext);
        var updateHandler = new UpdateClinicServiceItemCommandHandler(repo, uow, _clinicContext);

        var created = await createHandler.Handle(new CreateClinicServiceItemCommand(
            "MED-LOSAR-50", "Losartan 50mg", "Medicine", 15m
        ), CancellationToken.None);

        var updateCommand = new UpdateClinicServiceItemCommand(
            Id: created.Id,
            Name: "Losartan Potassium 50mg Tablet",
            Category: "Medicine",
            StandardPrice: 18m,
            Description: "Angiotensin II receptor blocker",
            IsActive: true,
            PhilHealthCode: "PHIL-DRUG-LOSAR-50MG-TAB-002",
            PhilHealthDescription: "Losartan (as potassium) 50 mg Tablet",
            IsPhilHealthFormulary: true
        );

        // Act
        var updated = await updateHandler.Handle(updateCommand, CancellationToken.None);

        // Assert
        updated.Name.Should().Be("Losartan Potassium 50mg Tablet");
        updated.StandardPrice.Should().Be(18m);
        updated.PhilHealthCode.Should().Be("PHIL-DRUG-LOSAR-50MG-TAB-002");
        updated.IsPhilHealthFormulary.Should().BeTrue();

        var inDb = await repo.GetByIdAsync(created.Id);
        inDb!.Name.Should().Be("Losartan Potassium 50mg Tablet");
        inDb.PhilHealthCode.Should().Be("PHIL-DRUG-LOSAR-50MG-TAB-002");
    }

    [Fact]
    public async Task BulkImportServices_UpsertsAndTracksPhilHealthCoverage()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var bulkHandler = new BulkImportServicesCommandHandler(repo, uow, _clinicContext);

        // Pre-populate an item
        await repo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            Code = "MED-MET-500",
            Name = "Old Metformin 500mg",
            Category = "Medicine",
            StandardPrice = 8m,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        var importRows = new List<BulkImportServiceItemDto>
        {
            // Existing item to update
            new(
                Code: "MED-MET-500",
                Name: "Metformin Hydrochloride 500mg Tablet",
                Category: "Medicine",
                StandardPrice: 7.50m,
                Description: "Oral biguanide hypoglycemic",
                PhilHealthCode: "PHIL-DRUG-METFO-500MG-TAB-003",
                PhilHealthDescription: "Metformin (as hydrochloride) 500 mg Tablet",
                IsPhilHealthFormulary: true
            ),
            // New item mapped to PhilHealth
            new(
                Code: "DIAG-LIPID",
                Name: "Lipid Profile Panel",
                Category: "Diagnostic",
                StandardPrice: 650m,
                Description: "Total Cholesterol, HDL, LDL, Triglycerides",
                PhilHealthCode: "80061",
                PhilHealthDescription: "Lipid panel",
                IsPhilHealthFormulary: true
            ),
            // New item non-formulary / out-of-pocket
            new(
                Code: "PROC-COSMETIC",
                Name: "Skin Tag Cauterization",
                Category: "Procedure",
                StandardPrice: 1200m,
                Description: "Cosmetic electrocautery of benign skin tags",
                PhilHealthCode: null,
                PhilHealthDescription: null,
                IsPhilHealthFormulary: false
            )
        };

        // Act
        var result = await bulkHandler.Handle(new BulkImportServicesCommand(importRows), CancellationToken.None);

        // Assert
        result.TotalProcessed.Should().Be(3);
        result.TotalCreated.Should().Be(2);
        result.TotalUpdated.Should().Be(1);
        result.TotalMappedToPhilHealth.Should().Be(2);
        result.TotalNonFormulary.Should().Be(1);

        var allDb = repo.Query().ToList();
        allDb.Should().HaveCount(3);

        var updatedMet = allDb.First(x => x.Code == "MED-MET-500");
        updatedMet.Name.Should().Be("Metformin Hydrochloride 500mg Tablet");
        updatedMet.PhilHealthCode.Should().Be("PHIL-DRUG-METFO-500MG-TAB-003");
        updatedMet.IsPhilHealthFormulary.Should().BeTrue();

        var lipid = allDb.First(x => x.Code == "DIAG-LIPID");
        lipid.PhilHealthCode.Should().Be("80061");
        lipid.IsPhilHealthFormulary.Should().BeTrue();

        var cosmetic = allDb.First(x => x.Code == "PROC-COSMETIC");
        cosmetic.PhilHealthCode.Should().BeNull();
        cosmetic.IsPhilHealthFormulary.Should().BeFalse();
    }

    [Fact]
    public async Task GetClinicServices_EmptyCatalog_SeedsDefaultsWithPhilHealthMappings()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var queryHandler = new GetClinicServicesQueryHandler(repo, uow, _clinicContext);

        // Act
        var result = await queryHandler.Handle(new GetClinicServicesQuery(), CancellationToken.None);

        // Assert
        result.Should().NotBeEmpty();
        result.Should().Contain(x => x.Code == "PROC-ECG" && x.IsPhilHealthFormulary && x.PhilHealthCode == "93000");
        result.Should().Contain(x => x.Code == "LAB-RBS" && x.IsPhilHealthFormulary && x.PhilHealthCode == "82947");
    }

    [Fact]
    public async Task GetClinicServices_EmptyCatalog_WhenDentalSpecialty_SeedsDentalDefaults()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        await settingsRepo.AddAsync(new ClinicSettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Tooth Care Clinic",
            SpecialtyMode = "Dental"
        });
        await uow.SaveChangesAsync();

        var queryHandler = new GetClinicServicesQueryHandler(repo, uow, _clinicContext, settingsRepo);

        // Act
        var result = await queryHandler.Handle(new GetClinicServicesQuery(), CancellationToken.None);

        // Assert
        result.Should().HaveCount(10);
        result.All(x => x.Category == "Dental").Should().BeTrue();
        result.Should().Contain(x => x.Code == "DENT-CONS" && x.StandardPrice == 500m);
        result.Should().Contain(x => x.Code == "DENT-CLEAN" && x.StandardPrice == 850m);
        result.Should().Contain(x => x.Code == "DENT-FILL-COMP" && x.StandardPrice == 950m);
        result.Should().Contain(x => x.Code == "DENT-EXT-SIMPLE" && x.StandardPrice == 1000m);
        result.Should().Contain(x => x.Code == "DENT-EXT-SURG" && x.StandardPrice == 3500m);
        result.Should().Contain(x => x.Code == "DENT-SEALANT" && x.StandardPrice == 600m);
        result.Should().Contain(x => x.Code == "DENT-FLUOR" && x.StandardPrice == 500m);
        result.Should().Contain(x => x.Code == "DENT-XR-PA" && x.StandardPrice == 400m);
        result.Should().Contain(x => x.Code == "DENT-RCT" && x.StandardPrice == 4000m);
        result.Should().Contain(x => x.Code == "DENT-PULP" && x.StandardPrice == 1500m);
        result.Should().NotContain(x => x.Code == "CONS-GEN");
    }

    [Theory]
    [InlineData("MultiSpecialty")]
    [InlineData("Multi-Specialty")]
    [InlineData("multispecialty")]
    public async Task GetClinicServices_EmptyCatalog_WhenMultiSpecialty_SeedsBothMedicalAndDentalDefaults(string specialtyMode)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        await settingsRepo.AddAsync(new ClinicSettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "PolyCare Center",
            SpecialtyMode = specialtyMode
        });
        await uow.SaveChangesAsync();

        var queryHandler = new GetClinicServicesQueryHandler(repo, uow, _clinicContext, settingsRepo);

        // Act
        var result = await queryHandler.Handle(new GetClinicServicesQuery(), CancellationToken.None);

        // Assert
        result.Should().HaveCount(19); // 9 general medical + 10 dental
        result.Should().Contain(x => x.Code == "CONS-GEN" && x.Category == "Consultation");
        result.Should().Contain(x => x.Code == "DENT-CONS" && x.Category == "Dental");
        result.Should().Contain(x => x.Code == "DENT-RCT" && x.Category == "Dental");
    }

    [Fact]
    public async Task SeedDentalServices_EmptyCatalog_SeedsAllTenDentalItems()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new SeedDentalServicesCommandHandler(repo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Assert
        result.Should().HaveCount(10);
        result.All(x => x.Category == "Dental").Should().BeTrue();
        result.Select(x => x.Code).Should().Contain(new[]
        {
            "DENT-CONS", "DENT-CLEAN", "DENT-FILL-COMP", "DENT-EXT-SIMPLE", "DENT-EXT-SURG",
            "DENT-SEALANT", "DENT-FLUOR", "DENT-XR-PA", "DENT-RCT", "DENT-PULP"
        });

        var inDb = repo.Query().ToList();
        inDb.Should().HaveCount(10);
        inDb.All(x => x.ClinicId == _clinicId && x.TenantId == TenantId).Should().BeTrue();
    }

    [Fact]
    public async Task SeedDentalServices_ExistingDentalItems_IsIdempotentAndDoesNotDuplicateOrOverwrite()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new SeedDentalServicesCommandHandler(repo, uow, _clinicContext);

        // Pre-populate an existing customized dental item and an unrelated medical item
        await repo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            Code = "DENT-CONS",
            Name = "Customized Oral Examination",
            Category = "Dental",
            StandardPrice = 750m,
            Description = "Customized rate examination",
            IsActive = true
        });
        await repo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            Code = "CONS-GEN",
            Name = "General Consultation",
            Category = "Consultation",
            StandardPrice = 500m,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        // Act 1: First seeding
        var firstRun = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Assert 1
        firstRun.Should().HaveCount(10);
        var customFirst = firstRun.First(x => x.Code == "DENT-CONS");
        customFirst.StandardPrice.Should().Be(750m);
        customFirst.Name.Should().Be("Customized Oral Examination");

        var inDbAfterFirst = repo.Query().ToList();
        inDbAfterFirst.Should().HaveCount(11); // 1 medical + 1 existing dental + 9 new dental

        // Act 2: Second seeding (idempotency check)
        var secondRun = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Assert 2
        secondRun.Should().HaveCount(10);
        var customSecond = secondRun.First(x => x.Code == "DENT-CONS");
        customSecond.StandardPrice.Should().Be(750m);
        customSecond.Name.Should().Be("Customized Oral Examination");

        var inDbAfterSecond = repo.Query().ToList();
        inDbAfterSecond.Should().HaveCount(11); // Still exactly 11, no duplicates created
    }

    [Fact]
    public void ServicesController_SeedDentalServices_HasCorrectRouteAndPermissionAttributes()
    {
        var method = typeof(ServicesController).GetMethod(nameof(ServicesController.SeedDentalServices));
        method.Should().NotBeNull();

        var httpPostAttr = method!.GetCustomAttributes(typeof(HttpPostAttribute), false)
            .Cast<HttpPostAttribute>()
            .FirstOrDefault();
        httpPostAttr.Should().NotBeNull();
        httpPostAttr!.Template.Should().Be("seed-dental");

        var permissionAttr = method.GetCustomAttributes(typeof(HasPermissionAttribute), false)
            .Cast<HasPermissionAttribute>()
            .FirstOrDefault();
        permissionAttr.Should().NotBeNull();
        permissionAttr!.Permission.Should().Be(ClinicPermissions.ServicesManage);
    }
}
