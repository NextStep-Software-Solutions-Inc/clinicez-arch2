using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class FamilyHistoryPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string Relation { get; set; } = string.Empty;
    public string ConditionName { get; set; } = string.Empty;
    public int? AgeOfOnset { get; set; }
    public bool IsDeceased { get; set; }
    public string? Notes { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientFamilyHistorySyncProcessor
    : SimpleListSyncProcessor<PatientFamilyHistory, FamilyHistoryPayload>
{
    public PatientFamilyHistorySyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientFamilyHistory;

    protected override async Task<PatientFamilyHistory?> FindExistingAsync(FamilyHistoryPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientFamilyHistories.FindAsync([id.Value], ct)
            : await Context.PatientFamilyHistories.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientFamilyHistory CreateFromPayload(FamilyHistoryPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId,
        Relation = Enum.TryParse<FamilyRelation>(p.Relation, true, out var fr) ? fr : FamilyRelation.Other,
        ConditionName = p.ConditionName, AgeOfOnset = p.AgeOfOnset, IsDeceased = p.IsDeceased, Notes = p.Notes,
    };

    protected override void ApplyUpdate(PatientFamilyHistory e, FamilyHistoryPayload p)
    {
        e.Relation = Enum.TryParse<FamilyRelation>(p.Relation, true, out var fr) ? fr : e.Relation;
        e.ConditionName = p.ConditionName; e.AgeOfOnset = p.AgeOfOnset; e.IsDeceased = p.IsDeceased; e.Notes = p.Notes;
    }

    protected override DateTime GetPayloadTimestamp(FamilyHistoryPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientFamilyHistory e) => log.EntityId = e.Id;
}
