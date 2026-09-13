using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

// Mobile schema fields: procedure, surgeon, facility, date, anesthesiaType, complications
// Backend entity fields: ProcedureName, SurgeonName, Hospital, SurgeryDate, AnesthesiaType, Complications, Notes
internal sealed class SurgicalHistoryPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string Procedure { get; set; } = string.Empty;   // → ProcedureName
    public string? Surgeon { get; set; }                    // → SurgeonName
    public string? Facility { get; set; }                   // → Hospital
    public string? Date { get; set; }                       // ISO date → SurgeryDate
    public string? AnesthesiaType { get; set; }
    public string? Complications { get; set; }
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
        ClientId = p.ClientId,
        PatientId = p.PatientId,
        ProcedureName = p.Procedure,
        SurgeonName = p.Surgeon,
        Hospital = p.Facility,
        SurgeryDate = DateOnly.TryParse(p.Date, out var d) ? d : null,
        AnesthesiaType = p.AnesthesiaType,
        Complications = p.Complications,
    };

    protected override void ApplyUpdate(PatientSurgicalHistory e, SurgicalHistoryPayload p)
    {
        e.ProcedureName = p.Procedure;
        e.SurgeonName = p.Surgeon;
        e.Hospital = p.Facility;
        e.SurgeryDate = DateOnly.TryParse(p.Date, out var d) ? d : e.SurgeryDate;
        e.AnesthesiaType = p.AnesthesiaType;
        e.Complications = p.Complications;
    }

    protected override DateTime GetPayloadTimestamp(SurgicalHistoryPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientSurgicalHistory e) => log.EntityId = e.Id;
}
