using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/teleconsult/recordings")]
public sealed class TeleconsultRecordingsController : ControllerBase
{
    private const int StreamBufferSize = 80 * 1024; // 80 KB bounded streaming buffer

    private readonly ISender _sender;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicStorageService _storage;
    private readonly IConfiguration _configuration;
    private readonly ApplicationDbContext _db;
    private readonly ILogger<TeleconsultRecordingsController> _logger;

    public TeleconsultRecordingsController(
        ISender sender,
        IClinicContext clinicContext,
        IClinicStorageService storage,
        IConfiguration configuration,
        ApplicationDbContext db,
        ILogger<TeleconsultRecordingsController> logger)
    {
        _sender = sender;
        _clinicContext = clinicContext;
        _storage = storage;
        _configuration = configuration;
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Clinician initiates recording consent for a teleconsultation call.
    /// Guarded by administrative recording policy and teleconsult:record permission.
    /// </summary>
    [HttpPost("sessions/request-consent")]
    [HasPermission(ClinicPermissions.TeleconsultRecord)]
    public async Task<ActionResult<ApiResponse<RecordingSessionDto>>> RequestConsent(
        [FromBody] RequestConsentRequest request,
        CancellationToken ct)
    {
        var command = new RequestRecordingConsentCommand(
            request.CallId,
            request.PatientId,
            request.DoctorId,
            request.AppointmentId,
            request.ConsultationId,
            request.ContainerFormat
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<RecordingSessionDto>.Success(result, "Recording consent requested."));
    }

    /// <summary>
    /// Patient submits informed consent decision (approved or declined) via patient-app or portal-web.
    /// Rejection locks session in Blocked state and writes WORM audit log.
    /// </summary>
    [HttpPost("sessions/{id:guid}/patient-consent")]
    public async Task<ActionResult<ApiResponse<RecordingSessionDto>>> SubmitPatientConsent(
        Guid id,
        [FromBody] PatientConsentRequest request,
        CancellationToken ct)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var ua = Request.Headers.UserAgent.ToString();

        var command = new SubmitPatientConsentCommand(
            id,
            request.Approved,
            request.RejectionReason,
            ip,
            ua
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<RecordingSessionDto>.Success(result, request.Approved ? "Recording consent granted." : "Recording consent declined."));
    }

    /// <summary>
    /// Either participant revokes consent during an active recording session, halting recording immediately.
    /// </summary>
    [HttpPost("sessions/{id:guid}/revoke-consent")]
    public async Task<ActionResult<ApiResponse<RecordingSessionDto>>> RevokeConsent(
        Guid id,
        [FromBody] RevokeConsentRequest request,
        CancellationToken ct)
    {
        var command = new RevokeRecordingConsentCommand(id, request.Reason);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<RecordingSessionDto>.Success(result, "Recording consent revoked. Session stopped."));
    }

    /// <summary>
    /// Streams an encrypted chunk (~10s WebM/AES-256-GCM) directly to sovereign storage using an 80 KB buffer.
    /// Enforces zero whole-file RAM buffering.
    /// </summary>
    [HttpPost("sessions/{id:guid}/segments")]
    [RequestSizeLimit(100 * 1024 * 1024)] // 100 MB max segment chunk limit
    public async Task<ActionResult<ApiResponse<RecordingSegmentDto>>> UploadSegment(
        Guid id,
        CancellationToken ct)
    {
        if (!Request.Headers.TryGetValue("X-Segment-Index", out var idxVal) || !int.TryParse(idxVal, out var segmentIndex))
        {
            return BadRequest(ApiResponse<RecordingSegmentDto>.Fail("Missing or invalid X-Segment-Index header."));
        }

        if (!Request.Headers.TryGetValue("X-Segment-Duration-Ms", out var durVal) || !int.TryParse(durVal, out var durationMs))
        {
            return BadRequest(ApiResponse<RecordingSegmentDto>.Fail("Missing or invalid X-Segment-Duration-Ms header."));
        }

        var iv = Request.Headers["X-Encryption-Iv"].ToString();
        var tag = Request.Headers["X-Encryption-Tag"].ToString();

        if (string.IsNullOrWhiteSpace(iv) || string.IsNullOrWhiteSpace(tag))
        {
            return BadRequest(ApiResponse<RecordingSegmentDto>.Fail("Missing mandatory X-Encryption-Iv or X-Encryption-Tag headers."));
        }

        var tenantId = _clinicContext.TenantId ?? "default";
        var storageKey = $"{tenantId}/{_clinicContext.ClinicId}/{id}/seg_{segmentIndex:D5}.cez";

        using var hashingStream = new HashingReadStream(Request.Body);
        await _storage.SaveEncryptedStreamAsync(storageKey, hashingStream, ct);

        var sha256 = hashingStream.GetSha256Hex();
        var sizeBytes = hashingStream.TotalBytesRead;

        var command = new UploadRecordingSegmentCommand(
            id,
            segmentIndex,
            durationMs,
            storageKey,
            sizeBytes,
            sha256,
            iv,
            tag
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<RecordingSegmentDto>.Success(result, $"Segment {segmentIndex} uploaded successfully."));
    }

    /// <summary>
    /// Finalizes a recording session, verifies segment contiguity, creates encrypted manifest, and sets retention expiry.
    /// </summary>
    [HttpPost("sessions/{id:guid}/finalize")]
    [HasPermission(ClinicPermissions.TeleconsultRecord)]
    public async Task<ActionResult<ApiResponse<RecordingSessionDto>>> FinalizeSession(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new FinalizeRecordingSessionCommand(id), ct);
        return Ok(ApiResponse<RecordingSessionDto>.Success(result, "Recording session finalized."));
    }

    /// <summary>
    /// Places a medico-legal hold on a recording, freezing automated retention deletion.
    /// Admin only.
    /// </summary>
    [HttpPost("sessions/{id:guid}/legal-hold")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<RecordingSessionDto>>> PlaceLegalHold(
        Guid id,
        [FromBody] LegalHoldRequest request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new PlaceLegalHoldCommand(id, request.Reason), ct);
        return Ok(ApiResponse<RecordingSessionDto>.Success(result, "Medico-legal hold placed on recording session."));
    }

    /// <summary>
    /// Releases a medico-legal hold, allowing normal retention scheduling to resume.
    /// Admin only.
    /// </summary>
    [HttpPost("sessions/{id:guid}/release-legal-hold")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<RecordingSessionDto>>> ReleaseLegalHold(
        Guid id,
        [FromBody] ReleaseLegalHoldRequest request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new ReleaseLegalHoldCommand(id, request.Reason), ct);
        return Ok(ApiResponse<RecordingSessionDto>.Success(result, "Medico-legal hold released."));
    }

    /// <summary>
    /// Issues a short-lived 15-minute signed HMAC ticket for authorized clinical playback.
    /// Guarded by consultations:read permission and WORM audit logging.
    /// </summary>
    [HttpPost("sessions/{id:guid}/playback-ticket")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<PlaybackTicketDto>>> CreatePlaybackTicket(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new CreatePlaybackTicketCommand(id), ct);
        return Ok(ApiResponse<PlaybackTicketDto>.Success(result, "Playback ticket generated."));
    }

    /// <summary>
    /// Streams encrypted recording media (manifest or segment chunk) verified by a 15-minute playback ticket.
    /// </summary>
    [HttpGet("sessions/{id:guid}/stream")]
    public async Task<IActionResult> StreamRecording(
        Guid id,
        [FromQuery] string ticket,
        [FromQuery] int? segmentIndex,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(ticket))
        {
            return Unauthorized("Playback ticket is required.");
        }

        var parts = ticket.Split('.');
        if (parts.Length != 2)
        {
            return BadRequest("Invalid ticket format.");
        }

        var payload = parts[0];
        var signature = parts[1];

        var signingKey = _configuration["RecordingPlayback:SigningKey"] ?? "playback-signing-secret-cmk-2026-very-secure-key";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signingKey));
        var expectedSig = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');

        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(signature), Encoding.UTF8.GetBytes(expectedSig)))
        {
            return Unauthorized("Playback ticket signature verification failed.");
        }

        var payloadParts = payload.Split(':');
        if (payloadParts.Length != 4)
        {
            return BadRequest("Invalid ticket payload structure.");
        }

        if (!Guid.TryParse(payloadParts[0], out var ticketSessionId) || ticketSessionId != id)
        {
            return Unauthorized("Playback ticket does not match the requested recording session.");
        }

        if (!long.TryParse(payloadParts[2], out var ticks) || DateTime.UtcNow.Ticks > ticks)
        {
            return Unauthorized("Playback ticket has expired.");
        }

        var session = await _db.TeleconsultRecordingSessions
            .FirstOrDefaultAsync(s => s.Id == id, ct);

        if (session == null || session.IsPurged)
        {
            return NotFound("Recording session not found or already purged.");
        }

        if (segmentIndex.HasValue)
        {
            var segment = await _db.TeleconsultRecordingSegments
                .FirstOrDefaultAsync(s => s.SessionId == id && s.SegmentIndex == segmentIndex.Value, ct);

            if (segment == null || string.IsNullOrWhiteSpace(segment.StorageKey))
            {
                return NotFound($"Segment {segmentIndex.Value} not found.");
            }

            var stream = await _storage.OpenReadEncryptedStreamAsync(segment.StorageKey, ct);
            return File(stream, session.ContainerFormat, enableRangeProcessing: true);
        }

        if (string.IsNullOrWhiteSpace(session.ManifestStorageKey))
        {
            return NotFound("Manifest not found for session.");
        }

        var manifestStream = await _storage.OpenReadEncryptedStreamAsync(session.ManifestStorageKey, ct);
        return File(manifestStream, "application/json");
    }

    /// <summary>
    /// Retrieves recording metadata for consultation chart display.
    /// </summary>
    [HttpGet("consultations/{consultationId:guid}")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<RecordingSessionDto?>>> GetConsultationRecording(
        Guid consultationId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetConsultationRecordingQuery(consultationId), ct);
        return Ok(ApiResponse<RecordingSessionDto?>.Success(result));
    }

    private sealed class HashingReadStream : Stream
    {
        private readonly Stream _inner;
        private readonly IncrementalHash _hasher;
        private long _bytesRead;

        public HashingReadStream(Stream inner)
        {
            _inner = inner;
            _hasher = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        }

        public long TotalBytesRead => _bytesRead;

        public string GetSha256Hex() => Convert.ToHexString(_hasher.GetHashAndReset()).ToLowerInvariant();

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position
        {
            get => _bytesRead;
            set => throw new NotSupportedException();
        }

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            var read = await _inner.ReadAsync(buffer, cancellationToken);
            if (read > 0)
            {
                _hasher.AppendData(buffer.Span.Slice(0, read));
                _bytesRead += read;
            }
            return read;
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            var read = _inner.Read(buffer, offset, count);
            if (read > 0)
            {
                _hasher.AppendData(buffer, offset, read);
                _bytesRead += read;
            }
            return read;
        }

        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _hasher.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}

public sealed record RequestConsentRequest(
    Guid CallId,
    Guid PatientId,
    Guid DoctorId,
    Guid? AppointmentId = null,
    Guid? ConsultationId = null,
    string? ContainerFormat = null);

public sealed record PatientConsentRequest(
    bool Approved,
    string? RejectionReason = null);

public sealed record RevokeConsentRequest(
    string? Reason = null);

public sealed record LegalHoldRequest(
    string Reason);

public sealed record ReleaseLegalHoldRequest(
    string? Reason = null);
