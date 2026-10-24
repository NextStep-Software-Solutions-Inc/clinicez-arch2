using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientMe;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interfaces;

namespace ClinicEz.Patient.Api.Endpoints.Patients;

public sealed class GetPatientsMeEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/me", async (
                ICurrentUserService currentUser,
                ISender sender,
                CancellationToken ct) =>
            {
                var userId = currentUser.UserId;
                if (string.IsNullOrWhiteSpace(userId))
                    throw new UnauthorizedException("Authenticated Clerk user identity is required.");

                var result = await sender.Send(new GetPatientMeQuery(userId), ct);

                return result is null
                    ? Results.NotFound(ApiResponse<object>.Fail("No linked patient record found for current user."))
                    : Results.Ok(ApiResponse<PatientMeDto>.Success(result));
            })
            .WithTags("Patients")
            .WithName("GetPatientsMe")
            .WithSummary("Retrieve authenticated caller's own patient profile for intake autofill")
            .WithDescription("Resolves caller strictly from Clerk identity and returns data-minimized demographics, primary address, government IDs, and allergies.")
            .Produces<ApiResponse<PatientMeDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status401Unauthorized)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
