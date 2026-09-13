using Microsoft.EntityFrameworkCore;
using PatientAppBE.Application.Common.Constants;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Infrastructure.Persistence;

namespace PatientAppBE.Infrastructure.Services.Jobs.Processors;

// Mobile schema fields: diagnosis, controlStatus, monitoringFrequency
// Backend entity fields: ConditionName, DiagnosedAt, IsControlled, TreatmentNotes, CurrentMedications
internal sealed class ChronicConditionPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string Diagnosis { get; set; } = string.Empty;      // → ConditionName
    public string? ControlStatus { get; set; }                 // "Controlled" / "Uncontrolled" → IsControlled
    public string? MonitoringFrequency { get; set; }           // → TreatmentNotes
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientChronicConditionSyncProcessor
    : SimpleListSyncProcessor<PatientChronicCondition, ChronicConditionPayload>
{
    public PatientChronicConditionSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientChronicCondition;

    protected override async Task<PatientChronicCondition?> FindExistingAsync(ChronicConditionPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientChronicConditions.FindAsync([id.Value], ct)
            : await Context.PatientChronicConditions.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientChronicCondition CreateFromPayload(ChronicConditionPayload p) => new()
    {
        ClientId = p.ClientId,
        PatientId = p.PatientId,
        ConditionName = p.Diagnosis,
        IsControlled = string.Equals(p.ControlStatus, "Controlled", StringComparison.OrdinalIgnoreCase),
        TreatmentNotes = p.MonitoringFrequency,
    };

    protected override void ApplyUpdate(PatientChronicCondition e, ChronicConditionPayload p)
    {
        e.ConditionName = p.Diagnosis;
        e.IsControlled = string.Equals(p.ControlStatus, "Controlled", StringComparison.OrdinalIgnoreCase);
        e.TreatmentNotes = p.MonitoringFrequency;
    }

    protected override DateTime GetPayloadTimestamp(ChronicConditionPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientChronicCondition e) => log.EntityId = e.Id;
}
