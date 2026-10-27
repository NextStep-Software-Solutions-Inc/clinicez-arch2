using System;
using System.Collections.Generic;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Comms.Domain.Entities;

public class Conversation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public string? BranchId { get; set; }

    public ConversationScope Scope { get; set; } = ConversationScope.Facility;
    public ConversationKind Kind { get; set; } = ConversationKind.General;

    public Guid? PatientId { get; set; }
    public Guid? SubmittingAccountId { get; set; }
    public string? Relationship { get; set; }

    public Guid? GrantId { get; set; }
    public DateTime? GrantWindowEndUtc { get; set; }

    public string? ContextType { get; set; }
    public string? ContextId { get; set; }

    public string Title { get; set; } = string.Empty;
    public MessageCategory? Category { get; set; }

    public RequestStatus Status { get; set; } = RequestStatus.Submitted;
    public TriageDisposition? TriageDisposition { get; set; }
    public string? DeclineReasonCode { get; set; }

    public string? AssignedStaffId { get; set; }
    public string? AssignedStaffName { get; set; }
    public string? Priority { get; set; } // "Routine", "Urgent"

    public bool IsEmergencyConfirmed { get; set; }
    public bool IsLocalOnly { get; set; }
    public int ReopenCount { get; set; }

    public bool IsOffHoursSubmission { get; set; }
    public DateTime? TriageDueAtUtc { get; set; }
    public DateTime? TriagedAtUtc { get; set; }
    public string? TriagedByStaffId { get; set; }
    public string? TriagedByStaffName { get; set; }
    public DateTime? IdleDeadlineUtc { get; set; }
    public bool SlaBreached { get; set; }
    public DateTime? SupervisorAlertedAtUtc { get; set; }

    public string HomeCellId { get; set; } = "cloud";

    public DateTime? LastMessageAtUtc { get; set; }
    public string? LastMessageSnippet { get; set; }
    public int MessageCount { get; set; }
    public long LastSeq { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;

    public DateTime? ClosedAtUtc { get; set; }
    public string? ClosedBy { get; set; }

    public int Version { get; set; } = 1;

    public ICollection<Participant> Participants { get; set; } = new List<Participant>();
    public ICollection<Message> Messages { get; set; } = new List<Message>();
}
