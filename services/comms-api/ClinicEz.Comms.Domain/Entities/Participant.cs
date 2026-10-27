using System;

namespace ClinicEz.Comms.Domain.Entities;

public class Participant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public Conversation? Conversation { get; set; }

    public string TenantId { get; set; } = string.Empty;
    public string ParticipantType { get; set; } = "Staff"; // Staff, Patient, Guest
    public string ParticipantId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = "Member";

    public DateTime JoinedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LeftAtUtc { get; set; }

    public Guid? LastReadMessageId { get; set; }
    public DateTime? LastReadAtUtc { get; set; }
    public bool IsMuted { get; set; }

    public int Version { get; set; } = 1;
}
