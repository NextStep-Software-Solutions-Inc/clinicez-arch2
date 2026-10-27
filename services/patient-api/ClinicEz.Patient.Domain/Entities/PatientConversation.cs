using System;
using System.Collections.Generic;
using ClinicEz.Patient.Domain.Common;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>
/// Patient-owned replica of a facility conversation.
/// Survives tenant suspension, relocation, or deletion.
/// </summary>
public sealed class PatientConversation : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string HomeTenantId { get; set; } = string.Empty;
    public string HomeFacilityId { get; set; } = string.Empty;
    public string HomeFacilityType { get; set; } = string.Empty; // "Clinic", "Pharmacy", "Laboratory"
    public string FacilityName { get; set; } = string.Empty;

    public ConversationScope Scope { get; set; } = ConversationScope.PatientFacility;
    public ConversationKind Kind { get; set; } = ConversationKind.General;
    public string Subject { get; set; } = string.Empty;
    public MessageCategory Category { get; set; } = MessageCategory.Other;
    public RequestStatus Status { get; set; } = RequestStatus.Submitted;

    /// <summary>
    /// "Hide My Copy" local privacy flag. Excludes the conversation from patient inbox views
    /// without mutating or deleting the facility's official medical record.
    /// </summary>
    public bool IsHiddenByPatient { get; set; } = false;
    public DateTime? HiddenAtUtc { get; set; }

    public string LastMessagePreview { get; set; } = string.Empty;
    public DateTime LastMessageAtUtc { get; set; }
    public int UnreadCount { get; set; } = 0;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }

    public string? ContextType { get; set; } // "Appointment", "Encounter", "Prescription", "LabOrder"
    public string? ContextId { get; set; }
    public TriageDisposition? TriageDisposition { get; set; }
    public string? DeclineReasonCode { get; set; }
    public string? AssignedStaffDisplayName { get; set; }

    public DateTime OpenedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ClosedAtUtc { get; set; }
    public DateTime? GrantWindowEndUtc { get; set; }
    public DateTime? IdleDeadlineUtc { get; set; }
    public int ReopenCount { get; set; } = 0;

    // Managed Dependent Proxy Submissions
    public Guid? SubmittingAccountId { get; set; }
    public string? SubmittingAccountName { get; set; }
    public string? RelationshipToPatient { get; set; } // e.g. "Mother", "Guardian"

    /// <summary>Optimistic state version for out-of-order state transitions.</summary>
    public int Version { get; set; } = 1;

    public ICollection<PatientMessage> Messages { get; set; } = [];
    public ICollection<PatientCallSession> CallSessions { get; set; } = [];
}
