using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

// Mobile schema fields: condition, affectedRelative, side (Paternal/Maternal/Both/Unknown), ageOfOnset, isDeceased, ageAtDeath, causeOfDeath, notes
// Backend entity fields: Relation (FamilyRelation enum), ConditionName, AgeOfOnset, IsDeceased, Notes
internal sealed class FamilyHistoryPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string Condition { get; set; } = string.Empty;       // → ConditionName
    public string? AffectedRelative { get; set; }               // → Relation enum string
    public string? Side { get; set; }                           // Paternal/Maternal/Both/Unknown
    public int? AgeOfOnset { get; set; }
    public bool IsDeceased { get; set; }
    public int? AgeAtDeath { get; set; }
    public string? CauseOfDeath { get; set; }
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
        ClientId = p.ClientId,
        PatientId = p.PatientId,
        ConditionName = p.Condition,
        // affectedRelative is a free-text relative name; try to parse as FamilyRelation enum first
        Relation = Enum.TryParse<FamilyRelation>(p.AffectedRelative, true, out var fr) ? fr : FamilyRelation.Other,
        AgeOfOnset = p.AgeOfOnset,
        IsDeceased = p.IsDeceased,
        Notes = string.IsNullOrWhiteSpace(p.Notes)
            ? (p.CauseOfDeath is not null ? $"Cause of death: {p.CauseOfDeath}" : null)
            : p.Notes,
    };

    protected override void ApplyUpdate(PatientFamilyHistory e, FamilyHistoryPayload p)
    {
        e.ConditionName = p.Condition;
        e.Relation = Enum.TryParse<FamilyRelation>(p.AffectedRelative, true, out var fr) ? fr : e.Relation;
        e.AgeOfOnset = p.AgeOfOnset;
        e.IsDeceased = p.IsDeceased;
        e.Notes = string.IsNullOrWhiteSpace(p.Notes)
            ? (p.CauseOfDeath is not null ? $"Cause of death: {p.CauseOfDeath}" : e.Notes)
            : p.Notes;
    }

    protected override DateTime GetPayloadTimestamp(FamilyHistoryPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientFamilyHistory e) => log.EntityId = e.Id;
}
