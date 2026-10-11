using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RegisterDeviceSession;

namespace ClinicEz.Patient.Api.Endpoints.DeviceSessions;

public sealed record RegisterDeviceSessionRequest(
    string DeviceId,
    string DeviceLabel,
    string ClerkSessionId,
    string? PushToken);

public sealed class RegisterDeviceSessionEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/sessions", async (
                Guid patientId,
                RegisterDeviceSessionRequest request,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(new RegisterDeviceSessionCommand(
                    patientId,
                    request.DeviceId,
                    request.DeviceLabel,
                    request.ClerkSessionId,
                    request.PushToken), ct);

                return Results.Created(
                    $"/api/v1/patients/{patientId}/sessions/{result.SessionId}",
                    ApiResponse<RegisterDeviceSessionResponse>.Success(
                        result,
                        "Device session registered."));
            })
            .WithTags("Device Sessions")
            .WithName("RegisterDeviceSession")
            .WithSummary("Register the current device as an active session for a patient")
            .WithDescription("Registers the device identity, push notification token, and Clerk session for a patient. A patient can have several active devices; registering a device that is already active refreshes its existing session and never revokes other devices.")
            .Produces<ApiResponse<RegisterDeviceSessionResponse>>(StatusCodes.Status201Created)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
