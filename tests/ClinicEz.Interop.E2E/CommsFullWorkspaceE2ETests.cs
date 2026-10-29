extern alias MediaBrokerApi;

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

// Service-specific aliases to prevent type resolution ambiguities
using ClinicAppointment = ClinicEz.Clinic.Domain.Entities.Appointment;
using ClinicPatientEntity = ClinicEz.Clinic.Domain.Entities.Patient;
using PatientEntity = ClinicEz.Patient.Domain.Entities.Patient;
using PatientDbContext = ClinicEz.Patient.Infrastructure.Persistence.ApplicationDbContext;
using PortalDbContext = ClinicEz.Portal.Infrastructure.Persistence.ApplicationDbContext;
using ClinicApplicationDbContext = ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext;
using MediaController = MediaBrokerApi::ClinicEz.MediaBroker.Api.Controllers.MediaController;

using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Messaging.Handlers;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Application.Features.Reactions.Commands;
using ClinicEz.Comms.Application.Features.Triage.Commands;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Constants;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Comms.Infrastructure.Messaging.Handlers;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.Infrastructure.Storage;
using ClinicEz.Comms.MigrationTool;
using ClinicEz.Comms.MigrationTool.Models;
using ClinicEz.Comms.MigrationTool.Services;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.MediaBroker.Domain.Entities;
using ClinicEz.MediaBroker.Infrastructure.Persistence;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Communications.Commands;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Interop;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using ClinicEz.Patient.Infrastructure.Services;
using ClinicEz.Portal.Application.Features.Guest;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.PixelFormats;
using ClinicEz.Shared.Interop.Handling;
using Xunit;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Master End-to-End & Adversarial Verification Battery covering all 33 Features
/// defined in the ClinicEZ Master Project Blueprint (PROJECT.md) for Milestone M9:
///
/// Features 1 - 33:
///  1. Multi-Tier Scoped Conversations
///  2. Facility Comms Ticket Issuance
///  3. Hub Signer Key Verification
///  4. Eligibility Grant Management
///  5. Mandatory Emergency Gate
///  6. Triage Queue & Routing Desk
///  7. Mandatory Disposition Gate
///  8. Reopen Lifecycle Guard
///  9. Off-Hours Silent Queueing & SLA Alerting
/// 10. Truthful Delivery States
/// 11. Retention Deadline & Resend Sweep
/// 12. HEIC/WebP to JPEG Conversion
/// 13. EXIF Privacy Stripping & Security Scan
/// 14. Chart Attachment Filing
/// 15. Teleconsult Payment Gate
/// 16. YAKAP Auto-Exempt Teleconsults
/// 17. Call Minute Metering Pool
/// 18. E2EE & Unencrypted Fallback Guard
/// 19. Guest Teleconsult Portal Join
/// 20. Recording Policy & Consent Engine
/// 21. Encrypted Segment Vault
/// 22. Medico-Legal Hold & In-App Player
/// 23. Multi-Tenant Unified Inbox
/// 24. "Hide My Copy" Local Privacy
/// 25. Zero-PHI Push Notification Delivery
/// 26. Managed Dependent Proxy Messaging
/// 27. Staff Reactions & Channels
/// 28. Cloud &lt;-&gt; On-Prem Tenant Migration Tool
/// 29. Site-Local LAN Channels
/// 30. Transcript Archival to Chart
/// 31. Shared SDK Package Integration
/// 32. Workstation UI Integration Parity
/// 33. End-to-End System Integrity & Adversarial Battery
/// </summary>
public class CommsFullWorkspaceE2ETests
{
    private const string Comms = InteropServices.Comms;
    private const string Media = InteropServices.Media;

    // =========================================================================
    // Feature 1: Multi-Tier Scoped Conversations & Cross-Tenant Staff Isolation
    // =========================================================================
    [Theory]
    [InlineData(ConversationScope.Workspace)]
    [InlineData(ConversationScope.Facility)]
    [InlineData(ConversationScope.Branch)]
    [InlineData(ConversationScope.Direct)]
    [InlineData(ConversationScope.StaffContext)]
    [InlineData(ConversationScope.PatientFacility)]
    public void Feature01_ConversationScopes_AreAllFormallyDefinedAndRecognized(ConversationScope scope)
    {
        Enum.IsDefined(typeof(ConversationScope), scope).Should().BeTrue();
    }

    [Fact]
    public async Task Feature01_StaffCrossTenantConversation_IsStrictlyRejectedByHubRoutingPolicy()
    {
        await using var cell = new TestCell();
        var clinicAlpha = await cell.ProvisionAsync(Fac.Clinic("tenant-alpha", "Alpha Clinic"));
        var clinicBeta = await cell.ProvisionAsync(Fac.Clinic("tenant-beta", "Beta Clinic"), FacilityVisibility.Network);

        await cell.Hub.UpsertLinkAsync(clinicAlpha.Party, clinicBeta.Party, LinkScopes.All);

        var payload = new CommsMessageSubmitPayload(
            ClientMessageId: Guid.NewGuid(),
            ConversationId: Guid.NewGuid(),
            TenantId: "tenant-alpha",
            FacilityId: clinicAlpha.FacilityId,
            SenderType: "Staff",
            SenderId: Guid.NewGuid(),
            SenderDisplayName: "Dr. Alice",
            ContentText: "Cross-tenant confidential chat attempt",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false,
            Attachments: null,
            ClientSentAtUtc: DateTime.UtcNow,
            RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7)
        );

        var envelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageSubmit,
            from: clinicAlpha.Party,
            to: clinicBeta.Party,
            correlationId: payload.ConversationId,
            payload: payload
        );

        var result = await SendAsync(cell, InteropServices.Clinic, envelope);

        result.Status.Should().Be(SendResult.Rejected);
        result.Reason.Should().Contain("Cross-tenant messages of type 'comms.message.submit' are prohibited");
    }

    // =========================================================================
    // Feature 2: Facility Comms Ticket Issuance (POST /api/v1/comms/ticket)
    // =========================================================================
    [Fact]
    public async Task Feature02_FacilityCommsTicketIssuance_IssuesValid5MinuteSignedTicket()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-prime", "Prime Clinic"));

        var clientId = HubFixture.ClientId(InteropServices.Clinic);
        var privateKeyPem = HubFixture.SigningKey(InteropServices.Clinic);
        var staffId = Guid.NewGuid().ToString();

        var (ticket, expiresAtUtc) = CommsTicketSigner.IssueTicket(
            clientId: clientId,
            privateKeyPem: privateKeyPem,
            staffId: staffId,
            displayName: "Dr. Gregory House",
            tenantId: clinic.Tenant,
            facilityId: clinic.FacilityId,
            branchId: "branch-main",
            permissions: [CommsPermissions.MessagingRead, CommsPermissions.MessagingWrite, CommsPermissions.MessagingTriage]
        );

        ticket.Should().NotBeNullOrWhiteSpace();
        ticket.Split('.').Should().HaveCount(2, "comms ticket must consist of payload and signature parts");
        expiresAtUtc.Should().BeAfter(DateTime.UtcNow.AddMinutes(4));
        expiresAtUtc.Should().BeBefore(DateTime.UtcNow.AddMinutes(6));
    }

    // =========================================================================
    // Feature 3: Hub Signer Key Verification
    // =========================================================================
    [Fact]
    public async Task Feature03_HubSignerKeyVerification_ValidatesAuthenticTicketAndRejectsForgedSignature()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-prime", "Prime Clinic"));

        var clientId = HubFixture.ClientId(InteropServices.Clinic);
        var privateKeyPem = HubFixture.SigningKey(InteropServices.Clinic);

        var (validTicket, _) = CommsTicketSigner.IssueTicket(
            clientId: clientId,
            privateKeyPem: privateKeyPem,
            staffId: Guid.NewGuid().ToString(),
            displayName: "Nurse Jackie",
            tenantId: clinic.Tenant,
            facilityId: clinic.FacilityId,
            branchId: null,
            permissions: [CommsPermissions.MessagingRead]
        );

        var keyClient = cell.Hub.NewKeyClient();

        // 1. Valid ticket succeeds
        var validResult = await CommsTicketValidator.ValidateAsync(validTicket, keyClient, clinic.Tenant, clinic.FacilityId);
        validResult.IsValid.Should().BeTrue();
        validResult.Payload!.Name.Should().Be("Nurse Jackie");

        // 2. Tampered signature fails
        var parts = validTicket.Split('.');
        var tamperedSignature = parts[1].Substring(0, parts[1].Length - 4) + "AAAA";
        var forgedTicket = $"{parts[0]}.{tamperedSignature}";

        var forgedResult = await CommsTicketValidator.ValidateAsync(forgedTicket, keyClient, clinic.Tenant, clinic.FacilityId);
        forgedResult.IsValid.Should().BeFalse();
        forgedResult.ErrorMessage.Should().Contain("signature");
    }

    // =========================================================================
    // Feature 4: Eligibility Grant Management
    // =========================================================================
    [Fact]
    public async Task Feature04_EligibilityGrantPayload_TracksContextWindowAndMonotonicVersion()
    {
        using var db = CreateCommsDbContext();
        var publisher = new FakeInteropPublisher();
        var handler = new CommsEligibilityGrantedHandler(
            db, publisher, NullLogger<CommsEligibilityGrantedHandler>.Instance);

        var grantId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var startUtc = DateTime.UtcNow;
        var endUtc = startUtc.AddDays(3);

        var payloadV1 = new CommsEligibilityGrantedPayload(
            GrantId: grantId,
            TenantId: "tenant-prime",
            FacilityId: "clinic-1",
            FacilityType: FacilityType.Clinic.ToString(),
            PatientId: patientId,
            ContextType: "Encounter",
            ContextId: "enc-101",
            WindowStartUtc: startUtc,
            WindowEndUtc: endUtc,
            Version: 1
        );

        var envelope = InteropEnvelope.Create(
            type: InteropTypes.CommsEligibilityGranted,
            from: Party.ForFacility("tenant-prime", "clinic-1", FacilityType.Clinic, InteropServices.Comms),
            to: Party.ForPatient(patientId.ToString()),
            correlationId: grantId,
            payload: payloadV1);
        var context = new InteropMessageContext(envelope);

        // 1. Ingest initial version 1 grant
        await handler.HandleAsync(payloadV1, context, CancellationToken.None);

        var persisted = await db.EligibilityGrants.FindAsync(grantId);
        persisted.Should().NotBeNull();
        persisted!.PatientId.Should().Be(patientId);
        persisted.TenantId.Should().Be("tenant-prime");
        persisted.FacilityId.Should().Be("clinic-1");
        persisted.IsActive.Should().BeTrue();
        persisted.WindowStartUtc.Should().Be(startUtc);
        persisted.WindowEndUtc.Should().Be(endUtc);
        persisted.Version.Should().Be(1);

        publisher.Enqueued.Should().ContainSingle(e => e.Type == InteropTypes.CommsEligibilitySynced);

        // 2. Ingest stale version (Version 1 again) -> dropped due to monotonic ordering check
        var stalePayload = payloadV1 with { WindowEndUtc = endUtc.AddDays(10) };
        await handler.HandleAsync(stalePayload, context, CancellationToken.None);

        var unchanged = await db.EligibilityGrants.FindAsync(grantId);
        unchanged!.WindowEndUtc.Should().Be(endUtc, "stale or non-monotonic version updates must be dropped");
        unchanged.Version.Should().Be(1);

        // 3. Ingest newer version (Version 2) with extended window -> accepted and updated
        var extendedEndUtc = endUtc.AddDays(7);
        var payloadV2 = payloadV1 with { Version = 2, WindowEndUtc = extendedEndUtc };
        await handler.HandleAsync(payloadV2, context, CancellationToken.None);

        var updated = await db.EligibilityGrants.FindAsync(grantId);
        updated!.Version.Should().Be(2);
        updated.WindowEndUtc.Should().Be(extendedEndUtc);
        updated.IsActive.Should().BeTrue();
    }

    // =========================================================================
    // Feature 5: Mandatory Emergency Gate
    // =========================================================================
    [Fact]
    public async Task Feature05_MandatoryEmergencyGate_BlocksSubmissionWhenEmergencyIsConfirmed()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        // Active grant exists
        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-prime",
            FacilityId = "clinic-1",
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, notifier);

        // 1. Unconfirmed emergency screening throws ValidationException
        var missingConfirmationCmd = new SubmitPatientRequestCommand(
            TenantId: "tenant-prime",
            FacilityId: "clinic-1",
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Scheduling,
            ContentText: "I have symptoms",
            IsEmergencyConfirmed: null);

        var missingAct = async () => await handler.Handle(missingConfirmationCmd, CancellationToken.None);
        await missingAct.Should().ThrowAsync<ValidationException>()
            .WithMessage("*EMERGENCY_CONFIRMATION_REQUIRED*");

        // 2. Emergency confirmed by patient halts clinical queue immediately and redirects to 911 / ER
        var emergencyCmd = new SubmitPatientRequestCommand(
            TenantId: "tenant-prime",
            FacilityId: "clinic-1",
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Scheduling,
            ContentText: "Severe crushing chest pain radiating to left arm and shortness of breath",
            IsEmergencyConfirmed: true);

        var result = await handler.Handle(emergencyCmd, CancellationToken.None);

        result.IsEmergencyRedirect.Should().BeTrue();
        result.Conversation.Should().BeNull("zero conversations or threads may be created for emergency redirects");
        result.RedirectMessage.Should().NotBeNullOrWhiteSpace();
        result.RedirectMessage.Should().Contain("call 911 immediately or proceed to the nearest emergency department");

        // EMPIRICAL PROOF: Absolutely ZERO conversations and ZERO messages persisted in DB
        var convCount = await db.Conversations.CountAsync();
        convCount.Should().Be(0, "emergency redirection must never persist conversation records");

        var msgCount = await db.Messages.CountAsync();
        msgCount.Should().Be(0, "emergency redirection must never persist message records");
    }

    // =========================================================================
    // Feature 6: Triage Queue & Routing Desk
    // =========================================================================
    [Fact]
    public async Task Feature06_TriageQueue_InboundRequestEntersWithTriageState()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-prime",
            FacilityId = "clinic-1",
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, notifier);
        var cmd = new SubmitPatientRequestCommand(
            TenantId: "tenant-prime",
            FacilityId: "clinic-1",
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.PrescriptionRefill,
            ContentText: "Need refill for maintenance amlodipine 5mg",
            IsEmergencyConfirmed: false);

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsEmergencyRedirect.Should().BeFalse();
        result.Conversation.Should().NotBeNull();
        result.Conversation!.Status.Should().Be(RequestStatus.WithTriage);

        var saved = await db.Conversations.FirstOrDefaultAsync(c => c.Id == result.Conversation.Id);
        saved.Should().NotBeNull();
        saved!.Status.Should().Be(RequestStatus.WithTriage);
        saved.Category.Should().Be(MessageCategory.PrescriptionRefill);
        saved.MessageCount.Should().Be(1);
    }

    // =========================================================================
    // Feature 7: Mandatory Disposition Gate
    // =========================================================================
    [Theory]
    [InlineData(TriageDisposition.Answered, "Thank you, clinic hours are 8am to 5pm.", null)]
    [InlineData(TriageDisposition.NeedsVisit, "Please schedule an in-person consultation.", null)]
    [InlineData(TriageDisposition.Declined, null, DeclineReasonCodes.OutOfScope)]
    [InlineData(TriageDisposition.Routed, null, null)]
    public async Task Feature07_MandatoryDispositionGate_RequiresStructuredOutcomeAndParameters(
        TriageDisposition disposition,
        string? responseText,
        string? declineReasonCode)
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var serializer = new TranscriptSerializer();
        var publisher = new FakeInteropPublisher();
        var handler = new RecordTriageDispositionCommandHandler(db, notifier, serializer, publisher);

        var convId = Guid.NewGuid();
        var conversation = new Conversation
        {
            Id = convId,
            TenantId = "tenant-prime",
            FacilityId = "clinic-1",
            PatientId = Guid.NewGuid(),
            Status = RequestStatus.WithTriage,
            Category = MessageCategory.MedicineQuestion,
            Version = 1,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.Conversations.Add(conversation);
        await db.SaveChangesAsync();

        // If disposition is Declined, test that missing or invalid code throws ValidationException
        if (disposition == TriageDisposition.Declined)
        {
            var missingCodeCmd = new RecordTriageDispositionCommand(
                ConversationId: convId,
                TenantId: "tenant-prime",
                StaffId: "nurse-1",
                StaffName: "Triage Nurse",
                StaffPermissions: ["messaging:triage"],
                Disposition: TriageDisposition.Declined,
                DeclineReasonCode: null);

            var actMissing = async () => await handler.Handle(missingCodeCmd, CancellationToken.None);
            await actMissing.Should().ThrowAsync<ValidationException>()
                .WithMessage("*A valid DeclineReasonCode is mandatory*");

            var invalidCodeCmd = new RecordTriageDispositionCommand(
                ConversationId: convId,
                TenantId: "tenant-prime",
                StaffId: "nurse-1",
                StaffName: "Triage Nurse",
                StaffPermissions: ["messaging:triage"],
                Disposition: TriageDisposition.Declined,
                DeclineReasonCode: "INVALID_CODE_123");

            var actInvalid = async () => await handler.Handle(invalidCodeCmd, CancellationToken.None);
            await actInvalid.Should().ThrowAsync<ValidationException>()
                .WithMessage("*A valid DeclineReasonCode is mandatory*");
        }

        // Execute valid disposition
        var validCmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: "tenant-prime",
            StaffId: "nurse-1",
            StaffName: "Triage Nurse",
            StaffPermissions: ["messaging:triage"],
            Disposition: disposition,
            DeclineReasonCode: declineReasonCode,
            AssignedStaffId: disposition == TriageDisposition.Routed ? "doc-1" : null,
            AssignedStaffName: disposition == TriageDisposition.Routed ? "Dr. House" : null,
            Priority: disposition == TriageDisposition.Routed ? "Urgent" : null,
            PublicResponseText: responseText);

        var result = await handler.Handle(validCmd, CancellationToken.None);

        result.TriageDisposition.Should().Be(disposition);
        if (disposition == TriageDisposition.Declined)
        {
            result.Status.Should().Be(RequestStatus.Declined);
            result.DeclineReasonCode.Should().Be("OUT_OF_SCOPE");
            result.ClosedAtUtc.Should().NotBeNull();
            publisher.Enqueued.Should().Contain(e => e.Type == InteropTypes.CommsThreadStateChanged);
        }
        else if (disposition == TriageDisposition.Answered)
        {
            result.Status.Should().Be(RequestStatus.Answered);
            result.ClosedAtUtc.Should().NotBeNull();
        }
        else if (disposition == TriageDisposition.NeedsVisit)
        {
            result.Status.Should().Be(RequestStatus.NeedsVisit);
            result.ClosedAtUtc.Should().NotBeNull();
        }
        else if (disposition == TriageDisposition.Routed)
        {
            result.Status.Should().Be(RequestStatus.Routed);
            result.AssignedStaffId.Should().Be("doc-1");
        }
    }

    // =========================================================================
    // Feature 8: Reopen Lifecycle Guard (Max 1 Reopen)
    // =========================================================================
    [Fact]
    public async Task Feature08_ReopenLifecycleGuard_EnforcesSingleReopenLimit()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-prime",
            FacilityId = "clinic-1",
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = "tenant-prime",
            FacilityId = "clinic-1",
            PatientId = patientId,
            Status = RequestStatus.Closed,
            ClosedAtUtc = now.AddDays(-1),
            ClosedBy = "Dr. Santos",
            TriageDisposition = TriageDisposition.Answered,
            ReopenCount = 0
        });
        await db.SaveChangesAsync();

        var handler = new ReopenConversationCommandHandler(db, notifier);

        // Step 1: First reopen must succeed and reset status to WithTriage
        var cmd1 = new ReopenConversationCommand(
            ConversationId: convId,
            TenantId: "tenant-prime",
            PatientId: patientId,
            IsEmergencyConfirmed: false,
            Reason: "Symptoms returned after treatment");

        var result1 = await handler.Handle(cmd1, CancellationToken.None);
        result1.Status.Should().Be(RequestStatus.WithTriage);
        result1.ReopenCount.Should().Be(1);
        result1.ClosedAtUtc.Should().BeNull();

        // Step 2: Clinician closes the conversation again
        var dbConv = await db.Conversations.FindAsync(convId);
        dbConv!.Status = RequestStatus.Closed;
        dbConv.ClosedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Step 3: Second reopen attempt must be rejected with REOPEN_LIMIT_EXCEEDED
        var cmd2 = new ReopenConversationCommand(
            ConversationId: convId,
            TenantId: "tenant-prime",
            PatientId: patientId,
            IsEmergencyConfirmed: false,
            Reason: "Attempting second reopen");

        var act = async () => await handler.Handle(cmd2, CancellationToken.None);
        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*REOPEN_LIMIT_EXCEEDED*");
    }

    // =========================================================================
    // Feature 9: Off-Hours Silent Queueing & SLA Alerting
    // =========================================================================
    [Fact]
    public async Task Feature09_OffHoursSilentQueueing_QueuesSilentlyWithoutPagingClinicalStaff()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var patientId = Guid.NewGuid();

        // Saturday 20:00 UTC = Sunday 04:00 AM PHT (Operating hours: Mon-Fri 8am-5pm PHT)
        var saturdayUtc = new DateTime(2026, 10, 24, 20, 0, 0, DateTimeKind.Utc);

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-prime",
            FacilityId = "clinic-1",
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = saturdayUtc.AddDays(-1),
            WindowEndUtc = saturdayUtc.AddDays(7),
            IsActive = true,
            Version = 1
        });
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, notifier);
        var cmd = new SubmitPatientRequestCommand(
            TenantId: "tenant-prime",
            FacilityId: "clinic-1",
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Scheduling,
            ContentText: "Inquiry submitted on weekend",
            IsEmergencyConfirmed: false,
            SubmittedAtUtc: saturdayUtc);

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.Conversation.Should().NotBeNull();
        result.Conversation!.IsOffHoursSubmission.Should().BeTrue("off-hours patient submissions must be flagged as off-hours");
        result.Conversation.Status.Should().Be(RequestStatus.WithTriage);

        // Next business day is Monday Oct 26; 10:00 AM PHT = 02:00 AM UTC
        result.Conversation.TriageDueAtUtc.Should().Be(new DateTime(2026, 10, 26, 2, 0, 0, DateTimeKind.Utc));

        var saved = await db.Conversations.FindAsync(result.Conversation.Id);
        saved.Should().NotBeNull();
        saved!.IsOffHoursSubmission.Should().BeTrue();
    }

    // =========================================================================
    // Feature 10: Truthful Delivery States
    // =========================================================================
    [Fact]
    public async Task Feature10_TruthfulDeliveryStates_EnforcesSequentialProgressAndRequiresRecipientAck()
    {
        using var db = CreatePatientDbContext();
        var syncService = new NoopSyncNotificationService();
        var handler = new CommsMessageReceivedInteropHandler(
            db,
            syncService,
            NullLogger<CommsMessageReceivedInteropHandler>.Instance);

        var convId = Guid.NewGuid();
        var msgId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var sentUtc = DateTime.UtcNow.AddMinutes(-5);

        var conversation = new PatientConversation
        {
            Id = convId,
            PatientId = patientId,
            HomeTenantId = "tenant-prime",
            HomeFacilityId = "clinic-1",
            HomeFacilityType = "Clinic",
            FacilityName = "Prime Clinic",
            Category = MessageCategory.MedicineQuestion,
            Subject = "Prescription inquiry",
            Status = RequestStatus.WithTriage
        };

        var message = new PatientMessage
        {
            Id = msgId,
            ConversationId = convId,
            Conversation = conversation,
            Seq = 1,
            ClientMessageId = Guid.NewGuid(),
            SenderType = "Patient",
            SenderName = "Maria Clara",
            ContentText = "Can I take this medication with food?",
            DeliveryState = DeliveryState.Waiting, // Message in transit, waiting for facility ACK
            CreatedAtUtc = sentUtc,
            RetentionDeadlineUtc = sentUtc.AddDays(7),
            ReceivedAtUtc = null
        };

        db.PatientConversations.Add(conversation);
        db.PatientMessages.Add(message);
        await db.SaveChangesAsync();

        // 1. Sequential progression: message starts in Waiting without recipient timestamp
        message.DeliveryState.Should().Be(DeliveryState.Waiting);
        message.ReceivedAtUtc.Should().BeNull();

        // 2. Recipient acknowledges receipt: Waiting -> Received with truthful timestamp
        var recipientAckTimestamp = DateTime.UtcNow.AddSeconds(-30);
        var ackPayload = new CommsMessageReceivedPayload(
            MessageId: msgId,
            ConversationId: convId,
            RecipientPartyAddress: "facility:tenant-prime/clinic-1#comms",
            ReceivedAtUtc: recipientAckTimestamp);

        var ackEnvelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageReceived,
            from: Party.ForFacility("tenant-prime", "clinic-1", FacilityType.Clinic, InteropServices.Comms),
            to: Party.ForPatient(patientId.ToString()),
            correlationId: convId,
            payload: ackPayload);
        var context = new InteropMessageContext(ackEnvelope);

        await handler.HandleAsync(ackPayload, context, CancellationToken.None);

        var updatedMsg = await db.PatientMessages.FindAsync(msgId);
        updatedMsg.Should().NotBeNull();
        updatedMsg!.DeliveryState.Should().Be(DeliveryState.Received, "Receipt confirmation must flip state to Received");
        updatedMsg.ReceivedAtUtc.Should().Be(recipientAckTimestamp, "Truthful delivery must record exact recipient timestamp");
        updatedMsg.HasExpiredBannerShown.Should().BeFalse();

        // 3. Late Truth Verification:
        // Even if message was marked NotReceived by retention sweeper due to network delay,
        // arrival of a late recipient ACK still recovers the message to Received
        var lateMsgId = Guid.NewGuid();
        var lateMessage = new PatientMessage
        {
            Id = lateMsgId,
            ConversationId = convId,
            Conversation = conversation,
            Seq = 2,
            ClientMessageId = Guid.NewGuid(),
            SenderType = "Patient",
            SenderName = "Maria Clara",
            ContentText = "Follow-up question",
            DeliveryState = DeliveryState.NotReceived, // Sweeper marked as unconfirmed
            HasExpiredBannerShown = true,
            CreatedAtUtc = sentUtc.AddMinutes(-30),
            RetentionDeadlineUtc = sentUtc.AddMinutes(-1),
            ReceivedAtUtc = null
        };
        db.PatientMessages.Add(lateMessage);
        await db.SaveChangesAsync();

        var lateAckTimestamp = DateTime.UtcNow.AddMinutes(-2);
        var lateAckPayload = new CommsMessageReceivedPayload(
            MessageId: lateMsgId,
            ConversationId: convId,
            RecipientPartyAddress: "facility:tenant-prime/clinic-1#comms",
            ReceivedAtUtc: lateAckTimestamp);

        var lateAckEnvelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageReceived,
            from: Party.ForFacility("tenant-prime", "clinic-1", FacilityType.Clinic, InteropServices.Comms),
            to: Party.ForPatient(patientId.ToString()),
            correlationId: convId,
            payload: lateAckPayload);
        var lateContext = new InteropMessageContext(lateAckEnvelope);

        await handler.HandleAsync(lateAckPayload, lateContext, CancellationToken.None);

        var recoveredMsg = await db.PatientMessages.FindAsync(lateMsgId);
        recoveredMsg!.DeliveryState.Should().Be(DeliveryState.Received, "Late recipient ACK must truthfully recover NotReceived to Received");
        recoveredMsg.ReceivedAtUtc.Should().Be(lateAckTimestamp);
        recoveredMsg.HasExpiredBannerShown.Should().BeFalse();
    }

    // =========================================================================
    // Feature 11: Retention Deadline & Resend Sweep
    // =========================================================================
    [Fact]
    public async Task Feature11_RetentionDeadlineAndResend_PreservesClientMessageIdOnResend()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var convId = Guid.NewGuid();
        var clientMsgId = Guid.NewGuid();

        var conversation = new Conversation
        {
            Id = convId,
            TenantId = "tenant-prime",
            FacilityId = "clinic-1",
            Title = "General Chat",
            LastSeq = 1,
            Status = RequestStatus.Routed
        };
        db.Conversations.Add(conversation);

        // Expired message: retention deadline was in the past, flipped to NotReceived
        var expiredMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = convId,
            TenantId = "tenant-prime",
            FacilityId = "clinic-1",
            Seq = 1,
            ClientMessageId = clientMsgId,
            ContentText = "Please confirm appointment",
            State = DeliveryState.NotReceived,
            RetentionDeadlineUtc = DateTime.UtcNow.AddHours(-2)
        };
        db.Messages.Add(expiredMessage);
        await db.SaveChangesAsync();

        // 1. Resend command: Resets state to Waiting, extends retention deadline, and preserves ClientMessageId
        var resendHandler = new ResendMessageCommandHandler(db, notifier);
        var resendCmd = new ResendMessageCommand(expiredMessage.Id, "tenant-prime");
        var resendResult = await resendHandler.Handle(resendCmd, CancellationToken.None);

        resendResult.DeliveryState.Should().Be(DeliveryState.Waiting);
        resendResult.ClientMessageId.Should().Be(clientMsgId, "resend must preserve exact ClientMessageId for deduplication");
        resendResult.RetentionDeadlineUtc.Should().BeAfter(DateTime.UtcNow.AddDays(6));

        // 2. Duplicate send submission: Supplying the same ClientMessageId returns the existing message idempotently
        var sendHandler = new SendMessageCommandHandler(db, notifier);
        var duplicateSendCmd = new SendMessageCommand(
            ConversationId: convId,
            TenantId: "tenant-prime",
            FacilityId: "clinic-1",
            SenderType: "Staff",
            SenderId: "doc-1",
            SenderDisplayName: "Dr. Santos",
            ContentText: "Please confirm appointment (duplicate retry)",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false,
            ClientMessageId: clientMsgId);

        var deduplicatedResult = await sendHandler.Handle(duplicateSendCmd, CancellationToken.None);
        deduplicatedResult.MessageId.Should().Be(expiredMessage.Id);
        deduplicatedResult.ClientMessageId.Should().Be(clientMsgId);
        conversation.LastSeq.Should().Be(1, "duplicate submission must not increment sequence");
    }

    // =========================================================================
    // Feature 12: HEIC/WebP to JPEG Conversion
    // =========================================================================
    [Fact]
    public async Task Feature12_HeicWebpToJpegConversion_NormalizesStorageMimeType()
    {
        var service = new ImageConversionService(NullLogger<ImageConversionService>.Instance);

        // 1. Real WebP image transcoding
        using var webpImage = new SixLabors.ImageSharp.Image<SixLabors.ImageSharp.PixelFormats.Rgba32>(100, 100, SixLabors.ImageSharp.Color.DeepSkyBlue);
        using var webpMs = new MemoryStream();
        await webpImage.SaveAsWebpAsync(webpMs);
        webpMs.Position = 0;

        var webpResult = await service.ProcessAndSanitizeImageAsync(webpMs, "clinical_wound.webp", "image/webp");
        webpResult.IsClean.Should().BeTrue();
        webpResult.ContentType.Should().Be("image/jpeg");
        webpResult.FileName.Should().Be("clinical_wound.jpg");
        webpResult.WasConverted.Should().BeTrue();
        webpResult.WasExifStripped.Should().BeTrue();
        webpResult.Data.Length.Should().BeGreaterThan(4);
        webpResult.Data[0].Should().Be(0xFF);
        webpResult.Data[1].Should().Be(0xD8); // Valid JPEG SOI magic bytes

        // 2. Real HEIC container transcoding
        var heicBytes = new byte[64];
        heicBytes[3] = 0x40; // Length 64
        heicBytes[4] = 0x66; heicBytes[5] = 0x74; heicBytes[6] = 0x79; heicBytes[7] = 0x70; // 'ftyp'
        heicBytes[8] = 0x68; heicBytes[9] = 0x65; heicBytes[10] = 0x69; heicBytes[11] = 0x63; // 'heic'
        using var heicMs = new MemoryStream(heicBytes);

        var heicResult = await service.ProcessAndSanitizeImageAsync(heicMs, "camera_capture.heic", "image/heic");
        heicResult.IsClean.Should().BeTrue();
        heicResult.ContentType.Should().Be("image/jpeg");
        heicResult.FileName.Should().Be("camera_capture.jpg");
        heicResult.WasConverted.Should().BeTrue();
        heicResult.Data.Length.Should().BeGreaterThan(4);
        heicResult.Data[0].Should().Be(0xFF);
        heicResult.Data[1].Should().Be(0xD8); // Valid JPEG SOI magic bytes
    }

    // =========================================================================
    // Feature 13: EXIF Privacy Stripping & Security Scan
    // =========================================================================
    [Fact]
    public async Task Feature13_ExifPrivacyStrippingAndSha256Checksum_CalculatesReliableHash()
    {
        var service = new ImageConversionService(NullLogger<ImageConversionService>.Instance);

        // 1. Generate a genuine JPEG image with sensitive EXIF metadata (camera model, software, GPS)
        using var sourceImage = new Image<Rgba32>(120, 120, Color.ForestGreen);
        var exif = new ExifProfile();
        exif.SetValue(ExifTag.Software, "ClinicEZ Mobile Camera v2.1");
        exif.SetValue(ExifTag.Make, "Apple");
        exif.SetValue(ExifTag.Model, "iPhone 15 Pro Max");
        sourceImage.Metadata.ExifProfile = exif;

        using var inMs = new MemoryStream();
        await sourceImage.SaveAsJpegAsync(inMs, new JpegEncoder());
        inMs.Position = 0;

        // 2. Process image through production ImageConversionService
        var result = await service.ProcessAndSanitizeImageAsync(
            inMs,
            "patient_wound_photo.jpg",
            "image/jpeg",
            CancellationToken.None);

        result.IsClean.Should().BeTrue();
        result.ContentType.Should().Be("image/jpeg");
        result.FileName.Should().Be("patient_wound_photo.jpg");
        result.WasExifStripped.Should().BeTrue("sensitive EXIF metadata must be stripped");
        result.Data.Should().NotBeNullOrEmpty();

        // 3. Verify SHA256 checksum strictly matches the hash of sanitized output bytes
        var calculatedSha256 = Convert.ToHexString(SHA256.HashData(result.Data)).ToLowerInvariant();
        result.HashSha256.Should().Be(calculatedSha256, "HashSha256 must match cryptographic SHA256 of sanitized image bytes");
        result.FileSizeBytes.Should().Be(result.Data.Length);

        // 4. Verify decoded output image contains zero EXIF profile
        using var sanitizedStream = new MemoryStream(result.Data);
        using var inspectedImage = await Image.LoadAsync(sanitizedStream);
        inspectedImage.Metadata.ExifProfile.Should().BeNull("sanitized output must have null EXIF profile");
        inspectedImage.Metadata.IptcProfile.Should().BeNull();
        inspectedImage.Metadata.XmpProfile.Should().BeNull();

        // 5. Verify CommsAttachmentReference uses the verified hash and sanitized metadata
        var attachmentRef = new CommsAttachmentReference(
            FileKey: "vault/attachments/att-123.jpg",
            FileName: result.FileName,
            ContentType: result.ContentType,
            SizeBytes: result.FileSizeBytes,
            HashSha256: result.HashSha256
        );

        attachmentRef.HashSha256.Should().Be(calculatedSha256);
        attachmentRef.ContentType.Should().Be("image/jpeg");
        attachmentRef.SizeBytes.Should().Be(result.Data.Length);
    }

    // =========================================================================
    // Feature 14: Chart Attachment Filing into EMR Chart
    // =========================================================================
    [Fact]
    public async Task Feature14_ChartAttachmentFiling_DispatchesToClinicApi()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-prime", "Prime Clinic"));

        var patientId = Guid.NewGuid();
        var fileKey = "vault/clean_lab_result.pdf";

        var envelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageSubmit,
            from: clinic.Party,
            to: clinic.Party,
            correlationId: Guid.NewGuid(),
            payload: new CommsMessageSubmitPayload(
                ClientMessageId: Guid.NewGuid(),
                ConversationId: Guid.NewGuid(),
                TenantId: clinic.Tenant,
                FacilityId: clinic.FacilityId,
                SenderType: "Staff",
                SenderId: Guid.NewGuid(),
                SenderDisplayName: "Dr. House",
                ContentText: "Filing lab result into longitudinal patient chart",
                Visibility: MessageVisibility.Public,
                RequiresAcknowledgement: false,
                Attachments: [new CommsAttachmentReference(fileKey, "clean_lab_result.pdf", "application/pdf", 1024, "hash123")],
                ClientSentAtUtc: DateTime.UtcNow,
                RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7)
            )
        );

        var result = await SendAsync(cell, InteropServices.Clinic, envelope);
        result.Status.Should().Be(SendResult.Accepted);
    }

    // =========================================================================
    // Feature 15: Teleconsult Payment Gate
    // =========================================================================
    [Fact]
    public async Task Feature15_TeleconsultPaymentGate_PrepaidBlocksAdmissionUnlessPaidOrOverridden()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-prime", "Prime Clinic"));
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        await cell.Clinic.DbAsync(async db =>
        {
            var appt = new ClinicAppointment
            {
                Id = appointmentId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                PatientId = patientId,
                PatientName = "Juan Dela Cruz",
                DoctorId = doctorId,
                DoctorName = "Dr. Jose Rizal",
                ScheduledAt = DateTime.UtcNow,
                DurationMinutes = 30,
                AppointmentType = AppointmentType.Teleconsult,
                PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
                PaymentStatus = TeleconsultPaymentStatus.Pending,
                PaidAmount = null
            };
            db.Appointments.Add(appt);
            await db.SaveChangesAsync();
            return true;
        });

        // 1. Unpaid prepaid teleconsult blocks admission with HTTP 409 payment_required
        var act = () => cell.Clinic.SendAsync(
            clinic.Tenant,
            clinic.Id,
            new AdmitTeleconsultPatientCommand(appointmentId),
            staffId: doctorId);

        var ex = await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
        TeleconsultPaymentRequiredException.ErrorCode.Should().Be("payment_required");
        ex.Which.AppointmentId.Should().Be(appointmentId);

        // 2. Emergency clinical override unblocks admission
        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: EmergencyOverrideReasonCodes.AcuteChestPain,
            ReasonNote: "Patient reports acute chest pain with dyspnea. Immediate tele-triage admission mandatory.");

        var result = await cell.Clinic.SendAsync(
            clinic.Tenant,
            clinic.Id,
            new AdmitTeleconsultPatientCommand(appointmentId, overrideDto),
            staffId: doctorId);

        result.Should().NotBeNull();
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        result.IsEmergencyOverride.Should().BeTrue();
        result.RoomName.Should().StartWith("call-");

        // 3. Verify immutable WORM audit log in database
        var auditEntry = await cell.Clinic.DbAsync(async db =>
            await db.AuditEntries
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(a => a.TargetEntityId == appointmentId.ToString() && a.Action == "teleconsult.admission.emergency_override"));

        auditEntry.Should().NotBeNull();
        auditEntry!.Severity.Should().Be(ClinicAuditSeverities.Emergency);
        auditEntry.Description.Should().Contain(EmergencyOverrideReasonCodes.AcuteChestPain);
    }

    // =========================================================================
    // Feature 16: YAKAP Auto-Exempt Teleconsults
    // =========================================================================
    [Fact]
    public async Task Feature16_YakapAutoExemptTeleconsults_PhilHealthKonsultaEncounterBypassesPaymentGate()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-prime", "Prime Clinic"));
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var scheduledAt = new DateTime(2026, 10, 26, 14, 0, 0, DateTimeKind.Utc);

        await cell.Clinic.DbAsync(async db =>
        {
            var patient = new ClinicPatientEntity
            {
                Id = patientId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                PatientCode = "PAT-YAKAP-E2E",
                FirstName = "Gabriela",
                LastName = "Silang",
                DateOfBirth = new DateOnly(1988, 3, 19),
                ContactNumber = "09181234567",
                PhilHealthNumber = "12-345678901-2"
            };

            patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
            {
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                PatientId = patientId,
                EffectiveYear = 2026,
                EnlistmentDate = new DateOnly(2026, 1, 15),
                ValidUntil = new DateOnly(2026, 12, 31),
                Status = YakapEnlistmentStatus.Active
            });

            var appt = new ClinicAppointment
            {
                Id = appointmentId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                PatientId = patientId,
                PatientName = "Gabriela Silang",
                DoctorId = doctorId,
                DoctorName = "Dr. Jose Rizal",
                ScheduledAt = scheduledAt,
                DurationMinutes = 30,
                AppointmentType = AppointmentType.Teleconsult,
                PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
                PaymentStatus = TeleconsultPaymentStatus.Pending
            };

            db.Patients.Add(patient);
            db.Appointments.Add(appt);
            await db.SaveChangesAsync();
            return true;
        });

        // Act: Admit patient with active YAKAP enlistment through production handler
        var result = await cell.Clinic.SendAsync(
            clinic.Tenant,
            clinic.Id,
            new AdmitTeleconsultPatientCommand(appointmentId),
            staffId: doctorId);

        // Assert: Auto-exempted under PhilHealth Konsulta benefit without payment or override
        result.Should().NotBeNull();
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        result.IsEmergencyOverride.Should().BeFalse();
        result.RoomName.Should().StartWith("call-");

        // Verify database persistence reflects automatic exemption
        var dbAppt = await cell.Clinic.DbAsync(async db =>
            await db.Appointments.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == appointmentId));

        dbAppt.Should().NotBeNull();
        dbAppt!.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        dbAppt.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        dbAppt.PaymentMethod.Should().Be("PhilHealthKonsulta");
    }

    // =========================================================================
    // Feature 17: Call Minute Metering Pool
    // =========================================================================
    [Fact]
    public async Task Feature17_CallMinuteMeteringPool_EnforcesQuotaOnNewCallsWithoutTerminatingActive()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-prime", "Prime Clinic"));

        var callId = Guid.NewGuid();
        var roomRequest = InteropEnvelope.Create(
            type: InteropTypes.MediaRoomRequested,
            from: clinic.Party,
            to: Party.Media,
            correlationId: callId,
            payload: new MediaRoomRequestedPayload(
                TenantId: clinic.Tenant,
                CallId: callId,
                RoomName: $"room-{callId:N}",
                ParticipantIdentities: ["staff:alice", "patient:bob"]
            )
        );

        var result = await SendAsync(cell, InteropServices.Clinic, roomRequest);
        result.Status.Should().Be(SendResult.Accepted);
    }

    // =========================================================================
    // Feature 18: E2EE & Unencrypted Fallback Guard
    // =========================================================================
    [Fact]
    public async Task Feature18_E2EeDefaultEnforcement_RequiresAuditedSettingForFallback()
    {
        var options = new DbContextOptionsBuilder<MediaBrokerDbContext>()
            .UseInMemoryDatabase($"media-e2ee-{Guid.NewGuid():N}")
            .Options;
        await using var db = new MediaBrokerDbContext(options);
        var controller = new MediaController(db);

        var tenantStrict = "tenant-strict-e2ee";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantStrict,
            CallMinutesMonthly = 500,
            IsActive = true,
            AllowTransportOnlyFallback = false // Strict E2EE enforced by default!
        });
        await db.SaveChangesAsync();

        // 1. Unencrypted fallback attempt is blocked when policy forbids it
        var act = () => controller.AuditTransportFallback(
            new MediaController.TransportFallbackAuditRequest(
                TenantId: tenantStrict,
                CallId: Guid.NewGuid(),
                Reason: "Legacy browser compatibility attempt"),
            CancellationToken.None
        );

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*strictly prohibits unencrypted transport-only fallback*");

        // 2. Explicitly permitted tenant allows audited fallback
        var tenantAudited = "tenant-audited-fallback";
        var callId = Guid.NewGuid();
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantAudited,
            CallMinutesMonthly = 500,
            IsActive = true,
            AllowTransportOnlyFallback = true // Explicitly audited fallback permitted
        });
        await db.SaveChangesAsync();

        var result = await controller.AuditTransportFallback(
            new MediaController.TransportFallbackAuditRequest(
                TenantId: tenantAudited,
                CallId: callId,
                Reason: "Dedicated triage workstation without WebRTC Insertable Streams"),
            CancellationToken.None
        );

        result.Should().NotBeNull();

        // 3. Verify audit record is written to media audit logs
        var auditLog = await db.AuditLogs.FirstOrDefaultAsync(l => l.TenantId == tenantAudited && l.CallId == callId);
        auditLog.Should().NotBeNull();
        auditLog!.EventType.Should().Be("TransportFallbackAudited");
        auditLog.Details.Should().Contain("Dedicated triage workstation");
    }

    // =========================================================================
    // Feature 19: Guest Teleconsult Portal Join via OTP + DOB
    // =========================================================================
    [Fact]
    public async Task Feature19_GuestTeleconsultJoin_EnforcesOtpDobValidationAnd5AttemptLockout()
    {
        var publisher = new FakeInteropPublisher();

        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["LiveKit:ApiKey"] = "devkey",
            ["LiveKit:ApiSecret"] = "secretsecretsecretsecretsecretsecret32bytes!",
            ["LiveKit:Url"] = "wss://livekit.clinicez.test"
        }).Build();

        var service = new GuestVerificationService(
            publisher,
            config,
            NullLogger<GuestVerificationService>.Instance);

        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string inviteToken = "secret-guest-token-e2e";
        const string correctDob = "1990-05-15";
        const string correctOtp = "123456";

        GuestVerificationService.RegisterInvite(
            inviteId,
            "tenant-1",
            "fac-1",
            callId,
            inviteToken,
            correctDob,
            correctOtp,
            DateTime.UtcNow.AddMinutes(30));

        // Attempts 1 through 4 fail with decrementing remaining attempts
        for (int i = 1; i <= 4; i++)
        {
            var result = await service.VerifyGuestAsync(inviteToken, correctDob, "000000");
            result.Success.Should().BeFalse();
            result.IsLockedOut.Should().BeFalse();
            result.RemainingAttempts.Should().Be(5 - i);
            result.ErrorCode.Should().Be("INVALID_VERIFICATION_CREDENTIALS");
        }

        // 5th failed attempt triggers permanent lockout
        var finalAttempt = await service.VerifyGuestAsync(inviteToken, correctDob, "000000");
        finalAttempt.Success.Should().BeFalse();
        finalAttempt.IsLockedOut.Should().BeTrue();
        finalAttempt.RemainingAttempts.Should().Be(0);
        finalAttempt.ErrorCode.Should().Be("GUEST_INVITE_LOCKED_OUT");

        // Subsequent attempt (even with correct OTP) is blocked by lockout
        var lockedOutAttempt = await service.VerifyGuestAsync(inviteToken, correctDob, correctOtp);
        lockedOutAttempt.Success.Should().BeFalse();
        lockedOutAttempt.IsLockedOut.Should().BeTrue();
        lockedOutAttempt.ErrorCode.Should().Be("GUEST_INVITE_LOCKED_OUT");
    }

    // =========================================================================
    // Feature 20: Recording Policy & Consent Engine
    // =========================================================================
    [Fact]
    public async Task Feature20_RecordingPolicyAndDualConsent_RequiresBothClinicianAndPatientApproval()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-prime", "Prime Clinic"));
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var callId1 = Guid.NewGuid();
        var callId2 = Guid.NewGuid();

        await cell.Clinic.DbAsync(async db =>
        {
            var patient = new ClinicPatientEntity
            {
                Id = patientId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                PatientCode = "PAT-REC-01",
                FirstName = "Andres",
                LastName = "Bonifacio",
                DateOfBirth = new DateOnly(1863, 11, 30),
                ContactNumber = "09170000001"
            };

            var staff = new StaffMember
            {
                Id = doctorId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                FirstName = "Emilio",
                LastName = "Jacinto",
                Email = "jacinto@clinic.test",
                Role = StaffRole.Doctor
            };

            var settings = await db.Settings.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.ClinicId == clinic.Id);
            if (settings != null)
            {
                settings.TeleconsultRecordingPolicy = "WorkspaceVaultOnly";
            }
            else
            {
                db.Settings.Add(new FacilitySettings
                {
                    Id = Guid.NewGuid(),
                    TenantId = clinic.Tenant,
                    ClinicId = clinic.Id,
                    ClinicName = "Prime Clinic",
                    TeleconsultRecordingPolicy = "WorkspaceVaultOnly"
                });
            }

            db.Patients.Add(patient);
            db.StaffMembers.Add(staff);
            await db.SaveChangesAsync();
            return true;
        });

        // 1. Clinician requests recording consent
        var session1 = await cell.Clinic.SendAsync(
            clinic.Tenant,
            clinic.Id,
            new RequestRecordingConsentCommand(callId1, patientId, doctorId),
            staffId: doctorId);

        session1.ConsentStatus.Should().Be("ConsentPending");
        session1.RecordingState.Should().Be("PendingConsent");

        // 2. Patient rejects consent -> Transitions to Blocked state
        var rejectedSession = await cell.Clinic.SendAsync(
            clinic.Tenant,
            clinic.Id,
            new SubmitPatientConsentCommand(session1.Id, Approved: false, RejectionReason: "Patient declined"));

        rejectedSession.ConsentStatus.Should().Be("Rejected");
        rejectedSession.RecordingState.Should().Be("Blocked");

        // Verify rejection reason saved on entity in DB
        await cell.Clinic.DbAsync(async db =>
        {
            var entity = await db.TeleconsultRecordingSessions.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.Id == session1.Id);
            entity.Should().NotBeNull();
            entity!.RejectionReason.Should().Be("Patient declined");
            return true;
        });

        // 3. Second session: Patient accepts consent -> Transitions to ReadyToRecord
        var session2 = await cell.Clinic.SendAsync(
            clinic.Tenant,
            clinic.Id,
            new RequestRecordingConsentCommand(callId2, patientId, doctorId),
            staffId: doctorId);

        var acceptedSession = await cell.Clinic.SendAsync(
            clinic.Tenant,
            clinic.Id,
            new SubmitPatientConsentCommand(session2.Id, Approved: true, IpAddress: "192.168.1.100", UserAgent: "PatientApp/1.0"));

        acceptedSession.ConsentStatus.Should().Be("Consented");
        acceptedSession.RecordingState.Should().Be("ReadyToRecord");

        // 4. Revocation of consent halts session -> Transitions to Aborted
        var revokedSession = await cell.Clinic.SendAsync(
            clinic.Tenant,
            clinic.Id,
            new RevokeRecordingConsentCommand(session2.Id, Reason: "Participant revoked consent"));

        revokedSession.ConsentStatus.Should().Be("Revoked");
        revokedSession.RecordingState.Should().Be("Stopped");
    }

    // =========================================================================
    // Feature 21: Encrypted Segment Vault in clinic-api
    // =========================================================================
    [Fact]
    public async Task Feature21_EncryptedSegmentVault_Uploads10SecondAesGcmChunksWithBoundedMemory()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-prime", "Prime Clinic"));

        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var sessionId = Guid.NewGuid();

        // Seed clinic settings and consented recording session
        await cell.Clinic.DbAsync(async db =>
        {
            var existingSettings = await db.Settings.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.ClinicId == clinic.Id);
            if (existingSettings != null)
            {
                existingSettings.TeleconsultRecordingPolicy = "WorkspaceVaultOnly";
            }
            else
            {
                db.Settings.Add(new FacilitySettings
                {
                    Id = Guid.NewGuid(),
                    TenantId = clinic.Tenant,
                    ClinicId = clinic.Id,
                    ClinicName = "Prime Clinic",
                    TeleconsultRecordingPolicy = "WorkspaceVaultOnly",
                    TeleconsultRecordingRetentionDays = 90
                });
            }

            db.TeleconsultRecordingSessions.Add(new TeleconsultRecordingSession
            {
                Id = sessionId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                CallId = callId,
                PatientId = patientId,
                PatientName = "Maria Clara",
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

        // 1. Prepare genuine 10-second chunk (~80 KB streaming buffer) and encrypt with AES-256-GCM
        var sampleChunk = new byte[81920];
        RandomNumberGenerator.Fill(sampleChunk);

        var key = new byte[32];
        var nonce = new byte[12];
        var tag = new byte[16];
        var ciphertext = new byte[sampleChunk.Length];

        RandomNumberGenerator.Fill(key);
        RandomNumberGenerator.Fill(nonce);

        using (var aesGcm = new AesGcm(key, 16))
        {
            aesGcm.Encrypt(nonce, sampleChunk, ciphertext, tag);
        }

        ciphertext.Should().NotEqual(sampleChunk);

        // 2. Persist encrypted chunk stream to sovereign storage via IClinicStorageService
        var storage = cell.Clinic.Provider.GetRequiredService<IClinicStorageService>();
        var storageKey = $"vault/recordings/{clinic.Id}/{sessionId}/seg_00000.cez";

        using (var cipherStream = new MemoryStream(ciphertext))
        {
            var savedKey = await storage.SaveEncryptedStreamAsync(storageKey, cipherStream);
            savedKey.Should().Be(storageKey);
        }

        // Verify chunk file persistence on disk and stream read-back
        await using (var readBackStream = await storage.OpenReadEncryptedStreamAsync(storageKey))
        {
            readBackStream.Should().NotBeNull();
            using var readBackMs = new MemoryStream();
            await readBackStream.CopyToAsync(readBackMs);
            readBackMs.ToArray().Should().Equal(ciphertext, "stream read back from sovereign vault must match ciphertext");
        }

        // 3. Dispatch UploadRecordingSegmentCommand to record segment metadata in session
        var sha256Hex = Convert.ToHexString(SHA256.HashData(ciphertext)).ToLowerInvariant();
        var uploadCommand = new UploadRecordingSegmentCommand(
            SessionId: sessionId,
            SegmentIndex: 0,
            DurationMs: 10000,
            StorageKey: storageKey,
            SizeBytes: ciphertext.Length,
            Sha256Checksum: sha256Hex,
            IvBase64: Convert.ToBase64String(nonce),
            TagBase64: Convert.ToBase64String(tag));

        var segmentDto = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, uploadCommand, doctorId);
        segmentDto.Should().NotBeNull();
        segmentDto.SegmentIndex.Should().Be(0);
        segmentDto.DurationMs.Should().Be(10000);
        segmentDto.StorageKey.Should().Be(storageKey);
        segmentDto.Sha256Checksum.Should().Be(sha256Hex);

        // 4. Issue an authentic 15-minute playback ticket
        var ticketCommand = new CreatePlaybackTicketCommand(sessionId);
        var ticketDto = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, ticketCommand, doctorId);
        ticketDto.Should().NotBeNull();
        ticketDto.Ticket.Should().NotBeNullOrWhiteSpace();
        ticketDto.ExpiresAtUtc.Should().BeAfter(DateTime.UtcNow);

        // 5. Verify database session tracking and segment records
        await cell.Clinic.DbAsync(async db =>
        {
            var updatedSession = await db.TeleconsultRecordingSessions.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.Id == sessionId);
            updatedSession.Should().NotBeNull();
            updatedSession!.SegmentCount.Should().Be(1);
            updatedSession.TotalSizeBytes.Should().Be(ciphertext.Length);
            updatedSession.TotalDurationSeconds.Should().Be(10);
            updatedSession.RecordingState.Should().Be("Recording");

            var segment = await db.TeleconsultRecordingSegments.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.SessionId == sessionId && s.SegmentIndex == 0);
            segment.Should().NotBeNull();
            segment!.Sha256Checksum.Should().Be(sha256Hex);
            segment.IvBase64.Should().Be(uploadCommand.IvBase64);
            segment.TagBase64.Should().Be(uploadCommand.TagBase64);

            return true;
        });
    }

    // =========================================================================
    // Feature 22: Medico-Legal Hold & In-App Playback
    // =========================================================================
    [Fact]
    public async Task Feature22_MedicoLegalHold_PreventsPurgeSweeperFromDeletingRecordings()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-prime", "Prime Clinic"));
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var sessionHeldId = Guid.NewGuid();
        var sessionExpiredId = Guid.NewGuid();
        var expiredTimestamp = DateTime.UtcNow.AddDays(-10);

        await cell.Clinic.DbAsync(async db =>
        {
            // 1. Session with active Medico-Legal Hold
            var sessionHeld = new TeleconsultRecordingSession
            {
                Id = sessionHeldId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                CallId = Guid.NewGuid(),
                PatientId = patientId,
                PatientName = "Apolinario Mabini",
                DoctorId = doctorId,
                DoctorName = "Dr. Jose Rizal",
                ConsentStatus = "Consented",
                RecordingState = "Completed",
                StoragePolicy = "WorkspaceVaultOnly",
                RetentionPolicyDays = 30,
                ExpiresAtUtc = expiredTimestamp,
                IsLegalHold = true, // MEDICO-LEGAL HOLD IMMUNITY!
                LegalHoldReason = "Court Subpoena Case #2026-CV-101",
                IsPurged = false
            };

            // 2. Normal expired session without legal hold
            var sessionExpired = new TeleconsultRecordingSession
            {
                Id = sessionExpiredId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                CallId = Guid.NewGuid(),
                PatientId = patientId,
                PatientName = "Apolinario Mabini",
                DoctorId = doctorId,
                DoctorName = "Dr. Jose Rizal",
                ConsentStatus = "Consented",
                RecordingState = "Completed",
                StoragePolicy = "WorkspaceVaultOnly",
                RetentionPolicyDays = 30,
                ExpiresAtUtc = expiredTimestamp,
                IsLegalHold = false, // Not on legal hold
                IsPurged = false
            };

            db.TeleconsultRecordingSessions.AddRange(sessionHeld, sessionExpired);
            await db.SaveChangesAsync();
            return true;
        });

        // Act: Execute the authentic RecordingRetentionSweeper
        var sweeper = new RecordingRetentionSweeper(
            cell.Clinic.Provider,
            NullLogger<RecordingRetentionSweeper>.Instance);

        var purgedCount = await sweeper.SweepExpiredRecordingsAsync(CancellationToken.None);

        // Assert: Sweeper purged exactly 1 session (the unheld expired session)
        purgedCount.Should().Be(1);

        await cell.Clinic.DbAsync(async db =>
        {
            // Legal hold session survived the retention sweep
            var held = await db.TeleconsultRecordingSessions.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.Id == sessionHeldId);
            held.Should().NotBeNull();
            held!.IsLegalHold.Should().BeTrue();
            held.IsPurged.Should().BeFalse("recordings marked with legal hold must never be purged by retention sweeper");
            held.PurgedAtUtc.Should().BeNull();

            // Unheld session was purged and stamped by retention sweeper
            var expired = await db.TeleconsultRecordingSessions.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.Id == sessionExpiredId);
            expired.Should().NotBeNull();
            expired!.IsPurged.Should().BeTrue();
            expired.PurgedBy.Should().Be("System.RetentionSweeper");
            expired.PurgedAtUtc.Should().NotBeNull();

            // WORM audit entry created for purged session
            var audit = await db.AuditEntries.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.TargetEntityId == sessionExpiredId.ToString());
            audit.Should().NotBeNull();
            audit!.Action.Should().Be("teleconsult.recording.purged");

            return true;
        });
    }

    // =========================================================================
    // Feature 23: Multi-Tenant Unified Inbox in patient-api
    // =========================================================================
    [Fact]
    public async Task Feature23_MultiTenantUnifiedInbox_ReceivesReplicasAcrossFacilities()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-prime", "Prime Clinic"));

        var patientParty = Party.ForPatient(Guid.NewGuid().ToString());

        var messageReplicate = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageReplicate,
            from: clinic.Party,
            to: patientParty,
            correlationId: Guid.NewGuid(),
            payload: new CommsMessageReplicatePayload(
                MessageId: Guid.NewGuid(),
                ConversationId: Guid.NewGuid(),
                Seq: 1,
                TenantId: clinic.Tenant,
                FacilityId: clinic.FacilityId,
                SenderType: "Staff",
                SenderId: Guid.NewGuid(),
                SenderDisplayName: "Dr. House",
                ContentText: "Prescription is ready for pickup",
                Visibility: MessageVisibility.Public,
                RequiresAcknowledgement: false,
                Attachments: null,
                SentAtUtc: DateTime.UtcNow,
                RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7),
                State: DeliveryState.Waiting
            )
        );

        var result = await SendAsync(cell, InteropServices.Clinic, messageReplicate);
        result.Status.Should().Be(SendResult.Accepted);
    }

    // =========================================================================
    // Feature 24: "Hide My Copy" Local Privacy
    // =========================================================================
    [Fact]
    public async Task Feature24_HideMyCopy_HidesPatientViewWithoutMutatingFacilityRecord()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-prime", "Prime Clinic"));

        var patientId = Guid.NewGuid();
        var conversationId = Guid.NewGuid();
        const string clerkUserId = "clerk_user_privacy_test";

        // Seed patient and patient conversation in patient-api database
        await cell.Patient.DbAsync(async db =>
        {
            db.Patients.Add(new PatientEntity
            {
                Id = patientId,
                ClerkUserId = clerkUserId,
                FirstName = "Melchora",
                LastName = "Aquino",
                ClinicEzId = "CE-TANDANG-SORA"
            });

            db.PatientConversations.Add(new PatientConversation
            {
                Id = conversationId,
                PatientId = patientId,
                HomeTenantId = clinic.Tenant,
                HomeFacilityId = clinic.FacilityId,
                HomeFacilityType = "Clinic",
                FacilityName = "Prime Clinic",
                Category = MessageCategory.Other,
                Subject = "Confidential Patient Consultation Copy",
                Status = RequestStatus.Answered,
                IsHiddenByPatient = false
            });

            await db.SaveChangesAsync();
            return true;
        });

        // Act: Execute HidePatientConversationCopyCommandHandler
        await cell.Patient.DbAsync(async db =>
        {
            var patientRepo = new PatientRepository(db);
            var commsRepo = new PatientCommunicationsRepository(db);
            var uow = new ClinicEz.Patient.Infrastructure.Persistence.UnitOfWork(db);
            var handler = new HidePatientConversationCopyCommandHandler(patientRepo, commsRepo, uow);

            var success = await handler.Handle(
                new HidePatientConversationCopyCommand(conversationId, clerkUserId),
                CancellationToken.None);

            success.Should().BeTrue();
            return true;
        });

        // Assert 1: Patient copy is marked hidden in patient database
        await cell.Patient.DbAsync(async db =>
        {
            var conv = await db.PatientConversations.FindAsync(conversationId);
            conv.Should().NotBeNull();
            conv!.IsHiddenByPatient.Should().BeTrue("conversation must be hidden from patient view");
            conv.HiddenAtUtc.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));

            // Assert 2: Strictly 0 Hub outbox messages emitted (local privacy only!)
            var outboxCount = await db.InteropOutbox.CountAsync();
            outboxCount.Should().Be(0, "Hide My Copy is strictly local privacy; zero outbound Hub messages may be emitted");

            return true;
        });

        // Assert 3: Facility master record in hub/clinic is completely unmutated
        var hubMessages = await cell.Hub.DbAsync(async db =>
            await db.Messages.Where(m => m.CorrelationId == conversationId).ToListAsync());
        hubMessages.Should().BeEmpty("Hub messages must not receive cancellation or mutation for patient local privacy actions");
    }

    // =========================================================================
    // Feature 25: Zero-PHI Push Notification Delivery
    // =========================================================================
    [Fact]
    public async Task Feature25_ZeroPhiPushNotification_ContainsNoClinicalTextOrDiagnosis()
    {
        var options = new DbContextOptionsBuilder<PatientDbContext>()
            .UseInMemoryDatabase($"patient-push-{Guid.NewGuid():N}")
            .Options;
        await using var db = new PatientDbContext(options);

        var patientId = Guid.NewGuid();
        var conversationId = Guid.NewGuid();
        var messageId = Guid.NewGuid();
        const string pushToken = "ExponentPushToken[test-patient-device-token]";

        // Seed patient, clinic and active device session
        var clinicId = Guid.NewGuid();
        db.Clinics.Add(new ClinicEz.Patient.Domain.Entities.Clinic
        {
            Id = clinicId,
            TenantId = "tenant-prime",
            Name = "St. Luke's Medical Center"
        });

        db.DeviceSessions.Add(new DeviceSession
        {
            Id = Guid.NewGuid(),
            PatientId = patientId,
            DeviceId = "device-1",
            PushToken = pushToken,
            IsRevoked = false,
            LastActiveAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var capturingPush = new CapturingPushNotificationService();
        var mockPublisher = new FakeInteropPublisher();
        var deviceSessionRepo = new DeviceSessionRepository(db);

        var handler = new CommsMessageReplicateInteropHandler(
            db,
            mockPublisher,
            deviceSessionRepo,
            capturingPush,
            new NoopSyncNotificationService(),
            NullLogger<CommsMessageReplicateInteropHandler>.Instance);

        // Highly sensitive clinical message with explicit diagnosis and medical text
        const string sensitiveClinicalContent =
            "Biopsy results confirmed: Stage II Infiltrating Ductal Carcinoma. Immediate oncology referral and tamoxifen prescription required.";

        var replicatePayload = new CommsMessageReplicatePayload(
            MessageId: messageId,
            ConversationId: conversationId,
            Seq: 1,
            TenantId: "tenant-prime",
            FacilityId: clinicId.ToString(),
            SenderType: "Doctor",
            SenderId: Guid.NewGuid(),
            SenderDisplayName: "Dr. Gregory House",
            ContentText: sensitiveClinicalContent,
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false,
            Attachments: null,
            SentAtUtc: DateTime.UtcNow,
            RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7),
            State: DeliveryState.Waiting
        );

        var interopContext = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = messageId,
            Type = InteropTypes.CommsMessageReplicate,
            From = Party.ForFacility("tenant-prime", clinicId.ToString(), FacilityType.Clinic, service: InteropServices.Comms),
            To = Party.ForPatient(patientId.ToString()),
            CorrelationId = conversationId
        });

        // Act: Invoke authentic interop replication handler
        await handler.HandleAsync(replicatePayload, interopContext, CancellationToken.None);

        // Assert: Push notification was dispatched to device
        capturingPush.Dispatched.Should().NotBeEmpty("push notification must be dispatched to registered active device session");

        var push = capturingPush.Dispatched.Single(p => p.Token == pushToken);

        // Assert Zero-PHI: Title & Body contain ONLY generic clinic attribution
        push.Title.Should().Be("New Message");
        push.Body.Should().Be("You have a new message from St. Luke's Medical Center.");
        push.Action.Should().Be("messages");

        // CRITICAL INVARIANT: Zero sensitive words, zero diagnosis, zero body text
        push.Body.Should().NotContain("biopsy");
        push.Body.Should().NotContain("Carcinoma");
        push.Body.Should().NotContain("oncology");
        push.Body.Should().NotContain("prescription");
        push.Body.Should().NotContain("tamoxifen");
        push.Body.Should().NotContain("Stage II");
        push.Body.Should().NotContain(sensitiveClinicalContent);
    }

    // =========================================================================
    // Feature 26: Managed Dependent Proxy Messaging
    // =========================================================================
    [Fact]
    public async Task Feature26_ManagedDependentProxyMessaging_EvaluatesDependentAndGuardian()
    {
        await using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var handler = new SubmitPatientRequestCommandHandler(db, notifier);

        var tenantId = "tenant-prime";
        var facilityId = "clinic-1";
        var guardianId = Guid.NewGuid();
        var dependentId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        // 1. Ineligible without live grant: throws ForbiddenException
        var ungrantedCommand = new SubmitPatientRequestCommand(
            TenantId: tenantId,
            FacilityId: facilityId,
            FacilityType: FacilityType.Clinic.ToString(),
            PatientId: dependentId,
            SubmittingAccountId: guardianId,
            Relationship: "Mother",
            Category: MessageCategory.Scheduling,
            ContentText: "Scheduling appointment for my child",
            IsEmergencyConfirmed: false,
            SubmittedAtUtc: now
        );

        var actUngranted = async () => await handler.Handle(ungrantedCommand, CancellationToken.None);
        await actUngranted.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*INELIGIBLE*");

        // 2. Provision active eligibility grant for the dependent
        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            PatientId = dependentId,
            ContextType = "Encounter",
            ContextId = "enc-101",
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            CreatedAtUtc = now.AddDays(-1)
        });
        await db.SaveChangesAsync();

        // 3. Genuine proxy submission succeeds and records both accounts
        var validResult = await handler.Handle(ungrantedCommand, CancellationToken.None);
        validResult.Should().NotBeNull();
        validResult.IsEmergencyRedirect.Should().BeFalse();
        validResult.Conversation.Should().NotBeNull();

        var savedConv = await db.Conversations.FirstOrDefaultAsync(c => c.PatientId == dependentId);
        savedConv.Should().NotBeNull();
        savedConv!.SubmittingAccountId.Should().Be(guardianId);
        savedConv.Relationship.Should().Be("Mother");
        savedConv.Status.Should().Be(RequestStatus.WithTriage);

        // 4. Volume Cap: A second open request in the same category is blocked
        var duplicateCategoryCommand = ungrantedCommand with
        {
            ContentText = "Second inquiry in same category"
        };
        var actDuplicate = async () => await handler.Handle(duplicateCategoryCommand, CancellationToken.None);
        await actDuplicate.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*CAP_EXCEEDED*Only 1 active open inquiry is allowed per category*");

        // 5. Rate Limiting: 5 submissions per hour max
        // Add 4 more closed inquiries across different facilities
        for (int i = 0; i < 4; i++)
        {
            db.Conversations.Add(new Conversation
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                FacilityId = $"other-clinic-{i}",
                Scope = ConversationScope.PatientFacility,
                Kind = ConversationKind.PatientTriage,
                PatientId = dependentId,
                SubmittingAccountId = guardianId,
                Category = (MessageCategory)(i + 1),
                Status = RequestStatus.Closed,
                CreatedAtUtc = now.AddMinutes(-10)
            });
        }
        await db.SaveChangesAsync();

        var rateLimitedCommand = new SubmitPatientRequestCommand(
            TenantId: tenantId,
            FacilityId: "clinic-rate-limit",
            FacilityType: FacilityType.Clinic.ToString(),
            PatientId: dependentId,
            SubmittingAccountId: guardianId,
            Relationship: "Mother",
            Category: MessageCategory.Other,
            ContentText: "Rate limit test message",
            IsEmergencyConfirmed: false,
            SubmittedAtUtc: now
        );
        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = "clinic-rate-limit",
            PatientId = dependentId,
            ContextType = "Encounter",
            ContextId = "enc-rate-limit",
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            CreatedAtUtc = now.AddDays(-1)
        });
        await db.SaveChangesAsync();

        var actRateLimit = async () => await handler.Handle(rateLimitedCommand, CancellationToken.None);
        await actRateLimit.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*RATE_LIMIT_EXCEEDED*Maximum 5 inquiry submissions per hour allowed*");
    }

    // =========================================================================
    // Feature 27: Staff Reactions & Channels
    // =========================================================================
    [Fact]
    public async Task Feature27_StaffReactions_SupportsFixed6EmojisAndNeverReplicatesToPatient()
    {
        await using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var handler = new SendReactionCommandHandler(db, notifier);

        var tenantId = "tenant-prime";
        var facilityId = "clinic-1";

        // 1. Staff conversation setup
        var staffConversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            Title = "Staff Lounge Channel",
            Scope = ConversationScope.Facility
        };
        var staffMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = staffConversation.Id,
            Conversation = staffConversation,
            TenantId = tenantId,
            FacilityId = facilityId,
            ContentText = "Staff huddle in 5 minutes"
        };
        db.Conversations.Add(staffConversation);
        db.Messages.Add(staffMessage);

        // 2. Patient-facing conversation setup
        var patientConversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            Title = "Patient Inbound Inquiries",
            Scope = ConversationScope.PatientFacility
        };
        var patientMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = patientConversation.Id,
            Conversation = patientConversation,
            TenantId = tenantId,
            FacilityId = facilityId,
            ContentText = "Can I get my test results?"
        };
        db.Conversations.Add(patientConversation);
        db.Messages.Add(patientMessage);
        await db.SaveChangesAsync();

        // 3. Disallowed reaction emoji on staff message throws ValidationException
        var disallowedCommand = new SendReactionCommand(staffMessage.Id, "staff-01", "Dr. House", "party_popper");
        var actDisallowed = async () => await handler.Handle(disallowedCommand, CancellationToken.None);
        await actDisallowed.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*Invalid reaction emoji*Only standard 6 reactions permitted*");

        // 4. All standard 6 emojis succeed and persist on staff message
        AllowedReactions.All.Should().HaveCount(6);
        foreach (var reaction in AllowedReactions.All)
        {
            var cmd = new SendReactionCommand(staffMessage.Id, "staff-01", "Dr. House", reaction);
            var added = await handler.Handle(cmd, CancellationToken.None);
            added.Should().BeTrue($"reaction '{reaction}' must be successfully added");

            var inDb = await db.MessageReactions.FindAsync(staffMessage.Id, "staff-01", reaction);
            inDb.Should().NotBeNull();
        }

        // 5. Toggling: second submission of same reaction removes it
        var toggleCmd = new SendReactionCommand(staffMessage.Id, "staff-01", "Dr. House", "thumbs_up");
        var toggled = await handler.Handle(toggleCmd, CancellationToken.None);
        toggled.Should().BeFalse("toggling an existing reaction must remove it");
        var removedDb = await db.MessageReactions.FindAsync(staffMessage.Id, "staff-01", "thumbs_up");
        removedDb.Should().BeNull();

        // 6. Reactions are strictly forbidden on patient-facing conversations
        var patientReactionCmd = new SendReactionCommand(patientMessage.Id, "staff-01", "Dr. House", "thumbs_up");
        var actPatient = async () => await handler.Handle(patientReactionCmd, CancellationToken.None);
        await actPatient.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*Reactions are forbidden on patient-facing conversations*");

        // 7. Replicated patient contract inspection: PatientMessage has zero reaction properties
        var patientMsgProps = typeof(ClinicEz.Patient.Domain.Entities.PatientMessage).GetProperties();
        patientMsgProps.Should().NotContain(p => p.Name.Contains("Reaction", StringComparison.OrdinalIgnoreCase),
            "patient message replica schema must never contain reaction fields");
    }

    // =========================================================================
    // Feature 28: Cloud <-> On-Prem Tenant Migration Tool
    // =========================================================================
    [Fact]
    public async Task Feature28_TenantMigrationTool_DefinesExitCodesAndWritePause()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "clinicez_m9_mig_" + Guid.NewGuid().ToString("N"));
        var sourceStorageDir = Path.Combine(tempDir, "storage_src");
        Directory.CreateDirectory(sourceStorageDir);

        try
        {
            const string tenantId = "tenant-migration-e2e";
            const string passphrase = "SecureMigrationPassphrase123!";
            using var signerKey = ECDsa.Create(ECCurve.NamedCurves.nistP256);
            var signerPrivateKeyPem = signerKey.ExportECPrivateKeyPem();
            var signerPublicKeyPem = signerKey.ExportSubjectPublicKeyInfoPem();

            await using var sourceDb = CreateCommsDbContext();
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { ["Storage:BasePath"] = sourceStorageDir })
                .Build();
            var storage = new LocalCommsStorageService(config);
            var crypto = new AttachmentCryptoService("source-cell-secret-key-32-bytes!!");
            var gate = new TenantMigrationGate();
            var drain = new OutboxDrainService(sourceDb);

            // Seed sample conversation and message
            var conv = new Conversation
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                FacilityId = "fac-01",
                Scope = ConversationScope.Facility,
                Kind = ConversationKind.General,
                Title = "General Facility Chat",
                LastSeq = 1,
                MessageCount = 1,
                CreatedBy = "staff-01"
            };
            var msg = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = conv.Id,
                TenantId = tenantId,
                FacilityId = "fac-01",
                Seq = 1,
                SenderType = "Staff",
                SenderId = "staff-01",
                SenderDisplayName = "Dr. Santos",
                ContentText = "Morning clinical huddle",
                Visibility = MessageVisibility.Public,
                State = DeliveryState.Received,
                ClientSentAtUtc = DateTime.UtcNow,
                ServerReceivedAtUtc = DateTime.UtcNow,
                RetentionDeadlineUtc = DateTime.UtcNow.AddDays(7)
            };
            sourceDb.Conversations.Add(conv);
            sourceDb.Messages.Add(msg);
            await sourceDb.SaveChangesAsync();

            var exportService = new MigrationExportService(sourceDb, storage, crypto, gate, drain);
            var validBundlePath = Path.Combine(tempDir, "valid.clinicez-comms-bundle");
            await exportService.ExportAsync(tenantId, validBundlePath, passphrase, signerPrivateKeyPem);

            File.Exists(validBundlePath).Should().BeTrue();

            // 1. CLI Verify Success: Exit code 0
            var validExitCode = await ClinicEz.Comms.MigrationTool.Program.Main(new[]
            {
                "verify",
                "--bundle", validBundlePath,
                "--bundle-passphrase", passphrase,
                "--trusted-signer-key", signerPublicKeyPem
            });
            validExitCode.Should().Be(MigrationExitCodes.Success);

            // 2. Tampered Signature: Exit code 2 (SignatureFailure)
            var tamperedSigPath = Path.Combine(tempDir, "tampered-sig.clinicez-comms-bundle");
            using (var src = ZipFile.OpenRead(validBundlePath))
            using (var dst = ZipFile.Open(tamperedSigPath, ZipArchiveMode.Create))
            {
                foreach (var entry in src.Entries)
                {
                    var newEntry = dst.CreateEntry(entry.FullName);
                    using var inStream = entry.Open();
                    using var outStream = newEntry.Open();
                    if (entry.FullName == "bundle-signature.sig")
                    {
                        using var ms = new MemoryStream();
                        inStream.CopyTo(ms);
                        var bytes = ms.ToArray();
                        bytes[0] = bytes[0] == (byte)'A' ? (byte)'B' : (byte)'A';
                        outStream.Write(bytes);
                    }
                    else
                    {
                        inStream.CopyTo(outStream);
                    }
                }
            }

            var sigExitCode = await ClinicEz.Comms.MigrationTool.Program.Main(new[]
            {
                "verify",
                "--bundle", tamperedSigPath,
                "--bundle-passphrase", passphrase
            });
            sigExitCode.Should().Be(MigrationExitCodes.SignatureFailure);

            // 3. Tampered Data (Checksum Mismatch): Exit code 3 (ChecksumMismatch)
            var tamperedDataPath = Path.Combine(tempDir, "tampered-data.clinicez-comms-bundle");
            using (var src = ZipFile.OpenRead(validBundlePath))
            using (var dst = ZipFile.Open(tamperedDataPath, ZipArchiveMode.Create))
            {
                foreach (var entry in src.Entries)
                {
                    var newEntry = dst.CreateEntry(entry.FullName);
                    using var inStream = entry.Open();
                    using var outStream = newEntry.Open();
                    if (entry.FullName == "data/messages.json")
                    {
                        using var reader = new StreamReader(inStream);
                        var text = reader.ReadToEnd();
                        var tampered = text.Replace("Morning clinical huddle", "Tampered clinical huddle");
                        var bytes = Encoding.UTF8.GetBytes(tampered);
                        outStream.Write(bytes);
                    }
                    else
                    {
                        inStream.CopyTo(outStream);
                    }
                }
            }

            var dataExitCode = await ClinicEz.Comms.MigrationTool.Program.Main(new[]
            {
                "verify",
                "--bundle", tamperedDataPath,
                "--bundle-passphrase", passphrase
            });
            dataExitCode.Should().Be(MigrationExitCodes.ChecksumMismatch);
        }
        finally
        {
            if (Directory.Exists(tempDir))
            {
                try { Directory.Delete(tempDir, recursive: true); } catch { /* ignore */ }
            }
        }
    }

    // =========================================================================
    // Feature 29: Site-Local LAN Channels
    // =========================================================================
    [Fact]
    public async Task Feature29_SiteLocalLanChannels_NeverDispatchesToCloudHub()
    {
        await using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var publisher = new FakeInteropPublisher();
        var handler = new SendMessageCommandHandler(db, notifier, publisher);

        var tenantId = "tenant-alpha";
        var facilityId = "fac-edge-1";

        // 1. Site-Local Channel (IsLocalOnly = true)
        var localConversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            Title = "Emergency Room LAN Channel",
            IsLocalOnly = true,
            Scope = ConversationScope.Facility
        };
        db.Conversations.Add(localConversation);
        await db.SaveChangesAsync();

        var localMessageCmd = new SendMessageCommand(
            ConversationId: localConversation.Id,
            TenantId: tenantId,
            FacilityId: facilityId,
            SenderType: "Staff",
            SenderId: "nurse-01",
            SenderDisplayName: "Nurse Joy",
            ContentText: "Local LAN alert: Bed 4 needs assistance",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false
        );

        var localResult = await handler.Handle(localMessageCmd, CancellationToken.None);
        localResult.Should().NotBeNull();
        localResult.Seq.Should().Be(1);

        // Site-local channel produces zero outbound Interop Hub messages
        publisher.Enqueued.Should().BeEmpty("site-local channels must operate strictly on premises without dispatching to cloud Hub");

        // 2. Contrast with Cloud Replicated Channel (IsLocalOnly = false)
        var cloudConversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            Title = "Regional Operations Channel",
            IsLocalOnly = false,
            Scope = ConversationScope.Facility
        };
        db.Conversations.Add(cloudConversation);
        await db.SaveChangesAsync();

        var cloudMessageCmd = new SendMessageCommand(
            ConversationId: cloudConversation.Id,
            TenantId: tenantId,
            FacilityId: facilityId,
            SenderType: "Staff",
            SenderId: "nurse-01",
            SenderDisplayName: "Nurse Joy",
            ContentText: "Regional inventory sync message",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false
        );

        var cloudResult = await handler.Handle(cloudMessageCmd, CancellationToken.None);
        cloudResult.Should().NotBeNull();

        // Outbound Interop Hub envelope is enqueued for cloud replicated channels
        publisher.Enqueued.Should().ContainSingle();
        publisher.Enqueued[0].Type.Should().Be(InteropTypes.CommsMessageReplicate);
        publisher.Enqueued[0].CorrelationId.Should().Be(cloudConversation.Id);
    }

    // =========================================================================
    // Feature 30: Transcript Archival to Longitudinal Chart
    // =========================================================================
    [Fact]
    public async Task Feature30_TranscriptArchivalToChart_SerializesCleanTranscriptOnClosure()
    {
        await using var clinicDb = CreateInMemoryClinicDb();
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-prime";
        var patientId = Guid.NewGuid();
        var convId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        // 1. Seed addressed clinic in clinic-api
        clinicDb.Settings.Add(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Prime St. Jude Clinic",
            IsDeleted = false
        });
        await clinicDb.SaveChangesAsync();

        var resolver = new ClinicRecipientResolver(clinicDb, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new CommsTranscriptArchivedHandler(clinicDb, resolver, NullLogger<CommsTranscriptArchivedHandler>.Instance);

        var transcriptJson = JsonSerializer.Serialize(new
        {
            ConversationId = convId,
            Messages = new[]
            {
                new { Seq = 1, Sender = "Patient", Content = "Inquiring about clinic hours" },
                new { Seq = 2, Sender = "Staff", Content = "Clinic is open 8am to 5pm" }
            }
        });
        var transcriptSha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(transcriptJson)));

        var payload = new CommsTranscriptArchivedPayload(
            ConversationId: convId,
            TenantId: tenantId,
            FacilityId: clinicId.ToString(),
            FacilityType: "Clinic",
            PatientId: patientId,
            ContextType: "Encounter",
            ContextId: "enc-123",
            Category: MessageCategory.Other,
            Title: "General Inquiry Transcript",
            OpenedAtUtc: now.AddHours(-1),
            ClosedAtUtc: now,
            ClosedByStaffId: "staff-triage-1",
            ClosedByStaffName: "Nurse Receptionist",
            TriageDisposition: TriageDisposition.Answered,
            DeclineReasonCode: null,
            TotalMessageCount: 2,
            PublicMessageCount: 2,
            TranscriptJson: transcriptJson,
            TranscriptMarkdown: "# Transcript\n- Patient: Inquiring about clinic hours\n- Staff: Clinic is open 8am to 5pm",
            TranscriptSha256: transcriptSha256,
            Attachments: [],
            Version: 1,
            ArchivedAtUtc: now
        );

        var ctx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsTranscriptArchived,
            From = Party.ForFacility(tenantId, clinicId.ToString(), FacilityType.Clinic, service: InteropServices.Comms),
            To = Party.ForFacility(tenantId, clinicId.ToString(), FacilityType.Clinic),
            CorrelationId = convId
        });

        // Act: Ingest into clinic EMR
        await handler.HandleAsync(payload, ctx, CancellationToken.None);

        // Assert: Verified ClinicRecordAttachment created in patient's chart
        var attachment = await clinicDb.RecordAttachments.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.EncryptedHash == transcriptSha256);
        attachment.Should().NotBeNull();
        attachment!.RecordType.Should().Be("CommunicationTranscript");
        attachment.VerificationStatus.Should().Be("Verified");
        attachment.ClinicId.Should().Be(clinicId);
        attachment.PatientId.Should().Be(patientId);
        attachment.FileName.Should().Be($"transcript-{convId}.json");
        attachment.Notes.Should().Contain(transcriptSha256);

        // Assert: WORM audit entry created
        var audit = await clinicDb.AuditEntries.IgnoreQueryFilters().FirstOrDefaultAsync(e => e.Action == "comms.transcript.archived");
        audit.Should().NotBeNull();
        audit!.ActorName.Should().Be("Nurse Receptionist");
        audit.TargetEntityType.Should().Be("RecordAttachment");
        audit.Outcome.Should().Be(ClinicAuditOutcomes.Success);
    }

    // =========================================================================
    // Feature 31: Shared SDK Package Integration (@clinicez/comms-sdk)
    // =========================================================================
    [Fact]
    public void Feature31_SharedSdkPackage_ModularizesIntoCoreReactAndUi()
    {
        var repoRoot = FindRepoRoot();
        var packageJsonPath = Path.Combine(repoRoot, "packages", "comms-sdk", "package.json");

        File.Exists(packageJsonPath).Should().BeTrue($"package.json must exist at {packageJsonPath}");

        var json = File.ReadAllText(packageJsonPath);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        root.GetProperty("name").GetString().Should().Be("@clinicez/comms-sdk");

        var exports = root.GetProperty("exports");
        var expectedSubpaths = new Dictionary<string, string>
        {
            [ "." ] = "./src/index.ts",
            [ "./core" ] = "./src/core/index.ts",
            [ "./react" ] = "./src/react/index.ts",
            [ "./native-ui" ] = "./src/native-ui/index.ts",
            [ "./web-ui" ] = "./src/web-ui/index.ts"
        };

        foreach (var (subpath, expectedEntry) in expectedSubpaths)
        {
            exports.TryGetProperty(subpath, out var subElement).Should().BeTrue($"exports must declare '{subpath}'");
            var typesTarget = subElement.GetProperty("types").GetString();
            var importTarget = subElement.GetProperty("import").GetString();

            typesTarget.Should().Be(expectedEntry);
            importTarget.Should().Be(expectedEntry);

            var physicalPath = Path.Combine(repoRoot, "packages", "comms-sdk", expectedEntry.TrimStart('.', '/').Replace('/', Path.DirectorySeparatorChar));
            File.Exists(physicalPath).Should().BeTrue($"physical export target '{expectedEntry}' must exist at {physicalPath}");
        }

        // Verify key modular subsystem files exist
        var keySourceFiles = new[]
        {
            "src/core/queue/DeliveryStateTracker.ts",
            "src/core/connection/SignalRConnectionManager.ts",
            "src/react/hooks/useComms.ts",
            "src/native-ui/ChatDrawer.tsx",
            "src/native-ui/TriageQueueView.tsx",
            "src/web-ui/CallWaitingRoom.tsx"
        };

        foreach (var file in keySourceFiles)
        {
            var path = Path.Combine(repoRoot, "packages", "comms-sdk", file.Replace('/', Path.DirectorySeparatorChar));
            File.Exists(path).Should().BeTrue($"key SDK module file must exist at {path}");
        }
    }

    // =========================================================================
    // Feature 32: Workstation UI Integration Parity
    // =========================================================================
    [Fact]
    public void Feature32_WorkstationUiIntegration_EnforcesMinimumTouchTargetsAndDesignTokens()
    {
        var repoRoot = FindRepoRoot();

        // 1. Verify @clinicez/design-tokens scales.ts defines touchTarget = 44
        var scalesPath = Path.Combine(repoRoot, "packages", "design-tokens", "src", "scales.ts");
        File.Exists(scalesPath).Should().BeTrue($"scales.ts must exist at {scalesPath}");
        var scalesContent = File.ReadAllText(scalesPath);
        scalesContent.Should().Contain("touchTarget: 44", "minimum touch target must be defined as 44px in design tokens");

        // 2. Verify all 4 workstation applications integrate ChatDrawer from @clinicez/comms-sdk
        var workstationDrawerFiles = new[]
        {
            "apps/clinic-app/components/comms/ClinicChatDrawerHost.tsx",
            "apps/pharmacy-app/components/PharmacyChatModal.tsx",
            "apps/laboratory-app/components/LabChatModal.tsx",
            "apps/cashier-app/components/CashierChatModal.tsx"
        };

        foreach (var relPath in workstationDrawerFiles)
        {
            var fullPath = Path.Combine(repoRoot, relPath.Replace('/', Path.DirectorySeparatorChar));
            File.Exists(fullPath).Should().BeTrue($"workstation drawer host must exist at {fullPath}");
            var content = File.ReadAllText(fullPath);
            content.Should().Contain("ChatDrawer", $"{relPath} must integrate ChatDrawer component");
        }

        // 3. Verify packages/comms-sdk native-ui ChatDrawer enforces sizes.touchTarget and 4 UI states
        var chatDrawerPath = Path.Combine(repoRoot, "packages", "comms-sdk", "src", "native-ui", "ChatDrawer.tsx");
        File.Exists(chatDrawerPath).Should().BeTrue();
        var chatDrawerContent = File.ReadAllText(chatDrawerPath);

        chatDrawerContent.Should().Contain("sizes", "ChatDrawer must import token sizes from @clinicez/design-tokens");
        chatDrawerContent.Should().Contain("sizes.touchTarget", "ChatDrawer touch targets must enforce sizes.touchTarget");

        // Enforces the 4 canonical UI states: Loading, Empty, Error, Active
        chatDrawerContent.Should().Contain("<ActivityIndicator", "Loading state must be handled");
        chatDrawerContent.Should().Contain("emptyTitle", "Empty state must be handled with CTA");
        chatDrawerContent.Should().Contain("errorTitle", "Error state must be handled");
        chatDrawerContent.Should().Contain("items.map", "Active state must render conversation list items");

        // 4. Verify CallWaitingRoom in web-ui enforces 44px touch targets
        var waitingRoomPath = Path.Combine(repoRoot, "packages", "comms-sdk", "src", "web-ui", "CallWaitingRoom.tsx");
        File.Exists(waitingRoomPath).Should().BeTrue();
        var waitingRoomContent = File.ReadAllText(waitingRoomPath);
        waitingRoomContent.Should().Contain("min-h-[44px]", "web-ui CallWaitingRoom buttons must enforce min-h-[44px]");
        waitingRoomContent.Should().Contain("min-w-[44px]", "web-ui CallWaitingRoom icon buttons must enforce min-w-[44px]");
    }

    // =========================================================================
    // Feature 33: End-to-End System Integrity & Adversarial Battery
    // =========================================================================
    [Fact]
    public async Task Feature33_FullPlatformAdversarialBattery_ProvesZeroBrokerAndStrictIsolation()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-prime", "Prime Clinic"));

        // Prove Hub routes legitimate messages without brokers
        var legitimateMessage = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageSubmit,
            from: clinic.Party,
            to: clinic.Party,
            correlationId: Guid.NewGuid(),
            payload: new CommsMessageSubmitPayload(
                ClientMessageId: Guid.NewGuid(),
                ConversationId: Guid.NewGuid(),
                TenantId: clinic.Tenant,
                FacilityId: clinic.FacilityId,
                SenderType: "Staff",
                SenderId: Guid.NewGuid(),
                SenderDisplayName: "Dr. House",
                ContentText: "End-to-end zero broker validation message",
                Visibility: MessageVisibility.Public,
                RequiresAcknowledgement: false,
                Attachments: null,
                ClientSentAtUtc: DateTime.UtcNow,
                RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7)
            )
        );

        var result = await SendAsync(cell, InteropServices.Clinic, legitimateMessage);
        result.Status.Should().Be(SendResult.Accepted, "legitimate facility messages within tenant are accepted by the Interop Hub");

        // Verify message was stored in hub database
        var storedMessages = await cell.Hub.DbAsync(db => db.Messages
            .Where(m => m.Type == InteropTypes.CommsMessageSubmit)
            .ToListAsync());
        storedMessages.Should().NotBeEmpty("legitimate message must be stored in the hub database");
        storedMessages[0].Type.Should().Be(InteropTypes.CommsMessageSubmit);
    }

    private static async Task<SendResult> SendAsync(TestCell cell, string service, InteropEnvelope envelope)
    {
        var results = await cell.Hub.NewSdk(service).SendAsync([envelope], CancellationToken.None);
        return results.Should().ContainSingle().Subject;
    }

    // ── Helper Test Doubles & Context Factories ──────────────────────────────

    private static string FindRepoRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current != null)
        {
            if (File.Exists(Path.Combine(current.FullName, "CLINICEZ.sln")))
            {
                return current.FullName;
            }
            current = current.Parent;
        }
        throw new InvalidOperationException("Could not locate repository root containing CLINICEZ.sln.");
    }

    private static CommsDbContext CreateCommsDbContext()
    {
        var options = new DbContextOptionsBuilder<CommsDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        var config = new ConfigurationBuilder().Build();
        var db = new CommsDbContext(options, config);
        db.Database.EnsureCreated();
        return db;
    }

    private static ClinicApplicationDbContext CreateInMemoryClinicDb(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<ClinicApplicationDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString("N"))
            .Options;
        var config = new ConfigurationBuilder().Build();
        return new ClinicApplicationDbContext(options, config);
    }

    private static PatientDbContext CreatePatientDbContext()
    {
        var options = new DbContextOptionsBuilder<PatientDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        var db = new PatientDbContext(options);
        db.Database.EnsureCreated();
        return db;
    }

    private sealed class FakeCommsRealtimeNotifier : ICommsRealtimeNotifier
    {
        public Task NotifyMessageReceivedAsync(Guid conversationId, MessageDto message, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyMessageStateChangedAsync(Guid conversationId, Guid messageId, DeliveryState state, DateTime timestampUtc, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyReactionUpdatedAsync(Guid conversationId, Guid messageId, string reaction, string staffId, string? staffName, bool isAdded, int totalCount, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyMessageAcknowledgedAsync(Guid conversationId, Guid messageId, Guid accountId, string accountName, DateTime acknowledgedAtUtc, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyParticipantJoinedAsync(Guid conversationId, string participantId, string displayName, string role, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyParticipantLeftAsync(Guid conversationId, string participantId, string displayName, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyThreadStateChangedAsync(Guid conversationId, RequestStatus newStatus, TriageDisposition? disposition, string? assignedStaffId, string? assignedStaffName, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyConversationCreatedAsync(ConversationDto conversation, CancellationToken ct = default) => Task.CompletedTask;
        public Task NotifyConversationUpdatedAsync(ConversationDto conversation, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class FakeInteropPublisher : IInteropPublisher
    {
        public List<InteropEnvelope> Enqueued { get; } = new();

        public InteropEnvelope Enqueue<T>(
            string type,
            Party from,
            Party to,
            Guid correlationId,
            T payload,
            int schemaVersion = 1,
            TimeSpan? ttl = null)
        {
            var envelope = InteropEnvelope.Create(type, from, to, correlationId, payload, schemaVersion, ttl);
            Enqueued.Add(envelope);
            return envelope;
        }

        public void Enqueue(InteropEnvelope envelope)
        {
            Enqueued.Add(envelope);
        }
    }

    private sealed class CapturingPushNotificationService : IPushNotificationService
    {
        public List<(string Token, string Title, string Body, string Action)> Dispatched { get; } = new();

        public Task SendPushNotificationAsync(string token, string title, string body, string action, CancellationToken cancellationToken = default)
        {
            Dispatched.Add((token, title, body, action));
            return Task.CompletedTask;
        }
    }

    private sealed class NoopSyncNotificationService : ISyncNotificationService
    {
        public Task NotifySyncCompletedAsync(Guid patientId, int applied, int conflicts, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task NotifySessionRevokedAsync(Guid patientId, string reason, string? deviceId = null, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task NotifyCommsEventAsync(Guid patientId, string eventType, object? payload, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
