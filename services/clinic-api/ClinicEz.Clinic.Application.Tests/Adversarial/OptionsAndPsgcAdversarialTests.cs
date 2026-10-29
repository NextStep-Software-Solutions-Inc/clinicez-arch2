using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Locations;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Options;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Adversarial stress testing for Milestone M2-B:
/// 1. Options endpoints & SHA-256 ETag 304 conditional revalidation.
/// 2. PSGC 10-digit Philippine geographic hierarchy (all 17 regions, provinces, cities, barangays).
/// 3. PSGC prefix and fuzzy search with boundary & adversarial inputs.
/// 4. High-concurrency stress testing across options and PSGC services.
/// </summary>
public sealed class OptionsAndPsgcAdversarialTests
{
    private static (OptionsController Controller, DefaultHttpContext HttpContext, PsgcLocationService PsgcService, ApplicationDbContext DbContext) CreateTestHarness()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("test-tenant");
        clinicContext.ClinicId.Returns(Guid.NewGuid());

        var (db, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var psgcService = new PsgcLocationService(db);

        var catalogQuery = Substitute.For<IPhilHealthCatalogQueryService>();
        catalogQuery.GetLibrariesAsync(Arg.Any<CancellationToken>()).Returns(new List<PhilHealthCatalogLibrarySummary>
        {
            new("lib_sex", "rev20261026", 4, 4, "hash-sex", DateTime.UtcNow, PhilHealthCatalogImportSource.Seed),
            new("lib_civil_status", "rev20261026", 6, 6, "hash-civil", DateTime.UtcNow, PhilHealthCatalogImportSource.Seed),
            new("lib_icd10", "rev20261026", 45000, 45000, "hash-icd10", DateTime.UtcNow, PhilHealthCatalogImportSource.Seed)
        });

        var controller = new OptionsController(catalogQuery, psgcService);
        var httpContext = new DefaultHttpContext();
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        return (controller, httpContext, psgcService, db);
    }

    // ── 1. Options Manifest & ETag 304 Caching Tests ──────────────────────────

    [Fact]
    public void GetManifest_Returns200WithSha256ETagAndCacheControl()
    {
        var (controller, httpContext, _, _) = CreateTestHarness();

        var result = controller.GetManifest();

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        httpContext.Response.Headers.ETag.ToString().Should().NotBeNullOrWhiteSpace();
        httpContext.Response.Headers.ETag.ToString().Trim('"').Should().HaveLength(64);
        httpContext.Response.Headers.CacheControl.ToString().Should().Contain("public");

        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<OptionsManifestResponse>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();
        apiResponse.Data!.ManifestVersion.Should().Be(EhrStaticOptions.StaticManifestVersion);
        apiResponse.Data.OptionSets.Should().ContainKey("sex");
        apiResponse.Data.OptionSets.Should().ContainKey("civil_status");
        apiResponse.Data.OptionSets.Should().ContainKey("blood_type");
    }

    [Fact]
    public void GetManifest_WithMatchingIfNoneMatch_Returns304NotModified()
    {
        var (controller, httpContext, _, _) = CreateTestHarness();
        var manifestVersion = EhrStaticOptions.StaticManifestVersion;
        var validETag = EhrOptionVersionHelper.FormatETag(manifestVersion);

        httpContext.Request.Headers.IfNoneMatch = validETag;

        var result = controller.GetManifest();

        var statusResult = result.Should().BeOfType<StatusCodeResult>().Subject;
        statusResult.StatusCode.Should().Be(StatusCodes.Status304NotModified);
    }

    [Fact]
    public void GetManifest_WithStaleETag_Returns200WithUpdatedETag()
    {
        var (controller, httpContext, _, _) = CreateTestHarness();
        httpContext.Request.Headers.IfNoneMatch = "\"stale_hash_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\"";

        var result = controller.GetManifest();

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        okResult.StatusCode.Should().Be(StatusCodes.Status200OK);
        httpContext.Response.Headers.ETag.ToString().Trim('"').Should().Be(EhrStaticOptions.StaticManifestVersion);
    }

    [Fact]
    public void GetManifest_WithWeakETag_Returns304NotModified()
    {
        var (controller, httpContext, _, _) = CreateTestHarness();
        var weakETag = $"W/{EhrOptionVersionHelper.FormatETag(EhrStaticOptions.StaticManifestVersion)}";
        httpContext.Request.Headers.IfNoneMatch = weakETag;

        var result = controller.GetManifest();

        var statusResult = result.Should().BeOfType<StatusCodeResult>().Subject;
        statusResult.StatusCode.Should().Be(StatusCodes.Status304NotModified);
    }

    [Fact]
    public void GetManifest_WithWildcardIfNoneMatch_Returns304NotModified()
    {
        var (controller, httpContext, _, _) = CreateTestHarness();
        httpContext.Request.Headers.IfNoneMatch = "*";

        var result = controller.GetManifest();

        var statusResult = result.Should().BeOfType<StatusCodeResult>().Subject;
        statusResult.StatusCode.Should().Be(StatusCodes.Status304NotModified);
    }

    // ── 2. Option Set Specific Tests ──────────────────────────────────────────

    [Theory]
    [InlineData("sex")]
    [InlineData("civil_status")]
    [InlineData("blood_type")]
    [InlineData("gender_identity")]
    [InlineData("patient_type")]
    [InlineData("education_level")]
    [InlineData("guardian_relationship")]
    [InlineData("valid_id_type")]
    [InlineData("medicine_route")]
    [InlineData("medicine_frequency")]
    public void GetOptionSet_ForStandardSets_Returns200WithETag(string optionSet)
    {
        var (controller, httpContext, _, _) = CreateTestHarness();

        var result = controller.GetOptionSet(optionSet);

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        httpContext.Response.Headers.ETag.ToString().Trim('"').Should().HaveLength(64);

        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<IReadOnlyCollection<EhrOptionDescriptor>>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();
        apiResponse.Data.Should().NotBeEmpty();

        // Matching ETag returns 304
        var condContext = new DefaultHttpContext();
        condContext.Request.Headers.IfNoneMatch = httpContext.Response.Headers.ETag.ToString();
        controller.ControllerContext = new ControllerContext { HttpContext = condContext };

        var condResult = controller.GetOptionSet(optionSet);
        condResult.Should().BeOfType<StatusCodeResult>().Subject.StatusCode.Should().Be(StatusCodes.Status304NotModified);
    }

    [Theory]
    [InlineData("non_existent_set_9999")]
    [InlineData("unknown_clinical_option_xyz")]
    [InlineData("invalid-hyphenated-option-set")]
    [InlineData("!@#$%^&*()")]
    [InlineData("SELECT * FROM Options")]
    [InlineData("../../etc/passwd")]
    public void GetOptionSet_ForUnknownOrAdversarialInput_Returns404NotFoundNever500(string invalidOptionSet)
    {
        var (controller, _, _, _) = CreateTestHarness();

        var result = controller.GetOptionSet(invalidOptionSet);

        var notFoundResult = result.Should().BeOfType<NotFoundObjectResult>().Subject;
        notFoundResult.StatusCode.Should().Be(StatusCodes.Status404NotFound);
        var body = notFoundResult.Value.Should().BeOfType<ApiResponse<object>>().Subject;
        body.Succeeded.Should().BeFalse();
        body.Message.Should().Contain("not found");
    }

    [Fact]
    public void GetAllOptions_ReturnsAllOptionSetsAndETag()
    {
        var (controller, httpContext, _, _) = CreateTestHarness();

        var result = controller.GetAllOptions();

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        httpContext.Response.Headers.ETag.ToString().Trim('"').Should().Be(EhrStaticOptions.StaticManifestVersion);

        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<IReadOnlyDictionary<string, IReadOnlyList<EhrOptionDescriptor>>>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();
        apiResponse.Data!.Count.Should().BeGreaterThanOrEqualTo(10);
    }

    [Fact]
    public async Task GetCatalogs_ReturnsDynamicLibrarySummariesAndETag()
    {
        var (controller, httpContext, _, _) = CreateTestHarness();

        var result = await controller.GetCatalogs();

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        httpContext.Response.Headers.ETag.ToString().Trim('"').Should().HaveLength(64);

        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<IReadOnlyList<PhilHealthCatalogLibrarySummary>>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();
        apiResponse.Data.Should().HaveCount(3);

        // Conditional 304 check
        var condContext = new DefaultHttpContext();
        condContext.Request.Headers.IfNoneMatch = httpContext.Response.Headers.ETag.ToString();
        controller.ControllerContext = new ControllerContext { HttpContext = condContext };

        var condResult = await controller.GetCatalogs();
        condResult.Should().BeOfType<StatusCodeResult>().Subject.StatusCode.Should().Be(StatusCodes.Status304NotModified);
    }

    // ── 3. PSGC Location Hierarchy Tests ──────────────────────────────────────

    [Fact]
    public async Task GetRegions_ReturnsAll17PhilippineRegionsWith10DigitPsgcCodes()
    {
        var (controller, _, psgcService, _) = CreateTestHarness();

        var result = await controller.GetRegions();

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();
        var regions = apiResponse.Data!;

        // Statutory requirement: exactly 17 administrative regions in the Philippines
        regions.Should().HaveCount(17, "the Philippines has exactly 17 administrative regions");

        foreach (var reg in regions)
        {
            reg.PsgcCode.Should().HaveLength(10, "PSGC codes must be exactly 10 digits");
            reg.PsgcCode.All(char.IsDigit).Should().BeTrue("PSGC codes must be purely numeric");
            reg.Level.Should().Be("Region");
            reg.RegionPsgc.Should().Be(reg.PsgcCode, "A region's RegionPsgc should match its own PSGC code");
        }

        // Verify key statutory region codes
        var regionCodes = regions.Select(r => r.PsgcCode).ToHashSet();
        regionCodes.Should().Contain("1300000000", "NCR");
        regionCodes.Should().Contain("0400000000", "CALABARZON");
        regionCodes.Should().Contain("0300000000", "Central Luzon");
        regionCodes.Should().Contain("0700000000", "Central Visayas");
        regionCodes.Should().Contain("1100000000", "Davao Region");
        regionCodes.Should().Contain("1400000000", "CAR");
        regionCodes.Should().Contain("1500000000", "BARMM");
        regionCodes.Should().Contain("1700000000", "MIMAROPA");
    }

    [Fact]
    public async Task GetProvinces_CascadingFilterByRegion_ReturnsCorrectProvinces()
    {
        var (controller, _, _, _) = CreateTestHarness();

        // 1. CALABARZON (0400000000) -> 5 provinces
        var resultCalabarzon = await controller.GetProvinces(regionPsgc: "0400000000");
        var calabarzonList = resultCalabarzon.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;

        calabarzonList.Should().HaveCount(5);
        calabarzonList.Select(p => p.Name).Should().Contain(["Batangas", "Cavite", "Laguna", "Quezon", "Rizal"]);

        // 2. NCR (1300000000) -> 4 districts
        var resultNcr = await controller.GetProvinces(regionPsgc: "1300000000");
        var ncrList = resultNcr.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;

        ncrList.Should().HaveCount(4);
        ncrList.All(p => p.Level == "Province").Should().BeTrue();

        // 2b. Region X (Northern Mindanao, 1000000000) -> 5 provinces
        var resultRegionX = await controller.GetProvinces(regionPsgc: "1000000000");
        var regionXList = resultRegionX.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;

        regionXList.Should().HaveCount(5);
        regionXList.Select(p => p.Name).Should().Contain(["Bukidnon", "Camiguin", "Lanao del Norte", "Misamis Occidental", "Misamis Oriental"]);

        // 2c. Every single Philippine region cascades to >= 1 province/district
        var allRegionsResult = await controller.GetRegions();
        var allRegions = allRegionsResult.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;
        foreach (var reg in allRegions)
        {
            var regProvs = (await controller.GetProvinces(reg.PsgcCode)).Should().BeOfType<OkObjectResult>().Subject
                .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;
            regProvs.Should().NotBeEmpty($"Region {reg.Name} ({reg.PsgcCode}) must have provinces/districts");
        }

        // 3. Non-existent region -> empty collection (200 OK, never 500)
        var resultEmpty = await controller.GetProvinces(regionPsgc: "9999999999");
        var emptyList = resultEmpty.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;
        emptyList.Should().BeEmpty();
    }

    [Fact]
    public async Task GetCities_CascadingFilterByProvinceAndRegion_ReturnsCorrectCities()
    {
        var (controller, _, _, _) = CreateTestHarness();

        // 1. Province filter: Cavite (0421000000) -> all 23 cities/municipalities including Bacoor, Dasmariñas, Imus
        var resultCavite = await controller.GetCities(provincePsgc: "0421000000", regionPsgc: null);
        var caviteCities = resultCavite.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;

        caviteCities.Should().HaveCount(23);
        caviteCities.Select(c => c.Name).Should().Contain(["City of Bacoor", "City of Dasmariñas", "City of Imus"]);

        // 2. Direct Region filter: NCR (1300000000) -> all 17 NCR cities/municipalities
        var resultNcr = await controller.GetCities(provincePsgc: null, regionPsgc: "1300000000");
        var ncrCities = resultNcr.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;

        ncrCities.Should().HaveCount(17);
        ncrCities.Select(c => c.Name).Should().Contain(["City of Manila", "Quezon City", "City of Makati", "City of Pasig", "City of Taguig"]);

        // 2b. Region X Misamis Oriental (1043000000) -> includes City of Cagayan de Oro (1043050000)
        var resultMisOr = await controller.GetCities(provincePsgc: "1043000000", regionPsgc: null);
        var misOrCities = resultMisOr.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;
        misOrCities.Should().Contain(c => c.PsgcCode == "1043050000" && c.Name.Contains("Cagayan de Oro", StringComparison.OrdinalIgnoreCase));

        // 3. Non-existent province -> empty collection (200 OK, never 500)
        var resultEmpty = await controller.GetCities(provincePsgc: "9999999999", regionPsgc: null);
        var emptyCities = resultEmpty.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;
        emptyCities.Should().BeEmpty();
    }

    [Fact]
    public async Task GetBarangays_FilterByCity_ReturnsCorrectBarangays()
    {
        var (controller, _, _, _) = CreateTestHarness();

        // 1. City of Manila (1339010000) -> 897 barangays across all Manila districts
        var resultManila = await controller.GetBarangays(cityMunicipalityPsgc: "1339010000");
        var manilaBarangays = resultManila.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;

        manilaBarangays.Should().HaveCount(897);
        manilaBarangays.Should().Contain(b => b.Name.Contains("Ermita", StringComparison.OrdinalIgnoreCase));
        manilaBarangays.Should().Contain(b => b.Name.Contains("Malate", StringComparison.OrdinalIgnoreCase));

        // 2. City of Makati (1376020000) -> 33 barangays
        var resultMakati = await controller.GetBarangays(cityMunicipalityPsgc: "1376020000");
        var makatiBarangays = resultMakati.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;

        makatiBarangays.Should().HaveCount(33);
        makatiBarangays.Select(b => b.Name).Should().Contain(["Bel-Air", "Poblacion", "San Antonio", "Urdaneta"]);

        // 3. Cebu City (0722170000) -> 80 barangays
        var resultCebu = await controller.GetBarangays(cityMunicipalityPsgc: "0722170000");
        var cebuBarangays = resultCebu.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;

        cebuBarangays.Should().HaveCount(80);
        cebuBarangays.Select(b => b.Name).Should().Contain(["Apas", "Banilad", "Guadalupe", "Mabolo"]);

        // 4. Missing / empty parameter -> 400 Bad Request, never 500
        var resultMissing = await controller.GetBarangays(cityMunicipalityPsgc: "");
        var badRequest = resultMissing.Should().BeOfType<BadRequestObjectResult>().Subject;
        badRequest.StatusCode.Should().Be(StatusCodes.Status400BadRequest);

        var resultWhitespace = await controller.GetBarangays(cityMunicipalityPsgc: "   ");
        resultWhitespace.Should().BeOfType<BadRequestObjectResult>().Subject.StatusCode.Should().Be(StatusCodes.Status400BadRequest);

        // 5. Non-existent city -> empty collection (200 OK, never 500)
        var resultNonExistent = await controller.GetBarangays(cityMunicipalityPsgc: "9999999999");
        var nonExistentBarangays = resultNonExistent.Should().BeOfType<OkObjectResult>().Subject
            .Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;
        nonExistentBarangays.Should().BeEmpty();
    }

    // ── 4. PSGC Location Search Tests ─────────────────────────────────────────

    [Theory]
    [InlineData("manila", 2)] // City of Manila, First District
    [InlineData("makati", 1)] // City of Makati
    [InlineData("cebu", 2)]   // Cebu province, Cebu City
    [InlineData("davao", 3)]  // Davao del Sur, Davao del Norte, Davao City
    [InlineData("quezon", 2)] // Quezon province, Quezon City
    [InlineData("diliman", 1)] // Barangay Diliman in Quezon City
    public async Task SearchLocations_ByName_ReturnsMatchingHierarchy(string query, int minimumMatches)
    {
        var (controller, _, _, _) = CreateTestHarness();

        var result = await controller.SearchLocations(q: query, limit: 50);

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var results = okResult.Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;

        results.Count.Should().BeGreaterThanOrEqualTo(minimumMatches);
        results.All(r => r.Name.Contains(query, StringComparison.OrdinalIgnoreCase) || r.PsgcCode.StartsWith(query, StringComparison.OrdinalIgnoreCase)).Should().BeTrue();
    }

    [Fact]
    public async Task SearchLocations_CaseInsensitiveMatching_ReturnsIdenticalResults()
    {
        var (controller, _, _, _) = CreateTestHarness();

        var lowerResult = await controller.SearchLocations(q: "makati");
        var upperResult = await controller.SearchLocations(q: "MAKATI");
        var mixedResult = await controller.SearchLocations(q: "MaKaTi");

        var lowerList = lowerResult.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;
        var upperList = upperResult.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;
        var mixedList = mixedResult.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;

        lowerList.Select(x => x.PsgcCode).Should().Equal(upperList.Select(x => x.PsgcCode));
        lowerList.Select(x => x.PsgcCode).Should().Equal(mixedList.Select(x => x.PsgcCode));
    }

    [Theory]
    [InlineData("1339", 7)] // Manila code prefix: district, city, 5 barangays
    [InlineData("0722", 8)] // Cebu code prefix
    [InlineData("0421", 4)] // Cavite code prefix
    public async Task SearchLocations_ByCodePrefix_ReturnsPrefixMatches(string codePrefix, int minimumExpected)
    {
        var (controller, _, _, _) = CreateTestHarness();

        var result = await controller.SearchLocations(q: codePrefix, limit: 50);

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var list = okResult.Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;

        list.Count.Should().BeGreaterThanOrEqualTo(minimumExpected);
        list.All(r => r.PsgcCode.StartsWith(codePrefix)).Should().BeTrue();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task SearchLocations_WithEmptyOrWhitespaceQuery_ReturnsEmptyListNever500(string? emptyQuery)
    {
        var (controller, _, _, _) = CreateTestHarness();

        var result = await controller.SearchLocations(q: emptyQuery, limit: 50);

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var list = okResult.Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;
        list.Should().BeEmpty();
    }

    [Fact]
    public async Task SearchLocations_WithNonExistentQuery_ReturnsEmptyListGracefully()
    {
        var (controller, _, _, _) = CreateTestHarness();

        var result = await controller.SearchLocations(q: "NonExistentPlaceXYZ987654321", limit: 50);

        var okResult = result.Should().BeOfType<OkObjectResult>().Subject;
        var list = okResult.Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;
        list.Should().BeEmpty();
    }

    [Fact]
    public async Task SearchLocations_LimitParameterClamping_ClampsBetween1And200()
    {
        var (controller, _, _, _) = CreateTestHarness();

        // 1. Limit = 2
        var resultClampedLow = await controller.SearchLocations(q: "City", limit: 2);
        var lowList = resultClampedLow.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;
        lowList.Count.Should().Be(2);

        // 2. Limit = 500 (clamped to at most 200, returns all 17 regions)
        var resultClampedHigh = await controller.SearchLocations(q: "Region", limit: 500);
        var highList = resultClampedHigh.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<ApiResponse<IReadOnlyList<PsgcLocationDto>>>().Subject.Data!;
        highList.Count.Should().Be(17);
    }

    // ── 5. High-Concurrency Stress Test ───────────────────────────────────────

    [Fact]
    public async Task HighConcurrencyStressTest_OptionsAndPsgcQueries_ExecuteDeterministically()
    {
        const int concurrentWorkers = 80;

        // Shared database context seed to ensure PsgcLocations table is seeded before concurrent queries
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("concurrent-tenant");
        clinicContext.ClinicId.Returns(Guid.NewGuid());
        var (sharedDb, _, _) = TestDbHelper.CreateSharedTestContext("PsgcConcurrencyTestDb", clinicContext);
        var seeder = new PsgcLocationService(sharedDb);
        await seeder.GetRegionsAsync(); // seeds database once

        var tasks = Enumerable.Range(0, concurrentWorkers).Select(async i =>
        {
            // Each worker creates its own scoped DbContext against the shared in-memory DB
            var workerContext = Substitute.For<IClinicContext>();
            workerContext.TenantId.Returns("concurrent-tenant");
            workerContext.ClinicId.Returns(Guid.NewGuid());
            var (workerDb, _, _) = TestDbHelper.CreateSharedTestContext("PsgcConcurrencyTestDb", workerContext);

            var workerPsgc = new PsgcLocationService(workerDb);
            var catalogQuery = Substitute.For<IPhilHealthCatalogQueryService>();
            var controller = new OptionsController(catalogQuery, workerPsgc);
            controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };

            switch (i % 8)
            {
                case 0:
                    var m = controller.GetManifest();
                    m.Should().BeOfType<OkObjectResult>();
                    break;
                case 1:
                    var s = controller.GetOptionSet("sex");
                    s.Should().BeOfType<OkObjectResult>();
                    break;
                case 2:
                    var c = controller.GetOptionSet("civil_status");
                    c.Should().BeOfType<OkObjectResult>();
                    break;
                case 3:
                    var r = await controller.GetRegions();
                    r.Should().BeOfType<OkObjectResult>();
                    break;
                case 4:
                    var p = await controller.GetProvinces("0400000000");
                    p.Should().BeOfType<OkObjectResult>();
                    break;
                case 5:
                    var ct = await controller.GetCities("0421000000", null);
                    ct.Should().BeOfType<OkObjectResult>();
                    break;
                case 6:
                    var b = await controller.GetBarangays("1339010000");
                    b.Should().BeOfType<OkObjectResult>();
                    break;
                case 7:
                    var q = await controller.SearchLocations("Makati", 10);
                    q.Should().BeOfType<OkObjectResult>();
                    break;
            }
        });

        var act = () => Task.WhenAll(tasks);
        await act.Should().NotThrowAsync("Concurrent execution across options and PSGC services must be thread-safe");
    }
}
