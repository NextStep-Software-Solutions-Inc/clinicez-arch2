using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Appointments.Commands.CancelAppointment;
using ClinicEz.Shared.Common;
using MediatR;

namespace ClinicEz.Patient.Api.Endpoints.Appointments;

public sealed record CancelAppointmentRequest(string? Reason);

public sealed class CancelAppointmentEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/appointments/{appointmentId:guid}/cancel", async (
                Guid patientId,
                Guid appointmentId,
                CancelAppointmentRequest? body,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(
                    new CancelAppointmentCommand(patientId, appointmentId, body?.Reason),
                    ct);
                return Results.Ok(ApiResponse<AppointmentDto>.Success(result));
            })
            .WithTags("Appointments")
            .WithName("CancelAppointment")
            .WithSummary("Cancel a patient appointment")
            .WithDescription("Cancels an appointment or draft and updates the patient's schedule.")
            .Produces<ApiResponse<AppointmentDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
