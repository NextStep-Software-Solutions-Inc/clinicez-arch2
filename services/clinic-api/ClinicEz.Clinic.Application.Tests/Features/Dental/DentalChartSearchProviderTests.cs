using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dental.Search;
using ClinicEz.Clinic.Application.Features.Search.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Search;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Dental;

public class DentalChartSearchProviderTests
{
    private readonly Guid _clinicIdA = Guid.NewGuid();
    private readonly Guid _clinicIdB = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;

    public DentalChartSearchProviderTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicIdA);
        _clinicContext.HasPermission(Arg.Any<string>()).Returns(true);
    }

    private static DentalToothRecord CreateTooth(
        Guid clinicId,
        string tenantId,
        Guid patientId,
        string patientName,
        int toothNumber,
        ToothStatus status,
        string? surface = null,
        string? notes = null,
        bool isDeleted = false)
    {
        return new DentalToothRecord
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = patientId,
            PatientName = patientName,
            ToothNumber = toothNumber,
            Status = status,
            Surface = surface,
            Notes = notes,
            IsDeleted = isDeleted,
            CreatedAt = DateTime.UtcNow
        };
    }

    // =========================================================================
    // 1. Contract & Metadata Invariants
    // =========================================================================
    [Fact]
    public void DentalChartSearchProvider_ExposesCorrectContractMetadata()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        provider.Category.Should().Be("Dental");
        provider.Priority.Should().Be(25);
        provider.RequiredPermission.Should().Be(ClinicPermissions.ConsultationsRead);
        provider.Should().BeAssignableTo<ISearchProvider>();
    }

    // =========================================================================
    // 2. Multi-Tenant Isolation
    // =========================================================================
    [Fact]
    public async Task SearchAsync_EnforcesStrictMultiTenantIsolation_NeverReturnsOtherClinicTeeth()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var patientIdA = Guid.NewGuid();
        var patientIdB = Guid.NewGuid();

        var toothA = CreateTooth(
            _clinicIdA, "tenant-a", patientIdA, "Maria Clara", 16, ToothStatus.Decay, "MOD", "Deep caries on upper first molar");

        var toothB = CreateTooth(
            _clinicIdB, "tenant-b", patientIdB, "Maria Clara", 16, ToothStatus.Decay, "MOD", "Deep caries on upper first molar");

        context.DentalToothRecords.AddRange(toothA, toothB);
        await context.SaveChangesAsync();

        // Search Clinic A
        var resultsA = await provider.SearchAsync("Maria Clara", _clinicIdA, 10, CancellationToken.None);
        resultsA.Should().HaveCount(1);
        resultsA[0].Id.Should().Be($"dental-{toothA.Id}");
        resultsA[0].RouteParams!["patientId"].Should().Be(patientIdA.ToString());
        resultsA[0].RouteParams!["toothNumber"].Should().Be("16");

        // Search Clinic B
        var resultsB = await provider.SearchAsync("Maria Clara", _clinicIdB, 10, CancellationToken.None);
        resultsB.Should().HaveCount(1);
        resultsB[0].Id.Should().Be($"dental-{toothB.Id}");
        resultsB[0].RouteParams!["patientId"].Should().Be(patientIdB.ToString());

        // Tooth number in Clinic A
        var toothResultsA = await provider.SearchAsync("16", _clinicIdA, 10, CancellationToken.None);
        toothResultsA.Should().HaveCount(1);
        toothResultsA[0].Id.Should().Be($"dental-{toothA.Id}");

        // Notes keyword in Clinic A
        var notesResultsA = await provider.SearchAsync("caries", _clinicIdA, 10, CancellationToken.None);
        notesResultsA.Should().HaveCount(1);
        notesResultsA[0].Id.Should().Be($"dental-{toothA.Id}");
    }

    // =========================================================================
    // 3. Soft-Delete Exclusion
    // =========================================================================
    [Fact]
    public async Task SearchAsync_ExcludesSoftDeletedRecords()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var activeTooth = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Active Patient", 11, ToothStatus.Healthy);
        var deletedTooth = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Deleted Patient", 11, ToothStatus.Decay, isDeleted: true);

        context.DentalToothRecords.AddRange(activeTooth, deletedTooth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync("11", _clinicIdA, 10, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].Id.Should().Be($"dental-{activeTooth.Id}");
    }

    // =========================================================================
    // 4. Tooth Number Query Patterns (Exact, Prefixed, Phrase)
    // =========================================================================
    [Theory]
    [InlineData("16")]
    [InlineData("#16")]
    [InlineData("tooth 16")]
    [InlineData("Tooth 16")]
    [InlineData("TOOTH #16")]
    [InlineData("  tooth   16  ")]
    [InlineData("tooth#16")]
    [InlineData("t16")]
    [InlineData("t#16")]
    public async Task SearchAsync_ToothNumberQueries_MatchesExactPrefixedAndPhrases(string query)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var targetTooth = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Juan Dela Cruz", 16, ToothStatus.Decay, "MOD");
        var otherTooth = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Juan Dela Cruz", 26, ToothStatus.Healthy);

        context.DentalToothRecords.AddRange(targetTooth, otherTooth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(query, _clinicIdA, 10, CancellationToken.None);

        results.Should().NotBeEmpty();
        results.Should().ContainSingle(r => r.RouteParams!["toothNumber"] == "16");
        results[0].Title.Should().StartWith("Tooth #16");
    }

    [Theory]
    [InlineData("55")]
    [InlineData("#55")]
    [InlineData("tooth 55")]
    [InlineData("Tooth #55")]
    public async Task SearchAsync_ChildDeciduousTeeth_MatchesFdiNumbering(string query)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var childTooth = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Baby Santos", 55, ToothStatus.Filled, "O", "Deciduous molar");
        context.DentalToothRecords.Add(childTooth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(query, _clinicIdA, 10, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].RouteParams!["toothNumber"].Should().Be("55");
        results[0].Title.Should().Contain("55");
    }

    [Fact]
    public async Task SearchAsync_NonMatchingToothNumber_ReturnsEmptyResults()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var tooth = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Juan Dela Cruz", 16, ToothStatus.Healthy);
        context.DentalToothRecords.Add(tooth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync("99", _clinicIdA, 10, CancellationToken.None);

        results.Should().BeEmpty();
    }

    // =========================================================================
    // 5. Patient Name Queries (Full, Partial, Case-Insensitive)
    // =========================================================================
    [Theory]
    [InlineData("Juan Dela Cruz")]
    [InlineData("juan dela cruz")]
    [InlineData("JUAN DELA CRUZ")]
    [InlineData("Dela Cruz")]
    [InlineData("dela")]
    [InlineData("cruz")]
    [InlineData("Juan")]
    public async Task SearchAsync_PatientNameQueries_MatchesCaseInsensitiveFullAndPartial(string query)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var tooth = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Juan Dela Cruz", 21, ToothStatus.Crown, notes: "Porcelain crown");
        context.DentalToothRecords.Add(tooth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(query, _clinicIdA, 10, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].Subtitle.Should().Contain("Juan Dela Cruz");
    }

    // =========================================================================
    // 6. Tooth Status Queries (Decay, Filled, Crown, Extraction, Healthy, Missing)
    // =========================================================================
    [Theory]
    [InlineData("Decay", ToothStatus.Decay, 14)]
    [InlineData("decay", ToothStatus.Decay, 14)]
    [InlineData("Filled", ToothStatus.Filled, 16)]
    [InlineData("filled", ToothStatus.Filled, 16)]
    [InlineData("Crown", ToothStatus.Crown, 21)]
    [InlineData("crown", ToothStatus.Crown, 21)]
    [InlineData("Extraction", ToothStatus.Extraction, 36)]
    [InlineData("extraction", ToothStatus.Extraction, 36)]
    [InlineData("Healthy", ToothStatus.Healthy, 11)]
    [InlineData("healthy", ToothStatus.Healthy, 11)]
    [InlineData("Missing", ToothStatus.Missing, 28)]
    [InlineData("missing", ToothStatus.Missing, 28)]
    public async Task SearchAsync_StatusQueries_MatchesAllStatusTaxonomies(
        string query, ToothStatus expectedStatus, int expectedToothNumber)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var teeth = new[]
        {
            CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Patient 1", 11, ToothStatus.Healthy),
            CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Patient 2", 14, ToothStatus.Decay, "O"),
            CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Patient 3", 16, ToothStatus.Filled, "MOD"),
            CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Patient 4", 21, ToothStatus.Crown),
            CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Patient 5", 28, ToothStatus.Missing),
            CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Patient 6", 36, ToothStatus.Extraction)
        };

        context.DentalToothRecords.AddRange(teeth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(query, _clinicIdA, 10, CancellationToken.None);

        results.Should().NotBeEmpty();
        results.Should().Contain(r => r.RouteParams!["toothNumber"] == expectedToothNumber.ToString() &&
                                      r.BadgeText == expectedStatus.ToString());
    }

    // =========================================================================
    // 7. Surface Queries (Single and Multi-Surfaces)
    // =========================================================================
    [Theory]
    [InlineData("MOD", 16)]
    [InlineData("mod", 16)]
    [InlineData("B", 14)]
    [InlineData("b", 14)]
    [InlineData("O", 15)]
    [InlineData("D", 25)]
    [InlineData("L", 35)]
    public async Task SearchAsync_SurfaceQueries_MatchesSurfaces(string query, int expectedToothNumber)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var teeth = new[]
        {
            CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "P1", 14, ToothStatus.Decay, "B"),
            CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "P2", 15, ToothStatus.Decay, "O"),
            CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "P3", 16, ToothStatus.Filled, "MOD"),
            CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "P4", 25, ToothStatus.Decay, "D"),
            CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "P5", 35, ToothStatus.Decay, "L")
        };

        context.DentalToothRecords.AddRange(teeth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(query, _clinicIdA, 10, CancellationToken.None);

        results.Should().NotBeEmpty();
        results.Should().Contain(r => r.RouteParams!["toothNumber"] == expectedToothNumber.ToString());
    }

    // =========================================================================
    // 8. Clinical Notes Keyword Queries
    // =========================================================================
    [Theory]
    [InlineData("abscess")]
    [InlineData("root canal")]
    [InlineData("fracture")]
    [InlineData("caries")]
    public async Task SearchAsync_ClinicalNotesQueries_MatchesKeywords(string query)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var tooth1 = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "P1", 16, ToothStatus.Decay, notes: "Acute periapical abscess");
        var tooth2 = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "P2", 21, ToothStatus.Filled, notes: "Previous root canal therapy completed");
        var tooth3 = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "P3", 31, ToothStatus.Extraction, notes: "Vertical root fracture");
        var tooth4 = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "P4", 46, ToothStatus.Decay, notes: "Severe occlusal caries");

        context.DentalToothRecords.AddRange(tooth1, tooth2, tooth3, tooth4);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(query, _clinicIdA, 10, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].Subtitle.ToLower().Should().Contain(query.ToLower());
    }

    // =========================================================================
    // 9. Semantic Badge Variant Mapping
    // =========================================================================
    [Theory]
    [InlineData(ToothStatus.Decay, "Decay", SearchBadgeVariant.Urgent)]
    [InlineData(ToothStatus.Extraction, "Extraction", SearchBadgeVariant.Emergency)]
    [InlineData(ToothStatus.Filled, "Filled", SearchBadgeVariant.Routine)]
    [InlineData(ToothStatus.Crown, "Crown", SearchBadgeVariant.Neutral)]
    [InlineData(ToothStatus.Healthy, "Healthy", SearchBadgeVariant.Neutral)]
    [InlineData(ToothStatus.Missing, "Missing", SearchBadgeVariant.Neutral)]
    public async Task SearchAsync_BadgeVariantMapping_MapsStatusToCorrectVariant(
        ToothStatus status, string expectedBadgeText, string expectedVariant)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var tooth = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Test Patient", 16, status);
        context.DentalToothRecords.Add(tooth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync("16", _clinicIdA, 10, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].BadgeText.Should().Be(expectedBadgeText);
        results[0].BadgeVariant.Should().Be(expectedVariant);
        results[0].Badge.Should().NotBeNull();
        results[0].Badge!.Text.Should().Be(expectedBadgeText);
        results[0].Badge!.Variant.Should().Be(expectedVariant);
    }

    // =========================================================================
    // 10. Deep Navigation Route Parameters & Item DTO Structure
    // =========================================================================
    [Fact]
    public async Task SearchAsync_FormatsItemDtoAndRouteParamsForDentalChartNavigation()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var patientId = Guid.NewGuid();
        var tooth = CreateTooth(_clinicIdA, "tenant-a", patientId, "Juan Dela Cruz", 16, ToothStatus.Decay, "MOD", "Deep caries");
        context.DentalToothRecords.Add(tooth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync("16", _clinicIdA, 10, CancellationToken.None);

        results.Should().HaveCount(1);
        var item = results[0];

        item.Id.Should().Be($"dental-{tooth.Id}");
        item.Category.Should().Be("Dental");
        item.Title.Should().Be("Tooth #16 — Decay (MOD)");
        item.Subtitle.Should().Be("Patient: Juan Dela Cruz • Deep caries");
        item.TargetRoute.Should().Be("Patients");

        item.RouteParams.Should().NotBeNull();
        item.RouteParams.Should().ContainKey("patientId").WhoseValue.Should().Be(patientId.ToString());
        item.RouteParams.Should().ContainKey("toothNumber").WhoseValue.Should().Be("16");
        item.RouteParams.Should().ContainKey("tab").WhoseValue.Should().Be("dental");
    }

    // =========================================================================
    // 11. Empty & Whitespace Query Handling
    // =========================================================================
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n ")]
    public async Task SearchAsync_WhenQueryIsEmptyOrWhitespace_ReturnsEmptyImmediately(string? emptyQuery)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var tooth = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Juan Dela Cruz", 16, ToothStatus.Decay);
        context.DentalToothRecords.Add(tooth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(emptyQuery!, _clinicIdA, 10, CancellationToken.None);

        results.Should().BeEmpty();
    }

    // =========================================================================
    // 12. Limit Clamping and Pagination Boundary Handling
    // =========================================================================
    [Fact]
    public async Task SearchAsync_ClampsLimitAndTruncatesResultsAccurately()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var patientId = Guid.NewGuid();
        for (int i = 11; i <= 35; i++)
        {
            context.DentalToothRecords.Add(CreateTooth(
                _clinicIdA, "tenant-a", patientId, "Juan Dela Cruz", i, ToothStatus.Decay));
        }
        await context.SaveChangesAsync();

        // Limit = 5
        var resultsLimit5 = await provider.SearchAsync("Decay", _clinicIdA, 5, CancellationToken.None);
        resultsLimit5.Should().HaveCount(5);

        // Limit = 0 -> defaults to 10
        var resultsLimit0 = await provider.SearchAsync("Decay", _clinicIdA, 0, CancellationToken.None);
        resultsLimit0.Should().HaveCount(10);

        // Negative limit -> defaults to 10
        var resultsLimitNegative = await provider.SearchAsync("Decay", _clinicIdA, -5, CancellationToken.None);
        resultsLimitNegative.Should().HaveCount(10);
    }

    // =========================================================================
    // 13. Cancellation Token Propagation
    // =========================================================================
    [Fact]
    public async Task SearchAsync_WithCancellationToken_HonorsCancellation()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var act = async () => await provider.SearchAsync("16", _clinicIdA, 10, cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    // =========================================================================
    // 14. Assembly Scanning & Dependency Injection Auto-Discovery
    // =========================================================================
    [Fact]
    public void AddPluggableSearch_AutoDiscoversDentalChartSearchProvider()
    {
        var services = new ServiceCollection();
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        services.AddScoped<IRepository<DentalToothRecord>>(_ => TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve));

        services.AddPluggableSearch<DentalChartSearchProvider>();

        // Verify descriptors registered by reflection scanning
        services.Should().Contain(d => d.ServiceType == typeof(ISearchProvider) && d.ImplementationType == typeof(DentalChartSearchProvider));
        services.Should().Contain(d => d.ServiceType == typeof(DentalChartSearchProvider) && d.ImplementationType == typeof(DentalChartSearchProvider));

        using var rootProvider = services.BuildServiceProvider();
        using var scope = rootProvider.CreateScope();

        var dental = scope.ServiceProvider.GetRequiredService<DentalChartSearchProvider>();
        dental.Should().NotBeNull();
        dental.Category.Should().Be("Dental");
        dental.Priority.Should().Be(25);
        dental.RequiredPermission.Should().Be(ClinicPermissions.ConsultationsRead);
    }

    // =========================================================================
    // 15. End-to-End MediatR Handler Integration & Priority Sorting
    // =========================================================================
    [Fact]
    public async Task GlobalClinicSearchQueryHandler_ExecutesDentalChartSearchProviderAndSortsByPriority()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var dentalProvider = new DentalChartSearchProvider(toothRepo);

        var patientProvider = Substitute.For<ISearchProvider>();
        patientProvider.Category.Returns("Patients");
        patientProvider.Priority.Returns(10);
        patientProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
            {
                new("pat-1", "Patients", "Juan Dela Cruz", "PIN: 1", null, null, "Patients")
            }));

        var tooth = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Juan Dela Cruz", 16, ToothStatus.Decay, "MOD");
        context.DentalToothRecords.Add(tooth);
        await context.SaveChangesAsync();

        var handler = new GlobalClinicSearchQueryHandler(
            new ISearchProvider[] { dentalProvider, patientProvider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        var response = await handler.Handle(new GlobalClinicSearchQuery("Juan"), CancellationToken.None);

        response.TotalCount.Should().Be(2);
        // Priority 10 (Patients) must precede Priority 25 (Dental)
        response.Items[0].Category.Should().Be("Patients");
        response.Items[1].Category.Should().Be("Dental");
        response.Items[1].Title.Should().Contain("Tooth #16");
    }

    [Fact]
    public async Task GlobalClinicSearchQueryHandler_WhenCategoryIsDental_OnlyExecutesDentalProvider()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var dentalProvider = new DentalChartSearchProvider(toothRepo);

        var patientProvider = Substitute.For<ISearchProvider>();
        patientProvider.Category.Returns("Patients");
        patientProvider.Priority.Returns(10);

        var tooth = CreateTooth(_clinicIdA, "tenant-a", Guid.NewGuid(), "Juan Dela Cruz", 16, ToothStatus.Decay);
        context.DentalToothRecords.Add(tooth);
        await context.SaveChangesAsync();

        var handler = new GlobalClinicSearchQueryHandler(
            new ISearchProvider[] { dentalProvider, patientProvider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        var response = await handler.Handle(new GlobalClinicSearchQuery("16", Category: "dental"), CancellationToken.None);

        response.TotalCount.Should().Be(1);
        response.Items[0].Category.Should().Be("Dental");
        await patientProvider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);
    }

    [Fact]
    public async Task GlobalSearch_WithDentalProvider_GatedByConsultationsReadPermission()
    {
        var dentalProvider = Substitute.For<ISearchProvider>();
        dentalProvider.Category.Returns("Dental");
        dentalProvider.Priority.Returns(25);
        dentalProvider.RequiredPermission.Returns(ClinicPermissions.ConsultationsRead);
        dentalProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
            {
                new("dental-1", "Dental", "Tooth #16 — Decay", "Patient: Juan", "Decay", SearchBadgeVariant.Urgent, "Patients")
            }));

        // Case 1: User has ConsultationsRead
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsRead).Returns(true);
        var handler = new GlobalClinicSearchQueryHandler(
            new[] { dentalProvider },
            _clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        var resultGranted = await handler.Handle(new GlobalClinicSearchQuery("Tooth"), CancellationToken.None);
        resultGranted.TotalCount.Should().Be(1);
        resultGranted.Items[0].Category.Should().Be("Dental");

        // Case 2: User lacks ConsultationsRead
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsRead).Returns(false);
        var resultDenied = await handler.Handle(new GlobalClinicSearchQuery("Tooth"), CancellationToken.None);
        resultDenied.TotalCount.Should().Be(0);
        resultDenied.Items.Should().BeEmpty();
    }
}
