using System;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;

public sealed record UploadRecordingSegmentCommand(
    Guid SessionId,
    int SegmentIndex,
    int DurationMs,
    string StorageKey,
    long SizeBytes,
    string Sha256Checksum,
    string IvBase64,
    string TagBase64) : IRequest<RecordingSegmentDto>;

public sealed class UploadRecordingSegmentCommandHandler : IRequestHandler<UploadRecordingSegmentCommand, RecordingSegmentDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IRepository<TeleconsultRecordingSession> _sessionRepo;
    private readonly IRepository<TeleconsultRecordingSegment> _segmentRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicStorageService _storage;
    private readonly ILogger<UploadRecordingSegmentCommandHandler> _logger;

    public UploadRecordingSegmentCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IRepository<TeleconsultRecordingSession> sessionRepo,
        IRepository<TeleconsultRecordingSegment> segmentRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IClinicStorageService storage,
        ILogger<UploadRecordingSegmentCommandHandler> logger)
    {
        _settingsRepo = settingsRepo;
        _sessionRepo = sessionRepo;
        _segmentRepo = segmentRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _storage = storage;
        _logger = logger;
    }

    public async Task<RecordingSegmentDto> Handle(UploadRecordingSegmentCommand request, CancellationToken ct)
    {
        // 1. Facility Policy Check
        var settings = await _settingsRepo.Query()
            .FirstOrDefaultAsync(s => s.ClinicId == _clinicContext.ClinicId, ct);

        if (string.Equals(settings?.TeleconsultRecordingPolicy, "Disabled", StringComparison.OrdinalIgnoreCase))
        {
            throw new ForbiddenException("Teleconsultation recording is disabled by facility policy. RECORDING_POLICY_DISABLED.");
        }

        // 2. Session & Consent State Check
        var session = await _sessionRepo.Query()
            .FirstOrDefaultAsync(s => s.Id == request.SessionId && s.ClinicId == _clinicContext.ClinicId, ct)
            ?? throw new NotFoundException($"Recording session {request.SessionId} not found.");

        if (string.Equals(session.ConsentStatus, "Rejected", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(session.RecordingState, "Blocked", StringComparison.OrdinalIgnoreCase))
        {
            throw new ForbiddenException("Recording consent was declined by patient. Segment uploads are blocked. CONSENT_REJECTED_RECORDING_BLOCKED.");
        }

        if (!string.Equals(session.ConsentStatus, "Consented", StringComparison.OrdinalIgnoreCase))
        {
            throw new ForbiddenException("Recording consent has not been granted by patient. CONSENT_NOT_GRANTED.");
        }

        if (string.Equals(session.RecordingState, "Purged", StringComparison.OrdinalIgnoreCase) || session.IsPurged)
        {
            throw new ForbiddenException("Recording session has already been purged.");
        }

        // Enforce sovereign storage path isolation: {TenantId}/{ClinicId}/{SessionId}/ or vault/recordings/{ClinicId}/{SessionId}/
        var expectedPrefix1 = $"{session.TenantId}/{session.ClinicId}/{session.Id}/";
        var expectedPrefix2 = $"vault/recordings/{session.ClinicId}/{session.Id}/";
        var expectedPrefix3 = $"vault/recordings/{session.TenantId}/{session.ClinicId}/{session.Id}/";

        if (string.IsNullOrWhiteSpace(request.StorageKey))
        {
            throw new ForbiddenException($"Storage key '{request.StorageKey}' violates sovereign path isolation. Key must start with '{expectedPrefix1}' and contain no path traversal.");
        }

        string unescapedKey;
        try
        {
            unescapedKey = Uri.UnescapeDataString(request.StorageKey);
        }
        catch (UriFormatException)
        {
            throw new ForbiddenException($"Storage key '{request.StorageKey}' violates sovereign path isolation. Invalid URL encoding.");
        }

        bool startsWithValidPrefix =
            (request.StorageKey.StartsWith(expectedPrefix1, StringComparison.OrdinalIgnoreCase) && unescapedKey.StartsWith(expectedPrefix1, StringComparison.OrdinalIgnoreCase)) ||
            (request.StorageKey.StartsWith(expectedPrefix2, StringComparison.OrdinalIgnoreCase) && unescapedKey.StartsWith(expectedPrefix2, StringComparison.OrdinalIgnoreCase)) ||
            (request.StorageKey.StartsWith(expectedPrefix3, StringComparison.OrdinalIgnoreCase) && unescapedKey.StartsWith(expectedPrefix3, StringComparison.OrdinalIgnoreCase));

        if (request.StorageKey.Contains("..") ||
            unescapedKey.Contains("..") ||
            request.StorageKey.Contains("%2e", StringComparison.OrdinalIgnoreCase) ||
            unescapedKey.Contains("%2e", StringComparison.OrdinalIgnoreCase) ||
            request.StorageKey.Contains("%00", StringComparison.OrdinalIgnoreCase) ||
            unescapedKey.Contains('\0') ||
            request.StorageKey.Contains('\\') ||
            unescapedKey.Contains('\\') ||
            !startsWithValidPrefix)
        {
            throw new ForbiddenException($"Storage key '{request.StorageKey}' violates sovereign path isolation. Key must start with '{expectedPrefix1}' and contain no path traversal.");
        }

        // Check for duplicate segment index
        var duplicate = await _segmentRepo.Query()
            .AnyAsync(s => s.SessionId == request.SessionId && s.SegmentIndex == request.SegmentIndex, ct);

        if (duplicate)
        {
            throw new ConflictException($"Segment with index {request.SegmentIndex} already uploaded for session {request.SessionId}.");
        }

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            TenantId = session.TenantId,
            ClinicId = session.ClinicId,
            SessionId = session.Id,
            SegmentIndex = request.SegmentIndex,
            DurationMs = request.DurationMs,
            StorageKey = request.StorageKey,
            SizeBytes = request.SizeBytes,
            Sha256Checksum = request.Sha256Checksum,
            IvBase64 = request.IvBase64,
            TagBase64 = request.TagBase64,
            ReceivedAtUtc = DateTime.UtcNow
        };

        await _segmentRepo.AddAsync(segment, ct);

        session.SegmentCount++;
        session.TotalSizeBytes += request.SizeBytes;
        session.TotalDurationSeconds += (int)Math.Round((double)request.DurationMs / 1000);
        if (session.RecordingState == "ReadyToRecord" || session.RecordingState == "PendingConsent")
        {
            session.RecordingState = "Recording";
            session.StartedAtUtc ??= DateTime.UtcNow;
        }

        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation("[RecordingVault] Segment {Index} ({Size} bytes) committed for session {SessionId}.",
            request.SegmentIndex, request.SizeBytes, request.SessionId);

        return new RecordingSegmentDto(
            segment.Id,
            segment.SessionId,
            segment.SegmentIndex,
            segment.DurationMs,
            segment.StorageKey,
            segment.SizeBytes,
            segment.Sha256Checksum,
            segment.ReceivedAtUtc
        );
    }
}
