using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.Exceptions;
using ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interfaces;

namespace ClinicEz.Patient.Api.Endpoints.Patients;

public sealed record ClaimIntakeRequest(
    string ClaimToken,
    bool IsDependent = false,
    string? RelationshipToDependent = null,
    string? PreferredRelationship = null,
    bool ConsentToShareInfo = true,
    bool ConfirmAlternateEmailLink = false,
    string? MiddleName = null,
    string? Suffix = null,
    string? Sex = null,
    string? CivilStatus = null,
    string? ContactNumber = null,
    string? PhilHealthPin = null,
    string? PhilhealthCategory = null,
    string? PrincipalMemberPin = null,
    string? PrincipalFullName = null,
    string? PrincipalRelationship = null,
    DateOnly? PrincipalDateOfBirth = null,
    List<ClaimAllergyDto>? Allergies = null);

public sealed class ClaimIntakeEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/claim-intake", async (
                ClaimIntakeRequest request,
                ICurrentUserService currentUser,
                ISender sender,
                CancellationToken ct) =>
            {
                var userId = currentUser.UserId;
                if (string.IsNullOrWhiteSpace(userId))
                    throw new UnauthorizedException("Authenticated Clerk user identity is required.");

                try
                {
                    var command = new ClaimIntakeCommand(
                        userId,
                        request.ClaimToken,
                        request.IsDependent,
                        request.RelationshipToDependent,
                        request.PreferredRelationship,
                        request.ConsentToShareInfo,
                        request.ConfirmAlternateEmailLink,
                        request.MiddleName,
                        request.Suffix,
                        request.Sex,
                        request.CivilStatus,
                        request.ContactNumber,
                        request.PhilHealthPin,
                        request.PhilhealthCategory,
                        request.PrincipalMemberPin,
                        request.PrincipalFullName,
                        request.PrincipalRelationship,
                        request.PrincipalDateOfBirth,
                        request.Allergies);

                    var result = await sender.Send(command, ct);

                    return Results.Ok(ApiResponse<ClaimIntakeResultDto>.Success(result));
                }
                catch (MedicalPrivacyGuardrailException ex)
                {
                    var error = new ApiFieldError(null, ex.ErrorCode, ex.Message);
                    return Results.UnprocessableEntity(ApiResponse<object>.Fail(ex.Message, [error], ex.ErrorCode));
                }
            })
            .WithTags("Patients")
            .WithName("ClaimIntake")
            .WithSummary("Claim an unauthenticated patient intake pass into a persistent patient profile")
            .WithDescription("Converts an anonymous guest intake registration into a persistent Clinic EZ Patient account, resolving identity divergence per RA 10173.")
            .Produces<ApiResponse<ClaimIntakeResultDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .Produces<ApiResponse<object>>(StatusCodes.Status401Unauthorized)
            .Produces<ApiResponse<object>>(StatusCodes.Status422UnprocessableEntity)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
