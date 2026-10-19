using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Organizations.Queries.SearchOrganizations;

namespace ClinicEz.Patient.Api.Endpoints.Organizations;

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
            .WithDescription("Searches the directory catalog for organizations. Supports filtering by patient ID and query query, with pagination.")
            .Produces<ApiResponse<DiscoveryPagedDto<OrganizationSummaryDto>>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}
