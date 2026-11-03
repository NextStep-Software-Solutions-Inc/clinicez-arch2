using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Discovery.Queries.UnifiedSearch;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Patient.Api.Endpoints.Discovery;

public sealed class UnifiedSearchEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/discovery/search", async (
                ISender sender,
                [FromQuery] string? q,
                [FromQuery] string? type,
                [FromQuery] int skip = 0,
                [FromQuery] int take = 20,
                CancellationToken ct = default) =>
            {
                var result = await sender.Send(new UnifiedSearchQuery(q, type, skip, take), ct);
                return Results.Ok(ApiResponse<UnifiedSearchResultDto>.Success(result));
            })
            .WithTags("Discovery")
            .WithName("UnifiedSearch")
            .WithSummary("Unified search across doctors, clinics, and services matching Stitch Screen 4")
            .WithDescription("Searches active healthcare providers, public clinics, and specialized care packages/services with category filter support (all, doctors, clinics, services).")
            .Produces<ApiResponse<UnifiedSearchResultDto>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}
