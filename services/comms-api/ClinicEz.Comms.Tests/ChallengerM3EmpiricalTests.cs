using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Conversations.Commands;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Application.Features.Triage.Commands;
using ClinicEz.Comms.Domain.Constants;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Moq;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class ChallengerM3EmpiricalTests
{
    private readonly Mock<ICommsRealtimeNotifier> _notifierMock = new();
    private readonly Mock<IInteropPublisher> _publisherMock = new();
    private readonly TranscriptSerializer _serializer = new();

    private const string TenantId = "tenant-challenger-m3";
    private const string FacilityId = "clinic-challenger-facility-1";
    private const string FacilityId2 = "clinic-challenger-facility-2";

    #region Group 1: Emergency Gate Bypass Attempts

    [Fact]
    public async Task Emp_1_1_Submit_EmergencyConfirmed_True_ZeroMessagesStored_ReturnsRedirect()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);
        var patientId = Guid.NewGuid();

        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Other,
            ContentText: "Severe crushing chest pain, difficulty breathing",
            IsEmergencyConfirmed: true);

        var result = await handler.Handle(cmd, CancellationToken.None);

        Assert.True(result.IsEmergencyRedirect);
        Assert.NotNull(result.RedirectMessage);
        Assert.Contains("911", result.RedirectMessage);
        Assert.Null(result.Conversation);

        // Invariant: zero messages and zero conversations stored in DB
        Assert.Empty(db.Conversations);
        Assert.Empty(db.Messages);
    }

    [Fact]
    public async Task Emp_1_2_Submit_EmergencyConfirmed_Null_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: Guid.NewGuid(),
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Scheduling,
            ContentText: "Need schedule",
            IsEmergencyConfirmed: null);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("EMERGENCY_CONFIRMATION_REQUIRED", ex.Message);
        Assert.Empty(db.Conversations);
        Assert.Empty(db.Messages);
    }

    [Fact]
    public async Task Emp_1_3_Reopen_EmergencyConfirmed_True_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Status = RequestStatus.Closed,
            ClosedAtUtc = DateTime.UtcNow.AddDays(-1),
            ReopenCount = 0
        });
        await db.SaveChangesAsync();

        var handler = new ReopenConversationCommandHandler(db, _notifierMock.Object, _publisherMock.Object);

        var cmd = new ReopenConversationCommand(
            ConversationId: convId,
            TenantId: TenantId,
            PatientId: patientId,
            IsEmergencyConfirmed: true,
            Reason: "Sudden onset loss of consciousness");

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("EMERGENCY_REDIRECT", ex.Message);
    }

    [Fact]
    public async Task Emp_1_4_Reopen_EmergencyConfirmed_Null_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Status = RequestStatus.Closed,
            ClosedAtUtc = DateTime.UtcNow.AddDays(-1),
            ReopenCount = 0
        });
        await db.SaveChangesAsync();

        var handler = new ReopenConversationCommandHandler(db, _notifierMock.Object, _publisherMock.Object);

        var cmd = new ReopenConversationCommand(
            ConversationId: convId,
            TenantId: TenantId,
            PatientId: patientId,
            IsEmergencyConfirmed: null,
            Reason: "Want to follow up");

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("EMERGENCY_CONFIRMATION_REQUIRED", ex.Message);
    }

    [Fact]
    public async Task Emp_1_5_CreateConversation_PatientFacility_MustBeRejected()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var handler = new CreateConversationCommandHandler(db);
        var patientId = Guid.NewGuid();

        // Adversarial attack: Call CreateConversationCommand directly with Scope: PatientFacility
        // Attempting to bypass SubmitPatientRequestCommand triage engine
        var cmd = new CreateConversationCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            BranchId: null,
            Scope: ConversationScope.PatientFacility,
            Kind: ConversationKind.PatientTriage,
            Title: "Bypassed Thread",
            ContextType: null,
            ContextId: null,
            Category: MessageCategory.PrescriptionRefill,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: patientId.ToString(),
            Participants: new List<ParticipantInput>
            {
                new("Patient", patientId.ToString(), "Attacker Patient", "Patient")
            });

        // Invariant: PatientFacility conversations must be created via SubmitPatientRequestCommand, not CreateConversationCommand
        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("PatientFacility", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    #endregion

    #region Group 2: Direct Message Bypasses without Active Eligibility Grant

    [Fact]
    public async Task Emp_2_1_Submit_NoGrant_ThrowsForbiddenException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: Guid.NewGuid(),
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.PrescriptionRefill,
            ContentText: "Refill request",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("INELIGIBLE", ex.Message);
    }

    [Fact]
    public async Task Emp_2_2_Submit_ExpiredGrant_ThrowsForbiddenException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-30),
            WindowEndUtc = now.AddMinutes(-1), // Expired
            IsActive = true,
            Version = 1
        });
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.PrescriptionRefill,
            ContentText: "Refill request",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("INELIGIBLE", ex.Message);
    }

    [Fact]
    public async Task Emp_2_3_Submit_RevokedGrant_ThrowsForbiddenException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = false, // Revoked
            RevokedAtUtc = now.AddHours(-1),
            RevokeReason = "Consultation voided",
            Version = 2
        });
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.PrescriptionRefill,
            ContentText: "Refill request",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("INELIGIBLE", ex.Message);
    }

    [Fact]
    public async Task Emp_2_4_Submit_GrantForDifferentFacility_ThrowsForbiddenException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId2, // Grant for Facility 2
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        // Submitting to Facility 1
        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.PrescriptionRefill,
            ContentText: "Refill request",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("INELIGIBLE", ex.Message);
    }

    [Fact]
    public async Task Emp_2_5_Reopen_ExpiredGrant_ThrowsForbiddenException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-30),
            WindowEndUtc = now.AddDays(-2), // Expired
            IsActive = true,
            Version = 1
        });

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Status = RequestStatus.Closed,
            ClosedAtUtc = now.AddDays(-1),
            ReopenCount = 0
        });
        await db.SaveChangesAsync();

        var handler = new ReopenConversationCommandHandler(db, _notifierMock.Object, _publisherMock.Object);

        var cmd = new ReopenConversationCommand(
            ConversationId: convId,
            TenantId: TenantId,
            PatientId: patientId,
            IsEmergencyConfirmed: false,
            Reason: "Follow up query");

        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("INELIGIBLE", ex.Message);
    }

    [Fact]
    public async Task Emp_2_6_SendMessage_PatientBlocked_WhileWithTriage()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Status = RequestStatus.WithTriage
        });
        await db.SaveChangesAsync();

        var handler = new SendMessageCommandHandler(db, _notifierMock.Object, _publisherMock.Object);

        var cmd = new SendMessageCommand(
            ConversationId: convId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            SenderType: "Patient",
            SenderId: "pat-1",
            SenderDisplayName: "Patient",
            ContentText: "Sending message before triage is done",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("triage", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Emp_2_7_SendMessage_ClosedThread_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Status = RequestStatus.Closed,
            ClosedAtUtc = DateTime.UtcNow.AddHours(-1)
        });
        await db.SaveChangesAsync();

        var handler = new SendMessageCommandHandler(db, _notifierMock.Object, _publisherMock.Object);

        var cmd = new SendMessageCommand(
            ConversationId: convId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            SenderType: "Staff",
            SenderId: "staff-1",
            SenderDisplayName: "Staff",
            ContentText: "Message to closed conversation",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("closed", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    #endregion

    #region Group 3: Disposition Validation Invariants

    [Fact]
    public async Task Emp_3_1_Disposition_Answered_WithoutText_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Status = RequestStatus.WithTriage
        });
        await db.SaveChangesAsync();

        var handler = new RecordTriageDispositionCommandHandler(db, _notifierMock.Object, _serializer, _publisherMock.Object);

        var cmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: TenantId,
            StaffId: "staff-triage",
            StaffName: "Triage Nurse",
            StaffPermissions: new List<string> { "messaging:triage" },
            Disposition: TriageDisposition.Answered,
            PublicResponseText: null); // Null response text!

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("response", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Emp_3_2_Disposition_NeedsVisit_WithoutInstructions_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Status = RequestStatus.WithTriage
        });
        await db.SaveChangesAsync();

        var handler = new RecordTriageDispositionCommandHandler(db, _notifierMock.Object, _serializer, _publisherMock.Object);

        var cmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: TenantId,
            StaffId: "staff-triage",
            StaffName: "Triage Nurse",
            StaffPermissions: new List<string> { "messaging:triage" },
            Disposition: TriageDisposition.NeedsVisit,
            PublicResponseText: null); // Null visit instructions!

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("instructions", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Emp_3_3_Disposition_Declined_MissingReasonCode_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Status = RequestStatus.WithTriage
        });
        await db.SaveChangesAsync();

        var handler = new RecordTriageDispositionCommandHandler(db, _notifierMock.Object, _serializer, _publisherMock.Object);

        var cmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: TenantId,
            StaffId: "staff-triage",
            StaffName: "Triage Nurse",
            StaffPermissions: new List<string> { "messaging:triage" },
            Disposition: TriageDisposition.Declined,
            DeclineReasonCode: null);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("DeclineReasonCode", ex.Message);
    }

    [Fact]
    public async Task Emp_3_4_Disposition_Declined_InvalidReasonCode_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Status = RequestStatus.WithTriage
        });
        await db.SaveChangesAsync();

        var handler = new RecordTriageDispositionCommandHandler(db, _notifierMock.Object, _serializer, _publisherMock.Object);

        var cmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: TenantId,
            StaffId: "staff-triage",
            StaffName: "Triage Nurse",
            StaffPermissions: new List<string> { "messaging:triage" },
            Disposition: TriageDisposition.Declined,
            DeclineReasonCode: "INVALID_RANDOM_CODE");

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("DeclineReasonCode", ex.Message);
    }

    [Theory]
    [InlineData("STAT")]
    [InlineData("Emergency")]
    [InlineData("Low")]
    [InlineData("High")]
    [InlineData("")]
    [InlineData(null)]
    public async Task Emp_3_5_Disposition_Routed_InvalidPriority_ThrowsValidationException(string? invalidPriority)
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Status = RequestStatus.WithTriage
        });
        await db.SaveChangesAsync();

        var handler = new RecordTriageDispositionCommandHandler(db, _notifierMock.Object, _serializer, _publisherMock.Object);

        var cmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: TenantId,
            StaffId: "staff-triage",
            StaffName: "Triage Nurse",
            StaffPermissions: new List<string> { "messaging:triage" },
            Disposition: TriageDisposition.Routed,
            AssignedStaffId: "doc-1",
            Priority: invalidPriority);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("Priority must be strictly 'Routine' or 'Urgent'", ex.Message);
    }

    [Fact]
    public async Task Emp_3_6_Disposition_Routed_MissingAssignedStaff_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Status = RequestStatus.WithTriage
        });
        await db.SaveChangesAsync();

        var handler = new RecordTriageDispositionCommandHandler(db, _notifierMock.Object, _serializer, _publisherMock.Object);

        var cmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: TenantId,
            StaffId: "staff-triage",
            StaffName: "Triage Nurse",
            StaffPermissions: new List<string> { "messaging:triage" },
            Disposition: TriageDisposition.Routed,
            AssignedStaffId: null, // Missing staff
            Priority: "Routine");

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("AssignedStaffId is mandatory", ex.Message);
    }

    [Fact]
    public async Task Emp_3_7_Disposition_MissingTriagePermission_ThrowsForbiddenException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Status = RequestStatus.WithTriage
        });
        await db.SaveChangesAsync();

        var handler = new RecordTriageDispositionCommandHandler(db, _notifierMock.Object, _serializer, _publisherMock.Object);

        var cmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: TenantId,
            StaffId: "staff-normal",
            StaffName: "Clerk",
            StaffPermissions: new List<string> { "messaging:read" }, // Missing messaging:triage
            Disposition: TriageDisposition.Answered,
            PublicResponseText: "Sample text");

        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("messaging:triage", ex.Message);
    }

    #endregion

    #region Group 4: Reopen Limit Violations

    [Fact]
    public async Task Emp_4_1_Reopen_ValidFirstReopen_ResetsToWithTriage_IncrementsReopenCount()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
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
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Status = RequestStatus.Closed,
            ClosedAtUtc = now.AddDays(-1),
            ClosedBy = "Dr. Santos",
            TriageDisposition = TriageDisposition.Answered,
            AssignedStaffId = "doc-1",
            Priority = "Routine",
            ReopenCount = 0
        });
        await db.SaveChangesAsync();

        var handler = new ReopenConversationCommandHandler(db, _notifierMock.Object, _publisherMock.Object);

        var cmd = new ReopenConversationCommand(
            ConversationId: convId,
            TenantId: TenantId,
            PatientId: patientId,
            IsEmergencyConfirmed: false,
            Reason: "Symptoms returned after treatment");

        var result = await handler.Handle(cmd, CancellationToken.None);

        Assert.Equal(RequestStatus.WithTriage, result.Status);
        Assert.Equal(1, result.ReopenCount);
        Assert.Null(result.ClosedAtUtc);
        Assert.Null(result.TriageDisposition);
        Assert.Null(result.AssignedStaffId);
    }

    [Fact]
    public async Task Emp_4_2_Reopen_SecondAttempt_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
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
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Status = RequestStatus.Closed,
            ClosedAtUtc = now.AddDays(-1),
            ReopenCount = 1 // Already reopened once!
        });
        await db.SaveChangesAsync();

        var handler = new ReopenConversationCommandHandler(db, _notifierMock.Object, _publisherMock.Object);

        var cmd = new ReopenConversationCommand(
            ConversationId: convId,
            TenantId: TenantId,
            PatientId: patientId,
            IsEmergencyConfirmed: false,
            Reason: "Attempting to reopen a second time");

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("REOPEN_LIMIT_EXCEEDED", ex.Message);
    }

    [Fact]
    public async Task Emp_4_3_Reopen_OpenThread_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Status = RequestStatus.Routed // Open thread
        });
        await db.SaveChangesAsync();

        var handler = new ReopenConversationCommandHandler(db, _notifierMock.Object, _publisherMock.Object);

        var cmd = new ReopenConversationCommand(
            ConversationId: convId,
            TenantId: TenantId,
            PatientId: patientId,
            IsEmergencyConfirmed: false,
            Reason: "Reopening non-closed thread");

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("Only closed or terminal conversations can be reopened", ex.Message);
    }

    #endregion

    #region Group 5: Volume Caps & Cooldown Stress

    [Fact]
    public async Task Emp_5_1_VolumeCap_CategoryCap_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });

        // 1 open in PrescriptionRefill
        db.Conversations.Add(new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Category = MessageCategory.PrescriptionRefill,
            Status = RequestStatus.WithTriage,
            CreatedAtUtc = now.AddHours(-1)
        });
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.PrescriptionRefill,
            ContentText: "Another refill request",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("CAP_EXCEEDED", ex.Message);
        Assert.Contains("category", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Emp_5_2_VolumeCap_FacilityCap_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });

        // 2 open at this facility in different categories
        db.Conversations.AddRange(
            new Conversation
            {
                Id = Guid.NewGuid(),
                TenantId = TenantId,
                FacilityId = FacilityId,
                PatientId = patientId,
                Category = MessageCategory.Scheduling,
                Status = RequestStatus.WithTriage,
                CreatedAtUtc = now.AddHours(-2)
            },
            new Conversation
            {
                Id = Guid.NewGuid(),
                TenantId = TenantId,
                FacilityId = FacilityId,
                PatientId = patientId,
                Category = MessageCategory.Billing,
                Status = RequestStatus.Routed,
                CreatedAtUtc = now.AddHours(-1)
            }
        );
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Other,
            ContentText: "Third request to same facility",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("CAP_EXCEEDED", ex.Message);
        Assert.Contains("facility", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Emp_5_3_VolumeCap_CrossFacility_Isolation_AllowsOtherFacility()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId2, // Grant for Facility 2
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });

        // 2 open at Facility 1
        db.Conversations.AddRange(
            new Conversation
            {
                Id = Guid.NewGuid(),
                TenantId = TenantId,
                FacilityId = FacilityId,
                PatientId = patientId,
                Category = MessageCategory.Scheduling,
                Status = RequestStatus.WithTriage,
                CreatedAtUtc = now.AddHours(-2)
            },
            new Conversation
            {
                Id = Guid.NewGuid(),
                TenantId = TenantId,
                FacilityId = FacilityId,
                PatientId = patientId,
                Category = MessageCategory.Billing,
                Status = RequestStatus.Routed,
                CreatedAtUtc = now.AddHours(-1)
            }
        );
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        // Submitting to Facility 2 (which has 0 open) should succeed
        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId2,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Other,
            ContentText: "Inquiry to Facility 2",
            IsEmergencyConfirmed: false);

        var result = await handler.Handle(cmd, CancellationToken.None);
        Assert.False(result.IsEmergencyRedirect);
        Assert.NotNull(result.Conversation);
    }

    [Fact]
    public async Task Emp_5_4_DeclineCooldown_Active24h_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });

        // Declined 6 hours ago
        db.Conversations.Add(new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Category = MessageCategory.PrescriptionRefill,
            Status = RequestStatus.Declined,
            DeclineReasonCode = DeclineReasonCodes.OutOfScope,
            ClosedAtUtc = now.AddHours(-6),
            CreatedAtUtc = now.AddHours(-7)
        });
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.PrescriptionRefill,
            ContentText: "Retrying refill within cooldown",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("COOLDOWN_ACTIVE", ex.Message);
    }

    [Fact]
    public async Task Emp_5_5_DeclineCooldown_DifferentCategory_Allowed()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });

        // Declined in PrescriptionRefill
        db.Conversations.Add(new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Category = MessageCategory.PrescriptionRefill,
            Status = RequestStatus.Declined,
            DeclineReasonCode = DeclineReasonCodes.OutOfScope,
            ClosedAtUtc = now.AddHours(-6),
            CreatedAtUtc = now.AddHours(-7)
        });
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        // Submitting in Scheduling category is NOT in cooldown
        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Scheduling,
            ContentText: "Scheduling request",
            IsEmergencyConfirmed: false);

        var result = await handler.Handle(cmd, CancellationToken.None);
        Assert.False(result.IsEmergencyRedirect);
        Assert.NotNull(result.Conversation);
    }

    [Fact]
    public async Task Emp_5_6_DeclineCooldown_Expired24h_Allowed()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-5),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });

        // Declined 25 hours ago (>24h cooldown)
        db.Conversations.Add(new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Category = MessageCategory.PrescriptionRefill,
            Status = RequestStatus.Declined,
            DeclineReasonCode = DeclineReasonCodes.OutOfScope,
            ClosedAtUtc = now.AddHours(-25),
            CreatedAtUtc = now.AddHours(-26)
        });
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.PrescriptionRefill,
            ContentText: "Retrying refill after cooldown passed",
            IsEmergencyConfirmed: false);

        var result = await handler.Handle(cmd, CancellationToken.None);
        Assert.False(result.IsEmergencyRedirect);
        Assert.NotNull(result.Conversation);
    }

    #endregion
}
