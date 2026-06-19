using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

// Mobile schema fields: drugName, dosage, dosageForm, frequency, prescribingPhysician, startDate, indication, isActive
// Backend entity fields: MedicationName, GenericName, Dosage, Frequency, Route, StartDate, EndDate, IsCurrentlyTaking, PrescribedBy, Purpose, Notes
internal sealed class MedicationPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string DrugName { get; set; } = string.Empty;        // → MedicationName
    public string? Dosage { get; set; }
    public string? DosageForm { get; set; }                     // → Route (closest match)
    public string? Frequency { get; set; }
    public string? PrescribingPhysician { get; set; }           // → PrescribedBy
    public string? StartDate { get; set; }                      // ISO date string
    public string? Indication { get; set; }                     // → Purpose
    public bool IsActive { get; set; } = true;                  // → IsCurrentlyTaking
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientMedicationSyncProcessor
    : SimpleListSyncProcessor<PatientMedication, MedicationPayload>
{
    public PatientMedicationSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientMedication;

    protected override async Task<PatientMedication?> FindExistingAsync(MedicationPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientMedications.FindAsync([id.Value], ct)
            : await Context.PatientMedications.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientMedication CreateFromPayload(MedicationPayload p) => new()
    {
        ClientId = p.ClientId,
        PatientId = p.PatientId,
        MedicationName = p.DrugName,
        Dosage = p.Dosage,
        Route = p.DosageForm,
        Frequency = p.Frequency,
        StartDate = DateOnly.TryParse(p.StartDate, out var sd) ? sd : null,
        IsCurrentlyTaking = p.IsActive,
        PrescribedBy = p.PrescribingPhysician,
        Purpose = p.Indication,
    };

    protected override void ApplyUpdate(PatientMedication e, MedicationPayload p)
    {
        e.MedicationName = p.DrugName;
        e.Dosage = p.Dosage;
        e.Route = p.DosageForm;
        e.Frequency = p.Frequency;
        e.StartDate = DateOnly.TryParse(p.StartDate, out var sd) ? sd : e.StartDate;
        e.IsCurrentlyTaking = p.IsActive;
        e.PrescribedBy = p.PrescribingPhysician;
        e.Purpose = p.Indication;
    }

    protected override DateTime GetPayloadTimestamp(MedicationPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientMedication e) => log.EntityId = e.Id;
}
