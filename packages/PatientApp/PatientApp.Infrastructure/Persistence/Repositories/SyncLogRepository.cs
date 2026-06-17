using Microsoft.EntityFrameworkCore;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Domain.Interfaces;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Persistence.Repositories;

public sealed class SyncLogRepository : BaseRepository<SyncLog>, ISyncLogRepository
{
    public SyncLogRepository(ApplicationDbContext context) : base(context) { }

    public async Task<HashSet<Guid>> GetExistingClientIdsAsync(
        IEnumerable<Guid> clientIds,
        CancellationToken cancellationToken = default)
    {
        var idList = clientIds.ToList();
        var found = await DbSet
            .Where(s => idList.Contains(s.ClientId))
            .Select(s => s.ClientId)
            .ToListAsync(cancellationToken);

        return [..found];
    }

    public async Task<IReadOnlyList<SyncLog>> GetPendingByClientIdsAsync(
        IEnumerable<Guid> clientIds,
        CancellationToken cancellationToken = default)
    {
        var idList = clientIds.ToList();
        return await DbSet
            .Where(s => idList.Contains(s.ClientId) && s.Status == SyncStatus.Pending)
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
