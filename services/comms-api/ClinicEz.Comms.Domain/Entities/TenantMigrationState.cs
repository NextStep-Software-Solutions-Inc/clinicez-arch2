using System;

namespace ClinicEz.Comms.Domain.Entities;

public enum MigrationLifecycleState
{
    Idle = 0,          // Normal operations; all reads and writes permitted
    Preparing = 1,     // Migration initiated; reads and writes still active
    Exporting = 2,     // Source locked; writes paused; snapshot & bundle export underway
    Importing = 3,     // Target locked; importing bundle inside database transaction
    CatchingUp = 4,    // Outbox drained; delta synchronization in progress
    Completed = 5,     // Cutover finished; target active; source archived
    Aborted = 6        // Migration cancelled or failed; source cleanly unlocked
}

public class TenantMigrationState
{
    public string TenantId { get; set; } = string.Empty;
    public Guid MigrationId { get; set; } = Guid.NewGuid();
    public MigrationLifecycleState State { get; set; } = MigrationLifecycleState.Idle;

    public bool IsLockedForMigration =>
        State == MigrationLifecycleState.Exporting ||
        State == MigrationLifecycleState.Importing ||
        State == MigrationLifecycleState.CatchingUp;

    public string SourceCellId { get; set; } = string.Empty;
    public string TargetCellId { get; set; } = string.Empty;
    public string TargetCellType { get; set; } = "OnPremise"; // "Cloud" or "OnPremise"
    public string? Reason { get; set; }
    public string? AbortReason { get; set; }

    public DateTime? LockedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public DateTime? AbortedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public long LastExportedSeq { get; set; }
    public uint RowVersion { get; set; }
}
