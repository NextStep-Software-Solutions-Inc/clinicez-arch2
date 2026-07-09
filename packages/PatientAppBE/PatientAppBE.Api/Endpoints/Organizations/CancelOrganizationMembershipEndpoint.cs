using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Features.Organizations.Commands.CancelOrganizationMembership;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using System;

namespace PatientAppBE.Api.Endpoints.Organizations;

public sealed class CancelOrganizationMembershipEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapDelete("/patients/{patientId:guid}/organization-memberships/{organizationId:guid}", async (
                Guid patientId, Guid organizationId, ISender sender, CancellationToken ct) =>
            {
                var result = await sender.Send(new CancelOrganizationMembershipCommand(patientId, organizationId), ct);
                return result
                    ? Results.Ok(ApiResponse<bool>.Success(true, "Cancelled organization membership successfully."))
                    : Results.NotFound(ApiResponse<object>.Fail("Membership not found."));
            })
            .WithTags("Memberships")
            .WithName("CancelOrganizationMembership")
            .WithSummary("Cancel an organization membership request or active membership")
            .Produces<ApiResponse<bool>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
