using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class ObstetricProfilePayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public int? Gravida { get; set; }
    public int? Para { get; set; }
    public int? AbortusCount { get; set; }
    public int? LivingChildren { get; set; }
    public DateOnly? LastMenstrualPeriod { get; set; }
    public DateOnly? Menarche { get; set; }
    public bool IsPregnant { get; set; }
    public int? MenstrualCycleLengthDays { get; set; }
    public bool HasDysmenorrhea { get; set; }
    public string? Notes { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientObstetricProfileSyncProcessor
    : SimpleListSyncProcessor<PatientObstetricProfile, ObstetricProfilePayload>
{
    public PatientObstetricProfileSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientObstetricProfile;

    protected override async Task<PatientObstetricProfile?> FindExistingAsync(ObstetricProfilePayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientObstetricProfiles.FindAsync([id.Value], ct)
            : await Context.PatientObstetricProfiles.FirstOrDefaultAsync(e => e.PatientId == p.PatientId || e.ClientId == p.ClientId, ct);

    protected override PatientObstetricProfile CreateFromPayload(ObstetricProfilePayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId,
        Gravida = p.Gravida, Para = p.Para, AbortusCount = p.AbortusCount,
        LivingChildren = p.LivingChildren, LastMenstrualPeriod = p.LastMenstrualPeriod,
        Menarche = p.Menarche, IsPregnant = p.IsPregnant,
        MenstrualCycleLengthDays = p.MenstrualCycleLengthDays, HasDysmenorrhea = p.HasDysmenorrhea, Notes = p.Notes,
    };

    protected override void ApplyUpdate(PatientObstetricProfile e, ObstetricProfilePayload p)
    {
        e.Gravida = p.Gravida; e.Para = p.Para; e.AbortusCount = p.AbortusCount;
        e.LivingChildren = p.LivingChildren; e.LastMenstrualPeriod = p.LastMenstrualPeriod;
        e.Menarche = p.Menarche; e.IsPregnant = p.IsPregnant;
        e.MenstrualCycleLengthDays = p.MenstrualCycleLengthDays; e.HasDysmenorrhea = p.HasDysmenorrhea; e.Notes = p.Notes;
    }

    protected override DateTime GetPayloadTimestamp(ObstetricProfilePayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientObstetricProfile e) => log.EntityId = e.Id;
}
