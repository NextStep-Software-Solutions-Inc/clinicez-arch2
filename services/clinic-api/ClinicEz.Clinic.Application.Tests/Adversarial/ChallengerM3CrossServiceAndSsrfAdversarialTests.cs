using System;
using System.Collections.Generic;
using System.IO;
using System.Security;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Common.Security;
using ClinicEz.Clinic.Application.Features.Records.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Messaging.Handlers;
using ClinicEz.Clinic.Infrastructure.Services.Storage;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Adversarial Verification Suite for Milestone M3 Cross-Service Routing, Vault Path Isolation & SSRF Hardening.
/// </summary>
public class ChallengerM3CrossServiceAndSsrfAdversarialTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-ssrf-adversarial";

    // ── SECTION 1: SSRF Hardening & SafeDownloadUrlValidator ──

    [Theory]
    [InlineData("http://127.0.0.1:8080/data.pdf")]
    [InlineData("https://127.0.0.1:8443/data.pdf")]
    [InlineData("https://127.0.0.1/data.pdf")]
    [InlineData("http://localhost/secret.pdf")]
    [InlineData("https://localhost:5001/secret.pdf")]
    [InlineData("https://sub.localhost/secret.pdf")]
    [InlineData("https://[::1]/secret.pdf")]
    [InlineData("http://[::1]:8080/secret.pdf")]
    [InlineData("https://10.0.0.1/internal.pdf")]
    [InlineData("http://10.0.0.1/internal.pdf")]
    [InlineData("https://10.254.1.1:8080/internal.pdf")]
    [InlineData("https://172.16.0.1/admin.pdf")]
    [InlineData("http://172.16.0.1/admin.pdf")]
    [InlineData("https://172.31.255.254/admin.pdf")]
    [InlineData("https://192.168.1.1/router.pdf")]
    [InlineData("http://192.168.1.1/router.pdf")]
    [InlineData("https://192.168.0.254/router.pdf")]
    [InlineData("https://169.254.169.254/latest/meta-data/")]
    [InlineData("http://169.254.169.254/latest/meta-data/iam/security-credentials/")]
    [InlineData("https://100.64.0.1/cgnat.pdf")]
    [InlineData("http://100.64.0.1/cgnat.pdf")]
    [InlineData("https://100.127.255.254/cgnat.pdf")]
    [InlineData("https://[fe80::1]/test.pdf")]
    [InlineData("https://[fc00::1]/test.pdf")]
    [InlineData("https://internal-service/test.pdf")]
    [InlineData("http://intranet")]
    [InlineData("https://intranet")]
    [InlineData("http://intranet/data.pdf")]
    [InlineData("https://intranet/data.pdf")]
    [InlineData("https://vault.local/test.pdf")]
    [InlineData("https://myhost.corp/test.pdf")]
    [InlineData("https://myhost.lan/test.pdf")]
    [InlineData("ftp://ftp.secure-records.com/file.pdf")]
    [InlineData("file:///etc/passwd")]
    [InlineData("gopher://127.0.0.1:70/")]
    [InlineData("https://user:password@storage.googleapis.com/file.pdf")]
    public void SafeDownloadUrlValidator_MaliciousAndPrivateUrls_MustBeStrictlyRejected(string attackUrl)
    {
        var isValid = SafeDownloadUrlValidator.TryValidateSafeHttpsUrl(attackUrl, out _, out var reason);
        isValid.Should().BeFalse($"SSRF attack vector '{attackUrl}' must be rejected");
        reason.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void SafeDownloadUrlValidator_UrlExceedingMaxLength_IsRejected()
    {
        var longUrl = "https://storage.googleapis.com/bucket/" + new string('a', 2050) + ".pdf";
        var isValid = SafeDownloadUrlValidator.TryValidateSafeHttpsUrl(longUrl, out _, out var reason);
        isValid.Should().BeFalse();
        reason.Should().Contain("exceeds maximum length");
    }

    [Theory]
    [InlineData("https://storage.googleapis.com/patient-uploads/file123.pdf")]
    [InlineData("https://s3.ap-southeast-1.amazonaws.com/cez-records/scan.pdf")]
    [InlineData("https://files.clinicez.com/patients/export.pdf")]
    [InlineData("https://cdn.example.ph/lab-results/cbc.pdf")]
    public void SafeDownloadUrlValidator_LegitimatePublicHttpsUrls_AreAllowed(string legitimateUrl)
    {
        var isValid = SafeDownloadUrlValidator.TryValidateSafeHttpsUrl(legitimateUrl, out var uri, out var reason);
        isValid.Should().BeTrue($"Legitimate public HTTPS URL '{legitimateUrl}' must pass validation. Reason: {reason}");
        uri.Scheme.Should().Be(Uri.UriSchemeHttps);
    }

    // ── SECTION 2: Teleconsult Vault Path Isolation & Storage Traversal ──

    [Theory]
    [InlineData("../../../etc/passwd")]
    [InlineData("..\\..\\secret.cez")]
    [InlineData("vault/../../escape.cez")]
    [InlineData("tenant_other/clinic_other/session_other/seg0.cez")]
    [InlineData("/absolute/root/override.cez")]
    [InlineData("%2e%2e/escape.cez")]
    [InlineData("%2e%2e/%2e%2e/etc/passwd")]
    [InlineData("/etc/passwd")]
    [InlineData("C:\\Windows\\System32\\cmd.exe")]
    [InlineData("C:/Windows/System32/cmd.exe")]
    public async Task UploadRecordingSegment_InvalidOrTraversalStorageKey_MustThrowForbiddenException(string attackKey)
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);
        var segmentRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSegment>(db, sieve);
        var storageService = Substitute.For<IClinicStorageService>();

        var facilitySettings = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Test Clinic",
            TeleconsultRecordingPolicy = "WorkspaceVaultOnly"
        };
        await settingsRepo.AddAsync(facilitySettings);

        var sessionId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = Guid.NewGuid(),
            ConsultationId = Guid.NewGuid(),
            DoctorId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            DoctorName = "Dr. Santos",
            PatientName = "Maria Clara",
            ConsentStatus = "Consented",
            RecordingState = "ReadyToRecord"
        };
        await sessionRepo.AddAsync(session);
        await uow.SaveChangesAsync();

        var handler = new UploadRecordingSegmentCommandHandler(
            settingsRepo,
            sessionRepo,
            segmentRepo,
            uow,
            clinicContext,
            storageService,
            NullLogger<UploadRecordingSegmentCommandHandler>.Instance);

        var command = new UploadRecordingSegmentCommand(
            sessionId,
            0,
            5000,
            attackKey,
            1024,
            "sha256",
            "iv",
            "tag");

        // Act & Assert
        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*violates sovereign path isolation*");
    }

    [Fact]
    public async Task UploadRecordingSegment_ValidSovereignStorageKey_Succeeds()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);
        var segmentRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSegment>(db, sieve);
        var storageService = Substitute.For<IClinicStorageService>();

        var facilitySettings = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Test Clinic",
            TeleconsultRecordingPolicy = "WorkspaceVaultOnly"
        };
        await settingsRepo.AddAsync(facilitySettings);

        var sessionId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = Guid.NewGuid(),
            ConsultationId = Guid.NewGuid(),
            DoctorId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            DoctorName = "Dr. Santos",
            PatientName = "Maria Clara",
            ConsentStatus = "Consented",
            RecordingState = "ReadyToRecord"
        };
        await sessionRepo.AddAsync(session);
        await uow.SaveChangesAsync();

        var validStorageKey = $"{_tenantId}/{_clinicId}/{sessionId}/seg_00000.cez";
        var handler = new UploadRecordingSegmentCommandHandler(
            settingsRepo,
            sessionRepo,
            segmentRepo,
            uow,
            clinicContext,
            storageService,
            NullLogger<UploadRecordingSegmentCommandHandler>.Instance);

        var command = new UploadRecordingSegmentCommand(
            sessionId,
            0,
            5000,
            validStorageKey,
            1024,
            "sha256",
            "iv",
            "tag");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.StorageKey.Should().Be(validStorageKey);
        session.RecordingState.Should().Be("Recording");
    }

    [Theory]
    [InlineData("../../../etc/shadow")]
    [InlineData("..\\windows\\system32\\cmd.exe")]
    [InlineData("dir/../../escape.txt")]
    [InlineData("/../../etc/shadow")]
    public async Task LocalClinicStorageService_PathTraversalKey_MustThrowSecurityException(string attackKey)
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "cez_storage_test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        try
        {
            var config = Substitute.For<Microsoft.Extensions.Configuration.IConfiguration>();
            config["Storage:BasePath"].Returns(tempDir);

            var storage = new LocalClinicStorageService(config, NullLogger<LocalClinicStorageService>.Instance);
            var act = () => storage.SaveEncryptedFileAsync(attackKey, [0x01, 0x02]);
            await act.Should().ThrowAsync<SecurityException>()
                .WithMessage("*Storage path traversal attempt detected*");
        }
        finally
        {
            if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true);
        }
    }

    // ── SECTION 3: Cross-Patient Attachment Linking Prevention ──

    [Fact]
    public async Task IntakePatientSharedFile_WhenFileIdBelongsToAnotherPatient_ThrowsForbiddenException()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var attachmentRepo = TestDbHelper.CreateRepository<RecordAttachment>(db, sieve);

        var patientAId = Guid.NewGuid();
        var patientBId = Guid.NewGuid();
        var existingFileId = Guid.NewGuid();

        // Existing attachment belongs to Patient A
        var existingAttachment = new RecordAttachment
        {
            Id = existingFileId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientAId,
            Title = "Patient A Blood Test",
            FileName = "cbc.pdf",
            StorageUri = $"tenants/{_tenantId}/clinics/{_clinicId}/records/{existingFileId}.cez"
        };
        await attachmentRepo.AddAsync(existingAttachment);
        await uow.SaveChangesAsync();

        var encryptionService = Substitute.For<IClinicEncryptionService>();
        encryptionService.EncryptAsync(Arg.Any<byte[]>(), Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(new ClinicEncryptedPayload([0x01, 0x02], "iv", "tag", "hash", 2, "wrappedKey"));

        var storageService = Substitute.For<IClinicStorageService>();

        var handler = new IntakePatientSharedFileCommandHandler(
            attachmentRepo,
            uow,
            clinicContext,
            encryptionService,
            storageService);

        // Patient B attempts to overwrite / claim Patient A's attachment ID
        var command = new IntakePatientSharedFileCommand(
            PatientId: patientBId,
            AppointmentId: null,
            ConsultationId: null,
            FileId: existingFileId,
            RecordType: "LabResult",
            Title: "Hijacked Attachment",
            FileName: "test.pdf",
            ContentType: "application/pdf",
            FileBytes: [0xAA, 0xBB]);

        // Act & Assert
        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*Cross-patient attachment linking is prohibited*");
    }

    // ── SECTION 4: Comms Handlers CloudPatientId -> Local Patient.Id Resolution ──

    [Fact]
    public async Task CommsAttachmentFiledHandler_ResolvesCloudPatientId_ToLocalPatientId()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var facility = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Jose Rizal Health"
        };
        db.Settings.Add(facility);

        var localPatientId = Guid.NewGuid();
        var cloudPatientId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = localPatientId,
            CloudPatientId = cloudPatientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-LOCAL-01",
            FirstName = "Jose",
            LastName = "Rizal",
            ContactNumber = "0917-123-4567"
        };
        db.Patients.Add(patient);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new CommsAttachmentFiledHandler(db, recipientResolver, NullLogger<CommsAttachmentFiledHandler>.Instance);

        var message = new CommsAttachmentFiledPayload(
            AttachmentId: Guid.NewGuid(),
            MessageId: null,
            ConversationId: Guid.NewGuid(),
            TenantId: _tenantId,
            FacilityId: _clinicId.ToString(),
            PatientId: cloudPatientId, // Cloud patient ID
            ConsultationId: null,
            RecordType: "LabResult",
            Title: "Lab Result",
            OriginalFileName: "lab_results.pdf",
            SafeFileName: "lab_results.pdf",
            ContentType: "application/pdf",
            FileSizeBytes: 2048,
            SHA256Checksum: "abcd1234abcd",
            StoragePath: "storage/comms/att1.pdf",
            FiledByStaffId: Guid.NewGuid().ToString(),
            FiledByStaffName: "Nurse Maria",
            FiledAtUtc: DateTime.UtcNow,
            Notes: null,
            Version: 1
        );

        var envelope = new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = "comms.attachment.filed",
            From = Party.Portal,
            To = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            SentAtUtc = DateTime.UtcNow
        };
        var interopContext = new InteropMessageContext(envelope);

        // Act
        await handler.HandleAsync(message, interopContext, CancellationToken.None);

        // Assert
        var savedAttachment = await db.RecordAttachments.FirstOrDefaultAsync(a => a.ClinicId == _clinicId);
        savedAttachment.Should().NotBeNull();
        savedAttachment!.PatientId.Should().Be(localPatientId); // Must be mapped to LOCAL Patient.Id!

        var savedAudit = await db.AuditEntries.FirstOrDefaultAsync(a => a.Action == "comms.attachment.filed");
        savedAudit.Should().NotBeNull();
        savedAudit!.PatientId.Should().Be(localPatientId);
    }

    [Fact]
    public async Task CommsAttachmentFiledHandler_WhenDirectPatientIdProvided_ResolvesCorrectly()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var facility = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Jose Rizal Health"
        };
        db.Settings.Add(facility);

        var directPatientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = directPatientId,
            CloudPatientId = null,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-DIRECT-01",
            FirstName = "Andres",
            LastName = "Bonifacio",
            ContactNumber = "0917-999-8888"
        };
        db.Patients.Add(patient);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new CommsAttachmentFiledHandler(db, recipientResolver, NullLogger<CommsAttachmentFiledHandler>.Instance);

        var message = new CommsAttachmentFiledPayload(
            AttachmentId: Guid.NewGuid(),
            MessageId: null,
            ConversationId: Guid.NewGuid(),
            TenantId: _tenantId,
            FacilityId: _clinicId.ToString(),
            PatientId: directPatientId, // Direct local Patient.Id
            ConsultationId: null,
            RecordType: "LabResult",
            Title: "Direct Attachment",
            OriginalFileName: "direct.pdf",
            SafeFileName: "direct.pdf",
            ContentType: "application/pdf",
            FileSizeBytes: 1024,
            SHA256Checksum: "deadbeef",
            StoragePath: "storage/comms/direct.pdf",
            FiledByStaffId: Guid.NewGuid().ToString(),
            FiledByStaffName: "Triage",
            FiledAtUtc: DateTime.UtcNow,
            Notes: null,
            Version: 1
        );

        var envelope = new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = "comms.attachment.filed",
            From = Party.Portal,
            To = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            SentAtUtc = DateTime.UtcNow
        };
        var interopContext = new InteropMessageContext(envelope);

        // Act
        await handler.HandleAsync(message, interopContext, CancellationToken.None);

        // Assert: Attachment created and mapped to directPatientId
        var attachment = await db.RecordAttachments.FirstOrDefaultAsync(a => a.ClinicId == _clinicId);
        attachment.Should().NotBeNull();
        attachment!.PatientId.Should().Be(directPatientId);
    }

    [Fact]
    public async Task CommsTranscriptArchivedHandler_ResolvesCloudPatientId_ToLocalPatientId()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var facility = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Jose Rizal Health"
        };
        db.Settings.Add(facility);

        var localPatientId = Guid.NewGuid();
        var cloudPatientId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = localPatientId,
            CloudPatientId = cloudPatientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-LOCAL-02",
            FirstName = "Maria",
            LastName = "Clara",
            ContactNumber = "0917-111-2222"
        };
        db.Patients.Add(patient);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new CommsTranscriptArchivedHandler(db, recipientResolver, NullLogger<CommsTranscriptArchivedHandler>.Instance);

        var message = new CommsTranscriptArchivedPayload(
            ConversationId: Guid.NewGuid(),
            TenantId: _tenantId,
            FacilityId: _clinicId.ToString(),
            FacilityType: "Clinic",
            PatientId: cloudPatientId,
            ContextType: null,
            ContextId: null,
            Category: MessageCategory.PostVisitFollowUp,
            Title: "Consultation Transcript",
            OpenedAtUtc: DateTime.UtcNow.AddHours(-1),
            ClosedAtUtc: DateTime.UtcNow,
            ClosedByStaffId: Guid.NewGuid().ToString(),
            ClosedByStaffName: "Dr. Santos",
            TriageDisposition: TriageDisposition.Answered,
            DeclineReasonCode: null,
            TotalMessageCount: 10,
            PublicMessageCount: 10,
            TranscriptJson: "{}",
            TranscriptMarkdown: "# Transcript",
            TranscriptSha256: "hash123",
            Attachments: Array.Empty<CommsAttachmentReference>(),
            Version: 1,
            ArchivedAtUtc: DateTime.UtcNow
        );

        var envelope = new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = "comms.transcript.archived",
            From = Party.Portal,
            To = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            SentAtUtc = DateTime.UtcNow
        };
        var interopContext = new InteropMessageContext(envelope);

        // Act
        await handler.HandleAsync(message, interopContext, CancellationToken.None);

        // Assert
        var savedAttachment = await db.RecordAttachments.FirstOrDefaultAsync(a => a.ClinicId == _clinicId && a.RecordType == "CommunicationTranscript");
        savedAttachment.Should().NotBeNull();
        savedAttachment!.PatientId.Should().Be(localPatientId);

        var savedAudit = await db.AuditEntries.FirstOrDefaultAsync(a => a.Action == "comms.transcript.archived");
        savedAudit.Should().NotBeNull();
        savedAudit!.PatientId.Should().Be(localPatientId);
    }

    // ── SECTION 5: PIN Hijacking Prevention in AppointmentBookedHandler ──

    [Fact]
    public async Task AppointmentBookedHandler_WhenPhilHealthPinMatches_ButDemographicsMismatch_DoesNotHijackAccount()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var facility = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Jose Rizal Health"
        };
        db.Settings.Add(facility);

        var pin = "12-345678901-2";
        var existingPatientId = Guid.NewGuid();

        // Existing patient "Juan Dela Cruz" born 1990-01-01
        var existingPatient = new Patient
        {
            Id = existingPatientId,
            CloudPatientId = null, // Not yet linked
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-JUAN-01",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1990, 1, 1),
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "0918-000-0001"
        };
        db.Patients.Add(existingPatient);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var publisher = Substitute.For<IInteropPublisher>();
        var handler = new AppointmentBookedHandler(db, recipientResolver, publisher, NullLogger<AppointmentBookedHandler>.Instance);

        var attackerCloudPatientId = Guid.NewGuid();
        var incomingEvent = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = attackerCloudPatientId,
            PatientFirstName = "Pedro",
            PatientLastName = "Penduko", // Different last name
            DateOfBirth = new DateOnly(1995, 5, 5), // Different DOB
            PhilHealthNumber = pin, // Attacker presents Juan's PIN
            PreferredDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            PreferredTime = "10:00"
        };

        var envelope = new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.PatientAppointmentBooked,
            From = Party.ForPatient(attackerCloudPatientId.ToString()),
            To = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            SentAtUtc = DateTime.UtcNow
        };
        var interopContext = new InteropMessageContext(envelope);

        // Act
        await handler.HandleAsync(incomingEvent, interopContext, CancellationToken.None);

        // Assert:
        // 1. Juan Dela Cruz's CloudPatientId must remain null (NOT hijacked by attackerCloudPatientId!)
        var juan = await db.Patients.FirstAsync(p => p.Id == existingPatientId);
        juan.CloudPatientId.Should().BeNull();

        // 2. A separate patient was provisioned for Pedro Penduko with attackerCloudPatientId
        var pedro = await db.Patients.FirstOrDefaultAsync(p => p.CloudPatientId == attackerCloudPatientId);
        pedro.Should().NotBeNull();
        pedro!.LastName.Should().Be("Penduko");
        pedro.Id.Should().NotBe(existingPatientId);
    }

    [Fact]
    public async Task AppointmentBookedHandler_WhenCandidateAlreadyLinkedToAnotherCloudPatientId_DoesNotHijackAccount()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var facility = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Jose Rizal Health"
        };
        db.Settings.Add(facility);

        var pin = "12-345678901-2";
        var existingPatientId = Guid.NewGuid();
        var legitimateCloudPatientId = Guid.NewGuid();

        // Existing patient "Juan Dela Cruz" born 1990-01-01 who ALREADY linked their account
        var existingPatient = new Patient
        {
            Id = existingPatientId,
            CloudPatientId = legitimateCloudPatientId, // Already linked!
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-JUAN-01",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1990, 1, 1),
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "0918-000-0001"
        };
        db.Patients.Add(existingPatient);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var publisher = Substitute.For<IInteropPublisher>();
        var handler = new AppointmentBookedHandler(db, recipientResolver, publisher, NullLogger<AppointmentBookedHandler>.Instance);

        var attackerCloudPatientId = Guid.NewGuid();
        // Attacker presents identical name, DOB, and PIN, but with a different CloudPatientId
        var incomingEvent = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = attackerCloudPatientId,
            PatientFirstName = "Juan",
            PatientLastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1990, 1, 1),
            PhilHealthNumber = pin,
            PreferredDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            PreferredTime = "10:00"
        };

        var envelope = new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.PatientAppointmentBooked,
            From = Party.ForPatient(attackerCloudPatientId.ToString()),
            To = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            SentAtUtc = DateTime.UtcNow
        };
        var interopContext = new InteropMessageContext(envelope);

        // Act
        await handler.HandleAsync(incomingEvent, interopContext, CancellationToken.None);

        // Assert:
        // 1. Juan Dela Cruz's CloudPatientId must remain legitimateCloudPatientId (NOT overwritten!)
        var juan = await db.Patients.FirstAsync(p => p.Id == existingPatientId);
        juan.CloudPatientId.Should().Be(legitimateCloudPatientId);

        // 2. A separate patient was provisioned for attackerCloudPatientId
        var attackerPatient = await db.Patients.FirstOrDefaultAsync(p => p.CloudPatientId == attackerCloudPatientId);
        attackerPatient.Should().NotBeNull();
        attackerPatient!.Id.Should().NotBe(existingPatientId);
    }

    [Fact]
    public async Task AppointmentBookedHandler_WhenPhilHealthPinMatches_ButDateOfBirthMismatches_DoesNotHijackAccount()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var facility = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Jose Rizal Health"
        };
        db.Settings.Add(facility);

        var pin = "12-345678901-2";
        var existingPatientId = Guid.NewGuid();

        // Existing patient "Juan Dela Cruz" born 1990-01-01
        var existingPatient = new Patient
        {
            Id = existingPatientId,
            CloudPatientId = null,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-JUAN-01",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1990, 1, 1),
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "0918-000-0001"
        };
        db.Patients.Add(existingPatient);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var publisher = Substitute.For<IInteropPublisher>();
        var handler = new AppointmentBookedHandler(db, recipientResolver, publisher, NullLogger<AppointmentBookedHandler>.Instance);

        var attackerCloudPatientId = Guid.NewGuid();
        var incomingEvent = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = attackerCloudPatientId,
            PatientFirstName = "Juan",
            PatientLastName = "Dela Cruz", // Same name
            DateOfBirth = new DateOnly(1995, 5, 5), // Different DOB!
            PhilHealthNumber = pin,
            PreferredDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            PreferredTime = "10:00"
        };

        var envelope = new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.PatientAppointmentBooked,
            From = Party.ForPatient(attackerCloudPatientId.ToString()),
            To = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            SentAtUtc = DateTime.UtcNow
        };
        var interopContext = new InteropMessageContext(envelope);

        // Act
        await handler.HandleAsync(incomingEvent, interopContext, CancellationToken.None);

        // Assert:
        // Juan Dela Cruz's CloudPatientId must remain null (NOT hijacked!)
        var juan = await db.Patients.FirstAsync(p => p.Id == existingPatientId);
        juan.CloudPatientId.Should().BeNull();
    }

    // ── SECTION 6: Attachment Hijacking & Storage Side-Effect Probes ──

    [Fact]
    public async Task AppointmentBookedHandler_AttachedFiles_DoesNotHijackExistingPatientAttachment()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var facility = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Jose Rizal Health"
        };
        db.Settings.Add(facility);

        var victimPatientId = Guid.NewGuid();
        var victimPatient = new Patient
        {
            Id = victimPatientId,
            CloudPatientId = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-VICTIM-01",
            FirstName = "Victim",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1985, 3, 15),
            ContactNumber = "0919-111-2222"
        };
        db.Patients.Add(victimPatient);

        // Existing attachment belonging to Victim
        var sensitiveFileId = Guid.NewGuid();
        var victimAttachment = new RecordAttachment
        {
            Id = sensitiveFileId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = victimPatientId,
            RecordType = "LabResult",
            Title = "Victim Confidential Biopsy",
            FileName = "biopsy.pdf",
            StorageUri = $"tenants/{_tenantId}/clinics/{_clinicId}/records/{sensitiveFileId}.cez",
            DocumentDate = DateOnly.FromDateTime(DateTime.UtcNow)
        };
        db.RecordAttachments.Add(victimAttachment);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var publisher = Substitute.For<IInteropPublisher>();
        var handler = new AppointmentBookedHandler(db, recipientResolver, publisher, NullLogger<AppointmentBookedHandler>.Instance);

        var attackerCloudPatientId = Guid.NewGuid();
        // Attacker books an appointment and attempts to claim victim's fileId
        var incomingEvent = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = attackerCloudPatientId,
            PatientFirstName = "Attacker",
            PatientLastName = "User",
            DateOfBirth = new DateOnly(1998, 12, 1),
            PreferredDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            PreferredTime = "14:00",
            AttachedFiles = new List<BookedAttachmentItem>
            {
                new()
                {
                    FileId = sensitiveFileId,
                    FileName = "claimed_biopsy.pdf",
                    DocumentTypeCode = "lab-result",
                    SizeBytes = 2048,
                    MimeType = "application/pdf"
                }
            }
        };

        var envelope = new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.PatientAppointmentBooked,
            From = Party.ForPatient(attackerCloudPatientId.ToString()),
            To = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            SentAtUtc = DateTime.UtcNow
        };
        var interopContext = new InteropMessageContext(envelope);

        // Act
        await handler.HandleAsync(incomingEvent, interopContext, CancellationToken.None);

        // Assert: Victim's attachment PatientId MUST NOT be reassigned to attacker!
        var attachment = await db.RecordAttachments.FirstAsync(a => a.Id == sensitiveFileId);
        attachment.PatientId.Should().Be(victimPatientId, "victim's attachment must NOT be hijacked to attacker!");
    }

    [Fact]
    public async Task IntakePatientSharedFile_WhenCrossPatientAttempt_ChecksStorageCallOrder()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var attachmentRepo = TestDbHelper.CreateRepository<RecordAttachment>(db, sieve);

        var patientAId = Guid.NewGuid();
        var patientBId = Guid.NewGuid();
        var existingFileId = Guid.NewGuid();

        var existingAttachment = new RecordAttachment
        {
            Id = existingFileId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientAId,
            Title = "Patient A Blood Test",
            FileName = "cbc.pdf",
            StorageUri = $"tenants/{_tenantId}/clinics/{_clinicId}/records/{existingFileId}.cez"
        };
        await attachmentRepo.AddAsync(existingAttachment);
        await uow.SaveChangesAsync();

        var encryptionService = Substitute.For<IClinicEncryptionService>();
        encryptionService.EncryptAsync(Arg.Any<byte[]>(), Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(new ClinicEncryptedPayload([0x01, 0x02], "iv", "tag", "hash", 2, "wrappedKey"));

        var storageService = Substitute.For<IClinicStorageService>();

        var handler = new IntakePatientSharedFileCommandHandler(
            attachmentRepo,
            uow,
            clinicContext,
            encryptionService,
            storageService);

        var command = new IntakePatientSharedFileCommand(
            PatientId: patientBId,
            AppointmentId: null,
            ConsultationId: null,
            FileId: existingFileId,
            RecordType: "LabResult",
            Title: "Hijacked Attachment",
            FileName: "test.pdf",
            ContentType: "application/pdf",
            FileBytes: [0xAA, 0xBB]);

        // Act & Assert
        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*Cross-patient attachment linking is prohibited*");

        // Verify that storageService was NOT invoked and disk storage was NOT mutated
        var wasStorageMutated = storageService.ReceivedCalls().Any(c => c.GetMethodInfo().Name == nameof(IClinicStorageService.SaveEncryptedFileAsync));
        wasStorageMutated.Should().BeFalse("SaveEncryptedFileAsync must NOT be invoked when cross-patient attempt is detected, leaving victim's physical file on disk intact!");

        // Verify that CPU encryption was also aborted
        var wasEncrypted = encryptionService.ReceivedCalls().Any(c => c.GetMethodInfo().Name == nameof(IClinicEncryptionService.EncryptAsync));
        wasEncrypted.Should().BeFalse("EncryptAsync must NOT be invoked when cross-patient attempt is detected, preventing CPU exhaustion!");
    }

    [Fact]
    public async Task LocalClinicStorageService_UrlEncodedTraversal_MustThrowSecurityException()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "cez_storage_test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        try
        {
            var config = Substitute.For<Microsoft.Extensions.Configuration.IConfiguration>();
            config["Storage:BasePath"].Returns(tempDir);

            var storage = new LocalClinicStorageService(config, NullLogger<LocalClinicStorageService>.Instance);
            var attackKey = "%2e%2e/%2e%2e/etc/passwd";

            // Act & Assert: URL-encoded traversal key must throw SecurityException
            var act = () => storage.SaveEncryptedFileAsync(attackKey, [0x01, 0x02]);
            await act.Should().ThrowAsync<SecurityException>()
                .WithMessage("*Storage path traversal attempt detected*");

            var createdDir = Path.Combine(tempDir, "%2e%2e");
            Directory.Exists(createdDir).Should().BeFalse("literal %2e%2e folder must NOT be created when URL-encoded traversal is detected");
        }
        finally
        {
            if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public async Task UploadRecordingSegment_UrlEncodedTraversal_WithinSovereignPrefix_MustThrowForbiddenException()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(db, sieve);
        var segmentRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSegment>(db, sieve);
        var storageService = Substitute.For<IClinicStorageService>();

        var facilitySettings = new FacilitySettings
        {
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Test Clinic",
            TeleconsultRecordingPolicy = "WorkspaceVaultOnly"
        };
        await settingsRepo.AddAsync(facilitySettings);

        var sessionId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = Guid.NewGuid(),
            ConsultationId = Guid.NewGuid(),
            DoctorId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            DoctorName = "Dr. Santos",
            PatientName = "Maria Clara",
            ConsentStatus = "Consented",
            RecordingState = "ReadyToRecord"
        };
        await sessionRepo.AddAsync(session);
        await uow.SaveChangesAsync();

        var handler = new UploadRecordingSegmentCommandHandler(
            settingsRepo,
            sessionRepo,
            segmentRepo,
            uow,
            clinicContext,
            storageService,
            NullLogger<UploadRecordingSegmentCommandHandler>.Instance);

        // Key starts with valid sovereign prefix, but embeds %2e%2e/ to escape session boundary
        var attackKeyWithUrlEncodedDot = $"{_tenantId}/{_clinicId}/{sessionId}/%2e%2e/escape.cez";

        var command = new UploadRecordingSegmentCommand(
            sessionId,
            0,
            5000,
            attackKeyWithUrlEncodedDot,
            1024,
            "sha256",
            "iv",
            "tag");

        // Act & Assert: StorageKey with %2e%2e within prefix must throw ForbiddenException
        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*violates sovereign path isolation*");
    }
}
