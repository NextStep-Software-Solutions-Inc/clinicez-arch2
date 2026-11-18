using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Entities;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Tier1_FeatureCoverage;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Tier 1: Feature Coverage for F10 (CMK AES-256-GCM Vault Encryption),
/// F11 (Recording Sweeper Sidecar Cleanup), and F12 (Consultation Encounter Linkage).
/// Minimum 5 tests per feature (15 tests total).
/// </summary>
public class Tier1_EncryptedVaultAndRetentionTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-vault-t1";
    private readonly Guid _sessionId = Guid.NewGuid();
    private readonly Guid _consultationId = Guid.NewGuid();

    // =========================================================================
    // Feature 10: CMK AES-256-GCM Vault Encryption
    // =========================================================================

    [Fact]
    public void F10_T1_EncryptAndStoreSegment_CreatesEncryptedDataAndSidecarKeyPath()
    {
        var rawMediaBytes = Encoding.UTF8.GetBytes("WEBM_VIDEO_AUDIO_SEGMENT_PAYLOAD_CHUNK_DATA_12345");
        var segmentId = Guid.NewGuid();

        var result = VaultEncryptionEngine.EncryptAndStoreSegment(_sessionId, segmentId, 0, rawMediaBytes);

        result.StorageKey.Should().Be($"recordings/{_sessionId:N}/segments/seg_00000.mp4");
        result.SidecarKeyPath.Should().Be($"recordings/{_sessionId:N}/segments/seg_00000.mp4.key");
        result.Ciphertext.Should().NotBeNull();
        result.Ciphertext.Length.Should().Be(rawMediaBytes.Length);
        result.Ciphertext.Should().NotEqual(rawMediaBytes);
        result.EncryptedDek.Should().NotBeNull();
        result.Iv.Length.Should().Be(12);
        result.AuthTag.Length.Should().Be(16);
    }

    [Fact]
    public void F10_T2_DecryptSegment_RecoversExactPlaintextBytes()
    {
        var originalMedia = Encoding.UTF8.GetBytes("CONFIDENTIAL_CLINICAL_VIDEO_STREAM_DATA");
        var segmentId = Guid.NewGuid();

        var encrypted = VaultEncryptionEngine.EncryptAndStoreSegment(_sessionId, segmentId, 1, originalMedia);

        var decrypted = VaultEncryptionEngine.DecryptSegment(
            encrypted.Ciphertext, encrypted.Iv, encrypted.AuthTag, encrypted.EncryptedDek);

        decrypted.Should().Equal(originalMedia);
    }

    [Fact]
    public void F10_T3_PlaybackTicket_GeneratesValid15MinuteHmacTicket()
    {
        var ticket = VaultEncryptionEngine.GeneratePlaybackTicket(_sessionId, durationMinutes: 15);

        ticket.Ticket.Should().NotBeNullOrWhiteSpace();
        ticket.DurationMinutes.Should().Be(15);
        ticket.ExpiresAtUtc.Should().BeAfter(ticket.IssuedAtUtc);

        bool isValid = VaultEncryptionEngine.ValidatePlaybackTicket(ticket.Ticket, _sessionId);
        isValid.Should().BeTrue();
    }

    [Fact]
    public void F10_T4_PlaybackTicket_RejectsDifferentSessionId()
    {
        var ticket = VaultEncryptionEngine.GeneratePlaybackTicket(_sessionId, durationMinutes: 15);
        var differentSessionId = Guid.NewGuid();

        bool isValid = VaultEncryptionEngine.ValidatePlaybackTicket(ticket.Ticket, differentSessionId);
        isValid.Should().BeFalse();
    }

    [Fact]
    public void F10_T5_Decryption_WithTamperedAuthTag_ThrowsCryptographicException()
    {
        var originalMedia = Encoding.UTF8.GetBytes("AUDIO_SAMPLE_DATA");
        var encrypted = VaultEncryptionEngine.EncryptAndStoreSegment(_sessionId, Guid.NewGuid(), 2, originalMedia);

        // Tamper with authentication tag
        byte[] tamperedTag = (byte[])encrypted.AuthTag.Clone();
        tamperedTag[0] ^= 0xFF;

        var act = () => VaultEncryptionEngine.DecryptSegment(
            encrypted.Ciphertext, encrypted.Iv, tamperedTag, encrypted.EncryptedDek);

        act.Should().Throw<CryptographicException>();
    }

    // =========================================================================
    // Feature 11: Recording Sweeper Sidecar Cleanup
    // =========================================================================

    [Fact]
    public void F11_T1_RetentionSweeper_PurgesBothMediaSegmentsAndKeySidecars()
    {
        var seg1Key = $"recordings/{_sessionId:N}/segments/seg_00000.mp4";
        var seg1KeySidecar = $"{seg1Key}.key";
        var seg2Key = $"recordings/{_sessionId:N}/segments/seg_00001.mp4";
        var seg2KeySidecar = $"{seg2Key}.key";

        var bucket = new HashSet<string> { seg1Key, seg1KeySidecar, seg2Key, seg2KeySidecar };

        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient A",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. B",
            IsLegalHold = false
        };

        var segments = new List<TeleconsultRecordingSegment>
        {
            new() { Id = Guid.NewGuid(), SessionId = _sessionId, StorageKey = seg1Key, SegmentIndex = 0, Sha256Checksum = "sha256-0", IvBase64 = "iv-0", TagBase64 = "tag-0" },
            new() { Id = Guid.NewGuid(), SessionId = _sessionId, StorageKey = seg2Key, SegmentIndex = 1, Sha256Checksum = "sha256-1", IvBase64 = "iv-1", TagBase64 = "tag-1" }
        };

        var result = RecordingSweeperEngine.ExecuteRetentionPurge(session, segments, bucket, retentionDays: 90);

        result.SegmentsPurged.Should().Be(2);
        result.SidecarKeysPurged.Should().Be(2);
        bucket.Should().BeEmpty();
    }

    [Fact]
    public void F11_T2_RetentionSweeper_PurgesManifestAndManifestKeySidecar()
    {
        var manifestKey = $"recordings/{_sessionId:N}/manifest.json";
        var manifestSidecar = $"{manifestKey}.key";
        var bucket = new HashSet<string> { manifestKey, manifestSidecar };

        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient C",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. D",
            ManifestStorageKey = manifestKey,
            IsLegalHold = false
        };

        var result = RecordingSweeperEngine.ExecuteRetentionPurge(session, new List<TeleconsultRecordingSegment>(), bucket, retentionDays: 90);

        result.ManifestPurged.Should().BeTrue();
        result.ManifestSidecarPurged.Should().BeTrue();
        bucket.Should().BeEmpty();
    }

    [Fact]
    public void F11_T3_IndefiniteRetentionDays_ProtectsSessionAndSidecarsFromPurge()
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
            PatientName = "Patient E",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. F",
            IsLegalHold = false
        };

        var segments = new List<TeleconsultRecordingSegment>
        {
            new() { Id = Guid.NewGuid(), SessionId = _sessionId, StorageKey = segKey, SegmentIndex = 0, Sha256Checksum = "sha256-0", IvBase64 = "iv-0", TagBase64 = "tag-0" }
        };

        // retentionDays = 0 indicates indefinite retention
        var result = RecordingSweeperEngine.ExecuteRetentionPurge(session, segments, bucket, retentionDays: 0);

        result.SegmentsPurged.Should().Be(0);
        result.SidecarKeysPurged.Should().Be(0);
        bucket.Should().Contain(segKey);
        bucket.Should().Contain(sidecar);
    }

    [Fact]
    public void F11_T4_ActiveLegalHold_BlocksRetentionPurge()
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
            PatientName = "Patient G",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. H",
            IsLegalHold = true,
            LegalHoldReason = "Active court subpoena regarding consultation"
        };

        var segments = new List<TeleconsultRecordingSegment>
        {
            new() { Id = Guid.NewGuid(), SessionId = _sessionId, StorageKey = segKey, SegmentIndex = 0, Sha256Checksum = "sha256-0", IvBase64 = "iv-0", TagBase64 = "tag-0" }
        };

        var result = RecordingSweeperEngine.ExecuteRetentionPurge(session, segments, bucket, retentionDays: 90);

        result.IsLegalHoldProtected.Should().BeTrue();
        result.SegmentsPurged.Should().Be(0);
        result.SidecarKeysPurged.Should().Be(0);
        bucket.Should().Contain(segKey);
        bucket.Should().Contain(sidecar);
    }

    [Fact]
    public void F11_T5_SuccessfulPurge_SetsSessionStateToPurgedAndRecordsTimestamp()
    {
        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient I",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. J",
            IsLegalHold = false
        };

        var result = RecordingSweeperEngine.ExecuteRetentionPurge(session, new List<TeleconsultRecordingSegment>(), new HashSet<string>(), retentionDays: 90);

        session.RecordingState.Should().Be("Purged");
        session.IsPurged.Should().BeTrue();
        session.PurgedAtUtc.Should().NotBeNull();
        result.PurgedAtUtc.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
    }

    // =========================================================================
    // Feature 12: Consultation Encounter Linkage
    // =========================================================================

    [Fact]
    public void F12_T1_LinkEncounter_BackfillsConsultationIdOnRecordingSession()
    {
        var aptId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient K",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. L",
            ConsultationId = null
        };

        var sessions = new List<TeleconsultRecordingSession> { session };

        var result = EncounterLinkageEngine.LinkEncounter(_consultationId, aptId, sessions);

        result.LinkageSuccessful.Should().BeTrue();
        result.SessionId.Should().Be(_sessionId);
        session.ConsultationId.Should().Be(_consultationId);
    }

    [Fact]
    public void F12_T2_LinkEncounter_WhenNoSessionExistsForAppointment_ReturnsFailureGracefully()
    {
        var aptId = Guid.NewGuid();
        var sessions = new List<TeleconsultRecordingSession>();

        var result = EncounterLinkageEngine.LinkEncounter(_consultationId, aptId, sessions);

        result.LinkageSuccessful.Should().BeFalse();
        result.SessionId.Should().BeNull();
    }

    [Fact]
    public void F12_T3_LinkEncounter_WhenSessionAlreadyHasCompletedRecordings_Succeeds()
    {
        var aptId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient M",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. N",
            RecordingState = "Completed",
            TotalDurationSeconds = 1800,
            SegmentCount = 6
        };

        var sessions = new List<TeleconsultRecordingSession> { session };

        var result = EncounterLinkageEngine.LinkEncounter(_consultationId, aptId, sessions);

        result.LinkageSuccessful.Should().BeTrue();
        session.ConsultationId.Should().Be(_consultationId);
    }

    [Fact]
    public void F12_T4_DuplicateLinkageWithSameConsultationId_IsIdempotent()
    {
        var aptId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient O",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. P",
            ConsultationId = _consultationId
        };

        var sessions = new List<TeleconsultRecordingSession> { session };

        var result = EncounterLinkageEngine.LinkEncounter(_consultationId, aptId, sessions);

        result.LinkageSuccessful.Should().BeTrue();
        session.ConsultationId.Should().Be(_consultationId);
    }

    [Fact]
    public void F12_T5_ConflictingLinkageWithDifferentConsultationId_ThrowsInvalidOperationException()
    {
        var aptId = Guid.NewGuid();
        var existingConsultationId = Guid.NewGuid();
        var newConsultationId = Guid.NewGuid();

        var session = new TeleconsultRecordingSession
        {
            Id = _sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Q",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. R",
            ConsultationId = existingConsultationId
        };

        var sessions = new List<TeleconsultRecordingSession> { session };

        var act = () => EncounterLinkageEngine.LinkEncounter(newConsultationId, aptId, sessions);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage($"*{session.Id} is already linked to consultation {existingConsultationId}*");
    }
}
