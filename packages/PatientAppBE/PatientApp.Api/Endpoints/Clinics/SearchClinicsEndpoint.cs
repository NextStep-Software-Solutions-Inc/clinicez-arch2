using CLINICEZ.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Features.Clinics.Queries.SearchClinics;

namespace PatientApp.Api.Endpoints.Clinics;

public sealed class SearchClinicsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/clinics", async (
                ISender sender,
                [FromQuery] string? q,
                [FromQuery] Guid? organizationId,
                [FromQuery] Guid? forPatientId,
                [FromQuery] int skip = 0,
                [FromQuery] int take = 50,
                CancellationToken ct = default) =>
            {
                var result = await sender.Send(new SearchClinicsQuery(q, organizationId, forPatientId, skip, take), ct);
                return Results.Ok(ApiResponse<DiscoveryPagedDto<ClinicSummaryDto>>.Success(result));
            })
            .WithTags("Discovery")
            .WithName("SearchClinics")
            .WithSummary("Search clinics. Filter by organizationId to see clinics in a joined organization.")
            .Produces<ApiResponse<DiscoveryPagedDto<ClinicSummaryDto>>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}
