using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Features.Patients.Commands.UpdatePatientDemographics;

namespace PatientApp.Api.Endpoints.Patients;

public sealed record UpdatePatientDemographicsRequest(
    string FirstName,
    string? MiddleName,
    string LastName,
    string? Suffix,
    string? Sex,
    DateOnly? DateOfBirth,
    string? PlaceOfBirth,
    string? CivilStatus,
    string? BloodType,
    string? Nationality,
    string? Ethnicity,
    string? Religion,
    string? PrimaryLanguage,
    string? EducationLevel,
    string? Mobile,
    string? AltPhone,
    string? Email,
    string? MessengerHandle,
    bool ConsentToShareInfo);

public sealed class UpdatePatientDemographicsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPut("/patients/{id:guid}/demographics", async (
                Guid id,
                UpdatePatientDemographicsRequest request,
                ISender sender,
                CancellationToken ct) =>
            {
                await sender.Send(new UpdatePatientDemographicsCommand(
                    id,
                    request.FirstName,
                    request.MiddleName,
                    request.LastName,
                    request.Suffix,
                    request.Sex,
                    request.DateOfBirth,
                    request.PlaceOfBirth,
                    request.CivilStatus,
                    request.BloodType,
                    request.Nationality,
                    request.Ethnicity,
                    request.Religion,
                    request.PrimaryLanguage,
                    request.EducationLevel,
                    request.Mobile,
                    request.AltPhone,
                    request.Email,
                    request.MessengerHandle,
                    request.ConsentToShareInfo), ct);

                return Results.NoContent();
            })
            .WithTags("Patients")
            .WithName("UpdatePatientDemographics")
            .WithSummary("Update the demographic and contact information for a patient")
            .Produces(StatusCodes.Status204NoContent)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
