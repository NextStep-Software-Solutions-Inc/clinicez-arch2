using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;

public sealed record CreatePlaybackTicketCommand(Guid SessionId) : IRequest<PlaybackTicketDto>;

public sealed class CreatePlaybackTicketCommandHandler : IRequestHandler<CreatePlaybackTicketCommand, PlaybackTicketDto>
{
    private readonly IRepository<TeleconsultRecordingSession> _sessionRepo;
    private readonly IRepository<AuditEntry> _auditRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IConfiguration _configuration;
    private readonly ILogger<CreatePlaybackTicketCommandHandler> _logger;

    public CreatePlaybackTicketCommandHandler(
        IRepository<TeleconsultRecordingSession> sessionRepo,
        IRepository<AuditEntry> auditRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IConfiguration configuration,
        ILogger<CreatePlaybackTicketCommandHandler> logger)
    {
        _sessionRepo = sessionRepo;
        _auditRepo = auditRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<PlaybackTicketDto> Handle(CreatePlaybackTicketCommand request, CancellationToken ct)
    {
        // 1. Permission Guard: ConsultationsRead required
        if (!_clinicContext.HasPermission(ClinicPermissions.ConsultationsRead))
        {
            throw new ForbiddenException("Caller lacks required consultations:read permission for recording playback.");
        }

        var session = await _sessionRepo.Query()
            .FirstOrDefaultAsync(s => s.Id == request.SessionId && s.ClinicId == _clinicContext.ClinicId, ct)
            ?? throw new NotFoundException($"Recording session {request.SessionId} not found.");

        if (session.IsPurged)
        {
            throw new ForbiddenException("Recording has been purged under data retention policy and is no longer available.");
        }

        var now = DateTime.UtcNow;
        var expiresAtUtc = now.AddMinutes(15);
        var signingKey = _configuration["RecordingPlayback:SigningKey"] ?? "playback-signing-secret-cmk-2026-very-secure-key";

        var payload = $"{session.Id:N}:{session.ClinicId:N}:{expiresAtUtc.Ticks}:{_clinicContext.StaffId}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signingKey));
        var signature = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');

        var ticket = $"{payload}.{signature}";

        // WORM Audit Entry
        var audit = new AuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = session.TenantId,
            ClinicId = session.ClinicId,
            Timestamp = now,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = "teleconsult.recording.playback.ticket_issued",
            ActorStaffId = _clinicContext.StaffId,
            ActorName = _clinicContext.StaffName ?? "Attending Staff",
            ActorRole = "Doctor",
            TargetEntityType = "TeleconsultRecordingSession",
            TargetEntityId = session.Id.ToString(),
            PatientId = session.PatientId,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Time-limited playback ticket issued for teleconsult recording {session.Id} (valid for 15 minutes).",
            MetadataJson = JsonSerializer.Serialize(new
            {
                SessionId = session.Id,
                session.CallId,
                StaffId = _clinicContext.StaffId,
                ExpiresAtUtc = expiresAtUtc
            })
        };

        await _auditRepo.AddAsync(audit, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation("[RecordingVault] Playback ticket issued for session {SessionId} to staff {StaffId}.",
            session.Id, _clinicContext.StaffId);

        return new PlaybackTicketDto(ticket, expiresAtUtc);
    }
}
