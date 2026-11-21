using System;
using System.Collections.Generic;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Comms.Domain.Entities;

public class Message
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public Conversation? Conversation { get; set; }

    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;

    public long Seq { get; set; }

    public string SenderType { get; set; } = "Staff"; // Staff, Patient, System, Guest
    public string? SenderId { get; set; }
    public string SenderDisplayName { get; set; } = string.Empty;

    public string ContentText { get; set; } = string.Empty;
    public MessageVisibility Visibility { get; set; } = MessageVisibility.Public;
    public DeliveryState State { get; set; } = DeliveryState.Waiting;

    public bool RequiresAcknowledgement { get; set; }
    public bool IsAcknowledged { get; set; }
    public DateTime? AcknowledgedAtUtc { get; set; }
    public Guid? AcknowledgedByAccountId { get; set; }
    public string? AcknowledgedByName { get; set; }

    public DateTime ClientSentAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ServerReceivedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime RetentionDeadlineUtc { get; set; }

    public Guid? ClientMessageId { get; set; }

    public bool IsArchivedToChart { get; set; }
    public DateTime? ChartFilingDateUtc { get; set; }
    public string? ChartFiledByStaffId { get; set; }

    public DateTime? UpdatedAtUtc { get; set; }
    public int Version { get; set; } = 1;

    public ICollection<MessageReaction> Reactions { get; set; } = new List<MessageReaction>();
    public ICollection<MessageAttachment> Attachments { get; set; } = new List<MessageAttachment>();
}
