using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Clinics.Commands.UnlockClinicAccess;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using System;
using System.Threading;

namespace ClinicEz.Patient.Api.Endpoints.Clinics;

public sealed record UnlockClinicRequest(
    string? JoinCode = null,
    Guid? OrganizationId = null,
    Guid? PatientId = null,
    bool ConsentPrivacyPolicy = true,
    bool ConsentTermsAndConditions = true,
    bool ConsentDataSharing = true);

public sealed class UnlockClinicEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/clinics/{clinicId:guid}/unlock", async (
                Guid clinicId,
                UnlockClinicRequest request,
                ICurrentUserService currentUser,
                IPatientRepository patientRepo,
                ISender sender,
                CancellationToken ct) =>
            {
                Guid patientId;
                if (request.PatientId.HasValue)
                {
                    patientId = request.PatientId.Value;
                }
                else
                {
                    if (string.IsNullOrWhiteSpace(currentUser.UserId))
                    {
                        return Results.Unauthorized();
                    }

                    var patient = await patientRepo.GetByClerkUserIdAsync(currentUser.UserId, ct);
                    if (patient == null)
                    {
                        return Results.NotFound(ApiResponse<object>.Fail("Current user is not a registered patient."));
                    }
                    patientId = patient.Id;
                }

                var result = await sender.Send(new UnlockClinicAccessCommand(
                    clinicId,
                    patientId,
                    request.JoinCode,
                    request.OrganizationId,
                    request.ConsentPrivacyPolicy,
                    request.ConsentTermsAndConditions,
                    request.ConsentDataSharing), ct);

                return Results.Ok(ApiResponse<UnlockClinicResultDto>.Success(result));
            })
            .WithTags("Discovery")
            .WithName("UnlockClinicAccess")
            .WithSummary("Unlock gated clinic service catalog and appointment booking using a 6-character Join Code or linked Organization")
            .Produces<ApiResponse<UnlockClinicResultDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
