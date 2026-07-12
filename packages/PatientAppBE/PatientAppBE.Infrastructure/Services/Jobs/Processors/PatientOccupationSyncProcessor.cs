using Microsoft.EntityFrameworkCore;
using PatientAppBE.Application.Common.Constants;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Enums;
using PatientAppBE.Infrastructure.Persistence;

namespace PatientAppBE.Infrastructure.Services.Jobs.Processors;

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

    protected override async Task<PatientOccupation?> FindExistingAsync(OccupationPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientOccupations.FindAsync([id.Value], ct)
            : await Context.PatientOccupations.FirstOrDefaultAsync(e => e.PatientId == p.PatientId || e.ClientId == p.ClientId, ct);

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
