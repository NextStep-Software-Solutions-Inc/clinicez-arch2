using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

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

    protected override Task<PatientDisability?> FindExistingAsync(DisabilityPayload p, Guid? id, CancellationToken ct)
        => FindByIdOrAsync(id, p.ClientId != Guid.Empty ? e => e.PatientId == p.PatientId && e.ClientId == p.ClientId : null, ct);

    protected override PatientDisability CreateFromPayload(DisabilityPayload p) => new()
        { ClientId = p.ClientId, PatientId = p.PatientId, BodyPart = p.BodyPart, Classification = p.Classification, IsPwdCertified = p.IsPwdCertified };

    protected override void ApplyUpdate(PatientDisability e, DisabilityPayload p)
        { e.BodyPart = p.BodyPart; e.Classification = p.Classification; e.IsPwdCertified = p.IsPwdCertified; }

    protected override DateTime GetPayloadTimestamp(DisabilityPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientDisability e) => log.EntityId = e.Id;
}
