using Microsoft.EntityFrameworkCore;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Enums;
using PatientAppBE.Domain.Interfaces;
using PatientAppBE.Infrastructure.Persistence;

namespace PatientAppBE.Infrastructure.Persistence.Repositories;

public sealed class SyncLogRepository : BaseRepository<SyncLog>, ISyncLogRepository
{
    public SyncLogRepository(ApplicationDbContext context) : base(context) { }

    public async Task<HashSet<Guid>> GetExistingIdempotencyKeysAsync(
        IEnumerable<Guid> keys,
        CancellationToken cancellationToken = default)
    {
        var keyList = keys.ToList();
        var found = await DbSet
            .Where(s => keyList.Contains(s.IdempotencyKey))
            .Select(s => s.IdempotencyKey)
            .ToListAsync(cancellationToken);

        return [..found];
    }

    public async Task<IReadOnlyList<SyncLog>> GetPendingByIdempotencyKeysAsync(
        IEnumerable<Guid> keys,
        CancellationToken cancellationToken = default)
    {
        var keyList = keys.ToList();
        return await DbSet
            .Where(s => keyList.Contains(s.IdempotencyKey) && s.Status == SyncStatus.Pending)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<SyncLog>> GetByPatientAsync(
        Guid patientId,
        int take,
        CancellationToken cancellationToken = default)
        => await DbSet
            .Where(s => s.PatientId == patientId)
            .OrderByDescending(s => s.ServerTimestamp)
            .Take(take)
            .ToListAsync(cancellationToken);

    public async Task AddRangeAsync(
        IEnumerable<SyncLog> logs,
        CancellationToken cancellationToken = default)
        => await DbSet.AddRangeAsync(logs, cancellationToken);
}
