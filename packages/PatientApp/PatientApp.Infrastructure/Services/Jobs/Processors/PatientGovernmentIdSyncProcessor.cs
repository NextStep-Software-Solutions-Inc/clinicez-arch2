using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class GovernmentIdPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string IdType { get; set; } = string.Empty;
    public string IdNumber { get; set; } = string.Empty;
    public DateOnly? IssuedAt { get; set; }
    public DateOnly? ExpiresAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientGovernmentIdSyncProcessor
    : SimpleListSyncProcessor<PatientGovernmentId, GovernmentIdPayload>
{
    public PatientGovernmentIdSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientGovernmentId;

    protected override async Task<PatientGovernmentId?> FindExistingAsync(GovernmentIdPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientGovernmentIds.FindAsync([id.Value], ct)
            : await Context.PatientGovernmentIds.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientGovernmentId CreateFromPayload(GovernmentIdPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId,
        IdType = Enum.TryParse<GovernmentIdType>(p.IdType, true, out var t) ? t : GovernmentIdType.PhilSys,
        IdNumber = p.IdNumber, IssuedAt = p.IssuedAt, ExpiresAt = p.ExpiresAt,
    };

    protected override void ApplyUpdate(PatientGovernmentId e, GovernmentIdPayload p)
    {
        e.IdType = Enum.TryParse<GovernmentIdType>(p.IdType, true, out var t) ? t : e.IdType;
        e.IdNumber = p.IdNumber; e.IssuedAt = p.IssuedAt; e.ExpiresAt = p.ExpiresAt;
    }

    protected override DateTime GetPayloadTimestamp(GovernmentIdPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientGovernmentId e) => log.EntityId = e.Id;
}
