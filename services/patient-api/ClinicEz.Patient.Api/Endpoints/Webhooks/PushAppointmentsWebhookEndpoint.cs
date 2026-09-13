using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Appointments.Commands.PushClinicAppointments;

namespace ClinicEz.Patient.Api.Endpoints.Webhooks;

public sealed class PushAppointmentsWebhookEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/webhooks/clinics/{clinicId:guid}/appointments", async (
                Guid clinicId,
                [FromQuery] Guid patientId,
                [FromBody] IReadOnlyList<ClinicAppointmentDto> payload,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(new PushClinicAppointmentsCommand(patientId, clinicId, payload), ct);
                return Results.Accepted(value: ApiResponse<bool>.Success(result));
            })
            .WithTags("Webhooks")
            .WithName("PushAppointmentsWebhook")
            .WithSummary("Receive appointments pushed from a clinic dashboard")
            .WithDescription("Callback webhook endpoint that receives updated appointment data pushed directly from a clinic dashboard.")
            .Produces<ApiResponse<bool>>(StatusCodes.Status202Accepted)
            .ProducesValidationProblem()
            .RequireAuthorization(); // Webhooks usually use a generic service-to-service token or specific auth.
    }
}
