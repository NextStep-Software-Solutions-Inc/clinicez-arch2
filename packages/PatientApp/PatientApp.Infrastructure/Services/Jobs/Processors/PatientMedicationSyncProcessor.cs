using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class MedicationPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string MedicationName { get; set; } = string.Empty;
    public string? GenericName { get; set; }
    public string? Dosage { get; set; }
    public string? Frequency { get; set; }
    public string? Route { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public bool IsCurrentlyTaking { get; set; }
    public string? PrescribedBy { get; set; }
    public string? Purpose { get; set; }
    public string? Notes { get; set; }
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
        ClientId = p.ClientId, PatientId = p.PatientId, MedicationName = p.MedicationName,
        GenericName = p.GenericName, Dosage = p.Dosage, Frequency = p.Frequency, Route = p.Route,
        StartDate = p.StartDate, EndDate = p.EndDate, IsCurrentlyTaking = p.IsCurrentlyTaking,
        PrescribedBy = p.PrescribedBy, Purpose = p.Purpose, Notes = p.Notes,
    };

    protected override void ApplyUpdate(PatientMedication e, MedicationPayload p)
    {
        e.MedicationName = p.MedicationName; e.GenericName = p.GenericName; e.Dosage = p.Dosage;
        e.Frequency = p.Frequency; e.Route = p.Route; e.StartDate = p.StartDate; e.EndDate = p.EndDate;
        e.IsCurrentlyTaking = p.IsCurrentlyTaking; e.PrescribedBy = p.PrescribedBy;
        e.Purpose = p.Purpose; e.Notes = p.Notes;
    }

    protected override DateTime GetPayloadTimestamp(MedicationPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientMedication e) => log.EntityId = e.Id;
}
