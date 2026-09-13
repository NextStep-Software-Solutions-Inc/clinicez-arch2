using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RevokeDeviceSession;

namespace ClinicEz.Patient.Api.Endpoints.DeviceSessions;

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
            .WithDescription("Revokes the active device session for the specified patient, logging them out of the system.")
            .Produces(StatusCodes.Status204NoContent)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
