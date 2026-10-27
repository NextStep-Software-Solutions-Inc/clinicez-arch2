using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Handles <c>comms.call.state.changed</c>: updates video call session state, LiveKit tokens,
/// and room details for the patient client.
/// </summary>
public sealed class CommsCallStateChangedInteropHandler : IInteropHandler<CommsCallStateChangedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ISyncNotificationService _syncNotificationService;
    private readonly ILogger<CommsCallStateChangedInteropHandler> _logger;

    public CommsCallStateChangedInteropHandler(
        ApplicationDbContext dbContext,
        ISyncNotificationService syncNotificationService,
        ILogger<CommsCallStateChangedInteropHandler> logger)
    {
        _dbContext = dbContext;
        _syncNotificationService = syncNotificationService;
        _logger = logger;
    }

    public async Task HandleAsync(CommsCallStateChangedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var session = await _dbContext.PatientCallSessions
            .FirstOrDefaultAsync(s => s.CallId == message.CallId, ct);

        if (session != null)
        {
            if (message.StateVersion <= session.StateVersion)
            {
                _logger.LogInformation("Call session {CallId} already at or past version {Version}. Skipping.",
                    message.CallId, session.StateVersion);
                return;
            }

            session.Status = message.Status;
            session.RoomName = message.RoomName;
            session.LiveKitToken = message.JoinToken;
            session.StateVersion = message.StateVersion;
            session.UpdatedAt = DateTime.UtcNow;

            if (message.Status == "Admitted" || message.Status == "InCall")
            {
                session.JoinedAtUtc ??= message.ChangedAtUtc;
            }
            else if (message.Status == "Ended")
            {
                session.EndedAtUtc ??= message.ChangedAtUtc;
            }
        }
        else
        {
            if (context.To.Kind != PartyKind.Patient || !Guid.TryParse(context.To.PatientId, out var patientId))
            {
                _logger.LogWarning("Call session {CallId} not found and recipient is not valid patient.", message.CallId);
                return;
            }

            var facilityName = "Facility";
            if (Guid.TryParse(message.FacilityId, out var fId))
            {
                var clinic = await _dbContext.Clinics.FirstOrDefaultAsync(c => c.Id == fId, ct);
                if (clinic != null && !string.IsNullOrWhiteSpace(clinic.Name))
                {
                    facilityName = clinic.Name;
                }
            }

            session = new PatientCallSession
            {
                CallId = message.CallId,
                ConversationId = message.ConversationId,
                PatientId = patientId,
                TenantId = message.TenantId,
                FacilityId = message.FacilityId,
                FacilityType = "Clinic",
                FacilityName = facilityName,
                CallKind = message.Kind,
                Status = message.Status,
                RoomName = message.RoomName,
                LiveKitToken = message.JoinToken,
                StateVersion = message.StateVersion,
                ScheduledAtUtc = message.ChangedAtUtc,
                CreatedAt = DateTime.UtcNow
            };

            await _dbContext.PatientCallSessions.AddAsync(session, ct);
        }

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Call session {CallId} state updated to {Status} for Patient {PatientId}.",
            session.CallId, session.Status, session.PatientId);

        try
        {
            await _syncNotificationService.NotifyCommsEventAsync(
                session.PatientId,
                "CallStateChanged",
                new
                {
                    callId = session.CallId,
                    conversationId = session.ConversationId,
                    status = session.Status,
                    roomName = session.RoomName,
                    joinToken = session.LiveKitToken
                },
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast call state change for patient {PatientId}.", session.PatientId);
        }
    }
}
