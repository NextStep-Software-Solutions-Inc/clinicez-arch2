using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Infrastructure.Interop;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interfaces;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Patient.Api.Endpoints.Teleconsult;

public sealed record PatientTeleconsultCallDto(
    Guid CallId,
    string Status,
    string? RoomName,
    string? RelayUrl,
    string? JoinToken);

public sealed class GetTeleconsultCallEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patient/teleconsult/calls/{callId:guid}", HandleAsync)
            .RequireAuthorization()
            .WithName("GetPatientTeleconsultCall")
            .WithSummary("Retrieves teleconsultation call status, room name, relay URL, and join token for patient")
            .WithTags("Teleconsultation")
            .Produces<ApiResponse<PatientTeleconsultCallDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound);
    }

    public static async Task<IResult> HandleAsync(
        Guid callId,
        ApplicationDbContext dbContext,
        ICurrentUserService currentUser,
        IConfiguration configuration,
        CancellationToken ct)
    {
        var session = await dbContext.PatientCallSessions
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.CallId == callId, ct);

        if (session is null)
        {
            return Results.NotFound(ApiResponse<object>.Fail($"Teleconsultation call {callId} not found.", [], "CALL_NOT_FOUND"));
        }

        var relayUrl = CommsCallStateChangedInteropHandler.GetRelayUrl(callId)
            ?? configuration["LIVEKIT_URL"]
            ?? "wss://media.clinicez.internal";

        var response = new PatientTeleconsultCallDto(
            CallId: session.CallId,
            Status: session.Status,
            RoomName: session.RoomName,
            RelayUrl: relayUrl,
            JoinToken: session.LiveKitToken);

        return Results.Ok(ApiResponse<PatientTeleconsultCallDto>.Success(response));
    }
}
