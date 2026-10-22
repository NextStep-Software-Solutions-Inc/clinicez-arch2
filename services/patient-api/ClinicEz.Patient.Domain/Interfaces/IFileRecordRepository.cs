using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Domain.Interfaces;

public interface IFileRecordRepository : IBaseRepository<FileRecord>
{
    Task<FileRecord?> GetByStorageKeyAsync(string storageKey, CancellationToken cancellationToken = default);
    Task<FileRecord?> GetByIdAndPatientIdAsync(Guid id, Guid patientId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<FileRecord>> GetByPatientIdAsync(
        Guid patientId,
        Guid? documentTypeId = null,
        string? searchTerm = null,
        DateOnly? from = null,
        DateOnly? to = null,
        CancellationToken cancellationToken = default);
}

