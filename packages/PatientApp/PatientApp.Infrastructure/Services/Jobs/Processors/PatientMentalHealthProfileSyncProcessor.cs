using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class MentalHealthProfilePayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public bool HasDiagnosis { get; set; }
    public string? DiagnosisName { get; set; }
    public bool IsOnMedication { get; set; }
    public string? MedicationName { get; set; }
    public string? TherapistName { get; set; }
    public string? TherapyType { get; set; }
    public string? SessionFrequency { get; set; }
    public string? Notes { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientMentalHealthProfileSyncProcessor
    : SimpleListSyncProcessor<PatientMentalHealthProfile, MentalHealthProfilePayload>
{
    public PatientMentalHealthProfileSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientMentalHealthProfile;

    protected override async Task<PatientMentalHealthProfile?> FindExistingAsync(MentalHealthProfilePayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientMentalHealthProfiles.FindAsync([id.Value], ct)
            : await Context.PatientMentalHealthProfiles.FirstOrDefaultAsync(e => e.PatientId == p.PatientId || e.ClientId == p.ClientId, ct);

    protected override PatientMentalHealthProfile CreateFromPayload(MentalHealthProfilePayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId,
        HasDiagnosis = p.HasDiagnosis, DiagnosisName = p.DiagnosisName,
        IsOnMedication = p.IsOnMedication, MedicationName = p.MedicationName,
        TherapistName = p.TherapistName, TherapyType = p.TherapyType,
        SessionFrequency = p.SessionFrequency, Notes = p.Notes,
    };

    protected override void ApplyUpdate(PatientMentalHealthProfile e, MentalHealthProfilePayload p)
    {
        e.HasDiagnosis = p.HasDiagnosis; e.DiagnosisName = p.DiagnosisName;
        e.IsOnMedication = p.IsOnMedication; e.MedicationName = p.MedicationName;
        e.TherapistName = p.TherapistName; e.TherapyType = p.TherapyType;
        e.SessionFrequency = p.SessionFrequency; e.Notes = p.Notes;
    }

    protected override DateTime GetPayloadTimestamp(MentalHealthProfilePayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientMentalHealthProfile e) => log.EntityId = e.Id;
}
