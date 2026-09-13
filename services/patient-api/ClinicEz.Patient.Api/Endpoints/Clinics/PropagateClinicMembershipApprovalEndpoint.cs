using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Features.Clinics.Commands.PropagateClinicMembershipApproval;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using System;
using System.Threading.Tasks;

namespace ClinicEz.Patient.Api.Endpoints.Clinics;

public sealed record PropagateClinicMembershipApprovalRequest(bool Approve);

public sealed class PropagateClinicMembershipApprovalEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/internal/clinics/{clinicId:guid}/memberships/{membershipId:guid}/approve", async (
                Guid clinicId, Guid membershipId, PropagateClinicMembershipApprovalRequest request, ISender sender, CancellationToken ct) =>
            {
                var success = await sender.Send(new PropagateClinicMembershipApprovalCommand(
                    clinicId, membershipId, request.Approve), ct);

                return Results.Ok(ApiResponse<bool>.Success(success, "Clinic membership approval state updated successfully."));
            })
            .WithTags("Internal")
            .WithName("PropagateClinicMembershipApproval")
            .WithSummary("Propagate clinic membership approval state from Admin Dashboard")
            .WithDescription("Updates and propagates the approval state of a clinic membership from the Admin Dashboard down to the Patient App Backend.")
            .Produces<ApiResponse<bool>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .Produces<ApiResponse<object>>(StatusCodes.Status409Conflict);
            // Note: In production this should be restricted to internal service authorization
    }
}
