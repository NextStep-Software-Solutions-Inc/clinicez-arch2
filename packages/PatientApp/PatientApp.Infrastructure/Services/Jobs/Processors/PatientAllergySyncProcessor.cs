using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class AllergyPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string AllergenName { get; set; } = string.Empty;
    public string AllergyType { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;
    public string? Reaction { get; set; }
    public DateOnly? OnsetDate { get; set; }
    public string? Notes { get; set; }
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
        ClientId = p.ClientId, PatientId = p.PatientId, AllergenName = p.AllergenName,
        AllergyType = Enum.TryParse<AllergyType>(p.AllergyType, true, out var at) ? at : AllergyType.Other,
        Severity = Enum.TryParse<AllergySeverity>(p.Severity, true, out var sev) ? sev : AllergySeverity.Mild,
        Reaction = p.Reaction, OnsetDate = p.OnsetDate, Notes = p.Notes,
    };

    protected override void ApplyUpdate(PatientAllergy e, AllergyPayload p)
    {
        e.AllergenName = p.AllergenName;
        e.AllergyType = Enum.TryParse<AllergyType>(p.AllergyType, true, out var at) ? at : e.AllergyType;
        e.Severity = Enum.TryParse<AllergySeverity>(p.Severity, true, out var sev) ? sev : e.Severity;
        e.Reaction = p.Reaction; e.OnsetDate = p.OnsetDate; e.Notes = p.Notes;
    }

    protected override DateTime GetPayloadTimestamp(AllergyPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientAllergy e) => log.EntityId = e.Id;
}
