using PatientAppBE.Domain.Entities;

namespace PatientAppBE.Domain.Interfaces;

public interface ISyncLogRepository : IBaseRepository<SyncLog>
{
    /// <summary>Returns the set of IdempotencyKeys already present in SyncLog (for idempotency).</summary>
    Task<HashSet<Guid>> GetExistingIdempotencyKeysAsync(
        IEnumerable<Guid> keys,
        CancellationToken cancellationToken = default);

    /// <summary>Loads SyncLog entries whose Status is still Pending for the given IdempotencyKeys.</summary>
    Task<IReadOnlyList<SyncLog>> GetPendingByIdempotencyKeysAsync(
        IEnumerable<Guid> keys,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SyncLog>> GetByPatientAsync(
        Guid patientId,
        int take,
        CancellationToken cancellationToken = default);

    Task AddRangeAsync(
        IEnumerable<SyncLog> logs,
        CancellationToken cancellationToken = default);
}
