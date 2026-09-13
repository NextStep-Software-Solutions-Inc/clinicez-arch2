using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientByClerkId;

namespace ClinicEz.Patient.Api.Endpoints.Patients;

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
            .WithDescription("Resolves the patient's internal profile ID and core summary info from their Clerk identity ID.")
            .Produces<ApiResponse<PatientSummaryDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
