using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Features.Patients.Commands.CreatePatient;

namespace ClinicEz.Patient.Api.Endpoints.Patients;

public sealed record CreatePatientRequest(
    string ClerkUserId,
    string FirstName,
    string? MiddleName,
    string LastName,
    string? Suffix,
    string? Sex,
    DateOnly? DateOfBirth,
    string? Nationality);

public sealed class CreatePatientEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients", async (
                CreatePatientRequest request,
                ISender sender,
                CancellationToken ct) =>
            {
                var id = await sender.Send(new CreatePatientCommand(
                    request.ClerkUserId,
                    request.FirstName,
                    request.MiddleName,
                    request.LastName,
                    request.Suffix,
                    request.Sex,
                    request.DateOfBirth,
                    request.Nationality), ct);

                return Results.Created(
                    $"/api/v1/patients/{id}",
                    ApiResponse<Guid>.Success(id, "Patient profile created."));
            })
            .WithTags("Patients")
            .WithName("CreatePatient")
            .WithSummary("Create a new patient profile linked to a Clerk user")
            .WithDescription("Creates a patient profile in the backend database linked to a Clerk identity after onboarding.")
            .Produces<ApiResponse<Guid>>(StatusCodes.Status201Created)
            .Produces<ApiResponse<object>>(StatusCodes.Status409Conflict)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
