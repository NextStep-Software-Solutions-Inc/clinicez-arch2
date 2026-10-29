using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Patient.Api.Endpoints.Locations;

public sealed class LocationsEndpoints : IEndpoint
{
    private const string CacheControlHeaderValue = "public, max-age=86400, stale-while-revalidate=604800";

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/locations/psgc").WithTags("Locations");

        // GET /api/v1/locations/psgc/regions
        group.MapGet("/regions", async ([FromServices] IPsgcLocationService psgcService, HttpContext context, CancellationToken ct) =>
        {
            context.Response.Headers.CacheControl = CacheControlHeaderValue;
            var regions = await psgcService.GetRegionsAsync(ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(regions));
        })
        .AllowAnonymous()
        .WithName("GetPatientPsgcRegions")
        .WithSummary("Returns all 17 Philippine Standard Geographic Code (PSGC) regions.");

        // GET /api/v1/locations/psgc/provinces
        group.MapGet("/provinces", async (string? regionPsgc, [FromServices] IPsgcLocationService psgcService, HttpContext context, CancellationToken ct) =>
        {
            context.Response.Headers.CacheControl = CacheControlHeaderValue;
            var provinces = await psgcService.GetProvincesAsync(regionPsgc, ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(provinces));
        })
        .AllowAnonymous()
        .WithName("GetPatientPsgcProvinces")
        .WithSummary("Returns provinces under a specific region or all provinces.");

        // GET /api/v1/locations/psgc/cities
        group.MapGet("/cities", async (string? provincePsgc, string? regionPsgc, [FromServices] IPsgcLocationService psgcService, HttpContext context, CancellationToken ct) =>
        {
            context.Response.Headers.CacheControl = CacheControlHeaderValue;
            var cities = await psgcService.GetCitiesMunicipalitiesAsync(provincePsgc, regionPsgc, ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(cities));
        })
        .AllowAnonymous()
        .WithName("GetPatientPsgcCities")
        .WithSummary("Returns cities and municipalities under a province or region.");

        // GET /api/v1/locations/psgc/barangays
        group.MapGet("/barangays", async (string? cityMunicipalityPsgc, [FromServices] IPsgcLocationService psgcService, HttpContext context, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(cityMunicipalityPsgc))
            {
                return Results.BadRequest(ApiResponse<object>.Fail("cityMunicipalityPsgc query parameter is required."));
            }

            context.Response.Headers.CacheControl = CacheControlHeaderValue;
            var barangays = await psgcService.GetBarangaysAsync(cityMunicipalityPsgc, ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(barangays));
        })
        .AllowAnonymous()
        .WithName("GetPatientPsgcBarangays")
        .WithSummary("Returns barangays under a specific city or municipality.");

        // GET /api/v1/locations/psgc/search
        group.MapGet("/search", async (string? q, int? limit, [FromServices] IPsgcLocationService psgcService, HttpContext context, CancellationToken ct) =>
        {
            context.Response.Headers.CacheControl = CacheControlHeaderValue;
            if (string.IsNullOrWhiteSpace(q))
            {
                return Results.Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(Array.Empty<PsgcLocationDto>()));
            }

            var results = await psgcService.SearchLocationsAsync(q, limit ?? 50, ct);
            return Results.Ok(ApiResponse<IReadOnlyList<PsgcLocationDto>>.Success(results));
        })
        .AllowAnonymous()
        .WithName("SearchPatientPsgcLocations")
        .WithSummary("Searches PSGC locations by name or code prefix.");
    }
}
