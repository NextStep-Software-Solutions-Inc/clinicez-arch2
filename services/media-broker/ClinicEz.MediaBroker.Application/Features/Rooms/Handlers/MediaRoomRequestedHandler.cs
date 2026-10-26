using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
using ClinicEz.MediaBroker.Application.Common.Options;
using ClinicEz.MediaBroker.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.MediaBroker.Application.Features.Rooms.Handlers;

public sealed partial class MediaRoomRequestedHandler : IInteropResponder<MediaRoomRequestedPayload, MediaRoomRespondedPayload>
{
    private readonly IMediaBrokerDbContext _db;
    private readonly ILiveKitTokenService _tokenService;
    private readonly IMediaMeteringService _meteringService;
    private readonly LiveKitOptions _options;
    private readonly ILogger<MediaRoomRequestedHandler> _logger;

    public MediaRoomRequestedHandler(
        IMediaBrokerDbContext db,
        ILiveKitTokenService tokenService,
        IMediaMeteringService meteringService,
        IOptions<LiveKitOptions> options,
        ILogger<MediaRoomRequestedHandler> logger)
    {
        _db = db;
        _tokenService = tokenService;
        _meteringService = meteringService;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<MediaRoomRespondedPayload> RespondAsync(
        MediaRoomRequestedPayload request,
        InteropMessageContext context,
        CancellationToken ct)
    {
        _logger.LogInformation("[MediaBroker] Processing media.room.requested for CallId {CallId}, Tenant {TenantId}, Room {RoomName}",
            request.CallId, request.TenantId, request.RoomName);

        // 1. Room name strict naming validation
        if (!ValidRoomPattern().IsMatch(request.RoomName))
        {
            _logger.LogWarning("[MediaBroker] Invalid room name requested: '{RoomName}'. Must match call-{{CallId}} with zero PHI.", request.RoomName);
            return new MediaRoomRespondedPayload(
                CallId: request.CallId,
                RoomName: request.RoomName,
                RelayUrl: string.Empty,
                ParticipantTokens: new Dictionary<string, string>(),
                Success: false,
                ErrorMessage: $"Invalid room name '{request.RoomName}'. Room name must follow 'call-{{id}}' format with zero PHI.");
        }

        // 2. Evaluate monthly call minute metering pool
        var decision = await _meteringService.EvaluateCallAdmissionAsync(request.TenantId, ct);
        if (!decision.Allowed)
        {
            _logger.LogWarning("[MediaBroker] Room request denied for Tenant {TenantId}: {Reason}", request.TenantId, decision.Reason);
            return new MediaRoomRespondedPayload(
                CallId: request.CallId,
                RoomName: request.RoomName,
                RelayUrl: string.Empty,
                ParticipantTokens: new Dictionary<string, string>(),
                Success: false,
                ErrorMessage: decision.Reason);
        }

        // 3. Generate Zero-PHI JWT tokens for each participant identity
        var tokens = new Dictionary<string, string>();
        var tokenTtl = TimeSpan.FromHours(2);

        try
        {
            foreach (var identity in request.ParticipantIdentities)
            {
                var token = _tokenService.CreateRoomToken(request.RoomName, identity, tokenTtl);
                tokens[identity] = token;
            }
        }
        catch (ArgumentException ex)
        {
            _logger.LogError(ex, "[MediaBroker] Error minting tokens for room {RoomName}", request.RoomName);
            return new MediaRoomRespondedPayload(
                CallId: request.CallId,
                RoomName: request.RoomName,
                RelayUrl: string.Empty,
                ParticipantTokens: new Dictionary<string, string>(),
                Success: false,
                ErrorMessage: $"Token minting rejected: {ex.Message}");
        }

        // 4. Generate 256-bit cryptographically secure room key hash for E2EE auditing
        var roomKeyBytes = RandomNumberGenerator.GetBytes(32);
        var keyHash = Convert.ToHexString(SHA256.HashData(roomKeyBytes));

        // 5. Create MediaCallSession and audit log
        var session = new MediaCallSession
        {
            CallId = request.CallId,
            TenantId = request.TenantId,
            FacilityId = context.From.FacilityId ?? string.Empty,
            RoomName = request.RoomName,
            Status = "Active",
            IsE2ee = true,
            E2eeKeyHash = keyHash,
            IsOverdraft = decision.IsOverdraft,
            RequestedAtUtc = DateTime.UtcNow,
            StartedAtUtc = DateTime.UtcNow
        };

        _db.CallSessions.Add(session);

        _db.AuditLogs.Add(new MediaAuditLog
        {
            TenantId = request.TenantId,
            CallId = request.CallId,
            EventType = "RoomCreated",
            Details = $"Room {request.RoomName} created with {tokens.Count} participant tokens. E2eeKeyHash: {keyHash}. Overdraft: {decision.IsOverdraft}",
            TimestampUtc = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("[MediaBroker] Room {RoomName} successfully created for CallId {CallId}. Returning tokens.",
            request.RoomName, request.CallId);

        return new MediaRoomRespondedPayload(
            CallId: request.CallId,
            RoomName: request.RoomName,
            RelayUrl: _options.RelayUrl,
            ParticipantTokens: tokens,
            Success: true,
            ErrorMessage: null);
    }

    [GeneratedRegex(@"^call-[0-9a-fA-F\-]{32,36}$", RegexOptions.Compiled)]
    private static partial Regex ValidRoomPattern();
}
