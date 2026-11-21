using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Options;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

public sealed record OptionsManifestResponse(
    string ManifestVersion,
    IReadOnlyDictionary<string, string> OptionSets);

/// <summary>
/// Tier A Static Options & Tier B Global Location/Catalog Reference endpoints.
/// Supports deterministic SHA-256 ETags and conditional HTTP 304 Not Modified revalidation.
/// </summary>
[ApiController]
public sealed class OptionsController : ControllerBase
{
    private const string CacheControlHeaderValue = "public, max-age=86400, stale-while-revalidate=604800";

    private readonly IPhilHealthCatalogQueryService _catalogQuery;
    private readonly IPsgcLocationService _psgcService;

    public OptionsController(
        IPhilHealthCatalogQueryService catalogQuery,
        IPsgcLocationService psgcService)
    {
        _catalogQuery = catalogQuery;
        _psgcService = psgcService;
    }

    // ── Tier A: Static Options Manifest ───────────────────────────────────────

    /// <summary>Retrieves the Tier A static options manifest with aggregate and per-set version hashes.</summary>
    [HttpGet("api/v1/options/manifest")]
    [AllowAnonymous]
    public IActionResult GetManifest()
    {
        var manifestVersion = EhrStaticOptions.StaticManifestVersion;
        var ifNoneMatch = Request.Headers.IfNoneMatch.ToString();

        if (EhrOptionVersionHelper.IsMatch(ifNoneMatch, manifestVersion))
        {
            return StatusCode(StatusCodes.Status304NotModified);
        }

        Response.Headers.ETag = EhrOptionVersionHelper.FormatETag(manifestVersion);
        Response.Headers.CacheControl = CacheControlHeaderValue;

        var sets = EhrStaticOptions.AllOptionSets
            .ToDictionary(s => s, s => EhrStaticOptions.GetOptionSetVersion(s));

        return Ok(ApiResponse<OptionsManifestResponse>.Success(
            new OptionsManifestResponse(manifestVersion, sets)));
    }

    /// <summary>Retrieves all descriptors for a specific Tier A static option set.</summary>
    [HttpGet("api/v1/options/{optionSet}")]
    [AllowAnonymous]
    public IActionResult GetOptionSet(string optionSet)
    {
        var options = EhrStaticOptions.GetOptions(optionSet);
        if (options.Count == 0)
        {
            return NotFound(ApiResponse<object>.Fail($"Option set '{optionSet}' was not found."));
        }

        var setVersion = EhrStaticOptions.GetOptionSetVersion(optionSet);
        var ifNoneMatch = Request.Headers.IfNoneMatch.ToString();

        if (EhrOptionVersionHelper.IsMatch(ifNoneMatch, setVersion))
        {
            return StatusCode(StatusCodes.Status304NotModified);
        }

        Response.Headers.ETag = EhrOptionVersionHelper.FormatETag(setVersion);
        Response.Headers.CacheControl = CacheControlHeaderValue;

        return Ok(ApiResponse<IReadOnlyCollection<EhrOptionDescriptor>>.Success(options));
    }

    /// <summary>Retrieves all Tier A static option sets and their descriptors.</summary>
    [HttpGet("api/v1/options")]
    [AllowAnonymous]
    public IActionResult GetAllOptions()
    {
        var manifestVersion = EhrStaticOptions.StaticManifestVersion;
        var ifNoneMatch = Request.Headers.IfNoneMatch.ToString();

        if (EhrOptionVersionHelper.IsMatch(ifNoneMatch, manifestVersion))
        {
            return StatusCode(StatusCodes.Status304NotModified);
        }

        Response.Headers.ETag = EhrOptionVersionHelper.FormatETag(manifestVersion);
        Response.Headers.CacheControl = CacheControlHeaderValue;

        return Ok(ApiResponse<IReadOnlyDictionary<string, IReadOnlyList<EhrOptionDescriptor>>>.Success(
            EhrStaticOptions.GetAllOptions()));
    }

    // ── Tier B: Catalogs Overview ─────────────────────────────────────────────

    /// <summary>Retrieves summary of Tier B dynamic catalog libraries with versions and hashes.</summary>
    [HttpGet("api/v1/options/catalogs")]
    [AllowAnonymous]
    public async Task<IActionResult> GetCatalogs(CancellationToken ct = default)
    {
        var libraries = await _catalogQuery.GetLibrariesAsync(ct);
        var catalogHash = EhrOptionVersionHelper.ComputeCatalogLibrarySha256(
            "tier_b_catalogs",
            libraries.Select(l => $"{l.Library}:{l.KitVersion}:{l.ContentHash}"));

        var ifNoneMatch = Request.Headers.IfNoneMatch.ToString();
        if (EhrOptionVersionHelper.IsMatch(ifNoneMatch, catalogHash))
        {
            return StatusCode(StatusCodes.Status304NotModified);
        }

        Response.Headers.ETag = EhrOptionVersionHelper.FormatETag(catalogHash);
        Response.Headers.CacheControl = "public, max-age=3600, stale-while-revalidate=86400";

        return Ok(ApiResponse<IReadOnlyList<PhilHealthCatalogLibrarySummary>>.Success(libraries));
    }

    // ── Tier B: PSGC Location Hierarchy ───────────────────────────────────────

    /// <summary>Returns the 17 Philippine Standard Geographic Code (PSGC) regions.</summary>
    [HttpGet("api/v1/locations/psgc/regions")]
    [AllowAnonymous]
    public async Task<IActionResult> GetRegions(CancellationToken ct = default)
    {
        var regions = await _psgcService.GetRegionsAsync(ct);
        return Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(regions));
    }

    /// <summary>Returns provinces under a specific region or all provinces.</summary>
    [HttpGet("api/v1/locations/psgc/provinces")]
    [AllowAnonymous]
    public async Task<IActionResult> GetProvinces([FromQuery] string? regionPsgc, CancellationToken ct = default)
    {
        var provinces = await _psgcService.GetProvincesAsync(regionPsgc, ct);
        return Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(provinces));
    }

    /// <summary>Returns cities and municipalities under a province or region.</summary>
    [HttpGet("api/v1/locations/psgc/cities")]
    [AllowAnonymous]
    public async Task<IActionResult> GetCities(
        [FromQuery] string? provincePsgc,
        [FromQuery] string? regionPsgc,
        CancellationToken ct = default)
    {
        var cities = await _psgcService.GetCitiesMunicipalitiesAsync(provincePsgc, regionPsgc, ct);
        return Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(cities));
    }

    /// <summary>Returns barangays under a specific city or municipality.</summary>
    [HttpGet("api/v1/locations/psgc/barangays")]
    [AllowAnonymous]
    public async Task<IActionResult> GetBarangays([FromQuery] string cityMunicipalityPsgc, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(cityMunicipalityPsgc))
        {
            return BadRequest(ApiResponse<object>.Fail("cityMunicipalityPsgc query parameter is required."));
        }

        var barangays = await _psgcService.GetBarangaysAsync(cityMunicipalityPsgc, ct);
        return Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(barangays));
    }

    /// <summary>Searches PSGC locations by name or code prefix.</summary>
    [HttpGet("api/v1/locations/psgc/search")]
    [AllowAnonymous]
    public async Task<IActionResult> SearchLocations(
        [FromQuery] string? q,
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(q))
        {
            return Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(System.Array.Empty<PsgcLocationDto>()));
        }

        var results = await _psgcService.SearchLocationsAsync(q, limit, ct);
        return Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(results));
    }
}
