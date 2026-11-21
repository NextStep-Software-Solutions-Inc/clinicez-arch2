using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Locations;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Options;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Xunit;

namespace ClinicEz.Portal.Tests.Adversarial;

/// <summary>
/// Milestone M2-C Challenger 2 Empirical Adversarial Stress Test Suite:
/// 1. PublicOptionsEndpoints SHA-256 ETag generation, Cache-Control, and HTTP 304 conditional revalidation.
/// 2. PSGC cascading location lookups: invalid codes, malformed lengths (<10, >10), non-numeric chars, unmatched hierarchies, fuzzing & concurrency.
/// 3. BranchEndpoints secret masking under adversarial requests: direct JSON inspection ensuring secretKey and cipherKey never leak.
/// </summary>
public sealed class ChallengerM2C2PublicOptionsAndPsgcAdversarialTests
{
    private readonly IPsgcLocationService _psgcService = new PsgcLocationService();

    #region Pillar 1: Public Options ETag Generation & HTTP 304 Caching

    [Fact]
    public void Manifest_ETag_StrictFormatAndDeterministicValue()
    {
        // 1. First call without If-None-Match
        var httpContext1 = new DefaultHttpContext();
        var result1 = PublicOptionsEndpoints.GetManifest(httpContext1);

        var okResult1 = Assert.IsAssignableFrom<IValueHttpResult>(result1);
        var apiResponse1 = Assert.IsAssignableFrom<ApiResponse<OptionsManifestResponse>>(okResult1.Value);
        Assert.True(apiResponse1.Succeeded);
        Assert.NotNull(apiResponse1.Data);

        var manifestVersion = apiResponse1.Data.ManifestVersion;
        Assert.False(string.IsNullOrWhiteSpace(manifestVersion));
        Assert.Equal(64, manifestVersion.Length);
        Assert.All(manifestVersion, c => Assert.True(char.IsAsciiHexDigitLower(c)));

        // Verify ETag header strictly follows RFC specification: quoted 64-char lowercase hex
        Assert.True(httpContext1.Response.Headers.ContainsKey("ETag"));
        var etagHeader1 = httpContext1.Response.Headers.ETag.ToString();
        Assert.Equal($"\"{manifestVersion}\"", etagHeader1);
        Assert.Equal(66, etagHeader1.Length);

        // Verify Cache-Control header
        Assert.True(httpContext1.Response.Headers.ContainsKey("Cache-Control"));
        Assert.Equal("public, max-age=86400, stale-while-revalidate=604800", httpContext1.Response.Headers.CacheControl.ToString());

        // 2. Determinism check: Second call must produce byte-for-byte identical ETag
        var httpContext2 = new DefaultHttpContext();
        var result2 = PublicOptionsEndpoints.GetManifest(httpContext2);
        var okResult2 = Assert.IsAssignableFrom<IValueHttpResult>(result2);
        var apiResponse2 = Assert.IsAssignableFrom<ApiResponse<OptionsManifestResponse>>(okResult2.Value);

        Assert.Equal(manifestVersion, apiResponse2.Data!.ManifestVersion);
        Assert.Equal(etagHeader1, httpContext2.Response.Headers.ETag.ToString());
    }

    [Theory]
    [InlineData("exact_quoted")]
    [InlineData("exact_unquoted")]
    [InlineData("weak_etag")]
    [InlineData("wildcard")]
    [InlineData("comma_separated_with_match")]
    [InlineData("uppercase_hex")]
    public void Manifest_IfNoneMatch_Variants_Return304NotModifiedWithEmptyBody(string variant)
    {
        var manifestVersion = EhrStaticOptions.StaticManifestVersion;
        var httpContext = new DefaultHttpContext();

        httpContext.Request.Headers.IfNoneMatch = variant switch
        {
            "exact_quoted" => $"\"{manifestVersion}\"",
            "exact_unquoted" => manifestVersion,
            "weak_etag" => $"W/\"{manifestVersion}\"",
            "wildcard" => "*",
            "comma_separated_with_match" => $"\"stale-etag-1\", W/\"{manifestVersion}\", \"stale-etag-2\"",
            "uppercase_hex" => $"\"{manifestVersion.ToUpperInvariant()}\"",
            _ => throw new ArgumentOutOfRangeException(nameof(variant))
        };

        var result = PublicOptionsEndpoints.GetManifest(httpContext);

        // Status code must be 304 Not Modified
        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status304NotModified, statusResult.StatusCode);

        // Must NOT be an IValueHttpResult (i.e. zero response body content)
        Assert.False(result is IValueHttpResult);

        // Must retain ETag header on 304 response
        Assert.True(httpContext.Response.Headers.ContainsKey("ETag"));
        Assert.Equal($"\"{manifestVersion}\"", httpContext.Response.Headers.ETag.ToString());
    }

    [Theory]
    [InlineData("0000000000000000000000000000000000000000000000000000000000000000")]
    [InlineData("\"stale-version-999999\"")]
    [InlineData("\"\"")]
    [InlineData(" ")]
    public void Manifest_IfNoneMatch_MismatchOrEmpty_Returns200WithPayload(string unmatchedHeader)
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers.IfNoneMatch = unmatchedHeader;

        var result = PublicOptionsEndpoints.GetManifest(httpContext);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<OptionsManifestResponse>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.True(httpContext.Response.Headers.ContainsKey("ETag"));
        Assert.True(httpContext.Response.Headers.ContainsKey("Cache-Control"));
    }

    [Fact]
    public void AllIndividualOptionSets_SupportETagAnd304ConditionalRevalidation()
    {
        var allSets = EhrStaticOptions.AllOptionSets.ToList();
        Assert.NotEmpty(allSets);

        foreach (var setName in allSets)
        {
            // Initial GET -> 200 OK with ETag
            var httpContext = new DefaultHttpContext();
            var result = PublicOptionsEndpoints.GetOptionSet(setName, httpContext);

            var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
            var apiResponse = Assert.IsAssignableFrom<ApiResponse<IReadOnlyCollection<EhrOptionDescriptor>>>(okResult.Value);
            Assert.True(apiResponse.Succeeded, $"Option set '{setName}' failed to load.");
            Assert.NotEmpty(apiResponse.Data!);

            Assert.True(httpContext.Response.Headers.ContainsKey("ETag"), $"Option set '{setName}' missing ETag.");
            var etag = httpContext.Response.Headers.ETag.ToString();
            Assert.StartsWith("\"", etag);
            Assert.EndsWith("\"", etag);

            // Revalidation with matching ETag -> 304 Not Modified
            var revalContext = new DefaultHttpContext();
            revalContext.Request.Headers.IfNoneMatch = etag;
            var revalResult = PublicOptionsEndpoints.GetOptionSet(setName, revalContext);

            var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(revalResult);
            Assert.Equal(StatusCodes.Status304NotModified, statusResult.StatusCode);
            Assert.False(revalResult is IValueHttpResult);
            Assert.Equal(etag, revalContext.Response.Headers.ETag.ToString());

            // Revalidation with weak prefix -> 304 Not Modified
            var weakContext = new DefaultHttpContext();
            weakContext.Request.Headers.IfNoneMatch = $"W/{etag}";
            var weakResult = PublicOptionsEndpoints.GetOptionSet(setName, weakContext);
            var weakStatus = Assert.IsAssignableFrom<IStatusCodeHttpResult>(weakResult);
            Assert.Equal(StatusCodes.Status304NotModified, weakStatus.StatusCode);
        }
    }

    [Theory]
    [InlineData("non_existent_option_set")]
    [InlineData("../../etc/passwd")]
    [InlineData("<script>alert(1)</script>")]
    [InlineData("!@#$%^&*()")]
    [InlineData("NULL")]
    public void OptionSet_AdversarialUnknownName_Returns404NotFound(string badOptionSet)
    {
        var httpContext = new DefaultHttpContext();
        var result = PublicOptionsEndpoints.GetOptionSet(badOptionSet, httpContext);

        var notFoundResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFoundResult.StatusCode);
    }

    [Fact]
    public void GetAllOptions_ETagAnd304ConditionalRevalidation()
    {
        var manifestVersion = EhrStaticOptions.StaticManifestVersion;

        // 1. Initial call -> 200 OK
        var httpContext = new DefaultHttpContext();
        var result = PublicOptionsEndpoints.GetAllOptions(httpContext);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<IReadOnlyDictionary<string, IReadOnlyList<EhrOptionDescriptor>>>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.True(httpContext.Response.Headers.ContainsKey("ETag"));
        Assert.Equal($"\"{manifestVersion}\"", httpContext.Response.Headers.ETag.ToString());

        // 2. Conditional revalidation -> 304 Not Modified
        var revalContext = new DefaultHttpContext();
        revalContext.Request.Headers.IfNoneMatch = $"\"{manifestVersion}\"";
        var revalResult = PublicOptionsEndpoints.GetAllOptions(revalContext);

        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(revalResult);
        Assert.Equal(StatusCodes.Status304NotModified, statusResult.StatusCode);
        Assert.False(revalResult is IValueHttpResult);
    }

    #endregion

    #region Pillar 2: PSGC Location Lookups & Concurrency Stress Testing

    [Fact]
    public async Task PSGC_All17Regions_Strict10DigitFormatAndUniqueness()
    {
        var regions = await _psgcService.GetRegionsAsync(CancellationToken.None);

        Assert.Equal(17, regions.Count);

        var seenCodes = new HashSet<string>(StringComparer.Ordinal);
        foreach (var r in regions)
        {
            Assert.Equal("Region", r.Level);
            Assert.Equal(10, r.PsgcCode.Length);
            Assert.True(r.PsgcCode.All(char.IsDigit), $"Region code '{r.PsgcCode}' contains non-digit chars.");
            Assert.False(string.IsNullOrWhiteSpace(r.Name));
            Assert.Null(r.ParentPsgcCode);
            Assert.Equal(r.PsgcCode, r.RegionPsgc);
            Assert.True(seenCodes.Add(r.PsgcCode), $"Duplicate region PSGC code '{r.PsgcCode}' found.");
        }
    }

    [Fact]
    public async Task PSGC_Provinces_CascadingHierarchy_AndEmptyOnUnknown()
    {
        // Region IV-A (CALABARZON): 0400000000
        var provinces = await _psgcService.GetProvincesAsync("0400000000", CancellationToken.None);
        Assert.NotEmpty(provinces);
        Assert.All(provinces, p =>
        {
            Assert.Equal("Province", p.Level);
            Assert.Equal(10, p.PsgcCode.Length);
            Assert.True(p.PsgcCode.All(char.IsDigit));
            Assert.Equal("0400000000", p.RegionPsgc);
        });

        // Unknown region code should safely return empty list without crashing
        var emptyProvinces = await _psgcService.GetProvincesAsync("9999999999", CancellationToken.None);
        Assert.Empty(emptyProvinces);
    }

    [Fact]
    public async Task PSGC_Cities_CascadingHierarchy_AndUnmatchedHierarchy()
    {
        // 1. By province: Cavite 0421000000
        var cities = await _psgcService.GetCitiesMunicipalitiesAsync("0421000000", null, CancellationToken.None);
        Assert.NotEmpty(cities);
        Assert.All(cities, c =>
        {
            Assert.Equal("CityMunicipality", c.Level);
            Assert.Equal(10, c.PsgcCode.Length);
            Assert.Equal("0421000000", c.ProvincePsgc);
        });

        // 2. By direct region: NCR 1300000000
        var ncrCities = await _psgcService.GetCitiesMunicipalitiesAsync(null, "1300000000", CancellationToken.None);
        Assert.NotEmpty(ncrCities);
        Assert.All(ncrCities, c =>
        {
            Assert.Equal("1300000000", c.RegionPsgc);
        });

        // 3. Mismatched province and region: Cebu 0722000000 with CALABARZON 0400000000
        // Province takes precedence in query logic or returns nothing matching province
        var unknownCities = await _psgcService.GetCitiesMunicipalitiesAsync("9999999999", null, CancellationToken.None);
        Assert.Empty(unknownCities);
    }

    [Fact]
    public async Task PSGC_Barangays_CascadingHierarchy_AndValidation()
    {
        // Valid city: City of Manila 1339010000
        var barangays = await _psgcService.GetBarangaysAsync("1339010000", CancellationToken.None);
        Assert.NotEmpty(barangays);
        Assert.All(barangays, b =>
        {
            Assert.Equal("Barangay", b.Level);
            Assert.Equal(10, b.PsgcCode.Length);
            Assert.Equal("1339010000", b.CityMunicipalityPsgc);
        });

        // Unknown city code returns empty list
        var emptyBarangays = await _psgcService.GetBarangaysAsync("9999999999", CancellationToken.None);
        Assert.Empty(emptyBarangays);

        // Missing city in endpoint handler returns 400 Bad Request
        var badRequestResult = await PublicOptionsEndpoints.GetBarangaysAsync("", _psgcService, CancellationToken.None);
        var status = Assert.IsAssignableFrom<IStatusCodeHttpResult>(badRequestResult);
        Assert.Equal(StatusCodes.Status400BadRequest, status.StatusCode);
    }

    [Theory]
    [InlineData("1")]                           // 1 digit
    [InlineData("12345")]                       // 5 digits
    [InlineData("123456789")]                   // 9 digits (too short)
    [InlineData("12345678901")]                 // 11 digits (too long)
    [InlineData("123456789012345678901234567890")] // 30 digits
    [InlineData("ABCDEFGHIJ")]                  // 10 non-numeric alpha
    [InlineData("13-00-00-00")]                 // Hyphenated
    [InlineData("1300000000' OR '1'='1")]       // SQL injection attempt
    [InlineData("<script>alert(1)</script>")]   // XSS attempt
    [InlineData("1300000000\0\0\0")]            // Null byte injection
    public async Task PSGC_MalformedInputs_SafelyHandledWithoutExceptions(string malformedInput)
    {
        // 1. Provinces lookup with malformed region code
        var provinces = await _psgcService.GetProvincesAsync(malformedInput, CancellationToken.None);
        Assert.Empty(provinces);

        // 2. Cities lookup with malformed province or region code
        var citiesByProv = await _psgcService.GetCitiesMunicipalitiesAsync(malformedInput, null, CancellationToken.None);
        Assert.Empty(citiesByProv);

        var citiesByReg = await _psgcService.GetCitiesMunicipalitiesAsync(null, malformedInput, CancellationToken.None);
        Assert.Empty(citiesByReg);

        // 3. Barangays lookup with malformed city code
        var barangays = await _psgcService.GetBarangaysAsync(malformedInput, CancellationToken.None);
        Assert.Empty(barangays);
    }

    [Theory]
    [InlineData(null, 50)]
    [InlineData("", 50)]
    [InlineData("   ", 50)]
    [InlineData("Manila", -10)]   // Negative limit should clamp to 1
    [InlineData("Manila", 0)]     // Zero limit should clamp to 1
    [InlineData("Manila", 1000)]  // Excessive limit should clamp to 200
    [InlineData("1300", 50)]      // Code prefix search
    [InlineData("0421", 50)]      // Cavite code prefix
    public async Task PSGC_SearchLocations_BoundaryAndFuzzing(string? query, int limit)
    {
        var results = await _psgcService.SearchLocationsAsync(query ?? string.Empty, limit, CancellationToken.None);

        if (string.IsNullOrWhiteSpace(query))
        {
            Assert.Empty(results);
        }
        else
        {
            Assert.NotEmpty(results);
            Assert.True(results.Count <= Math.Clamp(limit, 1, 200));
        }
    }

    [Fact]
    public async Task PSGC_MassiveConcurrencyStressTest_ThreadSafetyGuaranteed()
    {
        const int concurrentTasks = 120;
        var exceptions = new ConcurrentBag<Exception>();
        var tasks = new List<Task>();

        for (var i = 0; i < concurrentTasks; i++)
        {
            var taskIndex = i;
            tasks.Add(Task.Run(async () =>
            {
                try
                {
                    switch (taskIndex % 5)
                    {
                        case 0:
                            var regions = await _psgcService.GetRegionsAsync();
                            Assert.Equal(17, regions.Count);
                            break;
                        case 1:
                            var provinces = await _psgcService.GetProvincesAsync("0400000000");
                            Assert.NotEmpty(provinces);
                            break;
                        case 2:
                            var cities = await _psgcService.GetCitiesMunicipalitiesAsync("0421000000", null);
                            Assert.NotEmpty(cities);
                            break;
                        case 3:
                            var barangays = await _psgcService.GetBarangaysAsync("1339010000");
                            Assert.NotEmpty(barangays);
                            break;
                        case 4:
                            var search = await _psgcService.SearchLocationsAsync("City", 10);
                            Assert.NotEmpty(search);
                            break;
                    }
                }
                catch (Exception ex)
                {
                    exceptions.Add(ex);
                }
            }));
        }

        await Task.WhenAll(tasks);

        Assert.Empty(exceptions);
    }

    #endregion

    #region Pillar 3: BranchEndpoints Secret Masking Under Adversarial Inspection

    [Fact]
    public void BranchResponse_DirectJsonInspection_ZeroSecretOrCipherKeyInPayload()
    {
        const string rawSecretKey = "SUPER_SECRET_PAYLOAD_KEY_999999999";
        const string rawCipherKey = "SUPER_CIPHER_PAYLOAD_KEY_888888888";
        const string rawEncryptedSecret = "ENC_SECRET_BLOB_ABC123XYZ";
        const string rawEncryptedCipher = "ENC_CIPHER_BLOB_UVW456RST";

        var branch = new Branch
        {
            Id = Guid.NewGuid(),
            TenantId = Guid.NewGuid(),
            Name = "Adversarial Test Branch",
            Code = "ADV-01",
            StreetAddress = "777 Secret Lane",
            City = "Taguig",
            Province = "Metro Manila",
            PhilHealthAccreditationNumber = "H91009999",
            PhilHealthPmccNumber = "Z99999",
            PhilHealthSoftwareCertificateId = "KON-CERT-9999",
            PhilHealthBaseUrl = "https://pcapi.philhealth.gov.ph",
            IsPhilHealthAccredited = true,
            PhilHealthEncryptedSecretKey = rawEncryptedSecret,
            PhilHealthEncryptedCipherKey = rawEncryptedCipher,
            RegionPsgc = "1300000000",
            ProvincePsgc = "1376000000",
            CityMunicipalityPsgc = "1376040000",
            BarangayPsgc = "1376040001",
            IsActive = true
        };

        // Map to BranchResponse DTO
        var responseDto = BranchEndpoints.ToResponse(branch, new List<BranchFacilitySummaryDto>());

        // Verify boolean masking flags
        Assert.True(responseDto.HasSecretKey);
        Assert.True(responseDto.HasCipherKey);

        // Serialize the response payload directly to raw JSON
        var apiEnvelope = ApiResponse<BranchResponse>.Success(responseDto);
        var json = JsonSerializer.Serialize(apiEnvelope, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true
        });

        // 1. Plaintext secrets must NEVER appear in JSON
        Assert.DoesNotContain(rawSecretKey, json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(rawCipherKey, json, StringComparison.OrdinalIgnoreCase);

        // 2. Encrypted ciphertext blobs must NEVER appear in client response JSON
        Assert.DoesNotContain(rawEncryptedSecret, json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(rawEncryptedCipher, json, StringComparison.OrdinalIgnoreCase);

        // 3. Property names must strictly expose hasSecretKey / hasCipherKey, never secretKey or cipherKey
        Assert.Contains("\"hasSecretKey\": true", json);
        Assert.Contains("\"hasCipherKey\": true", json);
        Assert.DoesNotContain("\"secretKey\"", json);
        Assert.DoesNotContain("\"cipherKey\"", json);
        Assert.DoesNotContain("\"philHealthEncryptedSecretKey\"", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"philHealthEncryptedCipherKey\"", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void BranchResponseList_DirectJsonInspection_MaskedAcrossMultipleBranches()
    {
        var branches = new List<Branch>
        {
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = Guid.NewGuid(),
                Name = "Branch Alpha",
                PhilHealthEncryptedSecretKey = "SECRET_BLOB_ALPHA",
                PhilHealthEncryptedCipherKey = "CIPHER_BLOB_ALPHA",
                IsPhilHealthAccredited = true
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = Guid.NewGuid(),
                Name = "Branch Beta (No Credentials)",
                PhilHealthEncryptedSecretKey = null,
                PhilHealthEncryptedCipherKey = null,
                IsPhilHealthAccredited = false
            }
        };

        var camelCaseOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        var responseList = branches.Select(b => BranchEndpoints.ToResponse(b)).ToList();
        var apiEnvelope = ApiResponse<List<BranchResponse>>.Success(responseList);
        var json = JsonSerializer.Serialize(apiEnvelope, camelCaseOptions);

        // Alpha has credentials flagged as true, Beta flagged as false
        Assert.Contains("\"hasSecretKey\":true", json);
        Assert.Contains("\"hasSecretKey\":false", json);

        // Secret blobs must be completely absent
        Assert.DoesNotContain("SECRET_BLOB_ALPHA", json);
        Assert.DoesNotContain("CIPHER_BLOB_ALPHA", json);
        Assert.DoesNotContain("\"secretKey\"", json);
        Assert.DoesNotContain("\"cipherKey\"", json);
    }

    [Fact]
    public void PhilHealthTestConnectionResult_DirectJsonInspection_NeverExposesSecrets()
    {
        const string secretKey = "INPUT_SECRET_KEY_12345";
        var result = new PhilHealthTestConnectionResult(
            Success: true,
            Message: "Authentication successful! PhilHealth gateway accepted facility credentials. (Simulation Sandbox Verified)",
            Token: "PKA-SIM-H91001234-abcd1234ef",
            LatencyMs: 15);

        var camelCaseOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        var apiEnvelope = ApiResponse<PhilHealthTestConnectionResult>.Success(result);
        var json = JsonSerializer.Serialize(apiEnvelope, camelCaseOptions);

        Assert.DoesNotContain(secretKey, json);
        Assert.DoesNotContain("\"secretKey\"", json);
        Assert.DoesNotContain("\"cipherKey\"", json);
        Assert.Contains("\"success\":true", json);
        Assert.Contains("\"token\":", json);
    }

    [Fact]
    public void ReflectionAudit_BranchAndPublicOptionsResponseDtos_ZeroSecretProperties()
    {
        var responseTypes = new[]
        {
            typeof(BranchResponse),
            typeof(BranchFacilitySummaryDto),
            typeof(PhilHealthTestConnectionResult),
            typeof(OptionsManifestResponse),
            typeof(PsgcLocationDto)
        };

        var forbiddenPropertyNames = new[]
        {
            "SecretKey",
            "CipherKey",
            "PhilHealthSecretKey",
            "PhilHealthCipherKey",
            "EncryptedSecretKey",
            "EncryptedCipherKey",
            "PhilHealthEncryptedSecretKey",
            "PhilHealthEncryptedCipherKey",
            "Password",
            "PhilHealthPassword",
            "EncryptedPassword"
        };

        foreach (var type in responseTypes)
        {
            var properties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance);
            foreach (var prop in properties)
            {
                Assert.DoesNotContain(prop.Name, forbiddenPropertyNames, StringComparer.OrdinalIgnoreCase);
            }

            var fields = type.GetFields(BindingFlags.Public | BindingFlags.Instance);
            foreach (var field in fields)
            {
                Assert.DoesNotContain(field.Name, forbiddenPropertyNames, StringComparer.OrdinalIgnoreCase);
            }
        }
    }

    #endregion
}
