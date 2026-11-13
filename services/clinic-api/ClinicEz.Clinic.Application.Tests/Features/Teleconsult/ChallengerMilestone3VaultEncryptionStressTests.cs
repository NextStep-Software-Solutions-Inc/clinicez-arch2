using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Clinic.Infrastructure.Services.Storage;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Teleconsult;

/// <summary>
/// Adversarial stress tests by Challenger M3-2 for Milestone 3 (Media Signaling & Vault Recording Encryption).
/// Covers:
/// 1. AES-256-GCM Envelope Encryption & Sidecar Generation
/// 2. Tampered DEK Sidecar & Ciphertext Corruption
/// 3. 15-Minute Playback Ticket Boundary & HMAC Signature Attack
/// 4. HTTP 206 Partial Content & Range Processing
/// 5. Retention Sweeper Sidecar Purge & Immunity
/// </summary>
public sealed class ChallengerMilestone3VaultEncryptionStressTests
{
    private const string MasterSecret = "sovereign-vault-cmk-master-secret-at-least-32-bytes-long!";
    private const string PlaybackSigningKey = "playback-hmac-sha256-signing-secret-key-2026-very-secure!";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-challenger-m3";
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;
    private readonly IConfiguration _configuration;
    private readonly ClinicEncryptionService _realEncryptionService;

    public ChallengerMilestone3VaultEncryptionStressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
        _clinicContext.StaffName.Returns("Dr. Challenger M3");
        _clinicContext.StaffRole.Returns("Doctor");
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsRead).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.TeleconsultRecord).Returns(true);

        var configValues = new Dictionary<string, string?>
        {
            [ClinicEncryptionKeyRing.MasterSecretKey] = MasterSecret,
            ["RecordingPlayback:SigningKey"] = PlaybackSigningKey
        };
        _configuration = new ConfigurationBuilder().AddInMemoryCollection(configValues).Build();

        var keyRing = ClinicEncryptionKeyRing.FromConfiguration(_configuration);
        _realEncryptionService = new ClinicEncryptionService(keyRing);
    }

    #region Test Double Storage

    private sealed class InMemoryClinicStorage : IClinicStorageService
    {
        public readonly ConcurrentDictionary<string, byte[]> Files = new();
        public readonly ConcurrentBag<string> DeletedKeys = new();
        public Func<string, bool>? FailOnDelete;

        public Task<string> SaveEncryptedFileAsync(string storageKey, byte[] ciphertext, CancellationToken cancellationToken = default)
        {
            Files[storageKey] = ciphertext;
            return Task.FromResult(storageKey);
        }

        public async Task<string> SaveEncryptedStreamAsync(string storageKey, Stream ciphertextStream, CancellationToken cancellationToken = default)
        {
            using var ms = new MemoryStream();
            await ciphertextStream.CopyToAsync(ms, cancellationToken);
            Files[storageKey] = ms.ToArray();
            return storageKey;
        }

        public Task<byte[]> ReadEncryptedFileAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            if (!Files.TryGetValue(storageKey, out var bytes))
            {
                throw new FileNotFoundException($"File not found in memory storage: {storageKey}");
            }
            return Task.FromResult(bytes);
        }

        public Task<Stream> OpenReadEncryptedStreamAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            if (!Files.TryGetValue(storageKey, out var bytes))
            {
                throw new FileNotFoundException($"File not found in memory storage: {storageKey}");
            }
            return Task.FromResult<Stream>(new MemoryStream(bytes));
        }

        public Task DeleteEncryptedFileAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            if (FailOnDelete?.Invoke(storageKey) == true)
            {
                throw new IOException($"Simulated storage failure when deleting {storageKey}");
            }

            DeletedKeys.Add(storageKey);
            Files.TryRemove(storageKey, out _);
            return Task.CompletedTask;
        }

        public Task<bool> FileExistsAsync(string storageKey, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(Files.ContainsKey(storageKey));
        }
    }

    private sealed class TestWrappedKeyModel
    {
        public string Alg { get; set; } = string.Empty;
        public string? Kid { get; set; }
        public string Iv { get; set; } = string.Empty;
        public string Tag { get; set; } = string.Empty;
        public string CipherText { get; set; } = string.Empty;
    }

    private static string GenerateTicket(Guid sessionId, Guid clinicId, Guid staffId, DateTime expiresAtUtc, string signingKey)
    {
        var payload = $"{sessionId:N}:{clinicId:N}:{expiresAtUtc.Ticks}:{staffId}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(signingKey));
        var signature = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
        return $"{payload}.{signature}";
    }

    #endregion

    // =========================================================================
    // 1. AES-256-GCM Envelope Encryption & Sidecar Generation
    // =========================================================================

    [Fact]
    public async Task UploadSegment_RawWebmChunk_CreatesEncryptedCiphertextAndValidSidecar_DecryptionRestoresExactBytes()
    {
        // Arrange: Prepare real storage and real encryption service
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var rawPlaintext = Encoding.UTF8.GetBytes("GCM_ENVELOPE_RAW_WEBM_CHUNK_WITH_CLINICAL_VIDEO_STREAM_DATA_1234567890");

        UploadRecordingSegmentCommand capturedCommand = null!;
        sender.Send(Arg.Do<UploadRecordingSegmentCommand>(c => capturedCommand = c), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                var cmd = ci.Arg<UploadRecordingSegmentCommand>();
                return new RecordingSegmentDto(
                    Id: Guid.NewGuid(),
                    SessionId: cmd.SessionId,
                    SegmentIndex: cmd.SegmentIndex,
                    DurationMs: cmd.DurationMs,
                    StorageKey: cmd.StorageKey,
                    SizeBytes: cmd.SizeBytes,
                    Sha256Checksum: cmd.Sha256Checksum,
                    ReceivedAtUtc: DateTime.UtcNow
                );
            });

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers["X-Segment-Index"] = "0";
        httpContext.Request.Headers["X-Segment-Duration-Ms"] = "10000";
        httpContext.Request.Body = new MemoryStream(rawPlaintext);
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        // Act: Upload segment chunk with missing client encryption headers
        var actionResult = await controller.UploadSegment(sessionId, CancellationToken.None);

        // Assert
        var okResult = actionResult.Result.Should().BeOfType<OkObjectResult>().Subject;
        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<RecordingSegmentDto>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();

        var expectedStorageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var expectedSidecarKey = $"{expectedStorageKey}.key";

        // 1. Verify ciphertext file exists and is encrypted (cannot be read as plaintext)
        storage.Files.Should().ContainKey(expectedStorageKey);
        var ciphertextBytes = storage.Files[expectedStorageKey];
        ciphertextBytes.Should().NotEqual(rawPlaintext);
        ciphertextBytes.Length.Should().Be(rawPlaintext.Length); // AES-GCM preserves payload length

        // 2. Verify wrapped DEK sidecar exists and is valid JSON
        storage.Files.Should().ContainKey(expectedSidecarKey);
        var sidecarBytes = storage.Files[expectedSidecarKey];
        var sidecarJson = Encoding.UTF8.GetString(sidecarBytes);

        var wrappedModel = JsonSerializer.Deserialize<TestWrappedKeyModel>(sidecarJson);
        wrappedModel.Should().NotBeNull();
        wrappedModel!.Alg.Should().Be("AES-256-GCM");
        wrappedModel.Kid.Should().NotBeNullOrWhiteSpace();
        wrappedModel.Iv.Should().NotBeNullOrWhiteSpace();
        wrappedModel.Tag.Should().NotBeNullOrWhiteSpace();
        wrappedModel.CipherText.Should().NotBeNullOrWhiteSpace();

        // 3. Empirically verify round-trip decryption using the real ClinicEncryptionService
        capturedCommand.Should().NotBeNull();
        await sender.Received(1).Send(Arg.Any<UploadRecordingSegmentCommand>(), Arg.Any<CancellationToken>());

        var decryptedBytes = await _realEncryptionService.DecryptAsync(
            ciphertextBytes,
            capturedCommand.IvBase64,
            capturedCommand.TagBase64,
            sidecarJson,
            _tenantId,
            _clinicId,
            CancellationToken.None);

        decryptedBytes.Should().Equal(rawPlaintext);
    }

    [Fact]
    public async Task UploadSegment_WithClientEncryptionHeaders_PreservesCiphertextWithoutSidecarGeneration()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var clientPreEncryptedBytes = Encoding.UTF8.GetBytes("PRE_ENCRYPTED_CLIENT_CIPHERTEXT");

        sender.Send(Arg.Any<UploadRecordingSegmentCommand>(), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                var cmd = ci.Arg<UploadRecordingSegmentCommand>();
                return new RecordingSegmentDto(
                    Id: Guid.NewGuid(),
                    SessionId: cmd.SessionId,
                    SegmentIndex: cmd.SegmentIndex,
                    DurationMs: cmd.DurationMs,
                    StorageKey: cmd.StorageKey,
                    SizeBytes: cmd.SizeBytes,
                    Sha256Checksum: cmd.Sha256Checksum,
                    ReceivedAtUtc: DateTime.UtcNow
                );
            });

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers["X-Segment-Index"] = "1";
        httpContext.Request.Headers["X-Segment-Duration-Ms"] = "10000";
        httpContext.Request.Headers["X-Encryption-Iv"] = Convert.ToBase64String(new byte[12]);
        httpContext.Request.Headers["X-Encryption-Tag"] = Convert.ToBase64String(new byte[16]);
        httpContext.Request.Body = new MemoryStream(clientPreEncryptedBytes);
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        // Act
        var result = await controller.UploadSegment(sessionId, CancellationToken.None);

        // Assert
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<RecordingSegmentDto>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();

        var expectedStorageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00001.cez";
        var expectedSidecarKey = $"{expectedStorageKey}.key";

        // Segment file was saved directly
        storage.Files.Should().ContainKey(expectedStorageKey);
        storage.Files[expectedStorageKey].Should().Equal(clientPreEncryptedBytes);

        // .key sidecar was NOT created for client pre-encrypted chunk
        storage.Files.Should().NotContainKey(expectedSidecarKey);
    }

    [Fact]
    public async Task UploadSegment_MultiMegabyteChunk_StressTestsMemoryAndEnvelopeEncryption()
    {
        // Arrange: Generate 1.5 MB pseudo-random video buffer
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var largePayload = new byte[1500 * 1024];
        RandomNumberGenerator.Fill(largePayload);

        UploadRecordingSegmentCommand capturedCmd = null!;
        sender.Send(Arg.Do<UploadRecordingSegmentCommand>(c => capturedCmd = c), Arg.Any<CancellationToken>())
            .Returns(ci =>
            {
                var cmd = ci.Arg<UploadRecordingSegmentCommand>();
                return new RecordingSegmentDto(
                    Id: Guid.NewGuid(),
                    SessionId: cmd.SessionId,
                    SegmentIndex: cmd.SegmentIndex,
                    DurationMs: cmd.DurationMs,
                    StorageKey: cmd.StorageKey,
                    SizeBytes: cmd.SizeBytes,
                    Sha256Checksum: cmd.Sha256Checksum,
                    ReceivedAtUtc: DateTime.UtcNow
                );
            });

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers["X-Segment-Index"] = "42";
        httpContext.Request.Headers["X-Segment-Duration-Ms"] = "10000";
        httpContext.Request.Body = new MemoryStream(largePayload);
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        // Act
        var actionResult = await controller.UploadSegment(sessionId, CancellationToken.None);

        // Assert
        var okResult = actionResult.Result.Should().BeOfType<OkObjectResult>().Subject;
        okResult.Value.Should().NotBeNull();

        var storageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00042.cez";
        var sidecarKey = $"{storageKey}.key";

        storage.Files.Should().ContainKey(storageKey);
        storage.Files.Should().ContainKey(sidecarKey);
        var ciphertext = storage.Files[storageKey];
        var sidecarJson = Encoding.UTF8.GetString(storage.Files[sidecarKey]);

        // Decrypt 1.5 MB chunk and assert perfect integrity
        var decrypted = await _realEncryptionService.DecryptAsync(
            ciphertext,
            capturedCmd.IvBase64,
            capturedCmd.TagBase64,
            sidecarJson,
            _tenantId,
            _clinicId,
            CancellationToken.None);

        decrypted.Should().Equal(largePayload);
    }

    [Theory]
    [InlineData(null, "10000")]
    [InlineData("not-an-int", "10000")]
    [InlineData("0", null)]
    [InlineData("0", "not-an-int")]
    public async Task UploadSegment_MissingOrInvalidHeaders_RejectsWithBadRequest(string? segmentIndexHeader, string? durationHeader)
    {
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var httpContext = new DefaultHttpContext();
        if (segmentIndexHeader != null) httpContext.Request.Headers["X-Segment-Index"] = segmentIndexHeader;
        if (durationHeader != null) httpContext.Request.Headers["X-Segment-Duration-Ms"] = durationHeader;
        httpContext.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes("CHUNK_DATA"));
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        var result = await controller.UploadSegment(Guid.NewGuid(), CancellationToken.None);

        var badRequestResult = result.Result.Should().BeOfType<BadRequestObjectResult>().Subject;
        badRequestResult.StatusCode.Should().Be(400);
    }

    // =========================================================================
    // 2. Tampered DEK Sidecar & Ciphertext Corruption
    // =========================================================================

    [Fact]
    public async Task StreamRecording_CorruptedSidecarJson_ThrowsExceptionAndNeverReturnsPlaintext()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var plainBytes = Encoding.UTF8.GetBytes("CONFIDENTIAL_PATIENT_TELECONSULT_AUDIO_AND_VIDEO");

        var encrypted = await _realEncryptionService.EncryptAsync(plainBytes, _tenantId, _clinicId, CancellationToken.None);

        var storageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var sidecarKey = $"{storageKey}.key";

        storage.Files[storageKey] = encrypted.Ciphertext;
        // Corrupt sidecar with invalid JSON
        storage.Files[sidecarKey] = Encoding.UTF8.GetBytes("{\"Alg\":\"AES-256-GCM\",\"Kid\":\"broken_json");

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = callId,
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            ContainerFormat = "video/webm",
            RecordingState = "Completed"
        };
        db.TeleconsultRecordingSessions.Add(session);

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 0,
            StorageKey = storageKey,
            Sha256Checksum = encrypted.EncryptedHash,
            IvBase64 = encrypted.IvBase64,
            TagBase64 = encrypted.TagBase64
        };
        db.TeleconsultRecordingSegments.Add(segment);
        await db.SaveChangesAsync();

        var ticket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(10), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act & Assert: Unwrapping must fail due to corrupted JSON and never return unauthenticated stream
        var act = () => controller.StreamRecording(sessionId, ticket, segmentIndex: 0, CancellationToken.None);
        await act.Should().ThrowAsync<Exception>(); // JsonException or CryptographicException
    }

    [Fact]
    public async Task StreamRecording_TamperedWrapTagInSidecar_ThrowsCryptographicExceptionOnDekUnwrap()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var plainBytes = Encoding.UTF8.GetBytes("CONFIDENTIAL_PATIENT_TELECONSULT_AUDIO_AND_VIDEO");

        var encrypted = await _realEncryptionService.EncryptAsync(plainBytes, _tenantId, _clinicId, CancellationToken.None);

        var storageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var sidecarKey = $"{storageKey}.key";

        storage.Files[storageKey] = encrypted.Ciphertext;

        // Tamper with wrapped DEK tag inside sidecar
        var model = JsonSerializer.Deserialize<TestWrappedKeyModel>(encrypted.WrappedKeyJson)!;
        var tagBytes = Convert.FromBase64String(model.Tag);
        tagBytes[0] ^= 0xFF; // Flip bits in wrap tag
        model.Tag = Convert.ToBase64String(tagBytes);
        storage.Files[sidecarKey] = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(model));

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            ContainerFormat = "video/webm",
            RecordingState = "Completed"
        };
        db.TeleconsultRecordingSessions.Add(session);

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 0,
            StorageKey = storageKey,
            Sha256Checksum = encrypted.EncryptedHash,
            IvBase64 = encrypted.IvBase64,
            TagBase64 = encrypted.TagBase64
        };
        db.TeleconsultRecordingSegments.Add(segment);
        await db.SaveChangesAsync();

        var ticket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(10), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act & Assert: DEK unwrap must fail AES-GCM authentication
        var act = () => controller.StreamRecording(sessionId, ticket, segmentIndex: 0, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>()
            .WithMessage("*Failed to decrypt DEK*");
    }

    [Fact]
    public async Task StreamRecording_TamperedSegmentTagInDb_ThrowsCryptographicException()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var plainBytes = Encoding.UTF8.GetBytes("SOVEREIGN_RECORDING_PAYLOAD");

        var encrypted = await _realEncryptionService.EncryptAsync(plainBytes, _tenantId, _clinicId, CancellationToken.None);

        var storageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var sidecarKey = $"{storageKey}.key";

        storage.Files[storageKey] = encrypted.Ciphertext;
        storage.Files[sidecarKey] = Encoding.UTF8.GetBytes(encrypted.WrappedKeyJson);

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            ContainerFormat = "video/webm",
            RecordingState = "Completed"
        };
        db.TeleconsultRecordingSessions.Add(session);

        // Tamper with segment's TagBase64 in database
        var tamperedTag = Convert.FromBase64String(encrypted.TagBase64);
        tamperedTag[tamperedTag.Length - 1] ^= 0xAA;

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 0,
            StorageKey = storageKey,
            Sha256Checksum = encrypted.EncryptedHash,
            IvBase64 = encrypted.IvBase64,
            TagBase64 = Convert.ToBase64String(tamperedTag) // Tampered!
        };
        db.TeleconsultRecordingSegments.Add(segment);
        await db.SaveChangesAsync();

        var ticket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(10), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act & Assert
        var act = () => controller.StreamRecording(sessionId, ticket, segmentIndex: 0, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task StreamRecording_CorruptedCiphertextBytesInStorage_ThrowsCryptographicException()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var plainBytes = Encoding.UTF8.GetBytes("SOVEREIGN_RECORDING_PAYLOAD");

        var encrypted = await _realEncryptionService.EncryptAsync(plainBytes, _tenantId, _clinicId, CancellationToken.None);

        var storageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var sidecarKey = $"{storageKey}.key";

        // Corrupt a byte in the stored ciphertext
        var corruptedCiphertext = (byte[])encrypted.Ciphertext.Clone();
        corruptedCiphertext[corruptedCiphertext.Length / 2] ^= 0x01;

        storage.Files[storageKey] = corruptedCiphertext;
        storage.Files[sidecarKey] = Encoding.UTF8.GetBytes(encrypted.WrappedKeyJson);

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            ContainerFormat = "video/webm",
            RecordingState = "Completed"
        };
        db.TeleconsultRecordingSessions.Add(session);

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 0,
            StorageKey = storageKey,
            Sha256Checksum = encrypted.EncryptedHash,
            IvBase64 = encrypted.IvBase64,
            TagBase64 = encrypted.TagBase64
        };
        db.TeleconsultRecordingSegments.Add(segment);
        await db.SaveChangesAsync();

        var ticket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(10), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act & Assert: AES-256-GCM authentication must fail when ciphertext is modified
        var act = () => controller.StreamRecording(sessionId, ticket, segmentIndex: 0, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task StreamRecording_MissingSidecar_FallsBackToRawStreamingGracefully()
    {
        // Arrange: Legacy or client-encrypted chunk has no .key sidecar
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var rawStoredBytes = Encoding.UTF8.GetBytes("LEGACY_CLIENT_ENCRYPTED_STREAM_BYTES");
        var storageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";

        storage.Files[storageKey] = rawStoredBytes;
        // Notice: NO .key sidecar in storage!

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            ContainerFormat = "video/webm",
            RecordingState = "Completed"
        };
        db.TeleconsultRecordingSessions.Add(session);

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 0,
            StorageKey = storageKey,
            Sha256Checksum = "hash123",
            IvBase64 = "iv123",
            TagBase64 = "tag123"
        };
        db.TeleconsultRecordingSegments.Add(segment);
        await db.SaveChangesAsync();

        var ticket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(10), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act: Stream recording
        var actionResult = await controller.StreamRecording(sessionId, ticket, segmentIndex: 0, CancellationToken.None);

        // Assert: Successfully falls back to raw stream without exception
        var fileResult = actionResult.Should().BeOfType<FileStreamResult>().Subject;
        fileResult.EnableRangeProcessing.Should().BeTrue();

        using var ms = new MemoryStream();
        await fileResult.FileStream.CopyToAsync(ms);
        ms.ToArray().Should().Equal(rawStoredBytes);
    }

    [Fact]
    public async Task CrossTenantOrCrossClinic_KeyTampering_FailsDekUnwrapWithCryptographicException()
    {
        // Arrange: Encrypted under Tenant A / Clinic A
        var plainBytes = Encoding.UTF8.GetBytes("CROSS_TENANT_SECURE_PAYLOAD");
        var encrypted = await _realEncryptionService.EncryptAsync(plainBytes, "tenant-a", Guid.NewGuid(), CancellationToken.None);

        // Act & Assert 1: Attempt to unwrap using Tenant B
        var actTenantB = () => _realEncryptionService.DecryptAsync(
            encrypted.Ciphertext,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            "tenant-b", // Wrong tenant!
            _clinicId,
            CancellationToken.None);

        await actTenantB.Should().ThrowAsync<CryptographicException>()
            .WithMessage("*Failed to decrypt DEK*");

        // Act & Assert 2: Attempt to unwrap using different Clinic Id
        var actDifferentClinic = () => _realEncryptionService.DecryptAsync(
            encrypted.Ciphertext,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            "tenant-a",
            Guid.NewGuid(), // Wrong clinic!
            CancellationToken.None);

        await actDifferentClinic.Should().ThrowAsync<CryptographicException>()
            .WithMessage("*Failed to decrypt DEK*");
    }

    // =========================================================================
    // 3. 15-Minute Playback Ticket Boundary & HMAC Signature Attack
    // =========================================================================

    [Fact]
    public async Task StreamRecording_PlaybackTicket_AtTPlus14m59s_Succeeds()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var storageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        storage.Files[storageKey] = Encoding.UTF8.GetBytes("RAW_STREAM_DATA");

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            ContainerFormat = "video/webm",
            RecordingState = "Completed"
        };
        db.TeleconsultRecordingSessions.Add(session);

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 0,
            StorageKey = storageKey,
            Sha256Checksum = "hash123",
            IvBase64 = "iv123",
            TagBase64 = "tag123"
        };
        db.TeleconsultRecordingSegments.Add(segment);
        await db.SaveChangesAsync();

        // Ticket at T+14m59s (just before 15m expiration)
        var ticket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(14).AddSeconds(59), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act
        var result = await controller.StreamRecording(sessionId, ticket, segmentIndex: 0, CancellationToken.None);

        // Assert
        result.Should().BeOfType<FileStreamResult>();
    }

    [Fact]
    public async Task StreamRecording_PlaybackTicket_AtTPlus15m01s_RejectsWithUnauthorized()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();
        var sessionId = Guid.NewGuid();

        // Expired ticket (expires 1 second in the past)
        var ticket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddSeconds(-1), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act
        var result = await controller.StreamRecording(sessionId, ticket, segmentIndex: 0, CancellationToken.None);

        // Assert
        var unauthorizedResult = result.Should().BeOfType<UnauthorizedObjectResult>().Subject;
        unauthorizedResult.Value.Should().Be("Playback ticket has expired.");
    }

    [Fact]
    public async Task StreamRecording_ForgedHmacSignature_RejectsWithUnauthorized()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();
        var sessionId = Guid.NewGuid();

        // Valid payload, but forged HMAC signature
        var payload = $"{sessionId:N}:{_clinicId:N}:{DateTime.UtcNow.AddMinutes(10).Ticks}:{_staffId}";
        var forgedTicket = $"{payload}.forged_tampered_signature_string";

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act
        var result = await controller.StreamRecording(sessionId, forgedTicket, segmentIndex: 0, CancellationToken.None);

        // Assert
        var unauthorizedResult = result.Should().BeOfType<UnauthorizedObjectResult>().Subject;
        unauthorizedResult.Value.Should().Be("Playback ticket signature verification failed.");
    }

    [Fact]
    public async Task StreamRecording_SignatureSignedWithWrongSecretKey_RejectsWithUnauthorized()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();
        var sessionId = Guid.NewGuid();

        // Ticket signed with an attacker's key
        var ticket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(10), "attacker-unauthorized-key-12345");

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act
        var result = await controller.StreamRecording(sessionId, ticket, segmentIndex: 0, CancellationToken.None);

        // Assert
        var unauthorizedResult = result.Should().BeOfType<UnauthorizedObjectResult>().Subject;
        unauthorizedResult.Value.Should().Be("Playback ticket signature verification failed.");
    }

    [Fact]
    public async Task StreamRecording_MismatchedSessionId_RejectsWithUnauthorized()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionA = Guid.NewGuid();
        var sessionB = Guid.NewGuid();

        // Ticket issued for Session A
        var ticketForA = GenerateTicket(sessionA, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(10), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act: Attempt to use ticket for Session A to access Session B
        var result = await controller.StreamRecording(sessionB, ticketForA, segmentIndex: 0, CancellationToken.None);

        // Assert
        var unauthorizedResult = result.Should().BeOfType<UnauthorizedObjectResult>().Subject;
        unauthorizedResult.Value.Should().Be("Playback ticket does not match the requested recording session.");
    }

    [Fact]
    public async Task StreamRecording_TamperedPayloadTicks_RejectsWithUnauthorized()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();
        var sessionId = Guid.NewGuid();

        var validTicket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(5), PlaybackSigningKey);
        var parts = validTicket.Split('.');
        var payloadParts = parts[0].Split(':');

        // Attacker modifies expiration ticks to extend ticket without recalculating HMAC
        payloadParts[2] = DateTime.UtcNow.AddHours(24).Ticks.ToString();
        var tamperedPayload = string.Join(':', payloadParts);
        var tamperedTicket = $"{tamperedPayload}.{parts[1]}";

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act
        var result = await controller.StreamRecording(sessionId, tamperedTicket, segmentIndex: 0, CancellationToken.None);

        // Assert
        var unauthorizedResult = result.Should().BeOfType<UnauthorizedObjectResult>().Subject;
        unauthorizedResult.Value.Should().Be("Playback ticket signature verification failed.");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("invalid_ticket_without_delimiter")]
    [InlineData("part1.part2.part3")]
    [InlineData("only:two:parts.validlookingbase64signature")]
    public async Task StreamRecording_MalformedTicketString_RejectsGracefully(string malformedTicket)
    {
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        var result = await controller.StreamRecording(Guid.NewGuid(), malformedTicket, segmentIndex: 0, CancellationToken.None);

        result.Should().Match(r => r is BadRequestObjectResult || r is UnauthorizedObjectResult);
    }

    // =========================================================================
    // 4. HTTP 206 Partial Content & Range Processing
    // =========================================================================

    [Fact]
    public async Task StreamRecording_DecryptedStream_HasEnableRangeProcessingAndCanSeekTrue()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var plainBytes = Encoding.UTF8.GetBytes("VIDEO_STREAM_FOR_SEEKING_IN_BROWSER_VIDEO_PLAYER");

        var encrypted = await _realEncryptionService.EncryptAsync(plainBytes, _tenantId, _clinicId, CancellationToken.None);

        var storageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var sidecarKey = $"{storageKey}.key";

        storage.Files[storageKey] = encrypted.Ciphertext;
        storage.Files[sidecarKey] = Encoding.UTF8.GetBytes(encrypted.WrappedKeyJson);

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            ContainerFormat = "video/webm",
            RecordingState = "Completed"
        };
        db.TeleconsultRecordingSessions.Add(session);

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 0,
            StorageKey = storageKey,
            Sha256Checksum = encrypted.EncryptedHash,
            IvBase64 = encrypted.IvBase64,
            TagBase64 = encrypted.TagBase64
        };
        db.TeleconsultRecordingSegments.Add(segment);
        await db.SaveChangesAsync();

        var ticket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(10), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act
        var result = await controller.StreamRecording(sessionId, ticket, segmentIndex: 0, CancellationToken.None);

        // Assert: Essential properties for HTTP 206 Partial Content in ASP.NET Core
        var fileResult = result.Should().BeOfType<FileStreamResult>().Subject;
        fileResult.EnableRangeProcessing.Should().BeTrue();
        fileResult.ContentType.Should().Be("video/webm");
        fileResult.FileStream.CanSeek.Should().BeTrue();
        fileResult.FileStream.Position.Should().Be(0);
        fileResult.FileStream.Length.Should().Be(plainBytes.Length);
    }

    [Fact]
    public async Task StreamRecording_RangeProcessing_SupportsArbitrarySeekAndByteSliceReads()
    {
        // Arrange: Generate 100 KB payload with identifiable pattern
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var plainBytes = new byte[100 * 1024];
        for (int i = 0; i < plainBytes.Length; i++)
        {
            plainBytes[i] = (byte)(i % 256);
        }

        var encrypted = await _realEncryptionService.EncryptAsync(plainBytes, _tenantId, _clinicId, CancellationToken.None);

        var storageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var sidecarKey = $"{storageKey}.key";

        storage.Files[storageKey] = encrypted.Ciphertext;
        storage.Files[sidecarKey] = Encoding.UTF8.GetBytes(encrypted.WrappedKeyJson);

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            ContainerFormat = "video/mp4",
            RecordingState = "Completed"
        };
        db.TeleconsultRecordingSessions.Add(session);

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 0,
            StorageKey = storageKey,
            Sha256Checksum = encrypted.EncryptedHash,
            IvBase64 = encrypted.IvBase64,
            TagBase64 = encrypted.TagBase64
        };
        db.TeleconsultRecordingSegments.Add(segment);
        await db.SaveChangesAsync();

        var ticket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(10), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act
        var result = await controller.StreamRecording(sessionId, ticket, segmentIndex: 0, CancellationToken.None);

        // Assert: Verify arbitrary seek operations simulate HTTP Range headers
        var fileResult = result.Should().BeOfType<FileStreamResult>().Subject;
        var stream = fileResult.FileStream;

        // Slice 1: Seek to offset 10,000, read 4,096 bytes
        stream.Seek(10000, SeekOrigin.Begin);
        var slice1 = new byte[4096];
        var read1 = await stream.ReadAsync(slice1);
        read1.Should().Be(4096);
        slice1.Should().Equal(plainBytes.AsSpan(10000, 4096).ToArray());

        // Slice 2: Seek to offset 50,000, read 8,192 bytes
        stream.Seek(50000, SeekOrigin.Begin);
        var slice2 = new byte[8192];
        var read2 = await stream.ReadAsync(slice2);
        read2.Should().Be(8192);
        slice2.Should().Equal(plainBytes.AsSpan(50000, 8192).ToArray());

        // Slice 3: Seek from end by -1,024 bytes (Range: bytes=-1024)
        stream.Seek(-1024, SeekOrigin.End);
        var slice3 = new byte[1024];
        var read3 = await stream.ReadAsync(slice3);
        read3.Should().Be(1024);
        slice3.Should().Equal(plainBytes.AsSpan(plainBytes.Length - 1024, 1024).ToArray());
    }

    [Fact]
    public async Task StreamRecording_PurgedSession_ReturnsNotFound()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            RecordingState = "Purged",
            IsPurged = true
        };
        db.TeleconsultRecordingSessions.Add(session);
        await db.SaveChangesAsync();

        var ticket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(10), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act
        var result = await controller.StreamRecording(sessionId, ticket, segmentIndex: 0, CancellationToken.None);

        // Assert
        var notFoundResult = result.Should().BeOfType<NotFoundObjectResult>().Subject;
        notFoundResult.Value.Should().Be("Recording session not found or already purged.");
    }

    [Fact]
    public async Task StreamRecording_ManifestRequest_ReturnsJsonFileStream()
    {
        // Arrange
        var storage = new InMemoryClinicStorage();
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var sender = Substitute.For<ISender>();

        var sessionId = Guid.NewGuid();
        var manifestKey = $"{_tenantId}/{_clinicId}/{sessionId}/manifest.json";
        var manifestContent = Encoding.UTF8.GetBytes("{\"SessionId\":\"" + sessionId + "\",\"SegmentCount\":2}");
        storage.Files[manifestKey] = manifestContent;

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            ManifestStorageKey = manifestKey,
            RecordingState = "Completed"
        };
        db.TeleconsultRecordingSessions.Add(session);
        await db.SaveChangesAsync();

        var ticket = GenerateTicket(sessionId, _clinicId, _staffId, DateTime.UtcNow.AddMinutes(10), PlaybackSigningKey);

        var controller = new TeleconsultRecordingsController(
            sender, _clinicContext, storage, _realEncryptionService, _configuration, db,
            NullLogger<TeleconsultRecordingsController>.Instance);

        // Act: segmentIndex is null -> requests session manifest
        var result = await controller.StreamRecording(sessionId, ticket, segmentIndex: null, CancellationToken.None);

        // Assert
        var fileResult = result.Should().BeOfType<FileStreamResult>().Subject;
        fileResult.ContentType.Should().Be("application/json");

        using var ms = new MemoryStream();
        await fileResult.FileStream.CopyToAsync(ms);
        ms.ToArray().Should().Equal(manifestContent);
    }

    // =========================================================================
    // 5. Retention Sweeper Sidecar Purge & Immunity
    // =========================================================================

    [Fact]
    public async Task RetentionSweeper_ExpiredSessionWithMultipleSegments_PurgesAllCiphertextsAndAllKeySidecars()
    {
        // Arrange
        var dbName = $"SweeperDb_{Guid.NewGuid()}";
        var (setupDb, _, _) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var storage = new InMemoryClinicStorage();

        var sessionId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var manifestKey = $"{_tenantId}/{_clinicId}/{sessionId}/manifest.json";
        var manifestSidecarKey = $"{manifestKey}.key";

        storage.Files[manifestKey] = Encoding.UTF8.GetBytes("MANIFEST_DATA");
        storage.Files[manifestSidecarKey] = Encoding.UTF8.GetBytes("MANIFEST_KEY_SIDECAR");

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            RecordingState = "Completed",
            StoragePolicy = "RetentionSweep",
            RetentionPolicyDays = 30,
            ExpiresAtUtc = now.AddHours(-2), // Expired 2 hours ago
            IsLegalHold = false,
            IsPurged = false,
            ManifestStorageKey = manifestKey,
            SegmentCount = 3,
            TotalDurationSeconds = 30
        };

        for (int i = 0; i < 3; i++)
        {
            var segKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_{i:D5}.cez";
            var segKeySidecar = $"{segKey}.key";

            storage.Files[segKey] = Encoding.UTF8.GetBytes($"SEGMENT_{i}_DATA");
            storage.Files[segKeySidecar] = Encoding.UTF8.GetBytes($"SEGMENT_{i}_KEY_SIDECAR");

            session.Segments.Add(new TeleconsultRecordingSegment
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId,
                ClinicId = _clinicId,
                TenantId = _tenantId,
                SegmentIndex = i,
                StorageKey = segKey,
                SizeBytes = 100,
                Sha256Checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                IvBase64 = "dGVzdC1pdi0xMg==",
                TagBase64 = "dGVzdC10YWctMTY="
            });
        }

        setupDb.TeleconsultRecordingSessions.Add(session);
        await setupDb.SaveChangesAsync();

        var services = new ServiceCollection();
        services.AddTransient(_ => TestDbHelper.CreateSharedTestContext(dbName, _clinicContext).Context);
        services.AddSingleton<IClinicStorageService>(_ => storage);
        var sp = services.BuildServiceProvider();

        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        // Act: Run retention sweeper
        var purgedCount = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);

        // Assert
        purgedCount.Should().Be(1);

        // Verify ALL 3 segment ciphertext files AND their .key sidecars were deleted
        for (int i = 0; i < 3; i++)
        {
            var segKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_{i:D5}.cez";
            var segKeySidecar = $"{segKey}.key";

            storage.Files.Should().NotContainKey(segKey);
            storage.Files.Should().NotContainKey(segKeySidecar);
            storage.DeletedKeys.Should().Contain(segKey);
            storage.DeletedKeys.Should().Contain(segKeySidecar);
        }

        // Verify manifest AND manifest .key sidecar were deleted
        storage.Files.Should().NotContainKey(manifestKey);
        storage.Files.Should().NotContainKey(manifestSidecarKey);
        storage.DeletedKeys.Should().Contain(manifestKey);
        storage.DeletedKeys.Should().Contain(manifestSidecarKey);

        // Verify session was marked purged in database
        var (verifyDb, _, _) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var updatedSession = await verifyDb.TeleconsultRecordingSessions.IgnoreQueryFilters().FirstAsync(s => s.Id == sessionId);
        updatedSession.IsPurged.Should().BeTrue();
        updatedSession.PurgedAtUtc.Should().NotBeNull();
        updatedSession.PurgedBy.Should().Be("System.RetentionSweeper");

        // Verify immutable WORM audit log was recorded
        var audit = await verifyDb.AuditEntries.FirstOrDefaultAsync(a => a.TargetEntityId == sessionId.ToString() && a.Action == "teleconsult.recording.purged");
        audit.Should().NotBeNull();
        audit!.ActorRole.Should().Be("System");
    }

    [Fact]
    public async Task RetentionSweeper_LegalHoldImmunity_PreventsPurgeOfSegmentsAndSidecars()
    {
        // Arrange
        var dbName = $"SweeperDb_{Guid.NewGuid()}";
        var (setupDb, _, _) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var storage = new InMemoryClinicStorage();

        var sessionId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var segKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var sidecarKey = $"{segKey}.key";
        var manifestKey = $"{_tenantId}/{_clinicId}/{sessionId}/manifest.json";
        var manifestSidecarKey = $"{manifestKey}.key";

        storage.Files[segKey] = Encoding.UTF8.GetBytes("HELD_SEGMENT_DATA");
        storage.Files[sidecarKey] = Encoding.UTF8.GetBytes("HELD_SIDECAR_DATA");
        storage.Files[manifestKey] = Encoding.UTF8.GetBytes("HELD_MANIFEST");
        storage.Files[manifestSidecarKey] = Encoding.UTF8.GetBytes("HELD_MANIFEST_SIDECAR");

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            ExpiresAtUtc = now.AddDays(-60), // Expired 60 days ago
            IsLegalHold = true,              // Under Medico-Legal Hold!
            LegalHoldReason = "Pending subpoena for malpractice investigation",
            IsPurged = false,
            ManifestStorageKey = manifestKey
        };
        session.Segments.Add(new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 0,
            StorageKey = segKey,
            Sha256Checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            IvBase64 = "dGVzdC1pdi0xMg==",
            TagBase64 = "dGVzdC10YWctMTY="
        });

        setupDb.TeleconsultRecordingSessions.Add(session);
        await setupDb.SaveChangesAsync();

        var services = new ServiceCollection();
        services.AddTransient(_ => TestDbHelper.CreateSharedTestContext(dbName, _clinicContext).Context);
        services.AddSingleton<IClinicStorageService>(_ => storage);
        var sp = services.BuildServiceProvider();

        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        // Act
        var purgedCount = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);

        // Assert: Medico-legal hold strictly blocks purge
        purgedCount.Should().Be(0);

        storage.Files.Should().ContainKey(segKey);
        storage.Files.Should().ContainKey(sidecarKey);
        storage.Files.Should().ContainKey(manifestKey);
        storage.Files.Should().ContainKey(manifestSidecarKey);
        storage.DeletedKeys.Should().BeEmpty();

        var (verifyDb, _, _) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var updatedSession = await verifyDb.TeleconsultRecordingSessions.IgnoreQueryFilters().FirstAsync(s => s.Id == sessionId);
        updatedSession.IsPurged.Should().BeFalse();
        updatedSession.PurgedAtUtc.Should().BeNull();
    }

    [Fact]
    public async Task RetentionSweeper_IndefiniteRetentionImmunity_PreventsPurge()
    {
        // Arrange
        var dbName = $"SweeperDb_{Guid.NewGuid()}";
        var (setupDb, _, _) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var storage = new InMemoryClinicStorage();

        var sessionId = Guid.NewGuid();
        var segKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var sidecarKey = $"{segKey}.key";

        storage.Files[segKey] = Encoding.UTF8.GetBytes("INDEFINITE_RETENTION_DATA");
        storage.Files[sidecarKey] = Encoding.UTF8.GetBytes("INDEFINITE_SIDECAR");

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            RetentionPolicyDays = 0, // Indefinite retention policy
            ExpiresAtUtc = null,     // Never expires
            IsLegalHold = false,
            IsPurged = false
        };
        session.Segments.Add(new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 0,
            StorageKey = segKey,
            Sha256Checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            IvBase64 = "dGVzdC1pdi0xMg==",
            TagBase64 = "dGVzdC10YWctMTY="
        });

        setupDb.TeleconsultRecordingSessions.Add(session);
        await setupDb.SaveChangesAsync();

        var services = new ServiceCollection();
        services.AddTransient(_ => TestDbHelper.CreateSharedTestContext(dbName, _clinicContext).Context);
        services.AddSingleton<IClinicStorageService>(_ => storage);
        var sp = services.BuildServiceProvider();

        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        // Act
        var purgedCount = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);

        // Assert
        purgedCount.Should().Be(0);
        storage.Files.Should().ContainKey(segKey);
        storage.Files.Should().ContainKey(sidecarKey);
        storage.DeletedKeys.Should().BeEmpty();
    }

    [Fact]
    public async Task RetentionSweeper_StorageExceptionDuringDeletion_ResilientlyContinuesAndDoesNotCrash()
    {
        // Arrange
        var dbName = $"SweeperDb_{Guid.NewGuid()}";
        var (setupDb, _, _) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var storage = new InMemoryClinicStorage();

        var sessionId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var segKey0 = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var sidecar0 = $"{segKey0}.key";
        var segKey1 = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00001.cez";
        var sidecar1 = $"{segKey1}.key";

        storage.Files[segKey0] = Encoding.UTF8.GetBytes("DATA_0");
        storage.Files[sidecar0] = Encoding.UTF8.GetBytes("SIDECAR_0");
        storage.Files[segKey1] = Encoding.UTF8.GetBytes("DATA_1");
        storage.Files[sidecar1] = Encoding.UTF8.GetBytes("SIDECAR_1");

        // Simulate transient storage exception when deleting sidecar 0
        storage.FailOnDelete = key => key == sidecar0;

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorName = "Dr. Jose Rizal",
            ExpiresAtUtc = now.AddHours(-1),
            IsPurged = false
        };
        session.Segments.Add(new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 0,
            StorageKey = segKey0,
            Sha256Checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            IvBase64 = "dGVzdC1pdi0xMg==",
            TagBase64 = "dGVzdC10YWctMTY="
        });
        session.Segments.Add(new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            SegmentIndex = 1,
            StorageKey = segKey1,
            Sha256Checksum = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            IvBase64 = "dGVzdC1pdi0xMg==",
            TagBase64 = "dGVzdC10YWctMTY="
        });

        setupDb.TeleconsultRecordingSessions.Add(session);
        await setupDb.SaveChangesAsync();

        var services = new ServiceCollection();
        services.AddTransient(_ => TestDbHelper.CreateSharedTestContext(dbName, _clinicContext).Context);
        services.AddSingleton<IClinicStorageService>(_ => storage);
        var sp = services.BuildServiceProvider();

        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        // Act: Must not throw exception
        var act = () => sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);
        var purgedCount = await act.Should().NotThrowAsync();

        // Assert: Sweeper processed other files and marked session purged
        purgedCount.Subject.Should().Be(1);
        storage.DeletedKeys.Should().Contain(segKey0);
        storage.DeletedKeys.Should().Contain(segKey1);
        storage.DeletedKeys.Should().Contain(sidecar1);

        var (verifyDb, _, _) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var updatedSession = await verifyDb.TeleconsultRecordingSessions.IgnoreQueryFilters().FirstAsync(s => s.Id == sessionId);
        updatedSession.IsPurged.Should().BeTrue();
    }
}
