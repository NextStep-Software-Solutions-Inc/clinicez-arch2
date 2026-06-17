using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Features.Patients.Queries.GetPatientByClerkId;

namespace PatientApp.Api.Endpoints.Patients;

public sealed class GetPatientByClerkIdEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/by-clerk/{clerkUserId}", async (
                string clerkUserId,
                ISender sender,
                CancellationToken ct) =>
            {
                var patient = await sender.Send(new GetPatientByClerkIdQuery(clerkUserId), ct);

                return patient is null
                    ? Results.NotFound(ApiResponse<object>.Fail($"No patient found for Clerk user '{clerkUserId}'."))
                    : Results.Ok(ApiResponse<PatientSummaryDto>.Success(patient));
            })
            .WithTags("Patients")
            .WithName("GetPatientByClerkId")
            .WithSummary("Look up a patient by their Clerk user ID (used during app sign-in)")
            .Produces<ApiResponse<PatientSummaryDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
