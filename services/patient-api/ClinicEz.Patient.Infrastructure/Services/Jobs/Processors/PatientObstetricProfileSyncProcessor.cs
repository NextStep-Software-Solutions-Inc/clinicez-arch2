using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

// Mobile schema fields: ageAtMenarche, cycleLength, cycleDuration, regularity, dysmenorrheaSeverity,
//   menopausalStatus, ageAtMenopause, padsPerDay, ageAtOnsetSexualActivity, currentContraceptiveMethod,
//   menstruationApplicable, gravida, para, abortion, livingChildren, lmp, deliveryCnt, deliveryType,
//   fullTermDeliveries, prematureDeliveries, pregnancyInducedHypertension, onFamilyPlanning, pregnancyApplicable
// Backend entity fields: Gravida, Para, AbortusCount, LivingChildren, LastMenstrualPeriod, Menarche,
//   IsPregnant, MenstrualCycleLengthDays, HasDysmenorrhea, Notes
internal sealed class ObstetricProfilePayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    // Menstrual
    public int? AgeAtMenarche { get; set; }                    // → stored in Notes
    public int? CycleLength { get; set; }                      // → MenstrualCycleLengthDays
    public int? CycleDuration { get; set; }
    public string? Regularity { get; set; }
    public string? DysmenorrheaSeverity { get; set; }          // None/Mild/Moderate/Severe → HasDysmenorrhea
    public string? MenopausalStatus { get; set; }
    public int? AgeAtMenopause { get; set; }
    public int? PadsPerDay { get; set; }
    public int? AgeAtOnsetSexualActivity { get; set; }
    public string? CurrentContraceptiveMethod { get; set; }
    public bool MenstruationApplicable { get; set; } = true;
    // Obstetric
    public int? Gravida { get; set; }
    public int? Para { get; set; }
    public int? Abortion { get; set; }                         // → AbortusCount
    public int? LivingChildren { get; set; }
    public string? Lmp { get; set; }                           // ISO date → LastMenstrualPeriod
    public int? DeliveryCnt { get; set; }
    public string? DeliveryType { get; set; }
    public int? FullTermDeliveries { get; set; }
    public int? PrematureDeliveries { get; set; }
    public bool? PregnancyInducedHypertension { get; set; }
    public bool? OnFamilyPlanning { get; set; }
    public bool PregnancyApplicable { get; set; } = true;
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
        ClientId = p.ClientId,
        PatientId = p.PatientId,
        Gravida = p.Gravida,
        Para = p.Para,
        AbortusCount = p.Abortion,
        LivingChildren = p.LivingChildren,
        LastMenstrualPeriod = DateOnly.TryParse(p.Lmp, out var lmp) ? lmp : null,
        MenstrualCycleLengthDays = p.CycleLength,
        HasDysmenorrhea = !string.Equals(p.DysmenorrheaSeverity, "None", StringComparison.OrdinalIgnoreCase)
                          && p.DysmenorrheaSeverity is not null,
        IsPregnant = false,
        Notes = BuildObstetricNotes(p),
    };

    protected override void ApplyUpdate(PatientObstetricProfile e, ObstetricProfilePayload p)
    {
        e.Gravida = p.Gravida;
        e.Para = p.Para;
        e.AbortusCount = p.Abortion;
        e.LivingChildren = p.LivingChildren;
        e.LastMenstrualPeriod = DateOnly.TryParse(p.Lmp, out var lmp) ? lmp : e.LastMenstrualPeriod;
        e.MenstrualCycleLengthDays = p.CycleLength;
        e.HasDysmenorrhea = !string.Equals(p.DysmenorrheaSeverity, "None", StringComparison.OrdinalIgnoreCase)
                            && p.DysmenorrheaSeverity is not null;
        e.Notes = BuildObstetricNotes(p);
    }

    private static string? BuildObstetricNotes(ObstetricProfilePayload p)
    {
        var parts = new List<string>();
        if (p.MenopausalStatus is not null) parts.Add($"Menopausal: {p.MenopausalStatus}");
        if (p.DeliveryType is not null) parts.Add($"Delivery type: {p.DeliveryType}");
        if (p.PregnancyInducedHypertension == true) parts.Add("PIH: Yes");
        if (p.CurrentContraceptiveMethod is not null) parts.Add($"Contraceptive: {p.CurrentContraceptiveMethod}");
        return parts.Count > 0 ? string.Join("; ", parts) : null;
    }

    protected override DateTime GetPayloadTimestamp(ObstetricProfilePayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientObstetricProfile e) => log.EntityId = e.Id;
}
