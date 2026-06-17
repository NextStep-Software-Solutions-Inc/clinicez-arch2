using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Features.Clinics.Queries.SearchClinics;

namespace PatientApp.Api.Endpoints.Clinics;

public sealed class SearchClinicsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/clinics", async (
                ISender sender, CancellationToken ct,
                string? q = null, Guid? organizationId = null, int skip = 0, int take = 20) =>
            {
                var result = await sender.Send(new SearchClinicsQuery(q, organizationId, skip, take), ct);
                return Results.Ok(ApiResponse<DiscoveryPagedDto<ClinicSummaryDto>>.Success(result));
            })
            .WithTags("Discovery")
            .WithName("SearchClinics")
            .WithSummary("Search clinics. Filter by organizationId to see clinics in a joined organization.")
            .Produces<ApiResponse<DiscoveryPagedDto<ClinicSummaryDto>>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}
