using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// E2E Verification for Requirement R1, R8 and Scenarios 1 & 3:
/// Staff messages must NEVER cross tenants under any circumstances (even if a directory link exists).
/// Patient messages to facilities work across any tenant without requiring directory link provisioning.
/// </summary>
public class CommsCrossTenantIsolationTests
{
    [Fact]
    public async Task StaffMessageSubmit_AcrossDifferentTenants_IsRejectedByTheHub()
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic("tenant-alpha", "Clinic Alpha"));
        var clinicB = await cell.ProvisionAsync(Fac.Clinic("tenant-beta", "Clinic Beta"));

        var payload = new CommsMessageSubmitPayload(
            ClientMessageId: Guid.NewGuid(),
            ConversationId: Guid.NewGuid(),
            TenantId: "tenant-alpha",
            FacilityId: clinicA.FacilityId,
            SenderType: "Staff",
            SenderId: Guid.NewGuid(),
            SenderDisplayName: "Dr. Alice",
            ContentText: "Confidential staff communication between clinics",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false,
            Attachments: null,
            ClientSentAtUtc: DateTime.UtcNow,
            RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7)
        );

        var crossTenantEnvelope = InteropEnvelope.Create(
            InteropTypes.CommsMessageSubmit,
            clinicA.Party,
            clinicB.Party,
            payload.ConversationId,
            payload
        );

        var result = await SendAsync(cell, InteropServices.Clinic, crossTenantEnvelope);

        result.Status.Should().Be(SendResult.Rejected, "hub routing policy must block staff messages across different tenants");
        result.Reason.Should().NotBeNullOrWhiteSpace();

        // Verify message was never stored in hub database for delivery to tenant-beta
        var storedCount = await cell.Hub.DbAsync(db => db.Messages
            .CountAsync(m => m.Type == InteropTypes.CommsMessageSubmit && m.Mailbox.Contains(clinicB.FacilityId)));
        storedCount.Should().Be(0, "a rejected cross-tenant message must never enter any mailbox");
    }

    [Fact]
    public async Task StaffThreadStateChanged_AcrossTenants_IsRejectedByTheHub()
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic("tenant-alpha", "Clinic Alpha"));
        var labB = await cell.ProvisionAsync(Fac.Lab("tenant-beta", "Lab Beta"));

        var payload = new CommsThreadStateChangedPayload(
            ConversationId: Guid.NewGuid(),
            TenantId: "tenant-alpha",
            FacilityId: clinicA.FacilityId,
            NewStatus: RequestStatus.Routed,
            Disposition: TriageDisposition.Routed,
            DeclineReasonCode: null,
            AssignedStaffId: Guid.NewGuid().ToString(),
            AssignedStaffName: "Nurse Bob",
            Version: 1,
            ChangedAtUtc: DateTime.UtcNow
        );

        var crossTenantEnvelope = InteropEnvelope.Create(
            InteropTypes.CommsThreadStateChanged,
            clinicA.Party,
            labB.Party,
            payload.ConversationId,
            payload
        );

        var result = await SendAsync(cell, InteropServices.Clinic, crossTenantEnvelope);

        result.Status.Should().Be(SendResult.Rejected);
        result.Reason.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task PatientRequestSubmit_AcrossTenants_IsPermittedAndDelivered()
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic("tenant-alpha", "Clinic Alpha"));

        // A patient registered in patient-api (which operates across tenants) submits an inquiry to clinicA
        var patientParty = Party.ForPatient(Guid.NewGuid().ToString());

        var payload = new CommsRequestSubmitPayload(
            RequestId: Guid.NewGuid(),
            TenantId: clinicA.Tenant,
            FacilityId: clinicA.FacilityId,
            FacilityType: "Clinic",
            PatientId: Guid.Parse(patientParty.PatientId!),
            SubmittingAccountId: Guid.NewGuid(),
            Relationship: "Self",
            Category: MessageCategory.Scheduling,
            ContentText: "Requesting schedule consultation follow-up",
            IsEmergencyConfirmed: true,
            Attachments: null,
            SubmittedAtUtc: DateTime.UtcNow
        );

        var patientEnvelope = InteropEnvelope.Create(
            InteropTypes.CommsRequestSubmit,
            patientParty,
            clinicA.Party,
            payload.RequestId,
            payload
        );

        // Sent by the Patient service (PatientPlane)
        var result = await SendAsync(cell, InteropServices.Patient, patientEnvelope);

        result.Status.Should().Be(SendResult.Accepted, "patient-to-facility messages are permitted across any tenant without links");

        // Verify message reached the clinic's mailbox
        var messages = await cell.Hub.DbAsync(db => db.Messages
            .Where(m => m.Type == InteropTypes.CommsRequestSubmit)
            .ToListAsync());

        messages.Should().ContainSingle();
        messages[0].Mailbox.Should().EndWith(":" + InteropServices.Clinic);
    }

    [Fact]
    public async Task PatientMessageSubmit_ToAnotherTenantFacility_IsAcceptedWithoutLinkCheck()
    {
        await using var cell = new TestCell();
        var labB = await cell.ProvisionAsync(Fac.Lab("tenant-beta", "Lab Beta"));

        var patientParty = Party.ForPatient(Guid.NewGuid().ToString());
        var conversationId = Guid.NewGuid();

        var payload = new CommsMessageSubmitPayload(
            ClientMessageId: Guid.NewGuid(),
            ConversationId: conversationId,
            TenantId: labB.Tenant,
            FacilityId: labB.FacilityId,
            SenderType: "Patient",
            SenderId: Guid.Parse(patientParty.PatientId!),
            SenderDisplayName: "Patient Juan",
            ContentText: "Here is my inquiry regarding specimen collection hours.",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false,
            Attachments: null,
            ClientSentAtUtc: DateTime.UtcNow,
            RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7)
        );

        var envelope = InteropEnvelope.Create(
            InteropTypes.CommsMessageSubmit,
            patientParty,
            labB.Party,
            conversationId,
            payload
        );

        var result = await SendAsync(cell, InteropServices.Patient, envelope);

        result.Status.Should().Be(SendResult.Accepted);

        var messages = await cell.Hub.DbAsync(db => db.Messages
            .Where(m => m.Type == InteropTypes.CommsMessageSubmit && m.MessageId == envelope.MessageId)
            .ToListAsync());

        messages.Should().ContainSingle();
        messages[0].Mailbox.Should().EndWith(":" + InteropServices.Laboratory);
    }

    [Fact]
    public async Task DirectoryLinkWithAllScopes_DoesNotPermitCrossTenantStaffChat()
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic("tenant-alpha", "Clinic Alpha"));
        var labB = await cell.ProvisionAsync(Fac.Lab("tenant-beta", "Lab Beta"), FacilityVisibility.Network);

        // Provision an active DirectoryLink with LinkScopes.All
        await cell.Hub.UpsertLinkAsync(clinicA.Party, labB.Party, LinkScopes.All);

        // Staff chat message attempt
        var commsPayload = new CommsMessageSubmitPayload(
            ClientMessageId: Guid.NewGuid(),
            ConversationId: Guid.NewGuid(),
            TenantId: "tenant-alpha",
            FacilityId: clinicA.FacilityId,
            SenderType: "Staff",
            SenderId: Guid.NewGuid(),
            SenderDisplayName: "Dr. Alice",
            ContentText: "Cross-tenant chat attempt over link",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false,
            Attachments: null,
            ClientSentAtUtc: DateTime.UtcNow,
            RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7)
        );

        var crossChatEnvelope = InteropEnvelope.Create(
            InteropTypes.CommsMessageSubmit,
            clinicA.Party,
            labB.Party,
            commsPayload.ConversationId,
            commsPayload
        );

        var result = await SendAsync(cell, InteropServices.Clinic, crossChatEnvelope);

        // Under R1 and R8, staff of different tenants never share a conversation, so comms.* has LinkScopes.None
        result.Status.Should().Be(SendResult.Rejected, "staff comms cannot cross tenants even when clinical directory links exist");
    }

    private static async Task<SendResult> SendAsync(TestCell cell, string service, InteropEnvelope envelope)
    {
        var results = await cell.Hub.NewSdk(service).SendAsync([envelope], CancellationToken.None);
        return results.Should().ContainSingle().Subject;
    }
}
