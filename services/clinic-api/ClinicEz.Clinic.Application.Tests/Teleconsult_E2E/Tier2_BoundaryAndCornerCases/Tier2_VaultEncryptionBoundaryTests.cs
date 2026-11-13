using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Entities;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Tier2_BoundaryAndCornerCases;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Tier 2: Boundary and Corner Cases for F10 (Vault Encryption),
/// F11 (Retention Sweeper Cleanup), and F12 (Encounter Linkage).
/// Minimum 5 tests per feature (15 tests total).
/// </summary>
public class Tier2_VaultEncryptionBoundaryTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-vault-t2";
    private readonly Guid _sessionId = Guid.NewGuid();
    private readonly Guid _consultationId = Guid.NewGuid();

    // =========================================================================
    // Feature 10: Vault Encryption Boundary Cases
    // =========================================================================

    [Fact]
    public void F10_B1_ExpiredPlaybackTicket_ValidationFails()
    {
        // Generate an already expired ticket (e.g. issued with negative duration or past expiration)
        var ticket = VaultEncryptionEngine.GeneratePlaybackTicket(_sessionId, durationMinutes: -5);

        bool isValid = VaultEncryptionEngine.ValidatePlaybackTicket(ticket.Ticket, _sessionId);

        isValid.Should().BeFalse();
    }

    [Fact]
    public void F10_B2_TamperedHmacSignature_ValidationFails()
    {
        var ticket = VaultEncryptionEngine.GeneratePlaybackTicket(_sessionId, durationMinutes: 15);

        // Tamper with HMAC signature
        var parts = ticket.Ticket.Split(':');
        string tamperedTicket = $"{parts[0]}:{parts[1]}:TAMPERED_INVALID_SIG==";

        bool isValid = VaultEncryptionEngine.ValidatePlaybackTicket(tamperedTicket, _sessionId);

        isValid.Should().BeFalse();
    }

    [Fact]
    public void F10_B3_CorruptedWrappedDekSidecar_FailsUnwrappingWithCryptographicException()
    {
        var rawMediaBytes = Encoding.UTF8.GetBytes("ENCRYPTED_STREAM_PAYLOAD");
        var encrypted = VaultEncryptionEngine.EncryptAndStoreSegment(_sessionId, Guid.NewGuid(), 0, rawMediaBytes);

        // Corrupt sidecar key bytes
        byte[] corruptedSidecar = (byte[])encrypted.EncryptedDek.Clone();
        corruptedSidecar[^1] ^= 0xFF;

        var act = () => VaultEncryptionEngine.DecryptSegment(
            encrypted.Ciphertext, encrypted.Iv, encrypted.AuthTag, corruptedSidecar);

        act.Should().Throw<CryptographicException>();
    }

    [Fact]
    public void F10_B4_EmptyMediaPayload_ZeroBytes_EncryptsAndDecryptsSuccessfully()
    {
        byte[] emptyPayload = Array.Empty<byte>();

        var encrypted = VaultEncryptionEngine.EncryptAndStoreSegment(_sessionId, Guid.NewGuid(), 0, emptyPayload);
        var decrypted = VaultEncryptionEngine.DecryptSegment(
            encrypted.Ciphertext, encrypted.Iv, encrypted.AuthTag, encrypted.EncryptedDek);

        decrypted.Should().BeEmpty();
    }

    [Fact]
    public void F10_B5_LargePayloadChunk_EncryptsAndDecryptsWithExactParity()
    {
        // 1 MB segment chunk
        byte[] largeChunk = new byte[1024 * 1024];
        RandomNumberGenerator.Fill(largeChunk);

        var encrypted = VaultEncryptionEngine.EncryptAndStoreSegment(_sessionId, Guid.NewGuid(), 5, largeChunk);
        var decrypted = VaultEncryptionEngine.DecryptSegment(
            encrypted.Ciphertext, encrypted.Iv, encrypted.AuthTag, encrypted.EncryptedDek);

        decrypted.Should().Equal(largeChunk);
    }

    // =========================================================================
    // Feature 11: Retention Sweeper Boundary Cases
    // =========================================================================

    [Fact]
    public void F11_B1_MissingSegmentFilesFromStorage_DoesNotCrashSweeper()
    {
        // Bucket is empty (files already deleted externally)
        var bucket = new HashSet<string>();

        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient External Delete",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. X",
            IsLegalHold = false
        };

        var segments = new List<TeleconsultRecordingSegment>
        {
            new() { Id = Guid.NewGuid(), SessionId = _sessionId, StorageKey = "recordings/ghost.mp4", SegmentIndex = 0, Sha256Checksum = "s", IvBase64 = "iv", TagBase64 = "t" }
        };

        var result = RecordingSweeperEngine.ExecuteRetentionPurge(session, segments, bucket, retentionDays: 90);

        result.SegmentsPurged.Should().Be(0);
        result.SidecarKeysPurged.Should().Be(0);
        session.RecordingState.Should().Be("Purged");
    }

    [Fact]
    public void F11_B2_OrphanedSidecarKeyWithoutSegmentMedia_IsCleanedUp()
    {
        var segKey = $"recordings/{_sessionId:N}/segments/seg_orphan.mp4";
        var sidecarKey = $"{segKey}.key";

        // Only the sidecar key exists in storage
        var bucket = new HashSet<string> { sidecarKey };

        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Orphan",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Y",
            IsLegalHold = false
        };

        var segments = new List<TeleconsultRecordingSegment>
        {
            new() { Id = Guid.NewGuid(), SessionId = _sessionId, StorageKey = segKey, SegmentIndex = 0, Sha256Checksum = "s", IvBase64 = "iv", TagBase64 = "t" }
        };

        var result = RecordingSweeperEngine.ExecuteRetentionPurge(session, segments, bucket, retentionDays: 90);

        result.SidecarKeysPurged.Should().Be(1);
        bucket.Should().BeEmpty();
    }

    [Fact]
    public void F11_B3_ReleasedLegalHold_PermitsSubsequentPurge()
    {
        var segKey = $"recordings/{_sessionId:N}/segments/seg_00000.mp4";
        var sidecar = $"{segKey}.key";
        var bucket = new HashSet<string> { segKey, sidecar };

        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Released Hold",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Z",
            IsLegalHold = true // Initial state: protected
        };

        var segments = new List<TeleconsultRecordingSegment>
        {
            new() { Id = Guid.NewGuid(), SessionId = _sessionId, StorageKey = segKey, SegmentIndex = 0, Sha256Checksum = "s", IvBase64 = "iv", TagBase64 = "t" }
        };

        // Sweep 1: Blocked by hold
        var sweep1 = RecordingSweeperEngine.ExecuteRetentionPurge(session, segments, bucket, retentionDays: 90);
        sweep1.IsLegalHoldProtected.Should().BeTrue();
        bucket.Should().HaveCount(2);

        // Legal hold released by legal officer
        session.IsLegalHold = false;

        // Sweep 2: Purged successfully
        var sweep2 = RecordingSweeperEngine.ExecuteRetentionPurge(session, segments, bucket, retentionDays: 90);
        sweep2.IsLegalHoldProtected.Should().BeFalse();
        sweep2.SegmentsPurged.Should().Be(1);
        sweep2.SidecarKeysPurged.Should().Be(1);
        bucket.Should().BeEmpty();
    }

    [Fact]
    public void F11_B4_SessionWithZeroSegmentsAndNoManifest_CompletesPurgeWithoutError()
    {
        var bucket = new HashSet<string>();

        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Empty Session",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. A",
            ManifestStorageKey = null,
            IsLegalHold = false
        };

        var result = RecordingSweeperEngine.ExecuteRetentionPurge(session, new List<TeleconsultRecordingSegment>(), bucket, retentionDays: 90);

        result.SegmentsPurged.Should().Be(0);
        result.SidecarKeysPurged.Should().Be(0);
        session.RecordingState.Should().Be("Purged");
    }

    [Fact]
    public void F11_B5_NegativeRetentionDaysConfiguredOnSweeper_BlocksPurge()
    {
        // 0 days protects session
        var segKey = $"recordings/{_sessionId:N}/segments/seg_00000.mp4";
        var bucket = new HashSet<string> { segKey };

        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Indefinite Session",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Indefinite",
            IsLegalHold = false
        };

        var segments = new List<TeleconsultRecordingSegment>
        {
            new() { Id = Guid.NewGuid(), SessionId = _sessionId, StorageKey = segKey, SegmentIndex = 0, Sha256Checksum = "s", IvBase64 = "iv", TagBase64 = "t" }
        };

        var result = RecordingSweeperEngine.ExecuteRetentionPurge(session, segments, bucket, retentionDays: 0);

        result.SegmentsPurged.Should().Be(0);
        bucket.Should().Contain(segKey);
    }

    // =========================================================================
    // Feature 12: Consultation Encounter Linkage Boundary Cases
    // =========================================================================

    [Fact]
    public void F12_B1_ReLinkingSameConsultationMultipleTimes_IsCleanlyIdempotent()
    {
        var aptId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Repeat Link",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Link",
            ConsultationId = null
        };

        var sessions = new List<TeleconsultRecordingSession> { session };

        var r1 = EncounterLinkageEngine.LinkEncounter(_consultationId, aptId, sessions);
        var r2 = EncounterLinkageEngine.LinkEncounter(_consultationId, aptId, sessions);

        r1.LinkageSuccessful.Should().BeTrue();
        r2.LinkageSuccessful.Should().BeTrue();
        session.ConsultationId.Should().Be(_consultationId);
    }

    [Fact]
    public void F12_B2_LinkEncounter_WithNonExistentAppointmentId_ReturnsFailureGracefully()
    {
        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Other",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Other"
        };

        var sessions = new List<TeleconsultRecordingSession> { session };
        var unknownAptId = Guid.NewGuid();

        var result = EncounterLinkageEngine.LinkEncounter(_consultationId, unknownAptId, sessions);

        result.LinkageSuccessful.Should().BeFalse();
        result.SessionId.Should().BeNull();
    }

    [Fact]
    public void F12_B3_LinkEncounter_PreservesSessionMetricsAndState()
    {
        var aptId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Preserved Metrics",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Metrics",
            RecordingState = "Completed",
            TotalDurationSeconds = 1200,
            SegmentCount = 4,
            TotalSizeBytes = 15_000_000,
            IsLegalHold = true
        };

        var sessions = new List<TeleconsultRecordingSession> { session };

        var result = EncounterLinkageEngine.LinkEncounter(_consultationId, aptId, sessions);

        result.LinkageSuccessful.Should().BeTrue();
        session.RecordingState.Should().Be("Completed");
        session.TotalDurationSeconds.Should().Be(1200);
        session.SegmentCount.Should().Be(4);
        session.TotalSizeBytes.Should().Be(15_000_000);
        session.IsLegalHold.Should().BeTrue();
    }

    [Fact]
    public void F12_B4_LinkEncounter_WithNullAppointmentId_ReturnsFalse()
    {
        var sessions = new List<TeleconsultRecordingSession>();

        var result = EncounterLinkageEngine.LinkEncounter(_consultationId, Guid.Empty, sessions);

        result.LinkageSuccessful.Should().BeFalse();
    }

    [Fact]
    public void F12_B5_LinkEncounter_MultipleDistinctSessionsAcrossAppointments()
    {
        var apt1 = Guid.NewGuid();
        var apt2 = Guid.NewGuid();
        var consult1 = Guid.NewGuid();
        var consult2 = Guid.NewGuid();

        var s1 = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = apt1,
            PatientId = Guid.NewGuid(),
            PatientName = "P1",
            DoctorId = Guid.NewGuid(),
            DoctorName = "D1"
        };
        var s2 = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = apt2,
            PatientId = Guid.NewGuid(),
            PatientName = "P2",
            DoctorId = Guid.NewGuid(),
            DoctorName = "D2"
        };

        var sessions = new List<TeleconsultRecordingSession> { s1, s2 };

        var r1 = EncounterLinkageEngine.LinkEncounter(consult1, apt1, sessions);
        var r2 = EncounterLinkageEngine.LinkEncounter(consult2, apt2, sessions);

        r1.LinkageSuccessful.Should().BeTrue();
        r2.LinkageSuccessful.Should().BeTrue();
        s1.ConsultationId.Should().Be(consult1);
        s2.ConsultationId.Should().Be(consult2);
    }
}
