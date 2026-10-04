using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
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
}
