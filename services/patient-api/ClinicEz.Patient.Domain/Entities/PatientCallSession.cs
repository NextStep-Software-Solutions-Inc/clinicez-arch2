using System;
using ClinicEz.Patient.Domain.Common;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class PatientCallSession : BaseEntity
{
    public Guid CallId { get; set; }
    public Guid? ConversationId { get; set; }
    public PatientConversation? Conversation { get; set; }

    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public string FacilityType { get; set; } = string.Empty;
    public string FacilityName { get; set; } = string.Empty;

    public CallKind CallKind { get; set; } = CallKind.General;
    public string Status { get; set; } = "Scheduled"; // Scheduled, WaitingRoom, Admitted, InCall, Ended
    public string? RoomName { get; set; }
    public string? LiveKitToken { get; set; }

    public DateTime? ScheduledAtUtc { get; set; }
    public DateTime? JoinedAtUtc { get; set; }
    public DateTime? EndedAtUtc { get; set; }
    public int StateVersion { get; set; } = 1;
}
