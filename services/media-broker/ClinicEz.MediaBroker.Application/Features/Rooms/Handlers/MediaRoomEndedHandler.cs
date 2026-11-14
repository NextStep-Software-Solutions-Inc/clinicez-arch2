using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
using ClinicEz.MediaBroker.Application.Services;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.MediaBroker.Application.Features.Rooms.Handlers;

public sealed class MediaRoomEndedHandler : IInteropHandler<MediaRoomEndedPayload>
{
    private readonly IMediaBrokerDbContext _db;
    private readonly IMediaMeteringService _meteringService;
    private readonly ILiveKitRoomClient _liveKitRoomClient;
    private readonly ILogger<MediaRoomEndedHandler> _logger;

    public MediaRoomEndedHandler(
        IMediaBrokerDbContext db,
        IMediaMeteringService meteringService,
        ILiveKitRoomClient liveKitRoomClient,
        ILogger<MediaRoomEndedHandler> logger)
    {
        _db = db;
        _meteringService = meteringService;
        _liveKitRoomClient = liveKitRoomClient;
        _logger = logger;
    }

    public async Task HandleAsync(MediaRoomEndedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        if (payload is null)
        {
            _logger.LogWarning("[MediaBroker] Received null media.room.ended payload.");
            return;
        }

        _logger.LogInformation("[MediaBroker] Processing media.room.ended for CallId {CallId}, Tenant {TenantId}, Room {RoomName}",
            payload.CallId, payload.TenantId, payload.RoomName);

        var session = await _db.CallSessions.FirstOrDefaultAsync(s => s.CallId == payload.CallId, ct);
        if (session != null)
        {
            var startedAt = session.StartedAtUtc ?? session.RequestedAtUtc;
            await _meteringService.RecordCallEndedAsync(payload.CallId, startedAt, payload.EndedAtUtc, ct);
        }
        else
        {
            _logger.LogWarning("[MediaBroker] Call session {CallId} not found when processing media.room.ended.", payload.CallId);
        }

        // Server-side teardown of LiveKit SFU room with non-blocking fallback
        await _liveKitRoomClient.DeleteRoomAsync(payload.RoomName, ct);
    }
}
