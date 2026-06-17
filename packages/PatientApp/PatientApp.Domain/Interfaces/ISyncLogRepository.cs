using PatientApp.Domain.Entities;

namespace PatientApp.Domain.Interfaces;

public interface ISyncLogRepository : IBaseRepository<SyncLog>
{
    /// <summary>Returns the set of ClientIds already present in SyncLog (for idempotency).</summary>
    Task<HashSet<Guid>> GetExistingClientIdsAsync(
        IEnumerable<Guid> clientIds,
        CancellationToken cancellationToken = default);

    /// <summary>Loads SyncLog entries whose Status is still Pending for the given ClientIds.</summary>
    Task<IReadOnlyList<SyncLog>> GetPendingByClientIdsAsync(
        IEnumerable<Guid> clientIds,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SyncLog>> GetByPatientAsync(
        Guid patientId,
        int take,
        CancellationToken cancellationToken = default);

    Task AddRangeAsync(
        IEnumerable<SyncLog> logs,
        CancellationToken cancellationToken = default);
}
