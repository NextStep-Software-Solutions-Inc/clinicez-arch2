using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Comms;

public sealed class TeleconsultRecordingVaultAdversarialTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-vault-test";
    private readonly IClinicContext _clinicContext;

    public TeleconsultRecordingVaultAdversarialTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
        _clinicContext.StaffName.Returns("Dr. Juan Dela Cruz");
        _clinicContext.HasPermission(Arg.Any<string>()).Returns(true);
    }

    [Fact]
    public async Task RequestConsent_WhenPolicyDisabled_ThrowsForbiddenException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);

        // Facility explicitly disabled teleconsult recording
        context.ClinicSettings.Add(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Apex Clinic",
            TeleconsultRecordingPolicy = "Disabled"
        });
        await context.SaveChangesAsync();

        var handler = new ConsentCommandHandler(
            settingsRepo, sessionRepo, patientRepo, staffRepo, auditRepo,
            uow, _clinicContext, NullLogger<ConsentCommandHandler>.Instance);

        var command = new RequestRecordingConsentCommand(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());

        // Act & Assert
        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*RECORDING_POLICY_DISABLED*");
    }

    [Fact]
    public async Task PatientRejection_LocksSessionInBlockedState_AndRejectsSegmentUploads()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);
        var segmentRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSegment>(context, sieve);
        var storage = Substitute.For<IClinicStorageService>();

        context.ClinicSettings.Add(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Apex Clinic",
            TeleconsultRecordingPolicy = "WorkspaceVaultOnly",
            TeleconsultRecordingRetentionDays = 90
        });

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-001",
            FirstName = "Maria",
            LastName = "Clara",
            DateOfBirth = new DateOnly(1995, 5, 12),
            ContactNumber = "09171234567"
        };
        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        var consentHandler = new ConsentCommandHandler(
            settingsRepo, sessionRepo, patientRepo, staffRepo, auditRepo,
            uow, _clinicContext, NullLogger<ConsentCommandHandler>.Instance);

        var callId = Guid.NewGuid();
        var session = await consentHandler.Handle(
            new RequestRecordingConsentCommand(callId, patient.Id, _clinicContext.StaffId!.Value),
            CancellationToken.None);

        session.RecordingState.Should().Be("PendingConsent");
        session.ConsentStatus.Should().Be("ConsentPending");

        // Act: Patient Declines Consent
        var rejectedSession = await consentHandler.Handle(
            new SubmitPatientConsentCommand(session.Id, Approved: false, RejectionReason: "Privacy concerns"),
            CancellationToken.None);

        // Assert: Session locked in Blocked state
        rejectedSession.ConsentStatus.Should().Be("Rejected");
        rejectedSession.RecordingState.Should().Be("Blocked");

        // Verify WORM audit log written
        var auditEntry = await context.ClinicAuditEntries
            .FirstOrDefaultAsync(a => a.Action == "teleconsult.recording.consent.rejected");
        auditEntry.Should().NotBeNull();
        auditEntry!.Severity.Should().Be(ClinicAuditSeverities.Urgent);

        // Attempt segment upload should throw ForbiddenException
        var uploadHandler = new UploadRecordingSegmentCommandHandler(
            settingsRepo, sessionRepo, segmentRepo, uow, _clinicContext, storage,
            NullLogger<UploadRecordingSegmentCommandHandler>.Instance);

        var uploadAct = () => uploadHandler.Handle(new UploadRecordingSegmentCommand(
            SessionId: session.Id,
            SegmentIndex: 0,
            DurationMs: 10000,
            StorageKey: "vault/key-0.cez",
            SizeBytes: 1024,
            Sha256Checksum: "abc",
            IvBase64: "iv",
            TagBase64: "tag"), CancellationToken.None);

        await uploadAct.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*CONSENT_REJECTED_RECORDING_BLOCKED*");
    }

    [Fact]
    public async Task FinalizeSession_WithMissingSegment_DetectsGapsAndSavesEncryptedManifest()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var segmentRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSegment>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);
        var storage = Substitute.For<IClinicStorageService>();

        var sessionId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = callId,
            PatientId = patientId,
            PatientName = "Pedro Penduko",
            DoctorId = _clinicContext.StaffId!.Value,
            DoctorName = "Dr. Dela Cruz",
            ConsentStatus = "Consented",
            RecordingState = "Recording",
            StoragePolicy = "WorkspaceVaultOnly",
            RetentionPolicyDays = 30
        };
        context.TeleconsultRecordingSessions.Add(session);

        // Add segment 0 and segment 2 (missing segment 1)
        context.TeleconsultRecordingSegments.AddRange(
            new TeleconsultRecordingSegment
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = _clinicId,
                SessionId = sessionId,
                SegmentIndex = 0,
                DurationMs = 10000,
                StorageKey = "vault/seg0.cez",
                SizeBytes = 2000,
                Sha256Checksum = "hash0",
                IvBase64 = "iv0",
                TagBase64 = "tag0"
            },
            new TeleconsultRecordingSegment
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = _clinicId,
                SessionId = sessionId,
                SegmentIndex = 2, // GAP: missing index 1
                DurationMs = 10000,
                StorageKey = "vault/seg2.cez",
                SizeBytes = 2500,
                Sha256Checksum = "hash2",
                IvBase64 = "iv2",
                TagBase64 = "tag2"
            }
        );
        await context.SaveChangesAsync();

        var handler = new FinalizeRecordingSessionCommandHandler(
            sessionRepo, segmentRepo, auditRepo, uow, _clinicContext, storage,
            NullLogger<FinalizeRecordingSessionCommandHandler>.Instance);

        // Act
        var result = await handler.Handle(new FinalizeRecordingSessionCommand(sessionId), CancellationToken.None);

        // Assert
        result.HasGaps.Should().BeTrue();
        result.SegmentCount.Should().Be(2);
        result.TotalSizeBytes.Should().Be(4500);
        result.RecordingState.Should().Be("Completed");
        result.ManifestStorageKey.Should().NotBeNullOrWhiteSpace();

        // Manifest must be encrypted and saved to storage
        await storage.Received(1).SaveEncryptedFileAsync(
            Arg.Is<string>(k => k.Contains("manifest.cez")),
            Arg.Any<byte[]>(),
            Arg.Any<CancellationToken>());

        // WORM audit entry created
        var audit = await context.ClinicAuditEntries
            .FirstOrDefaultAsync(a => a.Action == "teleconsult.recording.finalized");
        audit.Should().NotBeNull();
        audit!.Description.Should().Contain("HasGaps: True");
    }

    [Fact]
    public async Task MedicoLegalHold_Immunity_PreventsRetentionSweepUntilReleased()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);
        var storage = Substitute.For<IClinicStorageService>();

        var services = new ServiceCollection();
        services.AddSingleton(context);
        services.AddSingleton(storage);
        var sp = services.BuildServiceProvider();

        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        var sessionId = Guid.NewGuid();
        var expiredDate = DateTime.UtcNow.AddDays(-10); // Expired 10 days ago!

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            PatientName = "Jose Rizal",
            DoctorId = _clinicContext.StaffId!.Value,
            DoctorName = "Dr. Dela Cruz",
            ConsentStatus = "Consented",
            RecordingState = "Completed",
            StoragePolicy = "WorkspaceVaultOnly",
            RetentionPolicyDays = 30,
            ExpiresAtUtc = expiredDate,
            IsLegalHold = true, // MEDICO-LEGAL HOLD PLACED!
            LegalHoldReason = "Court Subpoena Case #2026-99"
        };

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            SessionId = sessionId,
            SegmentIndex = 0,
            DurationMs = 10000,
            StorageKey = "vault/case-99/seg0.cez",
            SizeBytes = 5000,
            Sha256Checksum = "hash",
            IvBase64 = "iv",
            TagBase64 = "tag"
        };

        context.TeleconsultRecordingSessions.Add(session);
        context.TeleconsultRecordingSegments.Add(segment);
        await context.SaveChangesAsync();

        // Act 1: Run sweeper while legal hold is active
        var purgedCount1 = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);

        // Assert 1: Sweeper bypassed the recording due to strict legal hold immunity
        purgedCount1.Should().Be(0);
        session.IsPurged.Should().BeFalse();
        await storage.DidNotReceive().DeleteEncryptedFileAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());

        // Act 2: Release Legal Hold via Admin command
        var legalHoldHandler = new LegalHoldCommandHandler(
            sessionRepo, auditRepo, uow, _clinicContext,
            NullLogger<LegalHoldCommandHandler>.Instance);

        var releasedSession = await legalHoldHandler.Handle(
            new ReleaseLegalHoldCommand(sessionId, "Court case dismissed"),
            CancellationToken.None);

        releasedSession.IsLegalHold.Should().BeFalse();

        // Act 3: Re-run retention sweeper now that hold is released
        var purgedCount2 = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);

        // Assert 3: Recording successfully purged with storage deletion and WORM audit
        purgedCount2.Should().Be(1);
        session.IsPurged.Should().BeTrue();
        session.PurgedBy.Should().Be("System.RetentionSweeper");

        await storage.Received(1).DeleteEncryptedFileAsync("vault/case-99/seg0.cez", Arg.Any<CancellationToken>());

        var purgeAudit = await context.ClinicAuditEntries
            .FirstOrDefaultAsync(a => a.Action == "teleconsult.recording.purged");
        purgeAudit.Should().NotBeNull();
        purgeAudit!.Outcome.Should().Be(ClinicAuditOutcomes.Success);
    }

    [Fact]
    public async Task PlaybackTicket_GenerationAndExpiry_Enforces15MinuteTimeLimit()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("RecordingPlayback:SigningKey", "super-secret-vault-playback-key-2026")
            })
            .Build();

        var sessionId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            PatientName = "Andres Bonifacio",
            DoctorId = _clinicContext.StaffId!.Value,
            DoctorName = "Dr. Dela Cruz",
            ConsentStatus = "Consented",
            RecordingState = "Completed",
            StoragePolicy = "WorkspaceVaultOnly",
            RetentionPolicyDays = 90
        };
        context.TeleconsultRecordingSessions.Add(session);
        await context.SaveChangesAsync();

        var handler = new CreatePlaybackTicketCommandHandler(
            sessionRepo, auditRepo, uow, _clinicContext, config,
            NullLogger<CreatePlaybackTicketCommandHandler>.Instance);

        // Act
        var result = await handler.Handle(new CreatePlaybackTicketCommand(sessionId), CancellationToken.None);

        // Assert
        result.Ticket.Should().NotBeNullOrWhiteSpace();
        result.ExpiresAtUtc.Should().BeCloseTo(DateTime.UtcNow.AddMinutes(15), TimeSpan.FromSeconds(5));

        // Verify ticket structure: payload.signature
        var parts = result.Ticket.Split('.');
        parts.Length.Should().Be(2);

        // Parse payload
        var payloadParts = parts[0].Split(':');
        payloadParts[0].Should().Be(sessionId.ToString("N"));
        payloadParts[1].Should().Be(_clinicId.ToString("N"));

        // Verify signature matches HMAC-SHA256
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes("super-secret-vault-playback-key-2026"));
        var expectedSig = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(parts[0])))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
        parts[1].Should().Be(expectedSig);
    }

    [Fact]
    public async Task WormAuditLog_Immutability_ThrowsWhenAttemptingToModifyOrDelete()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);

        var audit = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Emergency,
            Action = "teleconsult.test.action",
            ActorName = "Dr. Test",
            ActorRole = "Doctor",
            TargetEntityType = "Appointment",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Immutable audit log entry test."
        };

        context.ClinicAuditEntries.Add(audit);
        await context.SaveChangesAsync();

        // Act & Assert 1: Modification throws InvalidOperationException
        audit.Description = "Tampered description";
        var modifyAct = () => context.SaveChangesAsync();
        await modifyAct.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*ClinicAuditEntry is append-only (WORM)*");

        // Act & Assert 2: Deletion throws InvalidOperationException
        context.Entry(audit).State = EntityState.Unchanged;
        context.ClinicAuditEntries.Remove(audit);
        var deleteAct = () => context.SaveChangesAsync();
        await deleteAct.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
    }

    [Fact]
    public async Task FinalizeSession_WhenRetentionPolicyDaysIsZero_SetsExpiresAtUtcToNull_AndImmuneFromSweeper()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var segmentRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSegment>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, sieve);
        var storage = Substitute.For<IClinicStorageService>();

        var sessionId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            PatientName = "Indefinite Archive Patient",
            DoctorId = _clinicContext.StaffId!.Value,
            DoctorName = "Dr. Dela Cruz",
            ConsentStatus = "Consented",
            RecordingState = "Recording",
            StoragePolicy = "WorkspaceVaultOnly",
            RetentionPolicyDays = 0 // Indefinite retention!
        };

        var segment = new TeleconsultRecordingSegment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            SessionId = sessionId,
            SegmentIndex = 0,
            DurationMs = 10000,
            StorageKey = "vault/indefinite/seg0.cez",
            SizeBytes = 1024,
            Sha256Checksum = "hash0",
            IvBase64 = "iv0",
            TagBase64 = "tag0"
        };

        context.TeleconsultRecordingSessions.Add(session);
        context.TeleconsultRecordingSegments.Add(segment);
        await context.SaveChangesAsync();

        var handler = new FinalizeRecordingSessionCommandHandler(
            sessionRepo, segmentRepo, auditRepo, uow, _clinicContext, storage,
            NullLogger<FinalizeRecordingSessionCommandHandler>.Instance);

        // Act: Finalize session with RetentionPolicyDays = 0
        var result = await handler.Handle(new FinalizeRecordingSessionCommand(sessionId), CancellationToken.None);

        // Assert: ExpiresAtUtc is null for indefinite retention
        result.ExpiresAtUtc.Should().BeNull();
        session.ExpiresAtUtc.Should().BeNull();

        // Run sweeper to verify session is NOT swept
        var services = new ServiceCollection();
        services.AddSingleton(context);
        services.AddSingleton(storage);
        var sp = services.BuildServiceProvider();
        var sweeper = new RecordingRetentionSweeper(sp, NullLogger<RecordingRetentionSweeper>.Instance);

        var purgedCount = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);
        purgedCount.Should().Be(0);
        session.IsPurged.Should().BeFalse();
    }
}
