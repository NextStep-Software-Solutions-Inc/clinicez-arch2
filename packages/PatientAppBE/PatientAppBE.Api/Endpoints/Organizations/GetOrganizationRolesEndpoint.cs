using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Common.DTOs;
using PatientAppBE.Application.Features.Organizations.Queries.GetOrganizationRoles;

namespace PatientAppBE.Api.Endpoints.Organizations;

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
            .WithDescription("Retrieves the user roles available in a specific organization by its unique ID.")
            .Produces<ApiResponse<IReadOnlyList<OrganizationRoleDto>>>(StatusCodes.Status200OK);
    }
}
