using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Common.DTOs;
using PatientAppBE.Application.Features.Patients.Queries.GetPatientFullRecord;

namespace PatientAppBE.Api.Endpoints.Patients;

public sealed class GetPatientFullRecordEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{id:guid}/full-record", async (
                Guid id,
                ISender sender,
                CancellationToken ct) =>
            {
                var record = await sender.Send(new GetPatientFullRecordQuery(id), ct);
                return Results.Ok(ApiResponse<PatientFullRecordDto>.Success(record));
            })
            .WithTags("Patients")
            .WithName("GetPatientFullRecord")
            .WithSummary("Returns all 22 ISyncable entity categories for a patient. Used to hydrate a freshly-installed device from the server state.")
            .WithDescription("Retrieves a complete snapshot of all syncable user records and medical tables. Designed to hydrate a mobile device's local database during setup/re-install.")
            .Produces<ApiResponse<PatientFullRecordDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
