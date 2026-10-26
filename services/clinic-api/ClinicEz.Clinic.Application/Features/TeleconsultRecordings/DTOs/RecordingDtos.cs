using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;

public sealed record RecordingSessionDto(
    Guid Id,
    Guid ClinicId,
    Guid CallId,
    Guid? AppointmentId,
    Guid? ConsultationId,
    Guid PatientId,
    string PatientName,
    Guid DoctorId,
    string DoctorName,
    string ConsentStatus,
    string RecordingState,
    string StoragePolicy,
    int TotalDurationSeconds,
    int SegmentCount,
    long TotalSizeBytes,
    string ContainerFormat,
    string? ManifestStorageKey,
    bool HasGaps,
    int RetentionPolicyDays,
    DateTime? ExpiresAtUtc,
    bool IsLegalHold,
    string? LegalHoldReason,
    bool IsPurged);

public sealed record RecordingSegmentDto(
    Guid Id,
    Guid SessionId,
    int SegmentIndex,
    int DurationMs,
    string StorageKey,
    long SizeBytes,
    string Sha256Checksum,
    DateTime ReceivedAtUtc);

public sealed record PlaybackTicketDto(
    string Ticket,
    DateTime ExpiresAtUtc);

public sealed record RecordingManifestSegmentItem(
    int SegmentIndex,
    int DurationMs,
    string StorageKey,
    long SizeBytes,
    string Sha256Checksum,
    string IvBase64,
    string TagBase64);

public sealed record RecordingManifest(
    Guid SessionId,
    Guid ClinicId,
    Guid CallId,
    string ContainerFormat,
    int TotalDurationSeconds,
    int SegmentCount,
    long TotalSizeBytes,
    bool HasGaps,
    IReadOnlyList<RecordingManifestSegmentItem> Segments,
    DateTime CreatedAtUtc);
