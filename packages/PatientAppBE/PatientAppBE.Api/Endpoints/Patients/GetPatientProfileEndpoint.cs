using Clinic EZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Common.DTOs;
using PatientAppBE.Application.Features.Patients.Queries.GetPatientProfile;

namespace PatientAppBE.Api.Endpoints.Patients;

public sealed class GetPatientProfileEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{id:guid}", async (
                Guid id,
                ISender sender,
                CancellationToken ct) =>
            {
                var profile = await sender.Send(new GetPatientProfileQuery(id), ct);
                return Results.Ok(ApiResponse<PatientProfileDto>.Success(profile));
            })
            .WithTags("Patients")
            .WithName("GetPatientProfile")
            .WithSummary("Get the full profile (demographics, addresses, emergency contacts) for a patient")
            .Produces<ApiResponse<PatientProfileDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
