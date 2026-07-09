using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class DisabilityPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string? BodyPart { get; set; }
    public string? Classification { get; set; }
    public bool IsPwdCertified { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientDisabilitySyncProcessor
    : SimpleListSyncProcessor<PatientDisability, DisabilityPayload>
{
    public PatientDisabilitySyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientDisability;

    protected override async Task<PatientDisability?> FindExistingAsync(DisabilityPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientDisabilities.FindAsync([id.Value], ct)
            : await Context.PatientDisabilities.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientDisability CreateFromPayload(DisabilityPayload p) => new()
        { ClientId = p.ClientId, PatientId = p.PatientId, BodyPart = p.BodyPart, Classification = p.Classification, IsPwdCertified = p.IsPwdCertified };

    protected override void ApplyUpdate(PatientDisability e, DisabilityPayload p)
        { e.BodyPart = p.BodyPart; e.Classification = p.Classification; e.IsPwdCertified = p.IsPwdCertified; }

    protected override DateTime GetPayloadTimestamp(DisabilityPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientDisability e) => log.EntityId = e.Id;
}
