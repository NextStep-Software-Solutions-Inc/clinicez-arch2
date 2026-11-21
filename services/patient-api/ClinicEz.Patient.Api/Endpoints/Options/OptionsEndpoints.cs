using System.Collections.Generic;
using System.Linq;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Options;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Patient.Api.Endpoints.Options;

public sealed record OptionsManifestResponse(
    string ManifestVersion,
    IReadOnlyDictionary<string, string> OptionSets);

public sealed class OptionsEndpoints : IEndpoint
{
    private const string CacheControlHeaderValue = "public, max-age=86400, stale-while-revalidate=604800";

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/options").WithTags("Options");

        // GET /api/v1/options/manifest
        group.MapGet("/manifest", (HttpContext context) =>
        {
            var manifestVersion = EhrStaticOptions.StaticManifestVersion;
            var etag = EhrOptionVersionHelper.FormatETag(manifestVersion);

            if (EhrOptionVersionHelper.IsMatch(context.Request.Headers.IfNoneMatch, manifestVersion))
            {
                return Results.StatusCode(StatusCodes.Status304NotModified);
            }

            context.Response.Headers.ETag = etag;
            context.Response.Headers.CacheControl = CacheControlHeaderValue;

            var sets = EhrStaticOptions.AllOptionSets
                .ToDictionary(s => s, s => EhrStaticOptions.GetOptionSetVersion(s));

            return Results.Ok(ApiResponse<OptionsManifestResponse>.Success(
                new OptionsManifestResponse(manifestVersion, sets)));
        })
        .AllowAnonymous()
        .WithName("GetPatientOptionsManifest")
        .WithSummary("Retrieves the Tier A static options manifest with aggregate and per-set version hashes.");

        // GET /api/v1/options/{optionSet}
        group.MapGet("/{optionSet}", (string optionSet, HttpContext context) =>
        {
            var options = EhrStaticOptions.GetOptions(optionSet);
            if (options.Count == 0)
            {
                return Results.NotFound(ApiResponse<object>.Fail($"Option set '{optionSet}' was not found."));
            }

            var setVersion = EhrStaticOptions.GetOptionSetVersion(optionSet);
            var etag = EhrOptionVersionHelper.FormatETag(setVersion);

            if (EhrOptionVersionHelper.IsMatch(context.Request.Headers.IfNoneMatch, setVersion))
            {
                return Results.StatusCode(StatusCodes.Status304NotModified);
            }

            context.Response.Headers.ETag = etag;
            context.Response.Headers.CacheControl = CacheControlHeaderValue;

            return Results.Ok(ApiResponse<IReadOnlyCollection<EhrOptionDescriptor>>.Success(options));
        })
        .AllowAnonymous()
        .WithName("GetPatientOptionSet")
        .WithSummary("Retrieves all descriptors for a specific Tier A static option set.");

        // GET /api/v1/options
        group.MapGet("", (HttpContext context) =>
        {
            var manifestVersion = EhrStaticOptions.StaticManifestVersion;
            var etag = EhrOptionVersionHelper.FormatETag(manifestVersion);

            if (EhrOptionVersionHelper.IsMatch(context.Request.Headers.IfNoneMatch, manifestVersion))
            {
                return Results.StatusCode(StatusCodes.Status304NotModified);
            }

            context.Response.Headers.ETag = etag;
            context.Response.Headers.CacheControl = CacheControlHeaderValue;

            return Results.Ok(ApiResponse<IReadOnlyDictionary<string, IReadOnlyList<EhrOptionDescriptor>>>.Success(
                EhrStaticOptions.GetAllOptions()));
        })
        .AllowAnonymous()
        .WithName("GetAllPatientOptions")
        .WithSummary("Retrieves all Tier A static option sets and their descriptors.");
    }
}
