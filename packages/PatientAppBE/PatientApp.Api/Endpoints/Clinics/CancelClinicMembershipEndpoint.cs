using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Features.Clinics.Commands.CancelClinicMembership;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using System;

namespace PatientApp.Api.Endpoints.Clinics;

public sealed class CancelClinicMembershipEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapDelete("/patients/{patientId:guid}/clinic-memberships/{clinicId:guid}", async (
                Guid patientId, Guid clinicId, ISender sender, CancellationToken ct) =>
            {
                var result = await sender.Send(new CancelClinicMembershipCommand(patientId, clinicId), ct);
                return result
                    ? Results.Ok(ApiResponse<bool>.Success(true, "Cancelled clinic membership successfully."))
                    : Results.NotFound(ApiResponse<object>.Fail("Membership not found."));
            })
            .WithTags("Memberships")
            .WithName("CancelClinicMembership")
            .WithSummary("Cancel a clinic membership request or active membership")
            .Produces<ApiResponse<bool>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
