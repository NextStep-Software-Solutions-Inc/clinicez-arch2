using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RevokeAllDeviceSessions;

namespace ClinicEz.Patient.Api.Endpoints.DeviceSessions;

public sealed class RevokeAllDeviceSessionsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapDelete("/patients/{patientId:guid}/sessions", async (
                Guid patientId,
                ISender sender,
                CancellationToken ct) =>
            {
                await sender.Send(new RevokeAllDeviceSessionsCommand(patientId), ct);
                return Results.NoContent();
            })
            .WithTags("Device Sessions")
            .WithName("RevokeAllDeviceSessions")
            .WithSummary("Sign the patient out of every device")
            .WithDescription("Revokes all active device sessions of the specified patient and notifies every connected device.")
            .Produces(StatusCodes.Status204NoContent)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
