using System;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Public zero-PHI queue display board projection for waiting-area TV displays.
/// Synchronized from clinic-api via facility.queue-board.updated.
/// Strictly ZERO PHI: contains only ticket numbers, room/station names, and wait counts (zero patient names).
/// Keyed by composite primary key (TenantId, FacilityId).
/// </summary>
public class FacilityQueueBoard
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public Guid FacilityId { get; set; }
    public Facility? Facility { get; set; }

    /// <summary>
    /// Active queue date in Asia/Manila (YYYY-MM-DD). Tickets automatically clear when QueueDate &lt; todayManila.
    /// </summary>
    public DateOnly QueueDate { get; set; }

    public bool IsAcceptingWalkIns { get; set; } = true;
    public int PatientsWaitingCount { get; set; }

    /// <summary>
    /// Optional PIN / passcode required to view this queue board on waiting area TV displays.
    /// Synchronized from clinic-api. Leaked links without this PIN cannot see queue details.
    /// </summary>
    public string? TvDisplayPin { get; set; }

    /// <summary>
    /// JSON array of active serving tickets (QueueBoardServingItemDto).
    /// </summary>
    public string NowServingJson { get; set; } = "[]";

    /// <summary>
    /// JSON array of upcoming tickets (QueueBoardUpcomingItemDto) with DisplayName == null.
    /// </summary>
    public string UpNextJson { get; set; } = "[]";

    /// <summary>
    /// Optional JSON array of emergency/priority tickets.
    /// </summary>
    public string? EmergencyJson { get; set; }

    public DateTime GeneratedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
