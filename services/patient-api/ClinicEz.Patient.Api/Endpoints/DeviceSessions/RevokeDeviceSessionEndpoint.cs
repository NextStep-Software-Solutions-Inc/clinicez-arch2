using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RevokeDeviceSession;

namespace ClinicEz.Patient.Api.Endpoints.DeviceSessions;

public sealed class RevokeDeviceSessionEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapDelete("/patients/{patientId:guid}/sessions/{sessionId:guid}", async (
                Guid patientId,
                Guid sessionId,
                ISender sender,
                CancellationToken ct) =>
            {
                await sender.Send(new RevokeDeviceSessionCommand(patientId, sessionId), ct);
                return Results.NoContent();
            })
            .WithTags("Device Sessions")
            .WithName("RevokeDeviceSession")
            .WithSummary("Sign a single device out")
            .WithDescription("Revokes one active device session of the specified patient and notifies that device. The patient's other devices stay signed in.")
            .Produces(StatusCodes.Status204NoContent)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
