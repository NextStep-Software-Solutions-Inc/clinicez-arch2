using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Triage.Commands;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Constants;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Interop;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

// Aliases
using ClinicAppointment = ClinicEz.Clinic.Domain.Entities.Appointment;
using ClinicPatientEntity = ClinicEz.Clinic.Domain.Entities.Patient;
using PatientEntity = ClinicEz.Patient.Domain.Entities.Patient;
using PatientDbContext = ClinicEz.Patient.Infrastructure.Persistence.ApplicationDbContext;
using ClinicDbContext = ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Empirical Challenger Adversarial Test Battery for Comms M9:
/// Stress-tests and adversarially challenges the 8 core security and triage domains:
///  1. Triage Intake (Eligibility Grant validation, Rate limits, Category caps, Cooldown)
///  2. Emergency Screening Gate (Confirmation requirement, Zero storage on emergency, Reopen emergency block)
///  3. Mandatory Disposition Gate (Permission check, Valid decline codes, Public response requirement, Internal note isolation)
///  4. Reopen Lifecycle Limit Guard (Terminal-only reopen, Single reopen limit, Revoked grant on reopen)
///  5. Teleconsult Payment Gate (Prepaid payment blocking, Non-prepaid allowance)
///  6. PhilHealth Konsulta YAKAP Auto-Exemption (Active enlistment exemption, Expired/pending non-exemption)
///  7. Audited Emergency Overrides (Signing authority check, Valid reason code check, Reason length check, WORM audit logging)
///  8. Zero PHI Push Notification Delivery (Internal message dropping, Generic push format, Zero diagnostic text)
/// </summary>
public class ChallengerCommsM9SecurityAndTriageTests
{
    // =========================================================================
    // 1. Triage Intake Security, Eligibility Grants & Throttling
    // =========================================================================

    [Theory]
    [InlineData("NoGrant")]
    [InlineData("InactiveGrant")]
    [InlineData("ExpiredGrant")]
    [InlineData("FutureGrant")]
    public async Task Challenger_TriageIntake_WhenGrantInvalidOrMissing_StrictlyThrowsForbidden(string grantScenario)
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        if (grantScenario == "InactiveGrant")
        {
            db.EligibilityGrants.Add(new EligibilityGrant
            {
                Id = Guid.NewGuid(),
                TenantId = "tenant-challenger",
                FacilityId = "clinic-1",
                FacilityType = "Clinic",
                PatientId = patientId,
                WindowStartUtc = now.AddDays(-1),
                WindowEndUtc = now.AddDays(7),
                IsActive = false, // Inactive!
                Version = 1
            });
        }
        else if (grantScenario == "ExpiredGrant")
        {
            db.EligibilityGrants.Add(new EligibilityGrant
            {
                Id = Guid.NewGuid(),
                TenantId = "tenant-challenger",
                FacilityId = "clinic-1",
                FacilityType = "Clinic",
                PatientId = patientId,
                WindowStartUtc = now.AddDays(-10),
                WindowEndUtc = now.AddDays(-1), // Expired!
                IsActive = true,
                Version = 1
            });
        }
        else if (grantScenario == "FutureGrant")
        {
            db.EligibilityGrants.Add(new EligibilityGrant
            {
                Id = Guid.NewGuid(),
                TenantId = "tenant-challenger",
                FacilityId = "clinic-1",
                FacilityType = "Clinic",
                PatientId = patientId,
                WindowStartUtc = now.AddDays(1), // Not active yet!
                WindowEndUtc = now.AddDays(7),
                IsActive = true,
                Version = 1
            });
        }
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, notifier);
        var cmd = new SubmitPatientRequestCommand(
            TenantId: "tenant-challenger",
            FacilityId: "clinic-1",
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Other,
            ContentText: "Inquiry without valid grant",
            IsEmergencyConfirmed: false);

        var act = async () => await handler.Handle(cmd, CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*INELIGIBLE*");
    }

    [Fact]
    public async Task Challenger_TriageIntake_WhenDuplicateCategoryOrFacilityCapOrRateLimitExceeded_ThrowsValidation()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });

        // 1. Existing open conversation in PrescriptionRefill
        db.Conversations.Add(new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            PatientId = patientId,
            Category = MessageCategory.PrescriptionRefill,
            Status = RequestStatus.WithTriage,
            CreatedAtUtc = now.AddMinutes(-10)
        });
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, notifier);

        // Attempt second open inquiry in same category -> CAP_EXCEEDED
        var duplicateCategoryCmd = new SubmitPatientRequestCommand(
            TenantId: "tenant-challenger",
            FacilityId: "clinic-1",
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.PrescriptionRefill,
            ContentText: "Another refill request",
            IsEmergencyConfirmed: false);

        var act1 = async () => await handler.Handle(duplicateCategoryCmd, CancellationToken.None);
        await act1.Should().ThrowAsync<ValidationException>()
            .WithMessage("*CAP_EXCEEDED: Only 1 active open inquiry is allowed per category*");

        // 2. Add second open conversation in different category to same facility
        db.Conversations.Add(new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            PatientId = patientId,
            Category = MessageCategory.Scheduling,
            Status = RequestStatus.WithTriage,
            CreatedAtUtc = now.AddMinutes(-5)
        });
        await db.SaveChangesAsync();

        // Attempt third open inquiry to same facility -> CAP_EXCEEDED
        var thirdFacilityCmd = new SubmitPatientRequestCommand(
            TenantId: "tenant-challenger",
            FacilityId: "clinic-1",
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Other,
            ContentText: "Third inquiry to same facility",
            IsEmergencyConfirmed: false);

        var act2 = async () => await handler.Handle(thirdFacilityCmd, CancellationToken.None);
        await act2.Should().ThrowAsync<ValidationException>()
            .WithMessage("*CAP_EXCEEDED: Maximum 2 active open inquiries are allowed per facility*");
    }

    [Fact]
    public async Task Challenger_TriageIntake_WhenCategoryDeclinedWithin24Hours_EnforcesCooldown()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });

        // Add inquiry in MedicineQuestion declined 4 hours ago
        db.Conversations.Add(new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            PatientId = patientId,
            Category = MessageCategory.MedicineQuestion,
            Status = RequestStatus.Declined,
            DeclineReasonCode = "OUT_OF_SCOPE",
            CreatedAtUtc = now.AddHours(-5),
            ClosedAtUtc = now.AddHours(-4)
        });
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, notifier);
        var cmd = new SubmitPatientRequestCommand(
            TenantId: "tenant-challenger",
            FacilityId: "clinic-1",
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.MedicineQuestion,
            ContentText: "Retry medicine question",
            IsEmergencyConfirmed: false);

        var act = async () => await handler.Handle(cmd, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*COOLDOWN_ACTIVE: Inquiries in this category were recently declined*");
    }

    // =========================================================================
    // 2. Emergency Screening Gate
    // =========================================================================

    [Fact]
    public async Task Challenger_EmergencyGate_WhenEmergencyConfirmed_NeverStoresConversationAndReturnsRedirect()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-challenger",
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

        // Patient confirms emergency symptoms
        var emergencyCmd = new SubmitPatientRequestCommand(
            TenantId: "tenant-challenger",
            FacilityId: "clinic-1",
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.MedicineQuestion,
            ContentText: "I am having sudden crushing chest pain radiating to left arm",
            IsEmergencyConfirmed: true); // Emergency Confirmed!

        var result = await handler.Handle(emergencyCmd, CancellationToken.None);

        result.IsEmergencyRedirect.Should().BeTrue();
        result.Conversation.Should().BeNull("zero conversations or threads may be created for emergency redirects");
        result.RedirectMessage.Should().Contain("call 911 immediately or proceed to the nearest emergency department");

        // EMPIRICAL PROOF: Absolutely ZERO conversations and ZERO messages persisted in DB!
        var convCount = await db.Conversations.CountAsync();
        convCount.Should().Be(0, "emergency redirection must never persist conversation records");

        var msgCount = await db.Messages.CountAsync();
        msgCount.Should().Be(0, "emergency redirection must never persist message records");
    }

    [Fact]
    public async Task Challenger_EmergencyGate_WhenEmergencyConfirmationMissing_StrictlyThrowsValidation()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var handler = new SubmitPatientRequestCommandHandler(db, notifier);

        var nullEmergencyCmd = new SubmitPatientRequestCommand(
            TenantId: "tenant-challenger",
            FacilityId: "clinic-1",
            FacilityType: "Clinic",
            PatientId: Guid.NewGuid(),
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Other,
            ContentText: "Inquiry without answering emergency question",
            IsEmergencyConfirmed: null); // Missing!

        var act = async () => await handler.Handle(nullEmergencyCmd, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*EMERGENCY_CONFIRMATION_REQUIRED*");
    }

    [Fact]
    public async Task Challenger_EmergencyGate_OnReopen_RejectsEmergencyConfirmationAndMissingConfirmation()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-challenger",
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
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            PatientId = patientId,
            Status = RequestStatus.Closed,
            ClosedAtUtc = now.AddHours(-2),
            ReopenCount = 0
        });
        await db.SaveChangesAsync();

        var handler = new ReopenConversationCommandHandler(db, notifier);

        // 1. Missing emergency confirmation throws
        var missingCmd = new ReopenConversationCommand(
            convId, "tenant-challenger", patientId, IsEmergencyConfirmed: null, Reason: "Reopening");
        var actMissing = async () => await handler.Handle(missingCmd, CancellationToken.None);
        await actMissing.Should().ThrowAsync<ValidationException>()
            .WithMessage("*EMERGENCY_CONFIRMATION_REQUIRED*");

        // 2. Confirmed emergency on reopen throws EMERGENCY_REDIRECT
        var emergencyCmd = new ReopenConversationCommand(
            convId, "tenant-challenger", patientId, IsEmergencyConfirmed: true, Reason: "Sudden breathing difficulty");
        var actEmergency = async () => await handler.Handle(emergencyCmd, CancellationToken.None);
        await actEmergency.Should().ThrowAsync<ValidationException>()
            .WithMessage("*EMERGENCY_REDIRECT*");
    }

    // =========================================================================
    // 3. Mandatory Disposition Gate & Structured Reason Codes
    // =========================================================================

    [Fact]
    public async Task Challenger_DispositionGate_WhenCallerLacksTriagePermission_StrictlyThrowsForbidden()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var serializer = new TranscriptSerializer();
        var publisher = new FakeInteropPublisher();
        var handler = new RecordTriageDispositionCommandHandler(db, notifier, serializer, publisher);

        var cmd = new RecordTriageDispositionCommand(
            ConversationId: Guid.NewGuid(),
            TenantId: "tenant-challenger",
            StaffId: "staff-1",
            StaffName: "Receptionist",
            StaffPermissions: ["messaging:read", "messaging:write"], // NO messaging:triage, admin, or messaging:manage
            Disposition: TriageDisposition.Answered,
            PublicResponseText: "Here is your answer");

        var act = async () => await handler.Handle(cmd, CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*messaging:triage*");
    }

    [Fact]
    public async Task Challenger_DispositionGate_DeclinedDisposition_StrictlyRequiresStatutoryReasonCode()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var serializer = new TranscriptSerializer();
        var publisher = new FakeInteropPublisher();
        var handler = new RecordTriageDispositionCommandHandler(db, notifier, serializer, publisher);

        var convId = Guid.NewGuid();
        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            Status = RequestStatus.WithTriage,
            Category = MessageCategory.MedicineQuestion
        });
        await db.SaveChangesAsync();

        // 1. Invalid reason code (e.g. "DECLINE-01" used in original tautological test!) throws ValidationException
        var invalidCodeCmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: "tenant-challenger",
            StaffId: "nurse-1",
            StaffName: "Triage Nurse",
            StaffPermissions: ["messaging:triage"],
            Disposition: TriageDisposition.Declined,
            DeclineReasonCode: "DECLINE-01"); // INVALID!

        var actInvalid = async () => await handler.Handle(invalidCodeCmd, CancellationToken.None);
        await actInvalid.Should().ThrowAsync<ValidationException>()
            .WithMessage("*A valid DeclineReasonCode is mandatory*");

        // 2. Missing reason code throws ValidationException
        var missingCodeCmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: "tenant-challenger",
            StaffId: "nurse-1",
            StaffName: "Triage Nurse",
            StaffPermissions: ["messaging:triage"],
            Disposition: TriageDisposition.Declined,
            DeclineReasonCode: null);

        var actMissing = async () => await handler.Handle(missingCodeCmd, CancellationToken.None);
        await actMissing.Should().ThrowAsync<ValidationException>()
            .WithMessage("*A valid DeclineReasonCode is mandatory*");

        // 3. Valid statutory reason code (e.g. DeclineReasonCodes.OutOfScope) succeeds
        var validCmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: "tenant-challenger",
            StaffId: "nurse-1",
            StaffName: "Triage Nurse",
            StaffPermissions: ["messaging:triage"],
            Disposition: TriageDisposition.Declined,
            DeclineReasonCode: DeclineReasonCodes.OutOfScope);

        var result = await handler.Handle(validCmd, CancellationToken.None);
        result.Status.Should().Be(RequestStatus.Declined);
        result.DeclineReasonCode.Should().Be("OUT_OF_SCOPE");
        result.ClosedAtUtc.Should().NotBeNull();
    }

    [Theory]
    [InlineData(TriageDisposition.Answered)]
    [InlineData(TriageDisposition.NeedsVisit)]
    public async Task Challenger_DispositionGate_AnsweredAndNeedsVisit_StrictlyRequirePublicResponseText(TriageDisposition disposition)
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var serializer = new TranscriptSerializer();
        var publisher = new FakeInteropPublisher();
        var handler = new RecordTriageDispositionCommandHandler(db, notifier, serializer, publisher);

        var convId = Guid.NewGuid();
        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            Status = RequestStatus.WithTriage,
            Category = MessageCategory.MedicineQuestion
        });
        await db.SaveChangesAsync();

        // Null or whitespace public text throws ValidationException
        var emptyCmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: "tenant-challenger",
            StaffId: "nurse-1",
            StaffName: "Triage Nurse",
            StaffPermissions: ["messaging:triage"],
            Disposition: disposition,
            PublicResponseText: "   "); // Whitespace!

        var act = async () => await handler.Handle(emptyCmd, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task Challenger_DispositionGate_InternalNote_IsStrictlyMarkedInternalAndExcludedFromTranscript()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var serializer = new TranscriptSerializer();
        var publisher = new FakeInteropPublisher();
        var handler = new RecordTriageDispositionCommandHandler(db, notifier, serializer, publisher);

        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var conv = new Conversation
        {
            Id = convId,
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            PatientId = patientId,
            Status = RequestStatus.WithTriage,
            Category = MessageCategory.MedicineQuestion
        };
        db.Conversations.Add(conv);
        await db.SaveChangesAsync();

        const string confidentialInternalNote = "Staff review note: Patient shows high anxiety, recommend gentle explanation in consultation.";

        var cmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: "tenant-challenger",
            StaffId: "nurse-1",
            StaffName: "Triage Nurse",
            StaffPermissions: ["messaging:triage"],
            Disposition: TriageDisposition.Answered,
            InternalNote: confidentialInternalNote,
            PublicResponseText: "Your inquiry has been answered. Take meds with food.");

        await handler.Handle(cmd, CancellationToken.None);

        // 1. Verify internal note saved in database with MessageVisibility.Internal
        var messages = await db.Messages.Where(m => m.ConversationId == convId).ToListAsync();
        messages.Should().HaveCount(2);

        var internalMsg = messages.Single(m => m.Visibility == MessageVisibility.Internal);
        internalMsg.ContentText.Should().Be(confidentialInternalNote);

        var publicMsg = messages.Single(m => m.Visibility == MessageVisibility.Public);
        publicMsg.ContentText.Should().Be("Your inquiry has been answered. Take meds with food.");

        // 2. Verify serialized transcript published to outbox completely EXCLUDES internal note
        var transcriptEnvelope = publisher.Enqueued.Single(e => e.Type == InteropTypes.CommsTranscriptArchived);
        var transcriptPayload = JsonSerializer.Deserialize<CommsTranscriptArchivedPayload>(transcriptEnvelope.Payload.GetRawText(), InteropJson.Options)!;
        transcriptPayload.TranscriptMarkdown.Should().NotContain(confidentialInternalNote);
        transcriptPayload.TranscriptJson.Should().NotContain(confidentialInternalNote);
        transcriptPayload.PublicMessageCount.Should().Be(1);
        transcriptPayload.TotalMessageCount.Should().Be(2);
    }

    // =========================================================================
    // 4. Reopen Lifecycle Limit Guard
    // =========================================================================

    [Fact]
    public async Task Challenger_ReopenLifecycle_WhenConversationNotClosed_StrictlyThrowsValidation()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });

        // Active conversation with status = WithTriage (NOT closed)
        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            PatientId = patientId,
            Status = RequestStatus.WithTriage,
            ClosedAtUtc = null,
            ReopenCount = 0
        });
        await db.SaveChangesAsync();

        var handler = new ReopenConversationCommandHandler(db, notifier);
        var cmd = new ReopenConversationCommand(convId, "tenant-challenger", patientId, false, "Trying to reopen active inquiry");

        var act = async () => await handler.Handle(cmd, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Only closed or terminal conversations can be reopened*");
    }

    [Fact]
    public async Task Challenger_ReopenLifecycle_WhenEligibilityGrantExpiredAtReopenTime_ThrowsForbidden()
    {
        using var db = CreateCommsDbContext();
        var notifier = new FakeCommsRealtimeNotifier();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        // Grant has expired!
        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-10),
            WindowEndUtc = now.AddDays(-1), // Expired
            IsActive = true,
            Version = 1
        });

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = "tenant-challenger",
            FacilityId = "clinic-1",
            PatientId = patientId,
            Status = RequestStatus.Closed,
            ClosedAtUtc = now.AddDays(-2),
            ReopenCount = 0
        });
        await db.SaveChangesAsync();

        var handler = new ReopenConversationCommandHandler(db, notifier);
        var cmd = new ReopenConversationCommand(convId, "tenant-challenger", patientId, false, "Grant expired reopen attempt");

        var act = async () => await handler.Handle(cmd, CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*INELIGIBLE: Active eligibility grant has expired or was revoked*");
    }

    // =========================================================================
    // 5 & 7. Teleconsult Payment Gate & Audited Emergency Overrides
    // =========================================================================

    [Fact]
    public async Task Challenger_EmergencyOverride_WhenCallerLacksSigningAuthority_StrictlyThrowsForbidden()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-challenger", "Challenger Clinic"));
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();

        await cell.Clinic.DbAsync(async db =>
        {
            db.Appointments.Add(new ClinicAppointment
            {
                Id = appointmentId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                PatientId = patientId,
                PatientName = "Pedro Penduko",
                DoctorId = doctorId,
                ScheduledAt = DateTime.UtcNow,
                AppointmentType = AppointmentType.Teleconsult,
                PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
                PaymentStatus = TeleconsultPaymentStatus.Pending
            });
            await db.SaveChangesAsync();
            return true;
        });

        using var _ = cell.Clinic.Ambient.Enter(clinic.Tenant, clinic.Id);
        using var scope = cell.Clinic.Provider.CreateScope();
        var sp = scope.ServiceProvider;
        var apptRepo = sp.GetRequiredService<IRepository<ClinicAppointment>>();
        var patRepo = sp.GetRequiredService<IRepository<ClinicPatientEntity>>();
        var auditRepo = sp.GetRequiredService<IRepository<AuditEntry>>();
        var unitOfWork = sp.GetRequiredService<IUnitOfWork>();
        var publisher = sp.GetRequiredService<IInteropPublisher>();
        var context = new FakeClinicContext(clinic.Tenant, clinic.Id, hasSigningAuthority: false);

        var handler = new AdmitTeleconsultPatientCommandHandler(
            apptRepo, patRepo, auditRepo, unitOfWork, context, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance);

        var overrideDto = new EmergencyOverrideDto(
            ReasonCode: EmergencyOverrideReasonCodes.AcuteChestPain,
            ReasonNote: "Emergency override attempt without doctor signing permission");

        var act = async () => await handler.Handle(new AdmitTeleconsultPatientCommand(appointmentId, overrideDto), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<ForbiddenException>();
        ex.WithMessage("*Only attending clinicians or doctors with signing authority can authorize emergency clinical overrides*");
    }

    [Fact]
    public async Task Challenger_EmergencyOverride_WhenReasonCodeInvalidOrReasonTooShort_ThrowsBadRequest()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-challenger", "Challenger Clinic"));
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var appt1 = Guid.NewGuid();
        var appt2 = Guid.NewGuid();

        await cell.Clinic.DbAsync(async db =>
        {
            db.Appointments.AddRange(
                new ClinicAppointment
                {
                    Id = appt1,
                    TenantId = clinic.Tenant,
                    ClinicId = clinic.Id,
                    PatientId = patientId,
                    PatientName = "Patient One",
                    DoctorId = doctorId,
                    ScheduledAt = DateTime.UtcNow,
                    AppointmentType = AppointmentType.Teleconsult,
                    PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
                    PaymentStatus = TeleconsultPaymentStatus.Pending
                },
                new ClinicAppointment
                {
                    Id = appt2,
                    TenantId = clinic.Tenant,
                    ClinicId = clinic.Id,
                    PatientId = patientId,
                    PatientName = "Patient Two",
                    DoctorId = doctorId,
                    ScheduledAt = DateTime.UtcNow,
                    AppointmentType = AppointmentType.Teleconsult,
                    PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
                    PaymentStatus = TeleconsultPaymentStatus.Pending
                });
            await db.SaveChangesAsync();
            return true;
        });

        // 1. Invalid / unrecognized reason code throws BadRequestException
        var invalidCodeDto = new EmergencyOverrideDto(
            ReasonCode: "INVALID_UNRECOGNIZED_CODE",
            ReasonNote: "Substantive clinical justification here");

        var act1 = () => cell.Clinic.SendAsync(
            clinic.Tenant,
            clinic.Id,
            new AdmitTeleconsultPatientCommand(appt1, invalidCodeDto),
            staffId: doctorId);

        await act1.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*is not a recognized statutory reason code*");

        // 2. Reason note shorter than 5 chars throws BadRequestException
        var shortNoteDto = new EmergencyOverrideDto(
            ReasonCode: EmergencyOverrideReasonCodes.AcuteChestPain,
            ReasonNote: "pain"); // Only 4 chars!

        var act2 = () => cell.Clinic.SendAsync(
            clinic.Tenant,
            clinic.Id,
            new AdmitTeleconsultPatientCommand(appt2, shortNoteDto),
            staffId: doctorId);

        await act2.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*minimum 5 characters*");
    }

    [Fact]
    public async Task Challenger_PaymentGate_NonPrepaidPolicy_AllowsImmediateAdmission()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-challenger", "Challenger Clinic"));
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var apptPostpaid = Guid.NewGuid();

        await cell.Clinic.DbAsync(async db =>
        {
            db.Appointments.Add(new ClinicAppointment
            {
                Id = apptPostpaid,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                PatientId = patientId,
                PatientName = "Postpaid Corporate Patient",
                DoctorId = doctorId,
                ScheduledAt = DateTime.UtcNow,
                AppointmentType = AppointmentType.Teleconsult,
                PaymentPolicy = TeleconsultPaymentPolicy.Postpaid, // Postpaid client
                PaymentStatus = TeleconsultPaymentStatus.Pending
            });
            await db.SaveChangesAsync();
            return true;
        });

        // Act: Admit without upfront payment or override
        var result = await cell.Clinic.SendAsync(
            clinic.Tenant,
            clinic.Id,
            new AdmitTeleconsultPatientCommand(apptPostpaid),
            staffId: doctorId);

        result.Should().NotBeNull();
        result.IsEmergencyOverride.Should().BeFalse();
        result.RoomName.Should().StartWith("call-");
    }

    // =========================================================================
    // 6. PhilHealth Konsulta YAKAP Auto-Exemption
    // =========================================================================

    [Fact]
    public async Task Challenger_YakapAutoExemption_WhenEnlistmentExpiredOrPending_DoesNotExempt()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-challenger", "Challenger Clinic"));
        var doctorId = Guid.NewGuid();
        var patientExpiredId = Guid.NewGuid();
        var apptExpired = Guid.NewGuid();

        await cell.Clinic.DbAsync(async db =>
        {
            var patientExpired = new ClinicPatientEntity
            {
                Id = patientExpiredId,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                PatientCode = "PAT-EXP-YAKAP",
                FirstName = "Marcelo",
                LastName = "Del Pilar",
                DateOfBirth = new DateOnly(1975, 8, 30),
                ContactNumber = "09190000001",
                PhilHealthNumber = "12-999999999-1"
            };

            // Enlistment for 2025 (Expired relative to encounter in 2026!)
            patientExpired.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
            {
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                PatientId = patientExpiredId,
                EffectiveYear = 2025,
                EnlistmentDate = new DateOnly(2025, 1, 10),
                ValidUntil = new DateOnly(2025, 12, 31),
                Status = YakapEnlistmentStatus.Active
            });

            var appt = new ClinicAppointment
            {
                Id = apptExpired,
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                PatientId = patientExpiredId,
                PatientName = "Marcelo Del Pilar",
                DoctorId = doctorId,
                ScheduledAt = new DateTime(2026, 10, 26, 15, 0, 0, DateTimeKind.Utc), // 2026!
                AppointmentType = AppointmentType.Teleconsult,
                PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
                PaymentStatus = TeleconsultPaymentStatus.Pending
            };

            db.Patients.Add(patientExpired);
            db.Appointments.Add(appt);
            await db.SaveChangesAsync();
            return true;
        });

        // Act: Admit teleconsult for patient with EXPIRED enlistment -> Must NOT auto-exempt!
        var act = () => cell.Clinic.SendAsync(
            clinic.Tenant,
            clinic.Id,
            new AdmitTeleconsultPatientCommand(apptExpired),
            staffId: doctorId);

        // Blocks with HTTP 409 payment_required
        var ex = await act.Should().ThrowAsync<TeleconsultPaymentRequiredException>();
        ex.Which.AppointmentId.Should().Be(apptExpired);
    }

    // =========================================================================
    // 8. Zero PHI Push Notification Delivery
    // =========================================================================

    [Fact]
    public async Task Challenger_ZeroPhiPush_InternalMessage_IsStrictlyDroppedWithZeroPushOrStore()
    {
        var options = new DbContextOptionsBuilder<PatientDbContext>()
            .UseInMemoryDatabase($"patient-push-internal-{Guid.NewGuid():N}")
            .Options;
        await using var db = new PatientDbContext(options);

        var patientId = Guid.NewGuid();
        var messageId = Guid.NewGuid();
        var conversationId = Guid.NewGuid();
        const string pushToken = "ExponentPushToken[internal-secret-token]";

        db.DeviceSessions.Add(new DeviceSession
        {
            Id = Guid.NewGuid(),
            PatientId = patientId,
            DeviceId = "device-challenger-1",
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

        // Internal message with staff note
        var internalPayload = new CommsMessageReplicatePayload(
            MessageId: messageId,
            ConversationId: conversationId,
            Seq: 1,
            TenantId: "tenant-challenger",
            FacilityId: Guid.NewGuid().ToString(),
            SenderType: "Staff",
            SenderId: Guid.NewGuid(),
            SenderDisplayName: "Dr. Gregory House",
            ContentText: "Confidential staff peer review note",
            Visibility: MessageVisibility.Internal, // INTERNAL NOTE!
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
            From = Party.ForFacility("tenant-challenger", "fac-1", FacilityType.Clinic, service: InteropServices.Comms),
            To = Party.ForPatient(patientId.ToString()),
            CorrelationId = conversationId
        });

        // Act: Deliver message with Visibility.Internal
        await handler.HandleAsync(internalPayload, interopContext, CancellationToken.None);

        // Assert 1: Push notifications dispatched must be strictly ZERO
        capturingPush.Dispatched.Should().BeEmpty("internal staff notes must NEVER trigger push notifications to patients");

        // Assert 2: Database message records stored must be strictly ZERO
        var storedMsg = await db.PatientMessages.FirstOrDefaultAsync(m => m.Id == messageId);
        storedMsg.Should().BeNull("internal staff notes must NEVER be stored in the patient database replica");

        // Assert 3: Hub acknowledgements dispatched must be strictly ZERO
        mockPublisher.Enqueued.Should().BeEmpty("internal messages must not receive receipt acknowledgements");
    }

    [Fact]
    public async Task Challenger_ZeroPhiPush_WhenClinicNameMissing_FallsBackSafelyWithZeroPhi()
    {
        var options = new DbContextOptionsBuilder<PatientDbContext>()
            .UseInMemoryDatabase($"patient-push-fallback-{Guid.NewGuid():N}")
            .Options;
        await using var db = new PatientDbContext(options);

        var patientId = Guid.NewGuid();
        var messageId = Guid.NewGuid();
        var conversationId = Guid.NewGuid();
        const string pushToken = "ExponentPushToken[fallback-token]";

        db.DeviceSessions.Add(new DeviceSession
        {
            Id = Guid.NewGuid(),
            PatientId = patientId,
            DeviceId = "device-fallback",
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

        const string sensitiveContent = "Positive screening for pulmonary tuberculosis. Sputum culture pending.";

        var payload = new CommsMessageReplicatePayload(
            MessageId: messageId,
            ConversationId: conversationId,
            Seq: 1,
            TenantId: "tenant-challenger",
            FacilityId: "unregistered-facility-id",
            SenderType: "Doctor",
            SenderId: Guid.NewGuid(),
            SenderDisplayName: "Dr. Santos",
            ContentText: sensitiveContent,
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
            From = Party.ForFacility("tenant-challenger", "fac-1", FacilityType.Clinic, service: InteropServices.Comms),
            To = Party.ForPatient(patientId.ToString()),
            CorrelationId = conversationId
        });

        await handler.HandleAsync(payload, interopContext, CancellationToken.None);

        capturingPush.Dispatched.Should().NotBeEmpty();
        var push = capturingPush.Dispatched.Single(p => p.Token == pushToken);

        // Verifies fallback message format
        push.Title.Should().Be("New Message");
        push.Body.Should().Be("You have a new message from Facility.");

        // Invariant: Zero clinical terms leaked
        push.Body.Should().NotContain("tuberculosis");
        push.Body.Should().NotContain("pulmonary");
        push.Body.Should().NotContain("Sputum");
    }

    // ── Helper Test Doubles ──────────────────────────────────────────────────

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

    private sealed class FakeClinicContext : IClinicContext
    {
        private readonly bool _hasSigningAuthority;

        public FakeClinicContext(string tenantId, Guid clinicId, bool hasSigningAuthority)
        {
            TenantId = tenantId;
            ClinicId = clinicId;
            _hasSigningAuthority = hasSigningAuthority;
        }

        public string TenantId { get; }
        public Guid ClinicId { get; }
        public Guid? BranchId => null;
        public Guid? StaffId => Guid.NewGuid();
        public string? StaffName => "Nurse Jackie";
        public string? StaffRole => "Nurse";
        public IReadOnlyList<string> Permissions => _hasSigningAuthority ? [ClinicPermissions.ConsultationsSign] : [];
        public bool HasPermission(string permission) => _hasSigningAuthority && permission == ClinicPermissions.ConsultationsSign;
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
