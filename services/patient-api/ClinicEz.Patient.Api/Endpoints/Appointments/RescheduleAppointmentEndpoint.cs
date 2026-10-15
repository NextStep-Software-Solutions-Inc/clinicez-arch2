using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Appointments.Commands.RescheduleAppointment;
using ClinicEz.Shared.Common;
using MediatR;

namespace ClinicEz.Patient.Api.Endpoints.Appointments;

public sealed record RescheduleAppointmentRequest(
    DateTime ScheduledAt,
    string? Reason);

public sealed class RescheduleAppointmentEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/appointments/{appointmentId:guid}/reschedule", async (
                Guid patientId,
                Guid appointmentId,
                RescheduleAppointmentRequest body,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(
                    new RescheduleAppointmentCommand(patientId, appointmentId, body.ScheduledAt, body.Reason),
                    ct);
                return Results.Ok(ApiResponse<AppointmentDto>.Success(result));
            })
            .WithTags("Appointments")
            .WithName("RescheduleAppointment")
            .WithSummary("Request an appointment reschedule")
            .WithDescription("Updates a patient's appointment schedule to Pending and notifies the clinic via the Interop Hub.")
            .Produces<ApiResponse<AppointmentDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
