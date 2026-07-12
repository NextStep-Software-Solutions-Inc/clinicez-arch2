using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Features.Organizations.Commands.PropagateOrganizationMembershipApproval;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using System;
using System.Threading.Tasks;

namespace PatientAppBE.Api.Endpoints.Organizations;

public sealed record PropagateOrganizationMembershipApprovalRequest(bool Approve);

public sealed class PropagateOrganizationMembershipApprovalEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/internal/organizations/{organizationId:guid}/memberships/{membershipId:guid}/approve", async (
                Guid organizationId, Guid membershipId, PropagateOrganizationMembershipApprovalRequest request, ISender sender, CancellationToken ct) =>
            {
                var success = await sender.Send(new PropagateOrganizationMembershipApprovalCommand(
                    organizationId, membershipId, request.Approve), ct);

                return Results.Ok(ApiResponse<bool>.Success(success, "Membership approval state updated successfully."));
            })
            .WithTags("Internal")
            .WithName("PropagateOrganizationMembershipApproval")
            .WithSummary("Propagate organization membership approval state from Admin Dashboard")
            .WithDescription("Updates and propagates the approval state of an organization membership from the Admin Dashboard down to the Patient App Backend.")
            .Produces<ApiResponse<bool>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .Produces<ApiResponse<object>>(StatusCodes.Status409Conflict);
            // Note: In production this should be restricted to internal service authorization
    }
}
