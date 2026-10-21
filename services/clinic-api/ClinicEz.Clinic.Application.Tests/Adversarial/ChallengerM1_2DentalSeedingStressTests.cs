using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Common;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Verification and Stress Test Suite by Challenger M1_2:
/// 1. Idempotency & Repeated Executions: 10x and 50x loops ensuring 0 duplicate records.
/// 2. Partial Catalog Seeding: N items exist -> exactly (10 - N) added.
/// 3. Price & Metadata Override Preservation: Customized prices and descriptions are never clobbered or reset.
/// 4. Multi-Tenant and Multi-Clinic Isolation.
/// 5. Security & Route Attribute Rigor: [HasPermission(ClinicPermissions.ServicesManage)] and [HttpPost("seed-dental")].
/// 6. Edge cases: Casing variations, whitespace padding, and soft/inactive state preservation.
/// </summary>
public class ChallengerM1_2DentalSeedingStressTests
{
    private readonly IClinicContext _clinicContextA;
    private readonly IClinicContext _clinicContextB;
    private readonly Guid _clinicIdA = Guid.NewGuid();
    private readonly Guid _clinicIdB = Guid.NewGuid();
    private const string TenantIdA = "tenant-challenger-alpha";
    private const string TenantIdB = "tenant-challenger-beta";

    public ChallengerM1_2DentalSeedingStressTests()
    {
        _clinicContextA = Substitute.For<IClinicContext>();
        _clinicContextA.ClinicId.Returns(_clinicIdA);
        _clinicContextA.TenantId.Returns(TenantIdA);

        _clinicContextB = Substitute.For<IClinicContext>();
        _clinicContextB.ClinicId.Returns(_clinicIdB);
        _clinicContextB.TenantId.Returns(TenantIdB);
    }

    // =========================================================================
    // 1. REPEATED EXECUTIONS (10x, 50x Loops) — ZERO DUPLICATES EVER CREATED
    // =========================================================================

    [Fact]
    public async Task SeedDentalServices_Repeated10xExecutions_NeverCreatesDuplicates()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new SeedDentalServicesCommandHandler(repo, uow, _clinicContextA);

        // Act: Run 10 consecutive iterations
        for (int i = 1; i <= 10; i++)
        {
            var result = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

            // Assert each iteration returns exactly 10 canonical presets
            result.Should().HaveCount(10, $"Iteration {i} must return exactly 10 presets");
            result.Select(x => x.Code).Distinct().Should().HaveCount(10, $"Iteration {i} result must have distinct codes");

            // Database count must strictly remain 10 after the first iteration
            var inDb = await repo.Query().ToListAsync();
            inDb.Should().HaveCount(10, $"Database record count at iteration {i} must stay at 10");
        }
    }

    [Fact]
    public async Task SeedDentalServices_Repeated50xExecutions_StaysStrictlyIdempotent()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new SeedDentalServicesCommandHandler(repo, uow, _clinicContextA);

        // Act: Run 50 consecutive iterations
        for (int i = 1; i <= 50; i++)
        {
            var result = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

            result.Should().HaveCount(10);
            result.All(x => x.Category == "Dental").Should().BeTrue();
        }

        // Final verification of database integrity
        var finalInDb = await repo.Query().ToListAsync();
        finalInDb.Should().HaveCount(10);
        finalInDb.Select(x => x.Code.ToUpperInvariant()).Distinct().Should().HaveCount(10);
    }

    // =========================================================================
    // 2. PARTIAL CATALOG SEEDING: WHEN N ITEMS EXIST, EXACTLY (10 - N) ARE ADDED
    // =========================================================================

    [Fact]
    public async Task SeedDentalServices_When3ItemsExist_AddsExactly7MissingItems()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new SeedDentalServicesCommandHandler(repo, uow, _clinicContextA);

        // Seed 3 initial dental items
        var initial3 = DentalCatalogDefaults.Defaults.Take(3).ToList();
        foreach (var def in initial3)
        {
            await repo.AddAsync(new ClinicServiceItem
            {
                TenantId = TenantIdA,
                ClinicId = _clinicIdA,
                Code = def.Code,
                Name = def.Name,
                Category = def.Category,
                StandardPrice = def.StandardPrice,
                Description = def.Description,
                IsActive = true
            });
        }
        await uow.SaveChangesAsync();

        var countBefore = await repo.Query().CountAsync();
        countBefore.Should().Be(3);

        // Act
        var result = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Assert
        result.Should().HaveCount(10);
        var countAfter = await repo.Query().CountAsync();
        countAfter.Should().Be(10, "exactly 7 missing items must have been added to the 3 existing ones");

        var codesInDb = (await repo.Query().Select(x => x.Code).ToListAsync()).ToHashSet();
        foreach (var def in DentalCatalogDefaults.Defaults)
        {
            codesInDb.Should().Contain(def.Code);
        }
    }

    [Theory]
    [InlineData(1, 9)]
    [InlineData(5, 5)]
    [InlineData(9, 1)]
    [InlineData(10, 0)]
    public async Task SeedDentalServices_WhenNItemsExist_AddsExactlyMissingCount(int existingCount, int expectedAdded)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new SeedDentalServicesCommandHandler(repo, uow, _clinicContextA);

        var preseeded = DentalCatalogDefaults.Defaults.Take(existingCount).ToList();
        foreach (var def in preseeded)
        {
            await repo.AddAsync(new ClinicServiceItem
            {
                TenantId = TenantIdA,
                ClinicId = _clinicIdA,
                Code = def.Code,
                Name = def.Name,
                Category = def.Category,
                StandardPrice = def.StandardPrice,
                Description = def.Description,
                IsActive = true
            });
        }
        await uow.SaveChangesAsync();

        var beforeCount = await repo.Query().CountAsync();
        beforeCount.Should().Be(existingCount);

        // Act
        var result = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Assert
        result.Should().HaveCount(10);
        var afterCount = await repo.Query().CountAsync();
        (afterCount - beforeCount).Should().Be(expectedAdded);
        afterCount.Should().Be(10);
    }

    // =========================================================================
    // 3. PRICE OVERRIDE PRESERVATION: SEEDING DOES NOT RESET CUSTOMIZED PRICES
    // =========================================================================

    [Fact]
    public async Task SeedDentalServices_WhenPricesOverridden_PreservesAllCustomPricesAndDescriptions()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new SeedDentalServicesCommandHandler(repo, uow, _clinicContextA);

        // Clinic customizes DENT-CONS (₱1,250 instead of ₱500) and DENT-RCT (₱7,500 instead of ₱4,000)
        await repo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantIdA,
            ClinicId = _clinicIdA,
            Code = "DENT-CONS",
            Name = "VIP Comprehensive Dental Exam",
            Category = "Dental",
            StandardPrice = 1250m,
            Description = "VIP executive dental screening with panoramic review",
            IsActive = true
        });

        await repo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantIdA,
            ClinicId = _clinicIdA,
            Code = "DENT-RCT",
            Name = "Specialist Microscope Endodontics",
            Category = "Dental",
            StandardPrice = 7500m,
            Description = "Molar root canal under surgical operating microscope",
            IsActive = true
        });
        await uow.SaveChangesAsync();

        // Act: Run seed command multiple times
        var run1 = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);
        var run2 = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Assert
        run1.Should().HaveCount(10);
        run2.Should().HaveCount(10);

        var consult = run2.First(x => x.Code == "DENT-CONS");
        consult.StandardPrice.Should().Be(1250m, "DENT-CONS custom price must not be reset to default 500");
        consult.Name.Should().Be("VIP Comprehensive Dental Exam");
        consult.Description.Should().Be("VIP executive dental screening with panoramic review");

        var rct = run2.First(x => x.Code == "DENT-RCT");
        rct.StandardPrice.Should().Be(7500m, "DENT-RCT custom price must not be reset to default 4000");
        rct.Name.Should().Be("Specialist Microscope Endodontics");

        // Verify standard prices for unmodified items were populated from defaults
        var clean = run2.First(x => x.Code == "DENT-CLEAN");
        clean.StandardPrice.Should().Be(850m);
        clean.Name.Should().Be("Oral Prophylaxis / Dental Cleaning");
    }

    // =========================================================================
    // 4. MULTI-TENANT AND MULTI-CLINIC ISOLATION
    // =========================================================================

    [Fact]
    public async Task SeedDentalServices_MultiTenantIsolation_NeverLeaksOrAffectsOtherClinics()
    {
        // Arrange: Shared in-memory database backing both clinics
        var sharedDbName = $"SharedDb_DentalSeed_{Guid.NewGuid()}";
        var (contextA, uowA, sieveA) = TestDbHelper.CreateSharedTestContext(sharedDbName, _clinicContextA);
        var repoA = TestDbHelper.CreateRepository<ClinicServiceItem>(contextA, sieveA);
        var handlerA = new SeedDentalServicesCommandHandler(repoA, uowA, _clinicContextA);

        var (contextB, uowB, sieveB) = TestDbHelper.CreateSharedTestContext(sharedDbName, _clinicContextB);
        var repoB = TestDbHelper.CreateRepository<ClinicServiceItem>(contextB, sieveB);
        var handlerB = new SeedDentalServicesCommandHandler(repoB, uowB, _clinicContextB);

        // Act 1: Seed Clinic A only
        var resultA = await handlerA.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Assert 1: Clinic A has 10 items, all with ClinicIdA and TenantIdA
        resultA.Should().HaveCount(10);
        resultA.All(x => x.ClinicId == _clinicIdA && x.TenantId == TenantIdA).Should().BeTrue();

        // Clinic B query must return 0 items initially (strict isolation)
        var clinicBItemsBefore = await repoB.Query().ToListAsync();
        clinicBItemsBefore.Should().BeEmpty("Clinic B must not see any items from Clinic A due to query filters");

        // Act 2: Seed Clinic B with a customized price on DENT-CONS (₱2,000)
        await repoB.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantIdB,
            ClinicId = _clinicIdB,
            Code = "DENT-CONS",
            Name = "Clinic B Oral Exam",
            Category = "Dental",
            StandardPrice = 2000m,
            IsActive = true
        });
        await uowB.SaveChangesAsync();

        var resultB = await handlerB.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Assert 2: Clinic B has 10 items, all with ClinicIdB and TenantIdB
        resultB.Should().HaveCount(10);
        resultB.All(x => x.ClinicId == _clinicIdB && x.TenantId == TenantIdB).Should().BeTrue();

        var consultA = (await handlerA.Handle(new SeedDentalServicesCommand(), CancellationToken.None))
            .First(x => x.Code == "DENT-CONS");
        var consultB = resultB.First(x => x.Code == "DENT-CONS");

        consultA.StandardPrice.Should().Be(500m);
        consultA.ClinicId.Should().Be(_clinicIdA);

        consultB.StandardPrice.Should().Be(2000m);
        consultB.ClinicId.Should().Be(_clinicIdB);

        // Verify total records across both clinics in the DB ignoring query filters
        var allDbA = await repoA.Query().ToListAsync();
        var allDbB = await repoB.Query().ToListAsync();
        allDbA.Should().HaveCount(10);
        allDbB.Should().HaveCount(10);
    }

    // =========================================================================
    // 5. SECURITY ATTRIBUTES & ROUTE CONTRACT VERIFICATION
    // =========================================================================

    [Fact]
    public void ServicesController_SeedDental_StrictSecurityAndRouteVerification()
    {
        var controllerType = typeof(ServicesController);

        // Verify controller level route
        var routeAttr = controllerType.GetCustomAttribute<RouteAttribute>();
        routeAttr.Should().NotBeNull();
        routeAttr!.Template.Should().Be("api/v1/services");

        // Verify action method
        var actionMethod = controllerType.GetMethod(nameof(ServicesController.SeedDentalServices));
        actionMethod.Should().NotBeNull("SeedDentalServices action method must exist on ServicesController");

        // Verify HttpPost attribute with "seed-dental"
        var httpPostAttr = actionMethod!.GetCustomAttribute<HttpPostAttribute>();
        httpPostAttr.Should().NotBeNull("SeedDentalServices must be an HTTP POST endpoint");
        httpPostAttr!.Template.Should().Be("seed-dental");

        // Verify [HasPermission(ClinicPermissions.ServicesManage)]
        var permissionAttr = actionMethod.GetCustomAttribute<HasPermissionAttribute>();
        permissionAttr.Should().NotBeNull("SeedDentalServices must be protected by HasPermissionAttribute");
        permissionAttr!.Permission.Should().Be(ClinicPermissions.ServicesManage, "Must require ServicesManage permission");

        // Verify return type
        actionMethod.ReturnType.Should().Be(typeof(Task<ActionResult<ApiResponse<List<ClinicServiceItemDto>>>>));

        // Verify CancellationToken parameter is present
        var parameters = actionMethod.GetParameters();
        parameters.Should().Contain(p => p.ParameterType == typeof(CancellationToken));
    }

    // =========================================================================
    // 6. ADVERSARIAL EDGE CASES: CASING, WHITESPACE, AND INACTIVE PRESERVATION
    // =========================================================================

    [Fact]
    public async Task SeedDentalServices_WhenExistingCodeHasMixedCasingOrWhitespace_DoesNotDuplicate()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new SeedDentalServicesCommandHandler(repo, uow, _clinicContextA);

        // Pre-populate with lowercase and whitespace padded codes
        await repo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantIdA,
            ClinicId = _clinicIdA,
            Code = "dent-cons", // lowercase
            Name = "Lowercase Dental Consult",
            Category = "Dental",
            StandardPrice = 550m,
            IsActive = true
        });

        await repo.AddAsync(new ClinicServiceItem
        {
            TenantId = TenantIdA,
            ClinicId = _clinicIdA,
            Code = "  DENT-CLEAN  ", // whitespace padded
            Name = "Padded Dental Cleaning",
            Category = "Dental",
            StandardPrice = 900m,
            IsActive = true
        });
        await uow.SaveChangesAsync();

        // Act
        var result = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Assert
        result.Should().HaveCount(10);
        var allDb = await repo.Query().ToListAsync();
        allDb.Should().HaveCount(10, "Case and whitespace variations must be matched without creating duplicate records");
    }

    [Fact]
    public async Task SeedDentalServices_WhenSeededItemIsInactive_DoesNotDuplicateOnReSeed()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new SeedDentalServicesCommandHandler(repo, uow, _clinicContextA);

        // Seed initial items
        await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Clinic deactivates DENT-SEALANT
        var sealant = (await repo.Query().ToListAsync()).First(x => x.Code == "DENT-SEALANT");
        sealant.IsActive = false;
        await uow.SaveChangesAsync();

        // Act: Re-run seed
        var result = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Assert
        result.Should().HaveCount(10);
        var inDb = await repo.Query().ToListAsync();
        inDb.Should().HaveCount(10, "Deactivated item must not trigger creation of a second DENT-SEALANT record");

        var sealantAfter = inDb.First(x => x.Code == "DENT-SEALANT");
        sealantAfter.IsActive.Should().BeFalse("Seeding must not force-reactivate an item deactivated by clinic admin");
    }

    [Fact]
    public async Task SeedDentalServices_WhenItemWasSoftDeleted_RestoresSoftDeletedRecordWithoutViolatingUniqueIndex()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var repo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var handler = new SeedDentalServicesCommandHandler(repo, uow, _clinicContextA);

        // Pre-insert a soft-deleted DENT-RCT row
        await repo.AddAsync(new ClinicServiceItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantIdA,
            ClinicId = _clinicIdA,
            Code = "DENT-RCT",
            Name = "Previously Deleted Root Canal",
            Category = "Dental",
            StandardPrice = 4000m,
            IsActive = false,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        });
        await uow.SaveChangesAsync();

        // Act: Run idempotent seed command
        var result = await handler.Handle(new SeedDentalServicesCommand(), CancellationToken.None);

        // Assert: All 10 presets seeded, DENT-RCT was restored without unique constraint collision
        result.Should().HaveCount(10);
        var inDb = await repo.Query().ToListAsync();
        inDb.Should().HaveCount(10);
        var rct = inDb.First(x => x.Code == "DENT-RCT");
        rct.IsDeleted.Should().BeFalse();
        rct.IsActive.Should().BeTrue();
    }
}
