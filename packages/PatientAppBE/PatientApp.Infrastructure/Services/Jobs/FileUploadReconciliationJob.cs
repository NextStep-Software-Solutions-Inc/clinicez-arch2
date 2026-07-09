using Hangfire;
using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Interfaces;
using PatientApp.Domain.Enums;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs;

public interface IFileUploadReconciliationJob
{
    Task ReconcilePendingUploadsAsync(CancellationToken cancellationToken);
}

public class FileUploadReconciliationJob : IFileUploadReconciliationJob
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IStorageService _storageService;

    public FileUploadReconciliationJob(ApplicationDbContext dbContext, IStorageService storageService)
    {
        _dbContext = dbContext;
        _storageService = storageService;
    }

    public async Task ReconcilePendingUploadsAsync(CancellationToken cancellationToken)
    {
        var oneHourAgo = DateTime.UtcNow.AddHours(-1);

        var pendingFiles = await _dbContext.FileRecords
            .Where(f => f.SyncStatus == FileSyncStatus.Syncing && f.UploadedAt < oneHourAgo)
            .ToListAsync(cancellationToken);

        foreach (var file in pendingFiles)
        {
            var exists = await _storageService.ObjectExistsAsync(file.StorageKey, cancellationToken);
            if (exists)
            {
                file.SyncStatus = FileSyncStatus.Synced;
            }
            else
            {
                _dbContext.FileRecords.Remove(file);
            }
        }

        if (pendingFiles.Any())
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
    }
}
