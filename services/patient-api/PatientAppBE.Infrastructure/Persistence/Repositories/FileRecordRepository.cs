using Microsoft.EntityFrameworkCore;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Infrastructure.Persistence.Repositories;

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
}
