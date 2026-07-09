using Clinic EZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Common.DTOs;
using PatientAppBE.Application.Features.DeviceSessions.Commands.RegisterDeviceSession;

namespace PatientAppBE.Api.Endpoints.DeviceSessions;

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
                        "Device session registered. Any previous session has been revoked."));
            })
            .WithTags("Device Sessions")
            .WithName("RegisterDeviceSession")
            .WithSummary("Register the current device as the single active session for a patient")
            .Produces<ApiResponse<RegisterDeviceSessionResponse>>(StatusCodes.Status201Created)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
