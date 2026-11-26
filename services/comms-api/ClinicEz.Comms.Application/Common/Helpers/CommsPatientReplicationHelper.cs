using System;
using System.Collections.Generic;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Comms.Application.Common.Helpers;

/// <summary>
/// Centralizes outbound replication of public patient-facility messages and thread state transitions
/// from <c>comms-api</c> to the patient's mailbox (<c>Party.ForPatient</c>).
/// Strictly enforces that <see cref="MessageVisibility.Internal"/> staff notes are NEVER replicated.
/// </summary>
public static class CommsPatientReplicationHelper
{
    public static FacilityType ResolveFacilityType(string? facilityType)
    {
        return Enum.TryParse<FacilityType>(facilityType, ignoreCase: true, out var parsed)
            ? parsed
            : FacilityType.Clinic;
    }

    public static void EnqueueMessageToPatient(
        IInteropPublisher publisher,
        Conversation conversation,
        Message message,
        IReadOnlyList<CommsAttachmentReference> attachments,
        string? facilityType = null)
    {
        if (conversation.IsLocalOnly ||
            conversation.Scope != ConversationScope.PatientFacility ||
            conversation.PatientId is not { } patientId ||
            patientId == Guid.Empty ||
            message.Visibility != MessageVisibility.Public)
        {
            return;
        }

        var fType = ResolveFacilityType(facilityType);
        var from = Party.ForFacility(conversation.TenantId, conversation.FacilityId, fType, service: InteropServices.Comms);
        var to = Party.ForPatient(patientId.ToString());

        var payload = new CommsMessageReplicatePayload(
            MessageId: message.Id,
            ConversationId: message.ConversationId,
            Seq: message.Seq,
            TenantId: message.TenantId,
            FacilityId: message.FacilityId,
            SenderType: message.SenderType,
            SenderId: message.SenderId != null && Guid.TryParse(message.SenderId, out var senderGuid) ? senderGuid : null,
            SenderDisplayName: message.SenderDisplayName,
            ContentText: message.ContentText,
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: message.RequiresAcknowledgement,
            Attachments: attachments,
            SentAtUtc: message.ClientSentAtUtc,
            RetentionDeadlineUtc: message.RetentionDeadlineUtc,
            State: message.State);

        publisher.Enqueue(
            type: InteropTypes.CommsMessageReplicate,
            from: from,
            to: to,
            correlationId: conversation.Id,
            payload: payload,
            schemaVersion: 1,
            ttl: TimeSpan.FromDays(7));
    }

    public static void EnqueueThreadStateToPatient(
        IInteropPublisher publisher,
        Conversation conversation,
        DateTime changedAtUtc,
        string? facilityType = null)
    {
        if (conversation.IsLocalOnly ||
            conversation.Scope != ConversationScope.PatientFacility ||
            conversation.PatientId is not { } patientId ||
            patientId == Guid.Empty)
        {
            return;
        }

        var fType = ResolveFacilityType(facilityType);
        var from = Party.ForFacility(conversation.TenantId, conversation.FacilityId, fType, service: InteropServices.Comms);
        var to = Party.ForPatient(patientId.ToString());

        var payload = new CommsThreadStateChangedPayload(
            ConversationId: conversation.Id,
            TenantId: conversation.TenantId,
            FacilityId: conversation.FacilityId,
            NewStatus: conversation.Status,
            Disposition: conversation.TriageDisposition,
            DeclineReasonCode: conversation.DeclineReasonCode,
            AssignedStaffId: conversation.AssignedStaffId,
            AssignedStaffName: conversation.AssignedStaffName,
            Version: conversation.Version,
            ChangedAtUtc: changedAtUtc);

        publisher.Enqueue(
            type: InteropTypes.CommsThreadStateChanged,
            from: from,
            to: to,
            correlationId: conversation.Id,
            payload: payload);
    }
}
