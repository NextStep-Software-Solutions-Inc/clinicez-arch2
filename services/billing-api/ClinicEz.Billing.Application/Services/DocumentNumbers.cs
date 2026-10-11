using System.Text.Json;
using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Application.Services;

/// <summary>
/// Gap-free document numbers per counter facility (<c>OR-000001</c>, <c>INV-000001</c>). The sequence row is part of the
/// caller's unit of work and carries a concurrency token: two writers racing for the same number cannot both commit.
/// </summary>
public sealed class DocumentNumbers
{
    public const string Receipt = "OR";
    public const string Invoice = "INV";
    public const string Refund = "RF";

    private readonly IBillingDbContext _db;

    public DocumentNumbers(IBillingDbContext db) => _db = db;

    public async Task<(int Sequence, string Number)> NextAsync(string tenantId, string facilityId, string kind, CancellationToken ct)
    {
        var sequence = _db.DocumentSequences.Local.FirstOrDefault(s => s.TenantId == tenantId && s.FacilityId == facilityId && s.Kind == kind)
            ?? await _db.DocumentSequences.IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.FacilityId == facilityId && s.Kind == kind, ct);

        if (sequence is null)
        {
            sequence = new DocumentSequence { Id = Guid.NewGuid(), TenantId = tenantId, FacilityId = facilityId, Kind = kind };
            _db.DocumentSequences.Add(sequence);
        }

        sequence.LastValue++;
        sequence.Version++;
        return (sequence.LastValue, $"{kind}-{sequence.LastValue:D6}");
    }
}

/// <summary>Writes immutable audit entries into the caller's unit of work (same save as the change they describe).</summary>
public sealed class AuditTrail
{
    private readonly IBillingDbContext _db;
    private readonly TimeProvider _clock;

    public AuditTrail(IBillingDbContext db, TimeProvider clock)
    {
        _db = db;
        _clock = clock;
    }

    public void Record(BillingCaller? actor, string tenantId, string? facilityId, string action, string entityType, Guid entityId, object details)
    {
        _db.AuditEntries.Add(new AuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            AtUtc = _clock.GetUtcNow().UtcDateTime,
            ActorUserId = actor?.UserId,
            ActorName = actor?.UserName ?? "system:interop",
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Details = JsonSerializer.Serialize(details)
        });
    }
}
