using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

// Mobile schema fields: diagnosis, duration, complications
// Backend entity fields: IllnessName, DiagnosedAt, ResolvedAt, TreatmentReceived, Notes
internal sealed class PastIllnessPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string Diagnosis { get; set; } = string.Empty;   // → IllnessName
    public string? Duration { get; set; }                   // → Notes (no exact match)
    public string? Complications { get; set; }              // → TreatmentReceived (closest)
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientPastIllnessSyncProcessor
    : SimpleListSyncProcessor<PatientPastIllness, PastIllnessPayload>
{
    public PatientPastIllnessSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientPastIllness;

    protected override async Task<PatientPastIllness?> FindExistingAsync(PastIllnessPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientPastIllnesses.FindAsync([id.Value], ct)
            : await Context.PatientPastIllnesses.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientPastIllness CreateFromPayload(PastIllnessPayload p) => new()
    {
        ClientId = p.ClientId,
        PatientId = p.PatientId,
        IllnessName = p.Diagnosis,
        Notes = p.Duration,
        TreatmentReceived = p.Complications,
    };

    protected override void ApplyUpdate(PatientPastIllness e, PastIllnessPayload p)
    {
        e.IllnessName = p.Diagnosis;
        e.Notes = p.Duration;
        e.TreatmentReceived = p.Complications;
    }

    protected override DateTime GetPayloadTimestamp(PastIllnessPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientPastIllness e) => log.EntityId = e.Id;
}
