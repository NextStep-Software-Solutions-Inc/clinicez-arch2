using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Appointments.Queries.GetAppointments;

namespace ClinicEz.Patient.Api.Endpoints.Appointments;

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
            .WithDescription("Retrieves all appointments for a patient across all clinics they have joined.")
            .Produces<ApiResponse<AppointmentsResponse>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
