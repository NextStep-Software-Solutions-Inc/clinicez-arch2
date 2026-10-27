using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Patient.Infrastructure.Services;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Empirical Adversarial Test Battery for Feature 13 (EXIF Privacy Stripping)
/// and Feature 21 (Encrypted Recording Segment Vault).
/// Executed by challenger_comms_m9_iter3_2.
/// </summary>
public class ChallengerCommsM9VaultAndPrivacyTests
{
    private static async Task EnsureRecordingPolicyAsync(TestCell cell, Guid clinicId, string policy = "WorkspaceVaultOnly")
    {
        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.ClinicSettings.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.ClinicId == clinicId);
            if (settings != null)
            {
                settings.TeleconsultRecordingPolicy = policy;
            }
            else
            {
                db.ClinicSettings.Add(new ClinicSettings
                {
                    Id = Guid.NewGuid(),
                    TenantId = "test-tenant",
                    ClinicId = clinicId,
                    ClinicName = "Test Clinic",
                    TeleconsultRecordingPolicy = policy,
                    TeleconsultRecordingRetentionDays = 90
                });
            }
            await db.SaveChangesAsync();
            return true;
        });
    }

    // =========================================================================
    // FEATURE 13: EXIF PRIVACY STRIPPING & IMAGE SANITIZATION
    // =========================================================================

    [Fact]
    public async Task Feature13_ExifPrivacyStripping_StripsAllExifTagsAndProducesIdenticalHash()
    {
        var service = new ImageConversionService(NullLogger<ImageConversionService>.Instance);

        // 1. Create a genuine JPEG image with sensitive clinical and device EXIF metadata
        using var sourceImage = new Image<Rgba32>(160, 160, Color.DarkSlateBlue);
        var exif = new ExifProfile();
        exif.SetValue(ExifTag.Software, "ClinicEZ Mobile Diagnostic v3.0");
        exif.SetValue(ExifTag.Make, "Samsung");
        exif.SetValue(ExifTag.Model, "Galaxy S24 Ultra");
        exif.SetValue(ExifTag.Artist, "Dr. Maria Clara");
        exif.SetValue(ExifTag.Copyright, "Confidential Clinical Record");
        exif.SetValue(ExifTag.UserComment, "Patient lesion photo with geolocation data");
        exif.SetValue(ExifTag.GPSLatitude, new Rational[] { new(14, 1), new(35, 1), new(45, 1) });
        exif.SetValue(ExifTag.GPSLongitude, new Rational[] { new(120, 1), new(59, 1), new(12, 1) });
        sourceImage.Metadata.ExifProfile = exif;

        using var inMs = new MemoryStream();
        await sourceImage.SaveAsJpegAsync(inMs, new JpegEncoder());
        inMs.Position = 0;

        // 2. Sanitize through ImageConversionService
        var result = await service.ProcessAndSanitizeImageAsync(
            inMs,
            "patient_diagnostic_scan.jpg",
            "image/jpeg",
            CancellationToken.None);

        result.IsClean.Should().BeTrue("sanitization should succeed for valid JPEG");
        result.WasExifStripped.Should().BeTrue("EXIF metadata must be reported as stripped");
        result.ContentType.Should().Be("image/jpeg");
        result.FileName.Should().Be("patient_diagnostic_scan.jpg");
        result.Data.Should().NotBeNullOrEmpty();
        result.FileSizeBytes.Should().Be(result.Data.Length);

        // 3. Cryptographic SHA-256 integrity: hash must strictly match sanitized bytes
        var expectedSha256 = Convert.ToHexString(SHA256.HashData(result.Data)).ToLowerInvariant();
        result.HashSha256.Should().Be(expectedSha256, "returned HashSha256 must match SHA256 of sanitized payload bytes");

        // 4. Adversarial inspection: re-decode sanitized bytes and ensure complete metadata eradication
        using var sanitizedMs = new MemoryStream(result.Data);
        using var sanitizedImage = await Image.LoadAsync(sanitizedMs);
        sanitizedImage.Metadata.ExifProfile.Should().BeNull("ExifProfile must be null in sanitized output");
        sanitizedImage.Metadata.IptcProfile.Should().BeNull("IptcProfile must be null in sanitized output");
        sanitizedImage.Metadata.XmpProfile.Should().BeNull("XmpProfile must be null in sanitized output");
    }

    [Theory]
    [InlineData("malicious_executable.jpg", new byte[] { 0x4D, 0x5A, 0x90, 0x00 }, "executable (MZ)")]
    [InlineData("malicious_elf.jpg", new byte[] { 0x7F, 0x45, 0x4C, 0x46, 0x02 }, "Linux ELF binary")]
    [InlineData("corrupted_header.jpg", new byte[] { 0xFF, 0xD8, 0xFF, 0x00, 0x01, 0x02 }, "Corrupted or invalid JPEG")]
    [InlineData("empty_file.jpg", new byte[0], "Empty file provided")]
    public async Task Feature13_MaliciousPayloads_RejectsExecutableHeadersAndCorruptedBytes(
        string fileName,
        byte[] payload,
        string expectedErrorSubstring)
    {
        var service = new ImageConversionService(NullLogger<ImageConversionService>.Instance);
        using var inMs = new MemoryStream(payload);

        var result = await service.ProcessAndSanitizeImageAsync(
            inMs,
            fileName,
            "image/jpeg",
            CancellationToken.None);

        result.IsClean.Should().BeFalse("dangerous or corrupted payload must be marked unclean");
        result.ErrorReason.Should().NotBeNullOrWhiteSpace();
        result.ErrorReason!.ToLowerInvariant().Should().Contain(expectedErrorSubstring.ToLowerInvariant());
        result.Data.Should().BeEmpty();
    }

    [Fact]
    public async Task Feature13_PdfWithActiveScript_RejectsDangerousPdfTokens()
    {
        var service = new ImageConversionService(NullLogger<ImageConversionService>.Instance);

        var maliciousPdfContent = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert('malicious script executed');) >> >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
        var pdfBytes = Encoding.ASCII.GetBytes(maliciousPdfContent);
        using var inMs = new MemoryStream(pdfBytes);

        var result = await service.ProcessAndSanitizeImageAsync(
            inMs,
            "clinical_summary.pdf",
            "application/pdf",
            CancellationToken.None);

        result.IsClean.Should().BeFalse("PDF with embedded JavaScript must be quarantined");
        result.ErrorReason.Should().Contain("/JavaScript");
    }

    // =========================================================================
    // FEATURE 21: RECORDING VAULT, STORAGE PERSISTENCE & PLAYBACK TICKETS
    // =========================================================================

    [Fact]
    public async Task Feature21_VaultChunkPersistence_AuthenticEncryptedStreamRoundTrip()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-vault-test", "Vault Test Clinic"));
        var storage = cell.Clinic.Provider.GetRequiredService<IClinicStorageService>();

        var sessionId = Guid.NewGuid();
        var samplePlaintext = new byte[81920]; // 80 KB
        RandomNumberGenerator.Fill(samplePlaintext);

        var key = new byte[32];
        var nonce = new byte[12];
        var tag = new byte[16];
        var ciphertext = new byte[samplePlaintext.Length];
        RandomNumberGenerator.Fill(key);
        RandomNumberGenerator.Fill(nonce);

        using (var aesGcm = new AesGcm(key, 16))
        {
            aesGcm.Encrypt(nonce, samplePlaintext, ciphertext, tag);
        }

        ciphertext.Should().NotEqual(samplePlaintext);

        var storageKey = $"vault/recordings/{clinic.Id}/{sessionId}/seg_00000.cez";

        // 1. Write stream to sovereign storage
        using (var cipherStream = new MemoryStream(ciphertext))
        {
            var savedKey = await storage.SaveEncryptedStreamAsync(storageKey, cipherStream);
            savedKey.Should().Be(storageKey);
        }

        // 2. Verify file exists
        var exists = await storage.FileExistsAsync(storageKey);
        exists.Should().BeTrue("storage must report saved chunk exists");

        // 3. Read back stream and verify exact byte equality with ciphertext
        await using (var readStream = await storage.OpenReadEncryptedStreamAsync(storageKey))
        {
            readStream.Should().NotBeNull();
            using var readMs = new MemoryStream();
            await readStream.CopyToAsync(readMs);
            readMs.ToArray().Should().Equal(ciphertext, "read-back stream must strictly match uploaded ciphertext");
        }
    }

    [Fact]
    public async Task Feature21_FacilityPolicy_BlocksUploadWhenRecordingPolicyDisabled()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-vault-pol", "Policy Test Clinic"));
        await EnsureRecordingPolicyAsync(cell, clinic.Id, "Disabled");

        var doctorId = Guid.NewGuid();
        var sessionId = Guid.NewGuid();

        await cell.Clinic.DbAsync(async db =>
        {
            db.TeleconsultRecordingSessions.Add(new TeleconsultRecordingSession
            {
                Id = sessionId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                CallId = Guid.NewGuid(),
                PatientId = Guid.NewGuid(),
                PatientName = "Patient Policy",
                DoctorId = doctorId,
                DoctorName = "Dr. Tester",
                ConsentStatus = "Consented",
                RecordingState = "ReadyToRecord",
                StoragePolicy = "Disabled",
                RetentionPolicyDays = 90,
                ExpiresAtUtc = DateTime.UtcNow.AddDays(90),
                CreatedAt = DateTime.UtcNow
            });

            await db.SaveChangesAsync();
            return true;
        });

        var cmd = new UploadRecordingSegmentCommand(
            SessionId: sessionId,
            SegmentIndex: 0,
            DurationMs: 10000,
            StorageKey: $"vault/recordings/{clinic.Id}/{sessionId}/seg_00000.cez",
            SizeBytes: 81920,
            Sha256Checksum: "abcd00001111222233334444555566667777888899990000aaaabbbbccccdddd",
            IvBase64: Convert.ToBase64String(new byte[12]),
            TagBase64: Convert.ToBase64String(new byte[16]));

        var act = async () => await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, cmd, doctorId);
        await act.Should().ThrowAsync<ForbiddenException>("uploading when facility policy is Disabled must throw ForbiddenException")
            .WithMessage("*RECORDING_POLICY_DISABLED*");
    }

    [Fact]
    public async Task Feature21_SessionTracking_IncrementsCountDurationAndSizeContiguously()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-vault-track", "Tracking Clinic"));
        await EnsureRecordingPolicyAsync(cell, clinic.Id, "WorkspaceVaultOnly");

        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var sessionId = Guid.NewGuid();

        // Seed session
        await cell.Clinic.DbAsync(async db =>
        {
            db.TeleconsultRecordingSessions.Add(new TeleconsultRecordingSession
            {
                Id = sessionId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                CallId = callId,
                PatientId = patientId,
                PatientName = "Juan Dela Cruz",
                DoctorId = doctorId,
                DoctorName = "Dr. Jose Rizal",
                ConsentStatus = "Consented",
                RecordingState = "ReadyToRecord",
                StoragePolicy = "WorkspaceVaultOnly",
                RetentionPolicyDays = 90,
                ExpiresAtUtc = DateTime.UtcNow.AddDays(90),
                SegmentCount = 0,
                TotalSizeBytes = 0,
                TotalDurationSeconds = 0,
                CreatedAt = DateTime.UtcNow
            });

            await db.SaveChangesAsync();
            return true;
        });

        // Upload segment 0 (10 seconds, 80 KB)
        var cmd0 = new UploadRecordingSegmentCommand(
            SessionId: sessionId,
            SegmentIndex: 0,
            DurationMs: 10000,
            StorageKey: $"vault/recordings/{clinic.Id}/{sessionId}/seg_00000.cez",
            SizeBytes: 81920,
            Sha256Checksum: "abcd00001111222233334444555566667777888899990000aaaabbbbccccdddd",
            IvBase64: Convert.ToBase64String(new byte[12]),
            TagBase64: Convert.ToBase64String(new byte[16]));

        var res0 = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, cmd0, doctorId);
        res0.SegmentIndex.Should().Be(0);

        // Upload segment 1 (10 seconds, 80 KB)
        var cmd1 = new UploadRecordingSegmentCommand(
            SessionId: sessionId,
            SegmentIndex: 1,
            DurationMs: 10000,
            StorageKey: $"vault/recordings/{clinic.Id}/{sessionId}/seg_00001.cez",
            SizeBytes: 81920,
            Sha256Checksum: "abcd00001111222233334444555566667777888899990000aaaabbbbcccceeee",
            IvBase64: Convert.ToBase64String(new byte[12]),
            TagBase64: Convert.ToBase64String(new byte[16]));

        var res1 = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, cmd1, doctorId);
        res1.SegmentIndex.Should().Be(1);

        // Verify session aggregates in DB
        await cell.Clinic.DbAsync(async db =>
        {
            var session = await db.TeleconsultRecordingSessions.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.Id == sessionId);
            session.Should().NotBeNull();
            session!.SegmentCount.Should().Be(2, "two segments uploaded");
            session.TotalDurationSeconds.Should().Be(20, "2 segments * 10 seconds = 20s");
            session.TotalSizeBytes.Should().Be(163840, "2 * 81920 bytes");
            session.RecordingState.Should().Be("Recording", "state transitions to Recording on first segment");

            var segments = await db.TeleconsultRecordingSegments.IgnoreQueryFilters()
                .Where(s => s.SessionId == sessionId)
                .OrderBy(s => s.SegmentIndex)
                .ToListAsync();

            segments.Should().HaveCount(2);
            segments[0].SegmentIndex.Should().Be(0);
            segments[1].SegmentIndex.Should().Be(1);

            return true;
        });
    }

    [Fact]
    public async Task Feature21_DuplicateSegment_ThrowsConflictException()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-vault-dup", "Dup Test Clinic"));
        await EnsureRecordingPolicyAsync(cell, clinic.Id, "WorkspaceVaultOnly");

        var doctorId = Guid.NewGuid();
        var sessionId = Guid.NewGuid();

        await cell.Clinic.DbAsync(async db =>
        {
            db.TeleconsultRecordingSessions.Add(new TeleconsultRecordingSession
            {
                Id = sessionId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                CallId = Guid.NewGuid(),
                PatientId = Guid.NewGuid(),
                PatientName = "Patient Dup",
                DoctorId = doctorId,
                DoctorName = "Dr. Tester",
                ConsentStatus = "Consented",
                RecordingState = "ReadyToRecord",
                StoragePolicy = "WorkspaceVaultOnly",
                RetentionPolicyDays = 90,
                ExpiresAtUtc = DateTime.UtcNow.AddDays(90),
                SegmentCount = 0,
                TotalSizeBytes = 0,
                TotalDurationSeconds = 0,
                CreatedAt = DateTime.UtcNow
            });

            await db.SaveChangesAsync();
            return true;
        });

        var cmd = new UploadRecordingSegmentCommand(
            SessionId: sessionId,
            SegmentIndex: 0,
            DurationMs: 10000,
            StorageKey: $"vault/recordings/{clinic.Id}/{sessionId}/seg_00000.cez",
            SizeBytes: 81920,
            Sha256Checksum: "1111222233334444555566667777888899990000aaaabbbbccccdddd11112222",
            IvBase64: Convert.ToBase64String(new byte[12]),
            TagBase64: Convert.ToBase64String(new byte[16]));

        // First upload succeeds
        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, cmd, doctorId);

        // Second upload of identical segment index must throw ConflictException
        var act = async () => await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, cmd, doctorId);
        await act.Should().ThrowAsync<ConflictException>("duplicate segment index must be rejected with ConflictException");
    }

    [Fact]
    public async Task Feature21_ConsentGuard_BlocksUploadWhenConsentRejectedOrPending()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-vault-consent", "Consent Test Clinic"));
        await EnsureRecordingPolicyAsync(cell, clinic.Id, "WorkspaceVaultOnly");

        var doctorId = Guid.NewGuid();
        var rejectedSessionId = Guid.NewGuid();
        var pendingSessionId = Guid.NewGuid();

        await cell.Clinic.DbAsync(async db =>
        {
            db.TeleconsultRecordingSessions.Add(new TeleconsultRecordingSession
            {
                Id = rejectedSessionId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                CallId = Guid.NewGuid(),
                PatientId = Guid.NewGuid(),
                PatientName = "Patient Declined",
                DoctorId = doctorId,
                DoctorName = "Dr. Tester",
                ConsentStatus = "Rejected",
                RecordingState = "Blocked",
                StoragePolicy = "WorkspaceVaultOnly",
                RetentionPolicyDays = 90,
                ExpiresAtUtc = DateTime.UtcNow.AddDays(90),
                CreatedAt = DateTime.UtcNow
            });

            db.TeleconsultRecordingSessions.Add(new TeleconsultRecordingSession
            {
                Id = pendingSessionId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                CallId = Guid.NewGuid(),
                PatientId = Guid.NewGuid(),
                PatientName = "Patient Pending",
                DoctorId = doctorId,
                DoctorName = "Dr. Tester",
                ConsentStatus = "PendingConsent",
                RecordingState = "PendingConsent",
                StoragePolicy = "WorkspaceVaultOnly",
                RetentionPolicyDays = 90,
                ExpiresAtUtc = DateTime.UtcNow.AddDays(90),
                CreatedAt = DateTime.UtcNow
            });

            await db.SaveChangesAsync();
            return true;
        });

        var uploadRejected = new UploadRecordingSegmentCommand(
            SessionId: rejectedSessionId,
            SegmentIndex: 0,
            DurationMs: 10000,
            StorageKey: $"vault/recordings/{clinic.Id}/{rejectedSessionId}/seg_00000.cez",
            SizeBytes: 81920,
            Sha256Checksum: "222233334444555566667777888899990000aaaabbbbccccdddd111122223333",
            IvBase64: Convert.ToBase64String(new byte[12]),
            TagBase64: Convert.ToBase64String(new byte[16]));

        var actRejected = async () => await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, uploadRejected, doctorId);
        await actRejected.Should().ThrowAsync<ForbiddenException>("uploading to rejected consent session must be forbidden");

        var uploadPending = new UploadRecordingSegmentCommand(
            SessionId: pendingSessionId,
            SegmentIndex: 0,
            DurationMs: 10000,
            StorageKey: $"vault/recordings/{clinic.Id}/{pendingSessionId}/seg_00000.cez",
            SizeBytes: 81920,
            Sha256Checksum: "33334444555566667777888899990000aaaabbbbccccdddd1111222233334444",
            IvBase64: Convert.ToBase64String(new byte[12]),
            TagBase64: Convert.ToBase64String(new byte[16]));

        var actPending = async () => await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, uploadPending, doctorId);
        await actPending.Should().ThrowAsync<ForbiddenException>("uploading to pending consent session must be forbidden");
    }

    [Fact]
    public async Task Feature21_PlaybackTicket_AuthenticHmacSignatureExpiryAndTamperResistance()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-vault-ticket", "Ticket Test Clinic"));
        await EnsureRecordingPolicyAsync(cell, clinic.Id, "WorkspaceVaultOnly");

        var doctorId = Guid.NewGuid();
        var sessionId = Guid.NewGuid();

        await cell.Clinic.DbAsync(async db =>
        {
            db.TeleconsultRecordingSessions.Add(new TeleconsultRecordingSession
            {
                Id = sessionId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                CallId = Guid.NewGuid(),
                PatientId = Guid.NewGuid(),
                PatientName = "Patient Ticket",
                DoctorId = doctorId,
                DoctorName = "Dr. Tester",
                ConsentStatus = "Consented",
                RecordingState = "ReadyToRecord",
                StoragePolicy = "WorkspaceVaultOnly",
                RetentionPolicyDays = 90,
                ExpiresAtUtc = DateTime.UtcNow.AddDays(90),
                CreatedAt = DateTime.UtcNow
            });

            await db.SaveChangesAsync();
            return true;
        });

        // 1. Issue Playback Ticket
        var ticketCmd = new CreatePlaybackTicketCommand(sessionId);
        var ticketDto = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, ticketCmd, doctorId);

        ticketDto.Should().NotBeNull();
        ticketDto.Ticket.Should().NotBeNullOrWhiteSpace();
        ticketDto.ExpiresAtUtc.Should().BeAfter(DateTime.UtcNow.AddMinutes(14));
        ticketDto.ExpiresAtUtc.Should().BeBefore(DateTime.UtcNow.AddMinutes(16));

        // 2. Cryptographic signature verification: Parse ticket and verify HMAC-SHA256 signature
        var ticketParts = ticketDto.Ticket.Split('.');
        ticketParts.Length.Should().Be(2, "ticket must be in format <payload>.<signature>");
        var payload = ticketParts[0];
        var signature = ticketParts[1];

        var payloadParts = payload.Split(':');
        payloadParts.Length.Should().Be(4, "payload must contain session:clinic:ticks:staff");
        payloadParts[0].Should().Be(sessionId.ToString("N"));
        payloadParts[1].Should().Be(clinic.Id.ToString("N"));
        payloadParts[3].Should().Be(doctorId.ToString());

        var signingKey = "playback-signing-secret-cmk-2026-very-secure-key";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signingKey));
        var expectedSig = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');

        signature.Should().Be(expectedSig, "ticket signature must match authentic HMAC-SHA256 calculation");

        // 3. Tamper Resistance: Tampering with session ID or staff ID produces signature mismatch
        var tamperedPayload = $"{Guid.NewGuid():N}:{clinic.Id:N}:{payloadParts[2]}:{doctorId}";
        var tamperedExpectedSig = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(tamperedPayload)))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
        tamperedExpectedSig.Should().NotBe(signature, "tampered payload must not match original signature");

        // 4. WORM Audit Trail: verify audit record was written
        await cell.Clinic.DbAsync(async db =>
        {
            var audit = await db.ClinicAuditEntries.IgnoreQueryFilters()
                .FirstOrDefaultAsync(a => a.TargetEntityId == sessionId.ToString() && a.Action == "teleconsult.recording.playback.ticket_issued");
            audit.Should().NotBeNull("issuing a playback ticket must write a clinical WORM audit entry");
            audit!.ActorStaffId.Should().Be(doctorId);
            audit.Outcome.Should().Be(ClinicAuditOutcomes.Success);
            return true;
        });
    }

    [Fact]
    public async Task Feature21_PurgedSession_BlocksUploadAndTicketGeneration()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-vault-purge", "Purge Test Clinic"));
        await EnsureRecordingPolicyAsync(cell, clinic.Id, "WorkspaceVaultOnly");

        var doctorId = Guid.NewGuid();
        var purgedSessionId = Guid.NewGuid();

        await cell.Clinic.DbAsync(async db =>
        {
            db.TeleconsultRecordingSessions.Add(new TeleconsultRecordingSession
            {
                Id = purgedSessionId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                CallId = Guid.NewGuid(),
                PatientId = Guid.NewGuid(),
                PatientName = "Patient Purged",
                DoctorId = doctorId,
                DoctorName = "Dr. Tester",
                ConsentStatus = "Consented",
                RecordingState = "Purged",
                IsPurged = true,
                StoragePolicy = "WorkspaceVaultOnly",
                RetentionPolicyDays = 90,
                ExpiresAtUtc = DateTime.UtcNow.AddDays(-1),
                CreatedAt = DateTime.UtcNow.AddDays(-91)
            });

            await db.SaveChangesAsync();
            return true;
        });

        // 1. Upload to purged session must be blocked
        var uploadCmd = new UploadRecordingSegmentCommand(
            SessionId: purgedSessionId,
            SegmentIndex: 0,
            DurationMs: 10000,
            StorageKey: $"vault/recordings/{clinic.Id}/{purgedSessionId}/seg_00000.cez",
            SizeBytes: 81920,
            Sha256Checksum: "4444555566667777888899990000aaaabbbbccccdddd11112222333344445555",
            IvBase64: Convert.ToBase64String(new byte[12]),
            TagBase64: Convert.ToBase64String(new byte[16]));

        var actUpload = async () => await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, uploadCmd, doctorId);
        await actUpload.Should().ThrowAsync<ForbiddenException>("uploading to purged session must be forbidden");

        // 2. Playback ticket on purged session must be blocked
        var ticketCmd = new CreatePlaybackTicketCommand(purgedSessionId);
        var actTicket = async () => await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, ticketCmd, doctorId);
        await actTicket.Should().ThrowAsync<ForbiddenException>("issuing ticket for purged session must be forbidden");
    }
}
