using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Common;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Queries;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ServicesCatalogChallengerTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string TenantId = "tenant-challenger-stress-101";

    public ServicesCatalogChallengerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(TenantId);
    }

    // =========================================================================
    // SECTION 1: EXACT PRICE, CODE, AND DESCRIPTION INTEGRITY
    // =========================================================================

    [Fact]
    public void CanonicalDentalDefaults_ContainsExactlyTenAuthoritativePresetsWithPreciseValues()
    {
        var defaults = DentalCatalogDefaults.Defaults;
        defaults.Should().HaveCount(10);

        var expectedPresets = new Dictionary<string, (string Name, decimal Price, string Category, string DescriptionSubstring)>
        {
            ["DENT-CONS"] = ("Dental Consultation & Oral Examination", 500m, "Dental", "Comprehensive dental examination"),
            ["DENT-CLEAN"] = ("Oral Prophylaxis / Dental Cleaning", 850m, "Dental", "scaling and polishing"),
            ["DENT-FILL-COMP"] = ("Composite Light-Cure Tooth Restoration", 950m, "Dental", "composite resin tooth filling"),
            ["DENT-EXT-SIMPLE"] = ("Tooth Extraction - Simple Exodontia", 1000m, "Dental", "Non-surgical extraction"),
            ["DENT-EXT-SURG"] = ("Surgical Odontectomy - Impacted Third Molar", 3500m, "Dental", "Surgical extraction of impacted"),
            ["DENT-SEALANT"] = ("Pit and Fissure Sealant", 600m, "Dental", "Preventive resin sealant"),
            ["DENT-FLUOR"] = ("Topical Fluoride Varnish Application", 500m, "Dental", "topical sodium fluoride varnish"),
            ["DENT-XR-PA"] = ("Dental Periapical Radiograph / X-Ray", 400m, "Dental", "Intraoral digital periapical"),
            ["DENT-RCT"] = ("Root Canal Therapy / Endodontic Treatment", 4000m, "Dental", "Complete endodontic chemo-mechanical"),
            ["DENT-PULP"] = ("Pediatric Pulpotomy", 1500m, "Dental", "vital pulp amputation")
        };

        foreach (var (code, expected) in expectedPresets)
        {
            var item = defaults.FirstOrDefault(d => d.Code == code);
            item.Should().NotBeNull($"Expected preset {code} must exist in canonical defaults");
            item!.Name.Should().Be(expected.Name);
            item.StandardPrice.Should().Be(expected.Price);
            item.Category.Should().Be(expected.Category);
            item.Description.Should().Contain(expected.DescriptionSubstring);
        }
    }

    [Fact]
    public void DentalCatalogDefaults_CreateDefaults_ProducesActiveEntitiesWithMatchingContext()
    {
        var testClinicId = Guid.NewGuid();
        var testTenantId = "tenant-entity-factory-test";

        var items = DentalCatalogDefaults.CreateDefaults(testTenantId, testClinicId);

        items.Should().HaveCount(10);
        items.All(x => x.ClinicId == testClinicId).Should().BeTrue();
        items.All(x => x.TenantId == testTenantId).Should().BeTrue();
        items.All(x => x.IsActive).Should().BeTrue();
        items.All(x => x.Category == "Dental").Should().BeTrue();
        items.All(x => x.StandardPrice > 0m).Should().BeTrue();
        items.Select(x => x.Code).Should().OnlyHaveUniqueItems();
    }

    // =========================================================================
    // SECTION 2: AUTO-SEEDING UNDER HIGH CHURN & SPECIALTY MODE TRANSITIONS
    // =========================================================================

    [Fact]
    public async Task AutoSeeding_HighChurnSequentialQueries_SeedsOnlyOnceAndRemainsConsistent()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        await settingsRepo.AddAsync(new ClinicSettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "High Churn Dental Care",
            SpecialtyMode = "Dental"
        });
        await uow.SaveChangesAsync();

        var queryHandler = new GetClinicServicesQueryHandler(repo, uow, _clinicContext, settingsRepo);

        // Run 25 rapid sequential queries simulating concurrent incoming workstation requests
        for (int i = 0; i < 25; i++)
        {
            var result = await queryHandler.Handle(new GetClinicServicesQuery(), CancellationToken.None);
            result.Should().HaveCount(10);
            result.All(x => x.Category == "Dental").Should().BeTrue();
        }

        // Verify database persistence count is strictly 10 items (zero duplication)
        var allDb = repo.Query().ToList();
        allDb.Should().HaveCount(10);
    }

    [Fact]
    public async Task SpecialtyModeTransition_DoesNotWipeOrDuplicateExistingServices()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var settings = new ClinicSettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Transition Clinic",
            SpecialtyMode = "Dental"
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var queryHandler = new GetClinicServicesQueryHandler(repo, uow, _clinicContext, settingsRepo);

        // Step 1: Initial query seeds 10 dental items
        var initialResult = await queryHandler.Handle(new GetClinicServicesQuery(), CancellationToken.None);
        initialResult.Should().HaveCount(10);

        // Step 2: Clinic transitions specialty mode to "Medical"
        settings.SpecialtyMode = "Medical";
        await uow.SaveChangesAsync();

        // Step 3: Querying does not re-seed or wipe existing dental items
        var medicalResult = await queryHandler.Handle(new GetClinicServicesQuery(), CancellationToken.None);
        medicalResult.Should().HaveCount(10); // Preserved existing dental items
        medicalResult.All(x => x.Category == "Dental").Should().BeTrue();

        // Step 4: Clinic transitions specialty mode to "MultiSpecialty"
        settings.SpecialtyMode = "MultiSpecialty";
        await uow.SaveChangesAsync();

        var multiResult = await queryHandler.Handle(new GetClinicServicesQuery(), CancellationToken.None);
        multiResult.Should().HaveCount(19); // 10 dental + 9 medical presets seeded idempotently without duplicates
        multiResult.Count(x => x.Category == "Dental").Should().Be(10);
        multiResult.Count(x => x.Category != "Dental").Should().Be(9);

        // Step 5: Transition from Medical (existing medical items) to Dental idempotently adds all 10 dental presets
        var clinicId2 = Guid.NewGuid();
        var clinicContext2 = Substitute.For<IClinicContext>();
        clinicContext2.TenantId.Returns(TenantId);
        clinicContext2.ClinicId.Returns(clinicId2);

        var (context2, uow2, sieve2) = TestDbHelper.CreateTestContext(clinicContext2);
        var repo2 = TestDbHelper.CreateRepository<ClinicServiceItem>(context2, sieve2);
        var settingsRepo2 = TestDbHelper.CreateRepository<ClinicSettings>(context2, sieve2);

        var settings2 = new ClinicSettings
        {
            TenantId = TenantId,
            ClinicId = clinicId2,
            ClinicName = "Medical to Dental Clinic",
            SpecialtyMode = "Medical"
        };
        await settingsRepo2.AddAsync(settings2);
        await uow2.SaveChangesAsync();

        var handler2 = new GetClinicServicesQueryHandler(repo2, uow2, clinicContext2, settingsRepo2);
        var medResult = await handler2.Handle(new GetClinicServicesQuery(), CancellationToken.None);
        medResult.Should().HaveCount(9);

        settings2.SpecialtyMode = "Dental";
        await uow2.SaveChangesAsync();

        var dentalResult = await handler2.Handle(new GetClinicServicesQuery(), CancellationToken.None);
        dentalResult.Should().HaveCount(19);
        dentalResult.Count(x => x.Category == "Dental").Should().Be(10);
        dentalResult.Count(x => x.Category != "Dental").Should().Be(9);
    }

    [Theory]
    [InlineData("Dental", 10, true)]
    [InlineData("dental", 10, true)]
    [InlineData("   DENTAL   ", 10, true)]
    [InlineData("MultiSpecialty", 19, false)]
    [InlineData("Multi-Specialty", 19, false)]
    [InlineData("multispecialty", 19, false)]
    [InlineData("  multi-specialty  ", 19, false)]
    [InlineData("Medical", 9, false)]
    [InlineData("medical", 9, false)]
    [InlineData("", 9, false)]
    [InlineData(null, 9, false)]
    [InlineData("ArbitraryCardiology", 9, false)]
    public async Task AutoSeeding_SpecialtyModeParsing_HandlesAllVariationsSafely(
        string? specialtyMode,
        int expectedCount,
        bool expectOnlyDental)
    {
        var testClinicId = Guid.NewGuid();
        var contextMock = Substitute.For<IClinicContext>();
        contextMock.ClinicId.Returns(testClinicId);
        contextMock.TenantId.Returns("tenant-variation-test");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(contextMock);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        if (specialtyMode != null)
        {
            await settingsRepo.AddAsync(new ClinicSettings
            {
                TenantId = "tenant-variation-test",
                ClinicId = testClinicId,
                ClinicName = "Variation Clinic",
                SpecialtyMode = specialtyMode
            });
            await uow.SaveChangesAsync();
        }

        var queryHandler = new GetClinicServicesQueryHandler(repo, uow, contextMock, settingsRepo);
        var result = await queryHandler.Handle(new GetClinicServicesQuery(), CancellationToken.None);

        result.Should().HaveCount(expectedCount);
        if (expectOnlyDental)
        {
            result.All(x => x.Category == "Dental").Should().BeTrue();
        }
        else if (expectedCount == 19)
        {
            result.Count(x => x.Category == "Dental").Should().Be(10);
            result.Count(x => x.Category != "Dental").Should().Be(9);
        }
        else
        {
            result.Any(x => x.Category == "Dental").Should().BeFalse();
        }
    }

    // =========================================================================
    // SECTION 3: IDEMPOTENCY & CUSTOM PRICE PRESERVATION STRESS
    // =========================================================================

    [Fact]
    public async Task SeedDentalServices_RepeatedFiftyTimes_RemainsStrictlyIdempotent()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new SeedDentalServicesCommandHandler(repo, uow, _clinicContext);

        for (int i = 0; i < 50; i++)
        {
            var result = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);
            result.Should().HaveCount(10);
        }

        var inDb = repo.Query().ToList();
        inDb.Should().HaveCount(10);
        inDb.Select(x => x.Code).Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public async Task SeedDentalServices_PreservesMultipleCustomPricesAndDescriptions()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new SeedDentalServicesCommandHandler(repo, uow, _clinicContext);

        // Pre-create 3 dental services with customized prices, names, and case-varied codes
        await repo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            Code = "dent-cons", // lowercase
            Name = "VIP Oral Comprehensive Consultation",
            Category = "Dental",
            StandardPrice = 1250m,
            Description = "VIP specialized 60-minute examination",
            IsActive = true
        });
        await repo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            Code = "  DENT-CLEAN  ", // whitespace-padded
            Name = "Deep Ultrasonic Prophylaxis",
            Category = "Dental",
            StandardPrice = 1500m,
            Description = "Dual-stage ultrasonic subgingival cleaning",
            IsActive = true
        });
        await repo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            Code = "DENT-RCT",
            Name = "Molar Rotary Endodontics",
            Category = "Dental",
            StandardPrice = 6000m,
            Description = "Rotary nickel-titanium 3-canal root canal therapy",
            IsActive = false // intentionally inactive
        });
        await uow.SaveChangesAsync();

        // Act
        var result = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Assert
        result.Should().HaveCount(10);

        // 1. Check custom items are untouched
        var cons = result.First(x => x.Code.Trim().ToUpperInvariant() == "DENT-CONS");
        cons.StandardPrice.Should().Be(1250m);
        cons.Name.Should().Be("VIP Oral Comprehensive Consultation");

        var clean = result.First(x => x.Code.Trim().ToUpperInvariant() == "DENT-CLEAN");
        clean.StandardPrice.Should().Be(1500m);
        clean.Name.Should().Be("Deep Ultrasonic Prophylaxis");

        var rct = result.First(x => x.Code.Trim().ToUpperInvariant() == "DENT-RCT");
        rct.StandardPrice.Should().Be(6000m);
        rct.Name.Should().Be("Molar Rotary Endodontics");
        rct.IsActive.Should().BeFalse(); // Inactive state was preserved, not overwritten

        // 2. Check the remaining 7 canonical presets were added with their standard prices
        var fill = result.First(x => x.Code == "DENT-FILL-COMP");
        fill.StandardPrice.Should().Be(950m);

        var surg = result.First(x => x.Code == "DENT-EXT-SURG");
        surg.StandardPrice.Should().Be(3500m);

        // 3. Verify total DB count
        var totalDb = repo.Query().ToList();
        totalDb.Should().HaveCount(10);
    }

    // =========================================================================
    // SECTION 4: DIRECTORY PUBLISHING WITH MIXED ACTIVE / INACTIVE DENTAL SERVICES
    // =========================================================================

    [Fact]
    public async Task DirectoryPublishing_FiltersOutInactiveDentalServices_IncludesOnlyActive()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        // Active doctor required for publishing readiness
        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Dr. Roberto",
            LastName = "Lim",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-DENT-889900",
            IsActive = true
        });

        // Add 6 active dental services
        var activeCodes = new[] { "DENT-CONS", "DENT-CLEAN", "DENT-FILL-COMP", "DENT-EXT-SIMPLE", "DENT-EXT-SURG", "DENT-SEALANT" };
        foreach (var code in activeCodes)
        {
            var def = DentalCatalogDefaults.Defaults.First(d => d.Code == code);
            await servicesRepo.AddAsync(new ClinicServiceItem
            {
                TenantId = TenantId,
                ClinicId = _clinicId,
                Code = def.Code,
                Name = def.Name,
                Category = def.Category,
                StandardPrice = def.StandardPrice,
                IsActive = true
            });
        }

        // Add 4 inactive dental services
        var inactiveCodes = new[] { "DENT-FLUOR", "DENT-XR-PA", "DENT-RCT", "DENT-PULP" };
        var inactiveNames = new List<string>();
        foreach (var code in inactiveCodes)
        {
            var def = DentalCatalogDefaults.Defaults.First(d => d.Code == code);
            inactiveNames.Add(def.Name);
            await servicesRepo.AddAsync(new ClinicServiceItem
            {
                TenantId = TenantId,
                ClinicId = _clinicId,
                Code = def.Code,
                Name = def.Name,
                Category = def.Category,
                StandardPrice = def.StandardPrice,
                IsActive = false
            });
        }

        // Add 2 active general medical services and 1 inactive medical service
        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            Code = "CONS-GEN",
            Name = "General Consultation",
            Category = "Consultation",
            StandardPrice = 500m,
            IsActive = true
        });
        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            Code = "PROC-WOUND",
            Name = "Wound Dressing",
            Category = "Procedure",
            StandardPrice = 350m,
            IsActive = true
        });
        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            Code = "PROC-NEB",
            Name = "Discontinued Nebulization",
            Category = "Procedure",
            StandardPrice = 250m,
            IsActive = false
        });

        var settings = new ClinicSettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Active Directory Dental Care",
            OperatingHours = "Mon-Sat 8:00 AM - 6:00 PM",
            SpecialtyMode = "MultiSpecialty",
            IsWorkspaceEligible = true,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var result = await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        result.Success.Should().BeTrue();
        result.IsPublished.Should().BeTrue();

        interopPublisher.Received(1).Enqueue<FacilityCreatedEvent>(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Is<Party>(p => p.FacilityId == _clinicId.ToString() && p.FacilityType == FacilityType.Clinic),
            Arg.Is<Party>(p => p.Kind == PartyKind.ControlPlane && p.Service == InteropServices.Patient),
            _clinicId,
            Arg.Is<FacilityCreatedEvent>(e =>
                e.Classification == "Multi-Specialty Clinic" &&
                e.IsPublic == true &&
                e.Services != null &&
                e.Services.Count == 8 && // 6 active dental + 2 active medical = 8 total (0 inactive)
                e.Services.All(s => s.IsActive) &&
                !e.Services.Any(s => inactiveNames.Contains(s.Name)) &&
                !e.Services.Any(s => s.Name == "Discontinued Nebulization")));
    }
}
