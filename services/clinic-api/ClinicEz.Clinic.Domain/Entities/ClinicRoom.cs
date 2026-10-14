using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ClinicRoom : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    /// <summary>
    /// Display name shown on queue pills and TV board (e.g., "Room 1", "Triage Station", "Treatment Room").
    /// </summary>
    public required string Name { get; set; }

    /// <summary>
    /// Optional short code (e.g., "RM1", "TRG", "TX1").
    /// </summary>
    public string? Code { get; set; }

    /// <summary>
    /// Functional type: Consultation, Triage, or Treatment.
    /// </summary>
    public ClinicRoomType Type { get; set; } = ClinicRoomType.Consultation;

    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;

    // Navigation properties
    public ICollection<StaffMember> AssignedStaff { get; set; } = new List<StaffMember>();
    public ICollection<QueueItem> QueueItems { get; set; } = new List<QueueItem>();
}
