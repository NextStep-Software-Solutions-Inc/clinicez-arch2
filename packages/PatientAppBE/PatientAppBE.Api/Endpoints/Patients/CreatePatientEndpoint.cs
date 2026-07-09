using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Features.Patients.Commands.CreatePatient;

namespace PatientAppBE.Api.Endpoints.Patients;

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
            .Produces<ApiResponse<Guid>>(StatusCodes.Status201Created)
            .Produces<ApiResponse<object>>(StatusCodes.Status409Conflict)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
