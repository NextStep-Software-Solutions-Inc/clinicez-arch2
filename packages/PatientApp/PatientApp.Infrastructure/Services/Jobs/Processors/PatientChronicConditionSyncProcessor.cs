using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class ChronicConditionPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string ConditionName { get; set; } = string.Empty;
    public DateOnly? DiagnosedAt { get; set; }
    public bool IsControlled { get; set; }
    public string? TreatmentNotes { get; set; }
    public string? CurrentMedications { get; set; }
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
        ClientId = p.ClientId, PatientId = p.PatientId, ConditionName = p.ConditionName,
        DiagnosedAt = p.DiagnosedAt, IsControlled = p.IsControlled,
        TreatmentNotes = p.TreatmentNotes, CurrentMedications = p.CurrentMedications,
    };

    protected override void ApplyUpdate(PatientChronicCondition e, ChronicConditionPayload p)
    {
        e.ConditionName = p.ConditionName; e.DiagnosedAt = p.DiagnosedAt; e.IsControlled = p.IsControlled;
        e.TreatmentNotes = p.TreatmentNotes; e.CurrentMedications = p.CurrentMedications;
    }

    protected override DateTime GetPayloadTimestamp(ChronicConditionPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientChronicCondition e) => log.EntityId = e.Id;
}
