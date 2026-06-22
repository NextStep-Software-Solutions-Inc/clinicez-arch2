using CLINICEZ.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Features.Organizations.Queries.SearchOrganizations;

namespace PatientApp.Api.Endpoints.Organizations;

public sealed class SearchOrganizationsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/organizations", async (
                ISender sender,
                [FromQuery] string? q,
                [FromQuery] Guid? forPatientId,
                [FromQuery] int skip = 0,
                [FromQuery] int take = 50,
                CancellationToken ct = default) =>
            {
                var result = await sender.Send(new SearchOrganizationsQuery(q, forPatientId, skip, take), ct);
                return Results.Ok(ApiResponse<DiscoveryPagedDto<OrganizationSummaryDto>>.Success(result));
            })
            .WithTags("Discovery")
            .WithName("SearchOrganizations")
            .WithSummary("Search the organization discovery catalogue. Always fetches latest when online.")
            .Produces<ApiResponse<DiscoveryPagedDto<OrganizationSummaryDto>>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}
