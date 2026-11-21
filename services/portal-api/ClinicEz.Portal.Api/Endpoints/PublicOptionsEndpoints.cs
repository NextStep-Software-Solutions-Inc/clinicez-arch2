using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Options;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed record OptionsManifestResponse(
    string ManifestVersion,
    IReadOnlyDictionary<string, string> OptionSets);

public sealed class PublicOptionsEndpoints : IEndpoint
{
    private const string CacheControlHeaderValue = "public, max-age=86400, stale-while-revalidate=604800";

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/public/options/manifest", GetManifest)
            .AllowAnonymous()
            .WithName("GetPublicOptionsManifest")
            .WithDescription("Retrieves the Tier A static options manifest with aggregate and per-set version hashes.");

        app.MapGet("/options/manifest", GetManifest)
            .AllowAnonymous()
            .WithName("GetOptionsManifest");

        app.MapGet("/public/options/{optionSet}", GetOptionSet)
            .AllowAnonymous()
            .WithName("GetPublicOptionSet")
            .WithDescription("Retrieves all descriptors for a specific Tier A static option set.");

        app.MapGet("/options/{optionSet}", GetOptionSet)
            .AllowAnonymous()
            .WithName("GetOptionSet");

        app.MapGet("/public/options", GetAllOptions)
            .AllowAnonymous()
            .WithName("GetPublicAllOptions")
            .WithDescription("Retrieves all Tier A static option sets and their descriptors.");

        app.MapGet("/options", GetAllOptions)
            .AllowAnonymous()
            .WithName("GetAllOptions");

        app.MapGet("/public/locations/psgc/regions", GetRegionsAsync)
            .AllowAnonymous()
            .WithName("GetPublicPsgcRegions")
            .WithDescription("Returns all 17 Philippine Standard Geographic Code (PSGC) regions.");

        app.MapGet("/locations/psgc/regions", GetRegionsAsync)
            .AllowAnonymous()
            .WithName("GetPsgcRegions");

        app.MapGet("/public/locations/psgc/provinces", GetProvincesAsync)
            .AllowAnonymous()
            .WithName("GetPublicPsgcProvinces")
            .WithDescription("Returns provinces under a specific region or all provinces.");

        app.MapGet("/locations/psgc/provinces", GetProvincesAsync)
            .AllowAnonymous()
            .WithName("GetPsgcProvinces");

        app.MapGet("/public/locations/psgc/cities", GetCitiesMunicipalitiesAsync)
            .AllowAnonymous()
            .WithName("GetPublicPsgcCities")
            .WithDescription("Returns cities and municipalities under a province or region.");

        app.MapGet("/locations/psgc/cities", GetCitiesMunicipalitiesAsync)
            .AllowAnonymous()
            .WithName("GetPsgcCities");

        app.MapGet("/public/locations/psgc/barangays", GetBarangaysAsync)
            .AllowAnonymous()
            .WithName("GetPublicPsgcBarangays")
            .WithDescription("Returns barangays under a specific city or municipality.");

        app.MapGet("/locations/psgc/barangays", GetBarangaysAsync)
            .AllowAnonymous()
            .WithName("GetPsgcBarangays");

        app.MapGet("/public/locations/psgc/search", SearchLocationsAsync)
            .AllowAnonymous()
            .WithName("GetPublicPsgcSearch")
            .WithDescription("Searches PSGC locations by name or code prefix.");

        app.MapGet("/locations/psgc/search", SearchLocationsAsync)
            .AllowAnonymous()
            .WithName("GetPsgcSearch");
    }

    public static IResult GetManifest(HttpContext httpContext)
    {
        var manifestVersion = EhrStaticOptions.StaticManifestVersion;
        var ifNoneMatch = httpContext.Request.Headers.IfNoneMatch.ToString();

        if (EhrOptionVersionHelper.IsMatch(ifNoneMatch, manifestVersion))
        {
            httpContext.Response.Headers.ETag = EhrOptionVersionHelper.FormatETag(manifestVersion);
            return Results.StatusCode(StatusCodes.Status304NotModified);
        }

        httpContext.Response.Headers.ETag = EhrOptionVersionHelper.FormatETag(manifestVersion);
        httpContext.Response.Headers.CacheControl = CacheControlHeaderValue;

        var sets = EhrStaticOptions.AllOptionSets
            .ToDictionary(s => s, s => EhrStaticOptions.GetOptionSetVersion(s));

        return Results.Ok(ApiResponse<OptionsManifestResponse>.Success(
            new OptionsManifestResponse(manifestVersion, sets)));
    }

    public static IResult GetOptionSet(string optionSet, HttpContext httpContext)
    {
        var options = EhrStaticOptions.GetOptions(optionSet);
        if (options.Count == 0)
        {
            return Results.NotFound(ApiResponse<object>.Fail($"Option set '{optionSet}' was not found."));
        }

        var setVersion = EhrStaticOptions.GetOptionSetVersion(optionSet);
        var ifNoneMatch = httpContext.Request.Headers.IfNoneMatch.ToString();

        if (EhrOptionVersionHelper.IsMatch(ifNoneMatch, setVersion))
        {
            httpContext.Response.Headers.ETag = EhrOptionVersionHelper.FormatETag(setVersion);
            return Results.StatusCode(StatusCodes.Status304NotModified);
        }

        httpContext.Response.Headers.ETag = EhrOptionVersionHelper.FormatETag(setVersion);
        httpContext.Response.Headers.CacheControl = CacheControlHeaderValue;

        return Results.Ok(ApiResponse<IReadOnlyCollection<EhrOptionDescriptor>>.Success(options));
    }

    public static IResult GetAllOptions(HttpContext httpContext)
    {
        var manifestVersion = EhrStaticOptions.StaticManifestVersion;
        var ifNoneMatch = httpContext.Request.Headers.IfNoneMatch.ToString();

        if (EhrOptionVersionHelper.IsMatch(ifNoneMatch, manifestVersion))
        {
            httpContext.Response.Headers.ETag = EhrOptionVersionHelper.FormatETag(manifestVersion);
            return Results.StatusCode(StatusCodes.Status304NotModified);
        }

        httpContext.Response.Headers.ETag = EhrOptionVersionHelper.FormatETag(manifestVersion);
        httpContext.Response.Headers.CacheControl = CacheControlHeaderValue;

        return Results.Ok(ApiResponse<IReadOnlyDictionary<string, IReadOnlyList<EhrOptionDescriptor>>>.Success(
            EhrStaticOptions.GetAllOptions()));
    }

    public static async Task<IResult> GetRegionsAsync(IPsgcLocationService psgcService, CancellationToken ct)
    {
        var regions = await psgcService.GetRegionsAsync(ct);
        return Results.Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(regions));
    }

    public static async Task<IResult> GetProvincesAsync(string? regionPsgc, IPsgcLocationService psgcService, CancellationToken ct)
    {
        var provinces = await psgcService.GetProvincesAsync(regionPsgc, ct);
        return Results.Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(provinces));
    }

    public static async Task<IResult> GetCitiesMunicipalitiesAsync(string? provincePsgc, string? regionPsgc, IPsgcLocationService psgcService, CancellationToken ct)
    {
        var cities = await psgcService.GetCitiesMunicipalitiesAsync(provincePsgc, regionPsgc, ct);
        return Results.Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(cities));
    }

    public static async Task<IResult> GetBarangaysAsync(string? cityMunicipalityPsgc, IPsgcLocationService psgcService, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(cityMunicipalityPsgc))
        {
            return Results.BadRequest(ApiResponse<object>.Fail("cityMunicipalityPsgc query parameter is required."));
        }

        var barangays = await psgcService.GetBarangaysAsync(cityMunicipalityPsgc, ct);
        return Results.Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(barangays));
    }

    public static async Task<IResult> SearchLocationsAsync(string? q, int? limit, IPsgcLocationService psgcService, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q))
        {
            return Results.Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(Array.Empty<PsgcLocationDto>()));
        }

        var results = await psgcService.SearchLocationsAsync(q, limit ?? 50, ct);
        return Results.Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(results));
    }
}
