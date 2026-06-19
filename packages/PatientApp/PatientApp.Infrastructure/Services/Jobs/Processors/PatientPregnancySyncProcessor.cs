using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class PregnancyPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public int? Year { get; set; }
    public string? Outcome { get; set; }
    public int? GestationalAgeWeeks { get; set; }
    public string? DeliveryType { get; set; }
    public decimal? BirthWeightKg { get; set; }
    public string? Complications { get; set; }
    public string? Facility { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientPregnancySyncProcessor
    : SimpleListSyncProcessor<PatientPregnancy, PregnancyPayload>
{
    public PatientPregnancySyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientPregnancy;

    protected override async Task<PatientPregnancy?> FindExistingAsync(PregnancyPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientPregnancies.FindAsync([id.Value], ct)
            : await Context.PatientPregnancies.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientPregnancy CreateFromPayload(PregnancyPayload p) => new()
        { ClientId = p.ClientId, PatientId = p.PatientId, Year = p.Year, Outcome = p.Outcome,
          GestationalAgeWeeks = p.GestationalAgeWeeks, DeliveryType = p.DeliveryType, BirthWeightKg = p.BirthWeightKg,
          Complications = p.Complications, Facility = p.Facility };

    protected override void ApplyUpdate(PatientPregnancy e, PregnancyPayload p)
        { e.Year = p.Year; e.Outcome = p.Outcome; e.GestationalAgeWeeks = p.GestationalAgeWeeks;
          e.DeliveryType = p.DeliveryType; e.BirthWeightKg = p.BirthWeightKg; e.Complications = p.Complications; e.Facility = p.Facility; }

    protected override DateTime GetPayloadTimestamp(PregnancyPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientPregnancy e) => log.EntityId = e.Id;
}
