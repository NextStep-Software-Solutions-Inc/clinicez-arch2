using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;

public sealed record FinalizeRecordingSessionCommand(Guid SessionId) : IRequest<RecordingSessionDto>;

public sealed class FinalizeRecordingSessionCommandHandler : IRequestHandler<FinalizeRecordingSessionCommand, RecordingSessionDto>
{
    private readonly IRepository<TeleconsultRecordingSession> _sessionRepo;
    private readonly IRepository<TeleconsultRecordingSegment> _segmentRepo;
    private readonly IRepository<ClinicAuditEntry> _auditRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicStorageService _storage;
    private readonly ILogger<FinalizeRecordingSessionCommandHandler> _logger;

    public FinalizeRecordingSessionCommandHandler(
        IRepository<TeleconsultRecordingSession> sessionRepo,
        IRepository<TeleconsultRecordingSegment> segmentRepo,
        IRepository<ClinicAuditEntry> auditRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IClinicStorageService storage,
        ILogger<FinalizeRecordingSessionCommandHandler> logger)
    {
        _sessionRepo = sessionRepo;
        _segmentRepo = segmentRepo;
        _auditRepo = auditRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _storage = storage;
        _logger = logger;
    }

    public async Task<RecordingSessionDto> Handle(FinalizeRecordingSessionCommand request, CancellationToken ct)
    {
        var session = await _sessionRepo.Query()
            .Include(s => s.Segments)
            .FirstOrDefaultAsync(s => s.Id == request.SessionId && s.ClinicId == _clinicContext.ClinicId, ct)
            ?? throw new NotFoundException($"Recording session {request.SessionId} not found.");

        var orderedSegments = session.Segments.OrderBy(s => s.SegmentIndex).ToList();

        // 1. Contiguity Verification
        var hasGaps = false;
        for (var i = 0; i < orderedSegments.Count; i++)
        {
            if (orderedSegments[i].SegmentIndex != i)
            {
                hasGaps = true;
                _logger.LogWarning("[RecordingVault] Gap detected in session {SessionId}: expected segment {ExpectedIndex}, found {ActualIndex}.",
                    session.Id, i, orderedSegments[i].SegmentIndex);
                break;
            }
        }
        session.HasGaps = hasGaps;

        // 2. Metrics calculation
        var totalSizeBytes = orderedSegments.Sum(s => s.SizeBytes);
        var totalDurationMs = orderedSegments.Sum(s => s.DurationMs);
        var totalDurationSec = (int)Math.Round((double)totalDurationMs / 1000);

        session.TotalSizeBytes = totalSizeBytes;
        session.TotalDurationSeconds = totalDurationSec;
        session.SegmentCount = orderedSegments.Count;
        session.RecordingState = "Completed";
        session.StoppedAtUtc = DateTime.UtcNow;
        session.ExpiresAtUtc = session.RetentionPolicyDays > 0
            ? DateTime.UtcNow.AddDays(session.RetentionPolicyDays)
            : null;

        // 3. Assemble and save encrypted manifest
        var manifestObj = new RecordingManifest(
            SessionId: session.Id,
            ClinicId: session.ClinicId,
            CallId: session.CallId,
            ContainerFormat: session.ContainerFormat,
            TotalDurationSeconds: totalDurationSec,
            SegmentCount: orderedSegments.Count,
            TotalSizeBytes: totalSizeBytes,
            HasGaps: hasGaps,
            Segments: orderedSegments.Select(s => new RecordingManifestSegmentItem(
                s.SegmentIndex,
                s.DurationMs,
                s.StorageKey,
                s.SizeBytes,
                s.Sha256Checksum,
                s.IvBase64,
                s.TagBase64
            )).ToList(),
            CreatedAtUtc: DateTime.UtcNow
        );

        var manifestJson = JsonSerializer.Serialize(manifestObj, InteropJson.Options);
        var manifestBytes = Encoding.UTF8.GetBytes(manifestJson);
        var manifestKey = $"vault/recordings/{session.ClinicId}/{session.Id}/manifest.cez";

        await _storage.SaveEncryptedFileAsync(manifestKey, manifestBytes, ct);
        session.ManifestStorageKey = manifestKey;

        // 4. WORM Audit Log
        var audit = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = session.TenantId,
            ClinicId = session.ClinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Operations,
            Severity = ClinicAuditSeverities.Routine,
            Action = "teleconsult.recording.finalized",
            ActorStaffId = _clinicContext.StaffId,
            ActorName = _clinicContext.StaffName ?? session.DoctorName,
            ActorRole = "Doctor",
            TargetEntityType = "TeleconsultRecordingSession",
            TargetEntityId = session.Id.ToString(),
            PatientId = session.PatientId,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Teleconsult recording {session.Id} finalized with {orderedSegments.Count} segments ({totalDurationSec}s, {totalSizeBytes} bytes). HasGaps: {hasGaps}.",
            MetadataJson = JsonSerializer.Serialize(new
            {
                SessionId = session.Id,
                session.CallId,
                session.SegmentCount,
                session.TotalDurationSeconds,
                session.TotalSizeBytes,
                session.HasGaps,
                ManifestKey = manifestKey,
                session.ExpiresAtUtc
            })
        };

        await _auditRepo.AddAsync(audit, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation("[RecordingVault] Recording session {SessionId} finalized successfully.", session.Id);

        return new RecordingSessionDto(
            session.Id,
            session.ClinicId,
            session.CallId,
            session.AppointmentId,
            session.ConsultationId,
            session.PatientId,
            session.PatientName,
            session.DoctorId,
            session.DoctorName,
            session.ConsentStatus,
            session.RecordingState,
            session.StoragePolicy,
            session.TotalDurationSeconds,
            session.SegmentCount,
            session.TotalSizeBytes,
            session.ContainerFormat,
            session.ManifestStorageKey,
            session.HasGaps,
            session.RetentionPolicyDays,
            session.ExpiresAtUtc,
            session.IsLegalHold,
            session.LegalHoldReason,
            session.IsPurged
        );
    }
}
