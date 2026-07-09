using PatientAppBE.Domain.Entities;

namespace PatientAppBE.Domain.Interfaces;

public interface IFileRecordRepository : IBaseRepository<FileRecord>
{
    Task<FileRecord?> GetByStorageKeyAsync(string storageKey, CancellationToken cancellationToken = default);
}
