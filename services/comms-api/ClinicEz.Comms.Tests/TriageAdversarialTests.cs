using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Application.Features.Triage.Commands;
using ClinicEz.Comms.Domain.Constants;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Comms.Infrastructure.Messaging.Handlers;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Moq;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class TriageAdversarialTests
{
    private readonly Mock<ICommsRealtimeNotifier> _notifierMock = new();
    private readonly Mock<IInteropPublisher> _publisherMock = new();
    private readonly TranscriptSerializer _serializer = new();

    private const string TenantId = "tenant-stjude";
    private const string FacilityId = "clinic-main";

    [Fact]
    public async Task Submit_NoLiveGrant_ThrowsForbiddenException()
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
            ContentText: "Need refill for amlodipine",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("INELIGIBLE", ex.Message);
    }

    [Fact]
    public async Task Submit_RevokedGrant_ThrowsForbiddenException()
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
            IsActive = false,
            RevokedAtUtc = now.AddHours(-2),
            RevokeReason = "Appointment cancelled",
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
            ContentText: "Need refill",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("INELIGIBLE", ex.Message);
    }

    [Fact]
    public async Task Submit_ExpiredGrant_ThrowsForbiddenException()
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
            WindowStartUtc = now.AddDays(-14),
            WindowEndUtc = now.AddDays(-1),
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
            ContentText: "Need refill",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("INELIGIBLE", ex.Message);
    }

    [Fact]
    public async Task Submit_EmergencyConfirmationNull_ThrowsValidationException()
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
            ContentText: "Book an appointment",
            IsEmergencyConfirmed: null);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("EMERGENCY_CONFIRMATION_REQUIRED", ex.Message);
    }

    [Fact]
    public async Task Submit_EmergencyConfirmedTrue_ReturnsEmergencyRedirect_NoMessagesStored()
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
            Category: MessageCategory.Other,
            ContentText: "Chest pain and shortness of breath",
            IsEmergencyConfirmed: true);

        var result = await handler.Handle(cmd, CancellationToken.None);

        Assert.True(result.IsEmergencyRedirect);
        Assert.NotNull(result.RedirectMessage);
        Assert.Contains("911", result.RedirectMessage);
        Assert.Null(result.Conversation);

        // Strict invariant: 0 conversations and 0 messages stored
        Assert.Empty(db.Conversations);
        Assert.Empty(db.Messages);
    }

    [Fact]
    public async Task Submit_EmergencyConfirmedFalse_WithActiveGrant_EntersWithTriage()
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
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Scheduling,
            ContentText: "Requesting schedule for Dr. Santos",
            IsEmergencyConfirmed: false);

        var result = await handler.Handle(cmd, CancellationToken.None);

        Assert.False(result.IsEmergencyRedirect);
        Assert.NotNull(result.Conversation);
        Assert.Equal(RequestStatus.WithTriage, result.Conversation.Status);
        Assert.Equal(0, result.Conversation.ReopenCount);
        Assert.Single(db.Conversations);
        Assert.Single(db.Messages);
    }

    [Fact]
    public async Task Submit_CategoryLimit_MaxOneOpenPerCategory_ThrowsValidationException()
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

        // Existing open conversation in PrescriptionRefill
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
            ContentText: "Second refill request",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("CAP_EXCEEDED", ex.Message);
    }

    [Fact]
    public async Task Submit_FacilityLimit_MaxTwoOpenPerFacility_ThrowsValidationException()
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

        // 2 active conversations at this facility in different categories
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
                Category = MessageCategory.LabResultQuestion,
                Status = RequestStatus.Routed,
                CreatedAtUtc = now.AddHours(-1)
            }
        );
        await db.SaveChangesAsync();

        var handler = new SubmitPatientRequestCommandHandler(db, _notifierMock.Object);

        // Attempting a 3rd inquiry to this facility
        var cmd = new SubmitPatientRequestCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Billing,
            ContentText: "Question on invoice",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("CAP_EXCEEDED", ex.Message);
    }

    [Fact]
    public async Task Submit_DeclineCooldown_Active24h_ThrowsValidationException()
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

        // Inquiry was declined 4 hours ago
        db.Conversations.Add(new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Category = MessageCategory.PrescriptionRefill,
            Status = RequestStatus.Declined,
            DeclineReasonCode = "OUT_OF_SCOPE",
            ClosedAtUtc = now.AddHours(-4),
            CreatedAtUtc = now.AddHours(-5)
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
            ContentText: "Trying refill again",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("COOLDOWN_ACTIVE", ex.Message);
    }

    [Fact]
    public async Task Submit_RateLimit_Max5PerHour_ThrowsValidationException()
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

        // 5 submissions in the last hour
        for (int i = 0; i < 5; i++)
        {
            db.Conversations.Add(new Conversation
            {
                Id = Guid.NewGuid(),
                TenantId = TenantId,
                FacilityId = FacilityId,
                PatientId = patientId,
                Category = (MessageCategory)(i + 1),
                Status = RequestStatus.Closed,
                ClosedAtUtc = now.AddMinutes(-5 * i),
                CreatedAtUtc = now.AddMinutes(-5 * (i + 1))
            });
        }
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
            ContentText: "6th submission in 1 hour",
            IsEmergencyConfirmed: false);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("RATE_LIMIT_EXCEEDED", ex.Message);
    }

    [Fact]
    public async Task Submit_OffHours_CalculatesNextBusinessDaySla()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();

        // Saturday evening UTC (PHT Sunday 04:00 AM)
        var saturdayUtc = new DateTime(2026, 10, 24, 20, 0, 0, DateTimeKind.Utc);

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = saturdayUtc.AddDays(-1),
            WindowEndUtc = saturdayUtc.AddDays(7),
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
            Category: MessageCategory.Scheduling,
            ContentText: "Appointment query",
            IsEmergencyConfirmed: false,
            SubmittedAtUtc: saturdayUtc);

        var result = await handler.Handle(cmd, CancellationToken.None);

        Assert.True(result.Conversation!.IsOffHoursSubmission);
        // Next business day is Monday Oct 26; 10:00 AM PHT = 02:00 AM UTC
        Assert.Equal(new DateTime(2026, 10, 26, 2, 0, 0, DateTimeKind.Utc), result.Conversation.TriageDueAtUtc);
    }

    [Fact]
    public async Task Disposition_RequiresMessagingTriagePermission_ThrowsForbiddenException()
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
            StaffId: "staff-1",
            StaffName: "Doctor Smith",
            StaffPermissions: new List<string> { "messaging:read", "messaging:write" }, // Missing messaging:triage
            Disposition: TriageDisposition.Answered,
            PublicResponseText: "Answer text");

        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("messaging:triage", ex.Message);
    }

    [Fact]
    public async Task Disposition_Declined_RequiresReasonCode_ThrowsValidationException()
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
            DeclineReasonCode: null); // Missing decline reason

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("DeclineReasonCode", ex.Message);
    }

    [Fact]
    public async Task Disposition_Declined_ClosesThreadAndEnqueuesTranscript()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var conv = new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Status = RequestStatus.WithTriage,
            Category = MessageCategory.PrescriptionRefill,
            Title = "Refill Inquiry"
        };
        conv.Messages.Add(new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            SenderType = "Patient",
            SenderId = patientId.ToString(),
            ContentText = "Need refill",
            Visibility = MessageVisibility.Public
        });
        db.Conversations.Add(conv);
        await db.SaveChangesAsync();

        var handler = new RecordTriageDispositionCommandHandler(db, _notifierMock.Object, _serializer, _publisherMock.Object);

        var cmd = new RecordTriageDispositionCommand(
            ConversationId: convId,
            TenantId: TenantId,
            StaffId: "staff-triage",
            StaffName: "Triage Nurse",
            StaffPermissions: new List<string> { "messaging:triage" },
            Disposition: TriageDisposition.Declined,
            DeclineReasonCode: DeclineReasonCodes.OutOfScope,
            PublicResponseText: "This request is outside the scope of our tele-triage service.");

        var result = await handler.Handle(cmd, CancellationToken.None);

        Assert.Equal(RequestStatus.Declined, result.Status);
        Assert.NotNull(result.ClosedAtUtc);
        Assert.Equal(DeclineReasonCodes.OutOfScope, result.DeclineReasonCode);

        // Verify outbox transcript message was enqueued
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.CommsTranscriptArchived,
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            convId,
            It.IsAny<CommsTranscriptArchivedPayload>()), Times.Once);
    }

    [Fact]
    public async Task Disposition_Routed_StatOrEmergencyPriority_ThrowsValidationException()
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
            Priority: "Stat"); // Forbidden urgency

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("Priority must be strictly 'Routine' or 'Urgent'", ex.Message);
    }

    [Fact]
    public async Task Disposition_Routed_RoutinePriority_AssignsStaffAndSetsRouted()
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
            AssignedStaffName: "Dr. Maria Cruz",
            Priority: "Routine",
            InternalNote: "Patient reports mild rash for 2 days.");

        var result = await handler.Handle(cmd, CancellationToken.None);

        Assert.Equal(RequestStatus.Routed, result.Status);
        Assert.Equal("doc-1", result.AssignedStaffId);
        Assert.Equal("Dr. Maria Cruz", result.AssignedStaffName);
        Assert.Equal("Routine", result.Priority);
        Assert.Null(result.ClosedAtUtc);

        // Internal note recorded with MessageVisibility.Internal
        var internalMsg = db.Messages.FirstOrDefault(m => m.ConversationId == convId && m.Visibility == MessageVisibility.Internal);
        Assert.NotNull(internalMsg);
        Assert.Contains("Patient reports mild rash", internalMsg.ContentText);
    }

    [Fact]
    public async Task SendMessage_DuringWithTriage_PatientMessageBlocked()
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
            ContentText: "Can I get an update?",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("triage", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Reopen_OpenThread_ThrowsValidationException()
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
            Status = RequestStatus.Routed // Open / not closed
        });
        await db.SaveChangesAsync();

        var handler = new ReopenConversationCommandHandler(db, _notifierMock.Object, _publisherMock.Object);

        var cmd = new ReopenConversationCommand(
            ConversationId: convId,
            TenantId: TenantId,
            PatientId: patientId,
            IsEmergencyConfirmed: false,
            Reason: "Need follow-up");

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("Only closed or terminal conversations can be reopened", ex.Message);
    }

    [Fact]
    public async Task Reopen_ExceededLimit_ThrowsValidationException()
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
            ReopenCount = 1 // Already reopened once
        });
        await db.SaveChangesAsync();

        var handler = new ReopenConversationCommandHandler(db, _notifierMock.Object, _publisherMock.Object);

        var cmd = new ReopenConversationCommand(
            ConversationId: convId,
            TenantId: TenantId,
            PatientId: patientId,
            IsEmergencyConfirmed: false,
            Reason: "Reopening again");

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("REOPEN_LIMIT_EXCEEDED", ex.Message);
    }

    [Fact]
    public async Task Reopen_EmergencyConfirmed_ThrowsValidationException()
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
            IsEmergencyConfirmed: true, // Emergency
            Reason: "Chest pain");

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("EMERGENCY_REDIRECT", ex.Message);
    }

    [Fact]
    public async Task Reopen_ExpiredGrant_ThrowsForbiddenException()
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
            WindowStartUtc = now.AddDays(-20),
            WindowEndUtc = now.AddDays(-5), // Expired
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
            Reason: "Follow up question");

        var ex = await Assert.ThrowsAsync<ForbiddenException>(() => handler.Handle(cmd, CancellationToken.None));
        Assert.Contains("INELIGIBLE", ex.Message);
    }

    [Fact]
    public async Task Reopen_ValidFirstTime_ResetsToWithTriage()
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
            Reason: "Still experiencing symptoms after 3 days");

        var result = await handler.Handle(cmd, CancellationToken.None);

        Assert.Equal(RequestStatus.WithTriage, result.Status);
        Assert.Equal(1, result.ReopenCount);
        Assert.Null(result.ClosedAtUtc);
        Assert.Null(result.TriageDisposition);
        Assert.Null(result.AssignedStaffId);

        // Notification message posted
        var reopenMessage = db.Messages.FirstOrDefault(m => m.ConversationId == convId && m.ContentText.Contains("still experiencing symptoms", StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(reopenMessage);
    }

    [Fact]
    public void TranscriptSerialization_StrictlyExcludesInternalNotes_AndGeneratesValidSha256()
    {
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var conv = new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Title = "Rash Consultation",
            Category = MessageCategory.PostVisitFollowUp,
            Status = RequestStatus.Closed,
            TriageDisposition = TriageDisposition.Answered,
            CreatedAtUtc = now.AddHours(-2),
            ClosedAtUtc = now
        };

        var participants = new List<Participant>
        {
            new() { Id = Guid.NewGuid(), ConversationId = convId, TenantId = TenantId, ParticipantId = patientId.ToString(), DisplayName = "Jane Doe", Role = "Patient" },
            new() { Id = Guid.NewGuid(), ConversationId = convId, TenantId = TenantId, ParticipantId = "nurse-1", DisplayName = "Nurse Kelly", Role = "Staff" }
        };

        var messages = new List<Message>
        {
            new()
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 1,
                SenderDisplayName = "Jane Doe",
                SenderType = "Patient",
                ContentText = "My rash looks red today",
                Visibility = MessageVisibility.Public,
                ServerReceivedAtUtc = now.AddHours(-2)
            },
            new()
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 2,
                SenderDisplayName = "Nurse Kelly",
                SenderType = "Staff",
                ContentText = "CONFIDENTIAL INTERNAL NOTE: Patient seems very anxious, check chart for allergy history.",
                Visibility = MessageVisibility.Internal, // INTERNAL NOTE
                ServerReceivedAtUtc = now.AddHours(-1)
            },
            new()
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 3,
                SenderDisplayName = "Nurse Kelly",
                SenderType = "Staff",
                ContentText = "Please continue applying the prescribed hydrocortisone cream.",
                Visibility = MessageVisibility.Public,
                ServerReceivedAtUtc = now
            }
        };

        var serialized = _serializer.Serialize(conv, participants, messages);

        // Assert: Exactly 2 public messages exported, zero internal notes
        Assert.Equal(2, serialized.Document.Messages.Count);
        Assert.DoesNotContain("CONFIDENTIAL INTERNAL NOTE", serialized.Json);
        Assert.DoesNotContain("CONFIDENTIAL INTERNAL NOTE", serialized.Markdown);
        Assert.Contains("My rash looks red today", serialized.Markdown);
        Assert.Contains("prescribed hydrocortisone", serialized.Markdown);

        // Assert: SHA-256 integrity hash is valid
        Assert.False(string.IsNullOrWhiteSpace(serialized.Sha256));
        Assert.Equal(64, serialized.Sha256.Length);
        Assert.Equal(serialized.Sha256, serialized.Document.TranscriptSha256);
    }

    [Fact]
    public async Task CommsEligibilityGrantedHandler_MonotonicVersion_DropsStale()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var grantId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        // Existing grant at version 2
        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = grantId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now,
            WindowEndUtc = now.AddDays(14),
            IsActive = true,
            Version = 2
        });
        await db.SaveChangesAsync();

        var logger = new Mock<Microsoft.Extensions.Logging.ILogger<CommsEligibilityGrantedHandler>>();
        var handler = new CommsEligibilityGrantedHandler(db, _publisherMock.Object, logger.Object);

        // Inbound message with older version 1 (network race or redelivery)
        var stalePayload = new CommsEligibilityGrantedPayload(
            GrantId: grantId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            ContextType: "Appointment",
            ContextId: "appt-old",
            WindowStartUtc: now.AddDays(-10),
            WindowEndUtc: now.AddDays(4),
            Version: 1);

        var env = new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsEligibilityGranted,
            From = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, service: InteropServices.Comms),
            CorrelationId = grantId
        };
        var ctx = new InteropMessageContext(env);

        await handler.HandleAsync(stalePayload, ctx, CancellationToken.None);

        var grantInDb = await db.EligibilityGrants.FindAsync(grantId);
        Assert.NotNull(grantInDb);
        Assert.Equal(2, grantInDb.Version); // Version not regressed
        Assert.Equal(now.AddDays(14), grantInDb.WindowEndUtc);
    }

    [Fact]
    public async Task CommsEligibilityRevokedHandler_MarksInactiveAndSyncs()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var grantId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = grantId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            WindowStartUtc = now.AddDays(-1),
            WindowEndUtc = now.AddDays(14),
            IsActive = true,
            Version = 1
        });
        await db.SaveChangesAsync();

        var logger = new Mock<Microsoft.Extensions.Logging.ILogger<CommsEligibilityRevokedHandler>>();
        var handler = new CommsEligibilityRevokedHandler(db, _publisherMock.Object, logger.Object);

        var revokePayload = new CommsEligibilityRevokedPayload(
            GrantId: grantId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            PatientId: patientId,
            Reason: "Appointment cancelled by patient",
            RevokedAtUtc: now,
            Version: 2);

        var env = new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsEligibilityRevoked,
            From = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, service: InteropServices.Comms),
            CorrelationId = grantId
        };
        var ctx = new InteropMessageContext(env);

        await handler.HandleAsync(revokePayload, ctx, CancellationToken.None);

        var grantInDb = await db.EligibilityGrants.FindAsync(grantId);
        Assert.NotNull(grantInDb);
        Assert.False(grantInDb.IsActive);
        Assert.Equal(2, grantInDb.Version);
        Assert.Equal("Appointment cancelled by patient", grantInDb.RevokeReason);

        // Forward sync to patient was enqueued
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.CommsEligibilitySynced,
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            grantId,
            It.IsAny<CommsEligibilitySyncedPayload>()), Times.Once);
    }
}
