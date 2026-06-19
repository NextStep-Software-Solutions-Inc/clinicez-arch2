using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class SurgicalHistoryPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string ProcedureName { get; set; } = string.Empty;
    public string? SurgeonName { get; set; }
    public string? Hospital { get; set; }
    public DateOnly? SurgeryDate { get; set; }
    public string? AnesthesiaType { get; set; }
    public string? Complications { get; set; }
    public string? Notes { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientSurgicalHistorySyncProcessor
    : SimpleListSyncProcessor<PatientSurgicalHistory, SurgicalHistoryPayload>
{
    public PatientSurgicalHistorySyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientSurgicalHistory;

    protected override async Task<PatientSurgicalHistory?> FindExistingAsync(SurgicalHistoryPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientSurgicalHistories.FindAsync([id.Value], ct)
            : await Context.PatientSurgicalHistories.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientSurgicalHistory CreateFromPayload(SurgicalHistoryPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId, ProcedureName = p.ProcedureName,
        SurgeonName = p.SurgeonName, Hospital = p.Hospital, SurgeryDate = p.SurgeryDate,
        AnesthesiaType = p.AnesthesiaType, Complications = p.Complications, Notes = p.Notes,
    };

    protected override void ApplyUpdate(PatientSurgicalHistory e, SurgicalHistoryPayload p)
    {
        e.ProcedureName = p.ProcedureName; e.SurgeonName = p.SurgeonName; e.Hospital = p.Hospital;
        e.SurgeryDate = p.SurgeryDate; e.AnesthesiaType = p.AnesthesiaType;
        e.Complications = p.Complications; e.Notes = p.Notes;
    }

    protected override DateTime GetPayloadTimestamp(SurgicalHistoryPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientSurgicalHistory e) => log.EntityId = e.Id;
}
