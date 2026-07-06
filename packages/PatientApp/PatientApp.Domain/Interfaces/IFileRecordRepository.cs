using PatientApp.Domain.Entities;

namespace PatientApp.Domain.Interfaces;

public interface IFileRecordRepository : IBaseRepository<FileRecord>
{
    Task<FileRecord?> GetByStorageKeyAsync(string storageKey, CancellationToken cancellationToken = default);
}
