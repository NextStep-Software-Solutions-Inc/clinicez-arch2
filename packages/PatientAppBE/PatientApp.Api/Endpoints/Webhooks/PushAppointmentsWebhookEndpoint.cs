using CLINICEZ.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Features.Appointments.Commands.PushClinicAppointments;

namespace PatientApp.Api.Endpoints.Webhooks;

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
            .Produces<ApiResponse<bool>>(StatusCodes.Status202Accepted)
            .ProducesValidationProblem()
            .RequireAuthorization(); // Webhooks usually use a generic service-to-service token or specific auth.
    }
}
