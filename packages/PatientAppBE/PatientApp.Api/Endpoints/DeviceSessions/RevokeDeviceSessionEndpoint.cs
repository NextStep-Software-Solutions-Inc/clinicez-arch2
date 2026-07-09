using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Features.DeviceSessions.Commands.RevokeDeviceSession;

namespace PatientApp.Api.Endpoints.DeviceSessions;

public sealed class RevokeDeviceSessionEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapDelete("/patients/{patientId:guid}/sessions", async (
                Guid patientId,
                ISender sender,
                CancellationToken ct) =>
            {
                await sender.Send(new RevokeDeviceSessionCommand(patientId), ct);
                return Results.NoContent();
            })
            .WithTags("Device Sessions")
            .WithName("RevokeDeviceSession")
            .WithSummary("Revoke the active device session for a patient (logout)")
            .Produces(StatusCodes.Status204NoContent)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
