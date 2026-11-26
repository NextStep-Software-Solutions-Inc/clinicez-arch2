using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

internal sealed class OccupationPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string? Occupation { get; set; }
    public string? Employer { get; set; }
    public string? Industry { get; set; }
    public string? WorkEnvironment { get; set; }
    public int? YearsInOccupation { get; set; }
    public string? HazardExposure { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientOccupationSyncProcessor
    : SimpleListSyncProcessor<PatientOccupation, OccupationPayload>
{
    public PatientOccupationSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientOccupation;
    protected override bool UpsertOnMissingUpdate => true;

    protected override Task<PatientOccupation?> FindExistingAsync(OccupationPayload p, Guid? id, CancellationToken ct)
        => FindByIdOrAsync(id, e => e.PatientId == p.PatientId || (p.ClientId != Guid.Empty && e.ClientId == p.ClientId), ct);

    protected override PatientOccupation CreateFromPayload(OccupationPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId, Occupation = p.Occupation, Employer = p.Employer,
        Industry = p.Industry, WorkEnvironment = Enum.TryParse<WorkEnvironment>(p.WorkEnvironment, true, out var we) ? we : null,
        YearsInOccupation = p.YearsInOccupation, HazardExposure = p.HazardExposure,
    };

    protected override void ApplyUpdate(PatientOccupation e, OccupationPayload p)
    {
        e.Occupation = p.Occupation; e.Employer = p.Employer; e.Industry = p.Industry;
        e.WorkEnvironment = Enum.TryParse<WorkEnvironment>(p.WorkEnvironment, true, out var we) ? we : e.WorkEnvironment;
        e.YearsInOccupation = p.YearsInOccupation; e.HazardExposure = p.HazardExposure;
    }

    protected override DateTime GetPayloadTimestamp(OccupationPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientOccupation e) => log.EntityId = e.Id;
}
