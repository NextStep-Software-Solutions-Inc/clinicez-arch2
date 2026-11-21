using System;
using System.Collections.Generic;
using ClinicEz.Patient.Domain.Common;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>
/// Patient-owned replica of a message within a conversation.
/// Strictly contains PUBLIC messages. Internal notes and staff reactions are NEVER stored.
/// </summary>
public sealed class PatientMessage : BaseEntity
{
    public Guid ConversationId { get; set; }
    public PatientConversation Conversation { get; set; } = null!;

    public long Seq { get; set; }
    public Guid ClientMessageId { get; set; } // Deduplication and idempotency key

    public string SenderType { get; set; } = string.Empty; // "Patient", "Guardian", "Staff"
    public string SenderName { get; set; } = string.Empty;
    public Guid? SenderId { get; set; }

    public string ContentText { get; set; } = string.Empty;

    public bool RequiresAcknowledgement { get; set; } = false;
    public bool IsAcknowledged { get; set; } = false;
    public DateTime? AcknowledgedAtUtc { get; set; }
    public Guid? AcknowledgedByAccountId { get; set; }
    public string? AcknowledgedByName { get; set; }

    public DeliveryState DeliveryState { get; set; } = DeliveryState.Waiting;
    public DateTime RetentionDeadlineUtc { get; set; }
    public DateTime? ReceivedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }

    public bool HasExpiredBannerShown { get; set; } = false;

    public ICollection<PatientMessageAttachment> Attachments { get; set; } = [];
}
