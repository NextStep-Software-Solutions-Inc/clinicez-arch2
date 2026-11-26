using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Api.Auth;
using ClinicEz.Patient.Application.Features.Clinics.Commands.RequestClinicLink;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Patient.Api.Endpoints.Clinics;

public sealed record RequestClinicLinkRequest(
    bool ConsentPrivacyPolicy,
    bool ConsentTermsAndConditions,
    bool ConsentDataSharing,
    Dictionary<string, string>? IdentifierClaims = null);

public sealed class RequestClinicLinkEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/clinics/{clinicId:guid}/link-request", async (
                Guid clinicId,
                RequestClinicLinkRequest request,
                ClaimsPrincipal user,
                IPatientRepository patientRepo,
                ISender sender,
                CancellationToken ct) =>
            {
                var clerkId = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
                if (string.IsNullOrWhiteSpace(clerkId))
                {
                    return Results.Unauthorized();
                }

                var patient = await patientRepo.GetByClerkUserIdAsync(clerkId, ct);
                if (patient is null)
                {
                    return Results.NotFound(ApiResponse<object>.Fail("Patient profile not found for the authenticated account."));
                }

                var verifiedEmail = ClaimEmailExtractor.ExtractVerifiedEmails(user).FirstOrDefault();
                var linkRequestId = await sender.Send(new RequestClinicLinkCommand(
                    patient.Id,
                    clinicId,
                    request.ConsentPrivacyPolicy,
                    request.ConsentTermsAndConditions,
                    request.ConsentDataSharing,
                    verifiedEmail,
                    request.IdentifierClaims), ct);

                return Results.Accepted(
                    $"/api/v1/patients/{patient.Id}/clinic-memberships/{linkRequestId}",
                    ApiResponse<Guid>.Success(linkRequestId, "Chart linkage request sent to the clinic for staff verification."));
            })
            .WithTags("Memberships")
            .WithName("RequestClinicLink")
            .WithSummary("Request staff-verified chart linkage with an existing clinic record via Interop Hub")
            .Produces<ApiResponse<Guid>>(StatusCodes.Status202Accepted)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .Produces<ApiResponse<object>>(StatusCodes.Status409Conflict)
            .RequireAuthorization();
    }
}
