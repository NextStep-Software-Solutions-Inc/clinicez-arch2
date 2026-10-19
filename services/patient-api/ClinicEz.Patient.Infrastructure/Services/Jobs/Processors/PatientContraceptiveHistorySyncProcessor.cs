using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

internal sealed class ContraceptiveHistoryPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string Method { get; set; } = string.Empty;
    public bool IsCurrent { get; set; }
    public DateOnly? DateStarted { get; set; }
    public string? ReasonForStopping { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientContraceptiveHistorySyncProcessor
    : SimpleListSyncProcessor<PatientContraceptiveHistory, ContraceptiveHistoryPayload>
{
    public PatientContraceptiveHistorySyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientContraceptiveHistory;

    protected override async Task<PatientContraceptiveHistory?> FindExistingAsync(ContraceptiveHistoryPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientContraceptiveHistories.FindAsync([id.Value], ct)
            : await Context.PatientContraceptiveHistories.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientContraceptiveHistory CreateFromPayload(ContraceptiveHistoryPayload p) => new()
        { ClientId = p.ClientId, PatientId = p.PatientId, Method = p.Method, IsCurrent = p.IsCurrent, DateStarted = p.DateStarted, ReasonForStopping = p.ReasonForStopping };

    protected override void ApplyUpdate(PatientContraceptiveHistory e, ContraceptiveHistoryPayload p)
        { e.Method = p.Method; e.IsCurrent = p.IsCurrent; e.DateStarted = p.DateStarted; e.ReasonForStopping = p.ReasonForStopping; }

    protected override DateTime GetPayloadTimestamp(ContraceptiveHistoryPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientContraceptiveHistory e) => log.EntityId = e.Id;
}
