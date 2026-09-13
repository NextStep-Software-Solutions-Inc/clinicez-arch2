using PatientAppBE.Domain.Entities;

namespace PatientAppBE.Infrastructure.Services.Jobs;

/// <summary>
/// Strategy contract for processing a single entity type in the offline sync pipeline.
/// One implementation per <c>ISyncable</c> entity; registered as Scoped.
/// </summary>
public interface ISyncEntityProcessor
{
    string EntityType { get; }
    Task<SyncProcessResult> ProcessAsync(SyncLog log, CancellationToken cancellationToken);
}
