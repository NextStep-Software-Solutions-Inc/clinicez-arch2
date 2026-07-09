using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Features.Appointments.Queries.GetAppointments;

namespace PatientApp.Api.Endpoints.Appointments;

public sealed class GetAppointmentsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/appointments", async (
                Guid patientId,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(new GetAppointmentsQuery(patientId), ct);
                return Results.Ok(ApiResponse<AppointmentsResponse>.Success(result));
            })
            .WithTags("Appointments")
            .WithName("GetAppointments")
            .WithSummary("Get a patient's appointments across all joined clinics")
            .Produces<ApiResponse<AppointmentsResponse>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
