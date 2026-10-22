using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

internal sealed class FileRecordRepository : BaseRepository<FileRecord>, IFileRecordRepository
{
    public FileRecordRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<FileRecord?> GetByStorageKeyAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        return await Context.FileRecords
            .FirstOrDefaultAsync(f => f.StorageKey == storageKey, cancellationToken);
    }

    public async Task<FileRecord?> GetByIdAndPatientIdAsync(Guid id, Guid patientId, CancellationToken cancellationToken = default)
    {
        return await Context.FileRecords
            .Include(f => f.DocumentType)
            .FirstOrDefaultAsync(f => f.Id == id && f.PatientId == patientId && !f.IsDeleted, cancellationToken);
    }

    public async Task<IReadOnlyList<FileRecord>> GetByPatientIdAsync(
        Guid patientId,
        Guid? documentTypeId = null,
        string? searchTerm = null,
        DateOnly? from = null,
        DateOnly? to = null,
        CancellationToken cancellationToken = default)
    {
        var query = Context.FileRecords
            .AsNoTracking()
            .Include(f => f.DocumentType)
            .Where(f => f.PatientId == patientId && !f.IsDeleted);

        if (documentTypeId.HasValue && documentTypeId.Value != Guid.Empty)
        {
            query = query.Where(f => f.DocumentTypeId == documentTypeId.Value);
        }

        if (!string.IsNullOrWhiteSpace(searchTerm))
        {
            var term = searchTerm.Trim().ToLower();
            query = query.Where(f => f.Title.ToLower().Contains(term) || f.FileName.ToLower().Contains(term) || (f.FacilityName != null && f.FacilityName.ToLower().Contains(term)));
        }

        if (from.HasValue)
        {
            query = query.Where(f => f.DocumentDate >= from.Value);
        }

        if (to.HasValue)
        {
            query = query.Where(f => f.DocumentDate <= to.Value);
        }

        return await query
            .OrderByDescending(f => f.DocumentDate)
            .ThenByDescending(f => f.UploadedAt)
            .ToListAsync(cancellationToken);
    }
}
