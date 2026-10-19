using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Domain.Interfaces;

public interface IFileRecordRepository : IBaseRepository<FileRecord>
{
    Task<FileRecord?> GetByStorageKeyAsync(string storageKey, CancellationToken cancellationToken = default);
}
