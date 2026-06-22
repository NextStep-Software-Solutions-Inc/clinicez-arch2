using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Features.Organizations.Queries.GetOrganizationRoles;

namespace PatientApp.Api.Endpoints.Organizations;

public sealed class GetOrganizationRolesEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/organizations/{organizationId:guid}/roles", async (
                Guid organizationId, ISender sender, CancellationToken ct) =>
            {
                var result = await sender.Send(new GetOrganizationRolesQuery(organizationId), ct);
                return Results.Ok(ApiResponse<IReadOnlyList<OrganizationRoleDto>>.Success(result, "Roles retrieved successfully."));
            })
            .WithTags("Organizations")
            .WithName("GetOrganizationRoles")
            .WithSummary("Get roles available for a specific organization")
            .Produces<ApiResponse<IReadOnlyList<OrganizationRoleDto>>>(StatusCodes.Status200OK);
    }
}
