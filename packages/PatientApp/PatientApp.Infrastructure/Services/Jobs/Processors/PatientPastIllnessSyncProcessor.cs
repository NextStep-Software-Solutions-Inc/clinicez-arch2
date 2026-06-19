using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class PastIllnessPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string IllnessName { get; set; } = string.Empty;
    public DateOnly? DiagnosedAt { get; set; }
    public DateOnly? ResolvedAt { get; set; }
    public string? TreatmentReceived { get; set; }
    public string? Notes { get; set; }
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
        ClientId = p.ClientId, PatientId = p.PatientId, IllnessName = p.IllnessName,
        DiagnosedAt = p.DiagnosedAt, ResolvedAt = p.ResolvedAt,
        TreatmentReceived = p.TreatmentReceived, Notes = p.Notes,
    };

    protected override void ApplyUpdate(PatientPastIllness e, PastIllnessPayload p)
    {
        e.IllnessName = p.IllnessName; e.DiagnosedAt = p.DiagnosedAt; e.ResolvedAt = p.ResolvedAt;
        e.TreatmentReceived = p.TreatmentReceived; e.Notes = p.Notes;
    }

    protected override DateTime GetPayloadTimestamp(PastIllnessPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientPastIllness e) => log.EntityId = e.Id;
}
