using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class TeleconsultRecordingSegment : ClinicScopedEntity
{
    public Guid SessionId { get; set; }
    public TeleconsultRecordingSession? Session { get; set; }

    /// <summary>Zero-based contiguous segment sequence number (0, 1, 2, ...).</summary>
    public int SegmentIndex { get; set; }

    /// <summary>Duration of this segment chunk in milliseconds (typically ~10,000 ms).</summary>
    public int DurationMs { get; set; } = 10000;

    /// <summary>Storage key or URI in sovereign storage.</summary>
    public required string StorageKey { get; set; }
    public long SizeBytes { get; set; }

    /// <summary>SHA-256 integrity checksum of the stored ciphertext segment.</summary>
    public required string Sha256Checksum { get; set; }

    /// <summary>AES-256-GCM 96-bit Initialization Vector.</summary>
    public required string IvBase64 { get; set; }

    /// <summary>AES-256-GCM 128-bit Authentication Tag.</summary>
    public required string TagBase64 { get; set; }

    public DateTime ReceivedAtUtc { get; set; } = DateTime.UtcNow;
}
