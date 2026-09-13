using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

internal sealed class MaleReproductivePayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public bool HasVasectomy { get; set; }
    public DateOnly? VasectomyDate { get; set; }
    public string? Conditions { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientMaleReproductiveSyncProcessor
    : SimpleListSyncProcessor<PatientMaleReproductive, MaleReproductivePayload>
{
    public PatientMaleReproductiveSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientMaleReproductive;

    protected override async Task<PatientMaleReproductive?> FindExistingAsync(MaleReproductivePayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientMaleReproductives.FindAsync([id.Value], ct)
            : await Context.PatientMaleReproductives.FirstOrDefaultAsync(e => e.PatientId == p.PatientId || e.ClientId == p.ClientId, ct);

    protected override PatientMaleReproductive CreateFromPayload(MaleReproductivePayload p) => new()
        { ClientId = p.ClientId, PatientId = p.PatientId, HasVasectomy = p.HasVasectomy, VasectomyDate = p.VasectomyDate, Conditions = p.Conditions };

    protected override void ApplyUpdate(PatientMaleReproductive e, MaleReproductivePayload p)
        { e.HasVasectomy = p.HasVasectomy; e.VasectomyDate = p.VasectomyDate; e.Conditions = p.Conditions; }

    protected override DateTime GetPayloadTimestamp(MaleReproductivePayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientMaleReproductive e) => log.EntityId = e.Id;
}
