using Microsoft.EntityFrameworkCore;
using PatientAppBE.Application.Common.Constants;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Infrastructure.Persistence;

namespace PatientAppBE.Infrastructure.Services.Jobs.Processors;

// Mobile schema fields: hasPriorDiagnosis, providerName, providerSpecialty, providerClinic, psychotherapyStatus
// Backend entity fields: HasDiagnosis, DiagnosisName, IsOnMedication, MedicationName, TherapistName, TherapyType, SessionFrequency, Notes
internal sealed class MentalHealthProfilePayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public bool HasPriorDiagnosis { get; set; }            // → HasDiagnosis
    public string? ProviderName { get; set; }              // → TherapistName
    public string? ProviderSpecialty { get; set; }         // → TherapyType
    public string? ProviderClinic { get; set; }            // stored in Notes
    public string? PsychotherapyStatus { get; set; }       // Active/Inactive/None → SessionFrequency
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
        ClientId = p.ClientId,
        PatientId = p.PatientId,
        HasDiagnosis = p.HasPriorDiagnosis,
        TherapistName = p.ProviderName,
        TherapyType = p.ProviderSpecialty,
        SessionFrequency = p.PsychotherapyStatus,
        Notes = p.ProviderClinic,
    };

    protected override void ApplyUpdate(PatientMentalHealthProfile e, MentalHealthProfilePayload p)
    {
        e.HasDiagnosis = p.HasPriorDiagnosis;
        e.TherapistName = p.ProviderName;
        e.TherapyType = p.ProviderSpecialty;
        e.SessionFrequency = p.PsychotherapyStatus;
        e.Notes = p.ProviderClinic;
    }

    protected override DateTime GetPayloadTimestamp(MentalHealthProfilePayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientMentalHealthProfile e) => log.EntityId = e.Id;
}
