using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Messaging.Handlers;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Comms;

/// <summary>
/// Empirical Adversarial Verification Suite for Challenger 2 (Milestone M3):
/// 1. Clinic CommsTicketController role claim boundaries (teleconsult:record strictly guarded by Doctor, Admin, or ConsultationsSign).
/// 2. Non-clinician roles (Nurse, Receptionist, Read-only) strictly blocked from teleconsult:record and teleconsult:call.
/// 3. Missing signing keys returning 503 Service Unavailable.
/// 4. Cryptographic validation of issued tickets against CommsTicketValidator.
/// 5. CommsTranscriptArchivedHandler and CommsAttachmentFiledHandler chart ingestion and WORM audit logging.
/// </summary>
public class ClinicCommsTicketAndArchivalAdversarialTests
{
    private readonly string _privKey;
    private readonly string _pubKey;
    private readonly string _clientId = "clinic-client-01";
    private readonly string _tenantId = "tenant-stjude";
    private readonly Guid _clinicId = Guid.NewGuid();

    public ClinicCommsTicketAndArchivalAdversarialTests()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        _privKey = ecdsa.ExportECPrivateKeyPem();
        _pubKey = ecdsa.ExportSubjectPublicKeyInfoPem();
    }

    private CommsTicketController CreateController(
        IClinicContext clinicContext,
        string? signingKey = null,
        string? clientId = null,
        ClaimsPrincipal? user = null)
    {
        var options = Options.Create(new InteropOptions
        {
            ClientId = clientId ?? _clientId,
            SigningKey = signingKey ?? _privKey
        });

        var config = new ConfigurationBuilder().Build();
        var controller = new CommsTicketController(options, clinicContext, config);

        var httpContext = new DefaultHttpContext();
        if (user != null)
        {
            httpContext.User = user;
        }
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };
        return controller;
    }

    private ApplicationDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var config = new ConfigurationBuilder().Build();
        var clinicCtx = Substitute.For<IClinicContext>();
        clinicCtx.TenantId.Returns(_tenantId);
        clinicCtx.ClinicId.Returns(_clinicId);
        return new ApplicationDbContext(options, config, clinicCtx);
    }

    // =========================================================================
    // SECTION 1: FACILITY TICKET ROLE CLAIM RESTRICTIONS (CLINIC API)
    // =========================================================================

    [Fact]
    public void IssueTicket_DoctorRole_ContainsTeleconsultRecordAndCall()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns(_tenantId);
        clinicContext.ClinicId.Returns(_clinicId);

        var claims = new[]
        {
            new Claim("sub", "doc-101"),
            new Claim("name", "Dr. Gregory House"),
            new Claim("tenant_id", _tenantId),
            new Claim("clinic_id", _clinicId.ToString()),
            new Claim("staff_role", "Doctor")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Facility"));

        var controller = CreateController(clinicContext, user: user);

        var result = controller.IssueTicket();
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;

        response.Succeeded.Should().BeTrue();
        response.Data.Should().NotBeNull();

        // Validate cryptographically
        var validation = CommsTicketValidator.Validate(response.Data!.Ticket, _pubKey, _tenantId, _clinicId.ToString());
        validation.IsValid.Should().BeTrue();
        validation.Payload!.Permissions.Should().Contain([
            CommsPermissions.MessagingRead,
            CommsPermissions.MessagingWrite,
            CommsPermissions.MessagingTriage,
            CommsPermissions.TeleconsultCall,
            CommsPermissions.TeleconsultRecord
        ]);
    }

    [Fact]
    public void IssueTicket_ConsultationsSignPermission_ContainsTeleconsultRecord()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns(_tenantId);
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(true);

        var claims = new[]
        {
            new Claim("sub", "signer-01"),
            new Claim("name", "Attending Clinician"),
            new Claim("tenant_id", _tenantId),
            new Claim("clinic_id", _clinicId.ToString()),
            new Claim("staff_role", "Clinician")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Facility"));

        var controller = CreateController(clinicContext, user: user);

        var result = controller.IssueTicket();
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;

        response.Succeeded.Should().BeTrue();
        var validation = CommsTicketValidator.Validate(response.Data!.Ticket, _pubKey, _tenantId, _clinicId.ToString());
        validation.IsValid.Should().BeTrue();
        validation.Payload!.Permissions.Should().Contain(CommsPermissions.TeleconsultRecord);
    }

    [Fact]
    public void IssueTicket_ConsultationsWriteWithoutSign_GrantsCall_NeverGrantsRecord()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns(_tenantId);
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);
        clinicContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(false);

        var claims = new[]
        {
            new Claim("sub", "resident-01"),
            new Claim("name", "Resident Physician"),
            new Claim("tenant_id", _tenantId),
            new Claim("clinic_id", _clinicId.ToString()),
            new Claim("staff_role", "Resident") // Not Doctor, Not Admin
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Facility"));

        var controller = CreateController(clinicContext, user: user);

        var result = controller.IssueTicket();
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;

        response.Succeeded.Should().BeTrue();
        var validation = CommsTicketValidator.Validate(response.Data!.Ticket, _pubKey, _tenantId, _clinicId.ToString());
        validation.IsValid.Should().BeTrue();
        validation.Payload!.Permissions.Should().Contain(CommsPermissions.TeleconsultCall);
        validation.Payload.Permissions.Should().NotContain(CommsPermissions.TeleconsultRecord,
            "non-signing resident must NEVER receive teleconsult:record permission");
    }

    [Fact]
    public void IssueTicket_NurseRole_GrantsTriage_NeverGrantsRecordOrCall()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns(_tenantId);
        clinicContext.ClinicId.Returns(_clinicId);

        var claims = new[]
        {
            new Claim("sub", "nurse-01"),
            new Claim("name", "Nurse Kelly"),
            new Claim("tenant_id", _tenantId),
            new Claim("clinic_id", _clinicId.ToString()),
            new Claim("staff_role", "Nurse")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Facility"));

        var controller = CreateController(clinicContext, user: user);

        var result = controller.IssueTicket();
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;

        response.Succeeded.Should().BeTrue();
        var validation = CommsTicketValidator.Validate(response.Data!.Ticket, _pubKey, _tenantId, _clinicId.ToString());
        validation.IsValid.Should().BeTrue();
        validation.Payload!.Permissions.Should().Contain([CommsPermissions.MessagingRead, CommsPermissions.MessagingWrite, CommsPermissions.MessagingTriage]);
        validation.Payload.Permissions.Should().NotContain(CommsPermissions.TeleconsultCall);
        validation.Payload.Permissions.Should().NotContain(CommsPermissions.TeleconsultRecord);
    }

    [Fact]
    public void IssueTicket_ReceptionistRole_GrantsTriage_NeverGrantsRecordOrCall()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns(_tenantId);
        clinicContext.ClinicId.Returns(_clinicId);

        var claims = new[]
        {
            new Claim("sub", "recep-01"),
            new Claim("name", "Front Desk Receptionist"),
            new Claim("tenant_id", _tenantId),
            new Claim("clinic_id", _clinicId.ToString()),
            new Claim("staff_role", "Receptionist")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Facility"));

        var controller = CreateController(clinicContext, user: user);

        var result = controller.IssueTicket();
        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;

        response.Succeeded.Should().BeTrue();
        var validation = CommsTicketValidator.Validate(response.Data!.Ticket, _pubKey, _tenantId, _clinicId.ToString());
        validation.IsValid.Should().BeTrue();
        validation.Payload!.Permissions.Should().Contain(CommsPermissions.MessagingTriage);
        validation.Payload.Permissions.Should().NotContain(CommsPermissions.TeleconsultCall);
        validation.Payload.Permissions.Should().NotContain(CommsPermissions.TeleconsultRecord);
    }

    [Fact]
    public void IssueTicket_UnconfiguredSigningKey_Returns503ServiceUnavailable()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim("staff_role", "Doctor")], "Facility"));

        var controller = CreateController(clinicContext, signingKey: string.Empty, user: user);

        var result = controller.IssueTicket();
        var statusResult = result.Result.Should().BeOfType<ObjectResult>().Subject;
        statusResult.StatusCode.Should().Be(StatusCodes.Status503ServiceUnavailable);

        var response = statusResult.Value.Should().BeOfType<ApiResponse<CommsTicketResponseDto>>().Subject;
        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("signing key is not configured");
    }

    // =========================================================================
    // SECTION 2: TRANSCRIPT ARCHIVAL & CHART ATTACHMENT INGESTION
    // =========================================================================

    [Fact]
    public async Task CommsTranscriptArchivedHandler_PersistsVerifiedClinicRecordAttachment_WithSha256AndAudit()
    {
        var db = CreateInMemoryDb();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var sha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        // Seed clinic settings for resolver
        db.ClinicSettings.Add(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Jude Clinic",
            IsDeleted = false
        });
        await db.SaveChangesAsync();

        var resolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new CommsTranscriptArchivedHandler(db, resolver, NullLogger<CommsTranscriptArchivedHandler>.Instance);

        var payload = new CommsTranscriptArchivedPayload(
            ConversationId: convId,
            TenantId: _tenantId,
            FacilityId: _clinicId.ToString(),
            FacilityType: "Clinic",
            PatientId: patientId,
            ContextType: "Appointment",
            ContextId: "appt-99",
            Category: MessageCategory.PostVisitFollowUp,
            Title: "Post-Visit Consultation Transcript",
            OpenedAtUtc: now.AddHours(-1),
            ClosedAtUtc: now,
            ClosedByStaffId: "doc-101",
            ClosedByStaffName: "Dr. Gregory House",
            TriageDisposition: TriageDisposition.Answered,
            DeclineReasonCode: null,
            TotalMessageCount: 5,
            PublicMessageCount: 3,
            TranscriptJson: "{\"ConversationId\":\"" + convId + "\"}",
            TranscriptMarkdown: "# Transcript",
            TranscriptSha256: sha256,
            Attachments: [],
            Version: 1,
            ArchivedAtUtc: now);

        var ctx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsTranscriptArchived,
            From = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic, service: InteropServices.Comms),
            To = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            CorrelationId = convId
        });

        await handler.HandleAsync(payload, ctx, CancellationToken.None);

        // ASSERT: Attachment saved with correct record type, SHA-256 hash, and Verified status
        var attachment = await db.RecordAttachments.FirstOrDefaultAsync(a => a.EncryptedHash == sha256);
        attachment.Should().NotBeNull();
        attachment!.RecordType.Should().Be("CommunicationTranscript");
        attachment.VerificationStatus.Should().Be("Verified");
        attachment.ClinicId.Should().Be(_clinicId);
        attachment.PatientId.Should().Be(patientId);
        attachment.EncryptedHash.Should().Be(sha256);

        // ASSERT: WORM Audit entry saved
        var audit = await db.ClinicAuditEntries.FirstOrDefaultAsync(e => e.Action == "comms.transcript.archived");
        audit.Should().NotBeNull();
        audit!.ActorName.Should().Be("Dr. Gregory House");
        audit.TargetEntityType.Should().Be("ClinicRecordAttachment");
        audit.Outcome.Should().Be(ClinicAuditOutcomes.Success);
    }

    [Fact]
    public async Task CommsAttachmentFiledHandler_PersistsVerifiedRecordAttachment_WithSha256AndAudit()
    {
        var db = CreateInMemoryDb();
        var attId = Guid.NewGuid();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var sha256 = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

        // Seed clinic settings for resolver
        db.ClinicSettings.Add(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Jude Clinic",
            IsDeleted = false
        });
        await db.SaveChangesAsync();

        var resolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new CommsAttachmentFiledHandler(db, resolver, NullLogger<CommsAttachmentFiledHandler>.Instance);

        var payload = new CommsAttachmentFiledPayload(
            AttachmentId: attId,
            MessageId: null,
            ConversationId: convId,
            TenantId: _tenantId,
            FacilityId: _clinicId.ToString(),
            PatientId: patientId,
            ConsultationId: null,
            RecordType: "DiagnosticAttachment",
            Title: "Routine Blood Test",
            OriginalFileName: "blood_test_results.pdf",
            SafeFileName: "blood_test_results.pdf",
            ContentType: "application/pdf",
            FileSizeBytes: 4096,
            SHA256Checksum: sha256,
            StoragePath: "storage/attachments/blood_test_results.pdf",
            FiledByStaffId: Guid.NewGuid().ToString(),
            FiledByStaffName: "Nurse Kelly",
            FiledAtUtc: now,
            Notes: "Verified normal results",
            Version: 1);

        var ctx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsAttachmentFiled,
            From = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic, service: InteropServices.Comms),
            To = Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            CorrelationId = attId
        });

        await handler.HandleAsync(payload, ctx, CancellationToken.None);

        // ASSERT: Attachment saved with clean checksum and Verified status
        var attachment = await db.RecordAttachments.FirstOrDefaultAsync(a => a.EncryptedHash == sha256);
        attachment.Should().NotBeNull();
        attachment!.RecordType.Should().Be("DiagnosticAttachment");
        attachment.VerificationStatus.Should().Be("Verified");
        attachment.FileName.Should().Be("blood_test_results.pdf");
        attachment.EncryptedHash.Should().Be(sha256);

        // ASSERT: WORM Audit entry saved
        var audit = await db.ClinicAuditEntries.FirstOrDefaultAsync(e => e.Action == "comms.attachment.filed");
        audit.Should().NotBeNull();
        audit!.ActorName.Should().Be("Nurse Kelly");
        audit.TargetEntityType.Should().Be("ClinicRecordAttachment");
        audit.Outcome.Should().Be(ClinicAuditOutcomes.Success);
    }
}
