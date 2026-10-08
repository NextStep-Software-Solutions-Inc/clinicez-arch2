using System.Text.Json;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

/// <summary>Generic Last-Write-Wins base used by all simple list-entity processors.</summary>
public abstract class SimpleListSyncProcessor<TEntity, TPayload> : ISyncEntityProcessor
    where TEntity : BaseEntity, ISyncable
    where TPayload : class
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public abstract string EntityType { get; }
    protected abstract Task<TEntity?> FindExistingAsync(TPayload payload, Guid? entityId, CancellationToken ct);
    protected abstract TEntity CreateFromPayload(TPayload payload);
    protected abstract void ApplyUpdate(TEntity entity, TPayload payload);
    protected abstract DateTime GetPayloadTimestamp(TPayload payload);
    protected abstract void SetEntityId(SyncLog log, TEntity entity);

    protected ApplicationDbContext Context { get; }

    protected SimpleListSyncProcessor(ApplicationDbContext context) => Context = context;

    public async Task<SyncProcessResult> ProcessAsync(SyncLog log, CancellationToken ct)
    {
        if (log.Operation == SyncOperation.Delete)
        {
            if (!log.EntityId.HasValue) return SyncProcessResult.Rejected("EntityId required for Delete.");
            var toDelete = await Context.Set<TEntity>().FindAsync([log.EntityId.Value], ct);
            if (toDelete is null)
            {
                toDelete = await Context.Set<TEntity>().FirstOrDefaultAsync(e => e.ClientId == log.EntityId.Value, ct);
            }
            if (toDelete is not null) Context.Set<TEntity>().Remove(toDelete);
            return SyncProcessResult.Success();
        }

        if (string.IsNullOrWhiteSpace(log.PayloadJson))
            return SyncProcessResult.Rejected("PayloadJson required for Create/Update.");

        var payload = JsonSerializer.Deserialize<TPayload>(log.PayloadJson, JsonOpts);
        if (payload is null) return SyncProcessResult.Rejected("Failed to deserialize payload.");

        var existing = await FindExistingAsync(payload, log.EntityId, ct);

        if (log.Operation == SyncOperation.Create)
        {
            if (existing is not null)
            {
                ApplyUpdate(existing, payload);
                Context.Set<TEntity>().Update(existing);
                SetEntityId(log, existing);
                return SyncProcessResult.Success();
            }
            var entity = CreateFromPayload(payload);
            await Context.Set<TEntity>().AddAsync(entity, ct);
            SetEntityId(log, entity);
            return SyncProcessResult.Success();
        }

        // Update — Last-Write-Wins
        if (existing is null) return SyncProcessResult.Conflict("Entity no longer exists on the server.");
        var serverTs = existing.UpdatedAt ?? existing.CreatedAt;
        var clientTs = GetPayloadTimestamp(payload);
        if (clientTs < serverTs)
            return SyncProcessResult.Conflict($"Server version is newer. Client={clientTs:O}, Server={serverTs:O}.");

        ApplyUpdate(existing, payload);
        Context.Set<TEntity>().Update(existing);
        SetEntityId(log, existing);
        return SyncProcessResult.Success();
    }
}
