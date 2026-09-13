using Microsoft.EntityFrameworkCore;
using PatientAppBE.Application.Common.Constants;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Enums;
using PatientAppBE.Infrastructure.Persistence;

namespace PatientAppBE.Infrastructure.Services.Jobs.Processors;

// Mobile schema fields: allergen, reactionType, severity, management, isActive
// Backend entity fields: AllergenName, AllergyType, Severity, Reaction, OnsetDate, Notes
internal sealed class AllergyPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string Allergen { get; set; } = string.Empty;      // → AllergenName
    public string? ReactionType { get; set; }                 // → Reaction
    public string? Severity { get; set; }
    public string? Management { get; set; }                   // → Notes
    public bool IsActive { get; set; } = true;
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientAllergySyncProcessor
    : SimpleListSyncProcessor<PatientAllergy, AllergyPayload>
{
    public PatientAllergySyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientAllergy;

    protected override async Task<PatientAllergy?> FindExistingAsync(AllergyPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientAllergies.FindAsync([id.Value], ct)
            : await Context.PatientAllergies.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientAllergy CreateFromPayload(AllergyPayload p) => new()
    {
        ClientId = p.ClientId,
        PatientId = p.PatientId,
        AllergenName = p.Allergen,
        AllergyType = AllergyType.Other,   // mobile doesn't have this distinction
        Severity = Enum.TryParse<AllergySeverity>(p.Severity, true, out var sev) ? sev : AllergySeverity.Mild,
        Reaction = p.ReactionType,
        Notes = p.Management,
    };

    protected override void ApplyUpdate(PatientAllergy e, AllergyPayload p)
    {
        e.AllergenName = p.Allergen;
        e.Severity = Enum.TryParse<AllergySeverity>(p.Severity, true, out var sev) ? sev : e.Severity;
        e.Reaction = p.ReactionType;
        e.Notes = p.Management;
    }

    protected override DateTime GetPayloadTimestamp(AllergyPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientAllergy e) => log.EntityId = e.Id;
}
